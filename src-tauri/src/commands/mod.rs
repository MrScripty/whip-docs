use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{Mutex, RwLock};

use crate::analyzer::rust_relations::RustImportRelationExtractor;
use crate::analyzer::{AnalysisStatusDto, AnalyzedGraph, RustAnalyzerService, RustGraphExtractor};
use crate::config::{AppConfigDto, ConfigStore, SourceRepoStatusDto};
use crate::graph::relations::{FileRelationGraphBuilder, FileRelationGraphSnapshotDto};
use crate::graph::{DirectoryGraphBuilder, DirectoryGraphSnapshotDto, GraphSnapshotDto};
use crate::intent::{AppendIntent, IntentError, IntentKind, IntentRecordDto, IntentStore};
use crate::source::ValidatedRepoPath;

pub struct AppState {
    shutdown_requested: AtomicBool,
    config_store: ConfigStore,
    config: RwLock<AppConfigDto>,
    analyzer_service: RustAnalyzerService,
    graph_snapshot: RwLock<Option<AnalyzedGraph>>,
    intent_store: Arc<IntentStore>,
    // Serialize binding commits with appends; extraction runs outside this gate.
    binding_mutation_gate: Arc<Mutex<()>>,
}

impl std::fmt::Debug for AppState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("AppState")
            .field("shutdown_requested", &self.shutdown_requested())
            .field("config_path", &self.config_store.config_path())
            .field("analyzer_status", &"<async>")
            .finish_non_exhaustive()
    }
}

impl AppState {
    pub fn new(config_store: ConfigStore, config: AppConfigDto) -> Self {
        Self::with_analyzer(config_store, config, RustAnalyzerService::default())
    }

    pub fn with_analyzer(
        config_store: ConfigStore,
        config: AppConfigDto,
        analyzer_service: RustAnalyzerService,
    ) -> Self {
        let app_data_dir = config_store
            .config_path()
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."));
        let intent_store = Arc::new(IntentStore::new(app_data_dir));
        Self {
            shutdown_requested: AtomicBool::new(false),
            config_store,
            config: RwLock::new(config),
            analyzer_service,
            graph_snapshot: RwLock::new(None),
            intent_store,
            binding_mutation_gate: Arc::new(Mutex::new(())),
        }
    }

    pub fn request_shutdown(&self) {
        self.shutdown_requested.store(true, Ordering::SeqCst);
    }

    fn shutdown_requested(&self) -> bool {
        self.shutdown_requested.load(Ordering::SeqCst)
    }

    pub async fn app_config(&self) -> AppConfigDto {
        self.config.read().await.clone()
    }

    pub async fn analysis_status(&self) -> AnalysisStatusDto {
        self.analyzer_service.status().await
    }

    pub async fn graph_snapshot(&self) -> Option<GraphSnapshotDto> {
        self.graph_snapshot
            .read()
            .await
            .as_ref()
            .map(|analysis| analysis.snapshot.clone())
    }

    pub async fn append_intent_record(
        &self,
        request: AppendIntent,
    ) -> Result<IntentRecordDto, CommandErrorDto> {
        let binding = Arc::clone(&self.binding_mutation_gate).lock_owned().await;
        let analysis = self.graph_snapshot.read().await.clone().ok_or_else(|| {
            CommandErrorDto::validation(
                "Analyze a repository and select a symbol before recording intent.",
            )
        })?;
        if self.app_config().await.source_repo_path.as_deref()
            != Some(analysis.snapshot.source_root.as_str())
        {
            return Err(CommandErrorDto::validation(
                "The source root changed. Analyze again before recording intent.",
            ));
        }
        let store = Arc::clone(&self.intent_store);
        tokio::task::spawn_blocking(move || {
            // The blocking worker retains the gate even if its caller is cancelled.
            let _binding = binding;
            store.append(&analysis, request)
        })
        .await
        .map_err(|error| CommandErrorDto::internal(error.to_string()))?
        .map_err(CommandErrorDto::from)
    }

    pub async fn list_intent_records(&self) -> Result<Vec<IntentRecordDto>, CommandErrorDto> {
        let Some(source_root) = self.app_config().await.source_repo_path else {
            return Ok(Vec::new());
        };
        let analysis = self.graph_snapshot.read().await.clone();
        let store = Arc::clone(&self.intent_store);
        tokio::task::spawn_blocking(move || store.list(&source_root, analysis.as_ref()))
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?
            .map_err(CommandErrorDto::from)
    }

    pub async fn source_snippet(
        &self,
        node_id: String,
    ) -> Result<SourceSnippetDto, CommandErrorDto> {
        let snapshot = self
            .graph_snapshot()
            .await
            .ok_or_else(|| CommandErrorDto::validation("graph snapshot is not available"))?;
        let node = snapshot
            .nodes
            .iter()
            .find(|node| node.id == node_id)
            .ok_or_else(|| CommandErrorDto::validation("graph node was not found"))?;
        let source_range = node
            .source_range
            .as_ref()
            .ok_or_else(|| CommandErrorDto::validation("graph node has no source range"))?;
        let source_repo = ValidatedRepoPath::parse_existing_cargo_repo(&snapshot.source_root)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;
        let source_path = source_repo
            .resolve_existing_child(&source_range.path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;
        let source = tokio::fs::read_to_string(&source_path)
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;
        let start_line = source_range.start_line.saturating_sub(3).max(1);
        let end_line = source_range.end_line.saturating_add(3);
        let text = source
            .lines()
            .enumerate()
            .filter_map(|(index, line)| {
                let line_number = index as u32 + 1;
                if line_number >= start_line && line_number <= end_line {
                    Some(line.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        Ok(SourceSnippetDto {
            node_id,
            path: source_range.path.clone(),
            start_line,
            end_line,
            text,
        })
    }

    pub async fn analyze_source_repo(&self) -> Result<GraphSnapshotDto, CommandErrorDto> {
        let config = self.app_config().await;
        let source_repo_path = config
            .source_repo_path
            .ok_or_else(|| CommandErrorDto::validation("source repository is not configured"))?;
        let source_repo = ValidatedRepoPath::parse_existing_cargo_repo(&source_repo_path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;
        let job_id = "analyze-source-repo";

        self.analyzer_service
            .begin_analysis_job(job_id)
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;

        let analyzed_root = source_repo.display_path();
        let extraction_result = tokio::task::spawn_blocking(move || {
            RustGraphExtractor.extract_with_sources(&source_repo)
        })
        .await;
        let _ = self.analyzer_service.complete_analysis_job(job_id).await;
        let analysis = extraction_result
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;

        let _binding = self.binding_mutation_gate.lock().await;
        let config = self.config.read().await;
        if config.source_repo_path.as_deref() != Some(analyzed_root.as_str()) {
            return Err(CommandErrorDto::validation(
                "The source root changed during analysis. Analyze again.",
            ));
        }
        let snapshot = analysis.snapshot.clone();
        let mut guard = self.graph_snapshot.write().await;
        *guard = Some(analysis);
        Ok(snapshot)
    }

    pub async fn load_directory_graph(
        &self,
        raw_path: String,
    ) -> Result<DirectoryGraphSnapshotDto, CommandErrorDto> {
        let source_repo = ValidatedRepoPath::parse_existing_cargo_repo(&raw_path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;

        tokio::task::spawn_blocking(move || DirectoryGraphBuilder::build(&source_repo))
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?
            .map_err(|error| CommandErrorDto::internal(error.to_string()))
    }

    pub async fn load_file_relation_graph(
        &self,
        raw_path: String,
    ) -> Result<FileRelationGraphSnapshotDto, CommandErrorDto> {
        let source_root = ValidatedRepoPath::parse_existing_source_root(&raw_path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;

        tokio::task::spawn_blocking(move || {
            let mut snapshot = FileRelationGraphBuilder::build_structure(&source_root)
                .map_err(|error| error.to_string())?;
            let import_snapshot = RustImportRelationExtractor
                .extract(&source_root)
                .map_err(|error| error.to_string())?;

            FileRelationGraphBuilder::add_rust_import_relations(&mut snapshot, import_snapshot);
            if source_root.as_path().join("Cargo.toml").is_file() {
                match RustGraphExtractor.extract(&source_root) {
                    Ok(graph_snapshot) => {
                        FileRelationGraphBuilder::add_rust_call_relations(
                            &mut snapshot,
                            graph_snapshot,
                        );
                    }
                    Err(error) => {
                        snapshot
                            .diagnostics
                            .push(crate::graph::AnalyzerDiagnosticDto {
                                code: "rust_call_extraction_failed".to_string(),
                                message: error.to_string(),
                                source_path: None,
                            });
                    }
                }
            }
            Ok::<_, String>(snapshot)
        })
        .await
        .map_err(|error| CommandErrorDto::internal(error.to_string()))?
        .map_err(CommandErrorDto::internal)
    }

    pub async fn shutdown_services(&self) -> Result<(), CommandErrorDto> {
        self.analyzer_service
            .shutdown()
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;
        Ok(())
    }

    pub async fn set_source_repo_path(
        &self,
        raw_path: String,
    ) -> Result<AppConfigDto, CommandErrorDto> {
        let validated_path = ValidatedRepoPath::parse_existing_cargo_repo(&raw_path)
            .map_err(|error| CommandErrorDto::validation(error.to_string()))?;
        let next_config = AppConfigDto {
            schema_version: crate::config::APP_CONFIG_SCHEMA_VERSION,
            source_repo_path: Some(validated_path.display_path()),
            source_repo_status: SourceRepoStatusDto::Valid,
        };

        let _binding = self.binding_mutation_gate.lock().await;
        self.config_store
            .save(&next_config)
            .await
            .map_err(|error| CommandErrorDto::internal(error.to_string()))?;

        let mut guard = self.config.write().await;
        *guard = next_config.clone();
        *self.graph_snapshot.write().await = None;
        Ok(next_config)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatusDto {
    pub app_name: &'static str,
    pub active_product: &'static str,
    pub shutdown_requested: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandErrorDto {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSnippetDto {
    pub node_id: String,
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub text: String,
}

impl CommandErrorDto {
    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            code: "validation_error".to_string(),
            message: message.into(),
            recoverable: true,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            code: "internal_error".to_string(),
            message: message.into(),
            recoverable: false,
        }
    }
}

impl From<IntentError> for CommandErrorDto {
    fn from(error: IntentError) -> Self {
        Self {
            code: error.code().to_owned(),
            message: error.to_string(),
            recoverable: !matches!(error, IntentError::Corrupt { .. } | IntentError::Io(_)),
        }
    }
}

#[tauri::command]
pub async fn append_intent_record(
    node_id: String,
    text: String,
    kind: IntentKind,
    parent_id: Option<String>,
    expected_analysis_at: String,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<IntentRecordDto, CommandErrorDto> {
    state
        .append_intent_record(AppendIntent {
            node_id,
            text,
            kind,
            parent_id,
            expected_analysis_at,
        })
        .await
}

#[tauri::command]
pub async fn list_intent_records(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<IntentRecordDto>, CommandErrorDto> {
    state.list_intent_records().await
}

#[tauri::command]
pub fn get_app_status(state: tauri::State<'_, std::sync::Arc<AppState>>) -> AppStatusDto {
    AppStatusDto {
        app_name: "Whip Docs",
        active_product: "local_architecture_analyzer",
        shutdown_requested: state.shutdown_requested(),
    }
}

#[tauri::command]
pub async fn get_app_config(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<AppConfigDto, CommandErrorDto> {
    Ok(state.app_config().await)
}

#[tauri::command]
pub async fn get_analysis_status(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<AnalysisStatusDto, CommandErrorDto> {
    Ok(state.analysis_status().await)
}

#[tauri::command]
pub async fn analyze_source_repo(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<GraphSnapshotDto, CommandErrorDto> {
    state.analyze_source_repo().await
}

#[tauri::command]
pub async fn load_directory_graph(
    path: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<DirectoryGraphSnapshotDto, CommandErrorDto> {
    state.load_directory_graph(path).await
}

#[tauri::command]
pub async fn load_file_relation_graph(
    path: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<FileRelationGraphSnapshotDto, CommandErrorDto> {
    state.load_file_relation_graph(path).await
}

#[tauri::command]
pub async fn get_graph_snapshot(
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<Option<GraphSnapshotDto>, CommandErrorDto> {
    Ok(state.graph_snapshot().await)
}

#[tauri::command]
pub async fn get_source_snippet(
    node_id: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<SourceSnippetDto, CommandErrorDto> {
    state.source_snippet(node_id).await
}

#[tauri::command]
pub async fn set_source_repo_path(
    path: String,
    state: tauri::State<'_, std::sync::Arc<AppState>>,
) -> Result<AppConfigDto, CommandErrorDto> {
    state.set_source_repo_path(path).await
}

#[cfg(test)]
mod tests {
    use super::{AppState, CommandErrorDto};
    use crate::analyzer::AnalyzerLifecyclePhase;
    use crate::config::{AppConfigDto, ConfigStore, SourceRepoStatusDto};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-command-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    async fn intent_fixture() -> (
        std::sync::Arc<AppState>,
        PathBuf,
        PathBuf,
        crate::intent::AppendIntent,
    ) {
        use crate::analyzer::AnalyzedGraph;
        use crate::graph::{
            GraphNodeDto, GraphNodeKind, GraphSnapshotDto, SourceRangeDto, GRAPH_SCHEMA_VERSION,
        };
        let app_dir = unique_temp_dir("intent-app");
        let repo_dir = unique_temp_dir("intent-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"intent_fixture\"\nversion = \"0.1.0\"\n",
        )
        .expect("write manifest");
        let source = "pub fn ship() {}\n";
        fs::write(repo_dir.join("src/lib.rs"), source).expect("write source");
        let state = std::sync::Arc::new(AppState::new(
            ConfigStore::new(&app_dir),
            AppConfigDto::default(),
        ));
        let config = state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("set root");
        *state.graph_snapshot.write().await = Some(AnalyzedGraph {
            snapshot: GraphSnapshotDto {
                schema_version: GRAPH_SCHEMA_VERSION,
                source_root: config.source_repo_path.expect("configured root"),
                generated_at: "analysis-1".to_owned(),
                nodes: vec![GraphNodeDto {
                    id: "function:ship".to_owned(),
                    kind: GraphNodeKind::Function,
                    label: "ship".to_owned(),
                    source_range: Some(SourceRangeDto {
                        path: "src/lib.rs".to_owned(),
                        start_line: 1,
                        start_column: 1,
                        end_line: 1,
                        end_column: 1,
                    }),
                }],
                edges: Vec::new(),
                diagnostics: Vec::new(),
            },
            sources: std::collections::BTreeMap::from([(
                "src/lib.rs".to_owned(),
                source.to_owned(),
            )]),
            repository_revision: None,
        });
        let request = crate::intent::AppendIntent {
            node_id: "function:ship".to_owned(),
            text: "Only ship after review.".to_owned(),
            kind: crate::intent::IntentKind::Original,
            parent_id: None,
            expected_analysis_at: "analysis-1".to_owned(),
        };
        (state, app_dir, repo_dir, request)
    }

    #[tokio::test]
    async fn app_state_reads_persisted_intent_after_restart_without_source_in_response() {
        let (state, app_dir, repo_dir, request) = intent_fixture().await;
        let original = state
            .append_intent_record(request)
            .await
            .expect("append intent");
        let store = ConfigStore::new(&app_dir);
        let restarted = AppState::new(
            store.clone(),
            store.load_or_default().await.expect("read config"),
        );
        let records = restarted
            .list_intent_records()
            .await
            .expect("list after restart");
        assert_eq!(records[0].id, original.id);
        assert_eq!(
            records[0].binding_status,
            crate::intent::BindingStatus::Unverified
        );
        assert!(!serde_json::to_string(&records)
            .expect("encode DTO")
            .contains("pub fn ship"));
        fs::remove_dir_all(app_dir).expect("cleanup app");
        fs::remove_dir_all(repo_dir).expect("cleanup repo");
    }

    #[tokio::test]
    async fn append_waits_for_binding_commit_then_rejects_old_analysis_token() {
        let (state, app_dir, repo_dir, request) = intent_fixture().await;
        let gate = state.binding_mutation_gate.lock().await;
        let task_state = std::sync::Arc::clone(&state);
        let append = tokio::spawn(async move { task_state.append_intent_record(request).await });
        tokio::task::yield_now().await;
        assert!(!append.is_finished());
        state
            .graph_snapshot
            .write()
            .await
            .as_mut()
            .expect("analysis")
            .snapshot
            .generated_at = "analysis-2".to_owned();
        drop(gate);
        let error = append
            .await
            .expect("join append")
            .expect_err("reject obsolete token");
        assert_eq!(error.code, "intent_stale_selection");
        assert!(state.list_intent_records().await.expect("list").is_empty());
        fs::remove_dir_all(app_dir).expect("cleanup app");
        fs::remove_dir_all(repo_dir).expect("cleanup repo");
    }

    #[tokio::test]
    async fn setting_a_source_root_clears_selection_and_blocks_old_append() {
        let (state, app_dir, repo_dir, request) = intent_fixture().await;
        state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("reset configured root");
        assert!(state.graph_snapshot().await.is_none());
        assert_eq!(
            state
                .append_intent_record(request)
                .await
                .expect_err("selection cleared")
                .code,
            "validation_error"
        );
        fs::remove_dir_all(app_dir).expect("cleanup app");
        fs::remove_dir_all(repo_dir).expect("cleanup repo");
    }

    #[test]
    fn command_error_serializes_camel_case_contract() {
        let error = CommandErrorDto::validation("source repo path is invalid");
        let serialized = serde_json::to_string(&error).expect("serialize command error");

        assert_eq!(
            serialized,
            r#"{"code":"validation_error","message":"source repo path is invalid","recoverable":true}"#
        );
    }

    #[test]
    fn internal_command_error_is_not_recoverable() {
        let error = CommandErrorDto::internal("analysis task failed");

        assert_eq!(error.code, "internal_error");
        assert!(!error.recoverable);
    }

    #[tokio::test]
    async fn app_state_sets_valid_source_repo_path_and_persists_config() {
        let app_dir = unique_temp_dir("app");
        let repo_dir = unique_temp_dir("repo");
        fs::create_dir_all(&repo_dir).expect("create repo dir");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\n",
        )
        .expect("write manifest");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store.clone(), AppConfigDto::default());

        let config = state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("set source repo path");

        assert_eq!(config.source_repo_status, SourceRepoStatusDto::Valid);
        assert_eq!(state.app_config().await, config);
        assert_eq!(
            store.load_or_default().await.expect("load persisted"),
            config
        );

        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_rejects_invalid_source_repo_path() {
        let app_dir = unique_temp_dir("invalid-app");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let error = state
            .set_source_repo_path("../outside".to_string())
            .await
            .expect_err("reject invalid repo path");

        assert_eq!(error.code, "validation_error");
        assert!(error.recoverable);
    }

    #[tokio::test]
    async fn app_state_exposes_analysis_status() {
        let app_dir = unique_temp_dir("analysis-status-app");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let status = state.analysis_status().await;

        assert_eq!(status.phase, AnalyzerLifecyclePhase::Idle);
        assert_eq!(status.active_job_id, None);
    }

    #[tokio::test]
    async fn app_state_analyzes_configured_source_repo_and_stores_snapshot() {
        let app_dir = unique_temp_dir("analysis-app");
        let repo_dir = unique_temp_dir("analysis-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo src");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .expect("write manifest");
        fs::write(
            repo_dir.join("src/lib.rs"),
            "pub fn helper() {}\npub fn entry() { helper(); }\n",
        )
        .expect("write source");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());
        state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("set source repo");

        let snapshot = state
            .analyze_source_repo()
            .await
            .expect("analyze source repo");

        assert!(snapshot.nodes.iter().any(|node| node.label == "entry"));
        assert_eq!(state.graph_snapshot().await, Some(snapshot));

        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_loads_directory_graph_without_running_analyzer() {
        let app_dir = unique_temp_dir("directory-graph-app");
        let repo_dir = unique_temp_dir("directory-graph-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo src");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\n",
        )
        .expect("write manifest");
        fs::write(repo_dir.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write source");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let snapshot = state
            .load_directory_graph(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("load directory graph");

        assert!(snapshot.nodes.iter().any(|node| node.id == "dir:src"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.from_node_id == "repo:." && edge.to_node_id == "dir:src"));
        assert_eq!(state.graph_snapshot().await, None);

        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_loads_file_relation_graph_from_generic_source_root() {
        let app_dir = unique_temp_dir("file-relation-graph-app");
        let repo_dir = unique_temp_dir("file-relation-graph-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo src");
        fs::write(repo_dir.join("src/main.rs"), "use crate::lib::fixture;\n")
            .expect("write main source");
        fs::write(repo_dir.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write lib source");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let snapshot = state
            .load_file_relation_graph(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("load file relation graph");

        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.id == "file:src/lib.rs"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.id == "contains:repo:.:dir:src"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.id == "imports:file:src/main.rs:file:src/lib.rs"));
        assert!(snapshot
            .analyzers
            .iter()
            .any(|analyzer| analyzer.analyzer == "syn-rust-import-relations"));
        assert_eq!(state.graph_snapshot().await, None);

        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_loads_file_relation_graph_with_rust_call_relations() {
        let app_dir = unique_temp_dir("file-relation-call-app");
        let repo_dir = unique_temp_dir("file-relation-call-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo src");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .expect("write manifest");
        fs::write(
            repo_dir.join("src/lib.rs"),
            "mod worker;\npub fn entry() { worker::run(); }\n",
        )
        .expect("write lib source");
        fs::write(repo_dir.join("src/worker.rs"), "pub fn run() {}\n")
            .expect("write worker source");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());

        let snapshot = state
            .load_file_relation_graph(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("load file relation graph");

        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.id == "calls:file:src/lib.rs:file:src/worker.rs"));
        assert!(snapshot
            .analyzers
            .iter()
            .any(|analyzer| analyzer.analyzer == "syn-rust-call-relations"));

        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }

    #[tokio::test]
    async fn app_state_returns_source_snippet_by_graph_node_id() {
        let app_dir = unique_temp_dir("snippet-app");
        let repo_dir = unique_temp_dir("snippet-repo");
        fs::create_dir_all(repo_dir.join("src")).expect("create repo src");
        fs::write(
            repo_dir.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .expect("write manifest");
        fs::write(
            repo_dir.join("src/lib.rs"),
            "pub fn helper() {}\npub fn entry() { helper(); }\n",
        )
        .expect("write source");
        let store = ConfigStore::new(&app_dir);
        let state = AppState::new(store, AppConfigDto::default());
        state
            .set_source_repo_path(repo_dir.to_string_lossy().into_owned())
            .await
            .expect("set source repo");
        let snapshot = state
            .analyze_source_repo()
            .await
            .expect("analyze source repo");
        let node_id = snapshot
            .nodes
            .iter()
            .find(|node| node.label == "entry")
            .expect("entry node")
            .id
            .clone();

        let snippet = state
            .source_snippet(node_id.clone())
            .await
            .expect("snippet");

        assert_eq!(snippet.node_id, node_id);
        assert_eq!(snippet.path, "src/lib.rs");
        assert!(snippet.text.contains("pub fn entry()"));

        fs::remove_dir_all(app_dir).expect("cleanup app dir");
        fs::remove_dir_all(repo_dir).expect("cleanup repo dir");
    }
}
