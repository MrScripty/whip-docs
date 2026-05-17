//! rust-analyzer lifecycle and Rust extraction service boundary.
#![allow(dead_code)]

mod extraction;
pub mod rust_relations;

use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time;

use crate::source::ValidatedRepoPath;
pub use extraction::RustGraphExtractor;

const DEFAULT_RUST_ANALYZER_BINARY: &str = "rust-analyzer";
const DEFAULT_STARTUP_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub struct RustAnalyzerService {
    settings: RustAnalyzerSettings,
    state: Mutex<AnalyzerState>,
}

impl Default for RustAnalyzerService {
    fn default() -> Self {
        Self::new(RustAnalyzerSettings::default())
    }
}

impl RustAnalyzerService {
    pub fn new(settings: RustAnalyzerSettings) -> Self {
        Self {
            settings,
            state: Mutex::new(AnalyzerState::default()),
        }
    }

    pub async fn status(&self) -> AnalysisStatusDto {
        self.state.lock().await.status.clone()
    }

    pub async fn start_for_workspace(
        &self,
        workspace: &ValidatedRepoPath,
    ) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        let mut state = self.state.lock().await;
        if state.child.is_some() {
            return Err(AnalyzerServiceError::AlreadyRunning);
        }

        state.status = AnalysisStatusDto::starting(workspace.display_path());

        let mut command = Command::new(&self.settings.executable);
        command
            .args(&self.settings.arguments)
            .current_dir(workspace.as_path())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let message = error.to_string();
                state.status = AnalysisStatusDto::failed(
                    Some(workspace.display_path()),
                    "spawn_failed",
                    message.clone(),
                    true,
                );
                return Err(AnalyzerServiceError::Spawn {
                    executable: self.settings.executable.clone(),
                    message,
                });
            }
        };

        if let Err(error) =
            wait_for_readiness(self.settings.startup_timeout, async { Ok(()) }).await
        {
            let _ = terminate_child(&mut child).await;
            state.status = AnalysisStatusDto::failed(
                Some(workspace.display_path()),
                "startup_timeout",
                error.to_string(),
                true,
            );
            return Err(error);
        }

        state.child = Some(child);
        state.status = AnalysisStatusDto::ready(workspace.display_path());
        Ok(state.status.clone())
    }

    pub async fn restart_for_workspace(
        &self,
        workspace: &ValidatedRepoPath,
    ) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        self.shutdown().await?;
        self.start_for_workspace(workspace).await
    }

    pub async fn begin_analysis_job(
        &self,
        job_id: impl Into<String>,
    ) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        let mut state = self.state.lock().await;
        if state.status.active_job_id.is_some() {
            return Err(AnalyzerServiceError::AnalysisAlreadyRunning);
        }

        let job_id = job_id.into();
        state.status.active_job_id = Some(job_id);
        state.status.phase = AnalyzerLifecyclePhase::Busy;
        Ok(state.status.clone())
    }

    pub async fn complete_analysis_job(
        &self,
        job_id: &str,
    ) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        let mut state = self.state.lock().await;
        match state.status.active_job_id.as_deref() {
            Some(active_job_id) if active_job_id == job_id => {
                state.status.active_job_id = None;
                state.status.phase = if state.child.is_some() {
                    AnalyzerLifecyclePhase::Ready
                } else {
                    AnalyzerLifecyclePhase::Idle
                };
                Ok(state.status.clone())
            }
            _ => Err(AnalyzerServiceError::UnknownAnalysisJob(job_id.to_string())),
        }
    }

    pub async fn cancel_active_analysis(&self) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        let mut state = self.state.lock().await;
        state.status.active_job_id = None;

        if let Some(mut child) = state.child.take() {
            terminate_child(&mut child).await?;
            state.status.phase = AnalyzerLifecyclePhase::Stopped;
        } else {
            state.status.phase = AnalyzerLifecyclePhase::Idle;
        };

        Ok(state.status.clone())
    }

    pub async fn shutdown(&self) -> Result<AnalysisStatusDto, AnalyzerServiceError> {
        let mut state = self.state.lock().await;
        state.status.phase = AnalyzerLifecyclePhase::Stopping;
        state.status.active_job_id = None;

        if let Some(mut child) = state.child.take() {
            terminate_child(&mut child).await?;
        }

        state.status.phase = AnalyzerLifecyclePhase::Stopped;
        Ok(state.status.clone())
    }

    pub fn request_timeout(&self) -> Duration {
        self.settings.request_timeout
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RustAnalyzerSettings {
    executable: PathBuf,
    arguments: Vec<String>,
    startup_timeout: Duration,
    request_timeout: Duration,
}

impl Default for RustAnalyzerSettings {
    fn default() -> Self {
        Self {
            executable: PathBuf::from(DEFAULT_RUST_ANALYZER_BINARY),
            arguments: Vec::new(),
            startup_timeout: DEFAULT_STARTUP_TIMEOUT,
            request_timeout: DEFAULT_REQUEST_TIMEOUT,
        }
    }
}

impl RustAnalyzerSettings {
    pub fn for_executable(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            ..Self::default()
        }
    }

    pub fn with_arguments(
        mut self,
        arguments: impl IntoIterator<Item = impl Into<String>>,
    ) -> Self {
        self.arguments = arguments.into_iter().map(Into::into).collect();
        self
    }

    pub fn with_startup_timeout(mut self, timeout: Duration) -> Self {
        self.startup_timeout = timeout;
        self
    }

    pub fn with_request_timeout(mut self, timeout: Duration) -> Self {
        self.request_timeout = timeout;
        self
    }
}

#[derive(Debug, Default)]
struct AnalyzerState {
    child: Option<Child>,
    status: AnalysisStatusDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisStatusDto {
    pub phase: AnalyzerLifecyclePhase,
    pub workspace_root: Option<String>,
    pub active_job_id: Option<String>,
    pub diagnostics: Vec<AnalyzerDiagnosticDto>,
}

impl Default for AnalysisStatusDto {
    fn default() -> Self {
        Self {
            phase: AnalyzerLifecyclePhase::Idle,
            workspace_root: None,
            active_job_id: None,
            diagnostics: Vec::new(),
        }
    }
}

impl AnalysisStatusDto {
    fn starting(workspace_root: String) -> Self {
        Self {
            phase: AnalyzerLifecyclePhase::Starting,
            workspace_root: Some(workspace_root),
            active_job_id: None,
            diagnostics: Vec::new(),
        }
    }

    fn ready(workspace_root: String) -> Self {
        Self {
            phase: AnalyzerLifecyclePhase::Ready,
            workspace_root: Some(workspace_root),
            active_job_id: None,
            diagnostics: Vec::new(),
        }
    }

    fn failed(
        workspace_root: Option<String>,
        code: impl Into<String>,
        message: impl Into<String>,
        recoverable: bool,
    ) -> Self {
        Self {
            phase: AnalyzerLifecyclePhase::Failed,
            workspace_root,
            active_job_id: None,
            diagnostics: vec![AnalyzerDiagnosticDto {
                code: code.into(),
                message: message.into(),
                recoverable,
            }],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnalyzerLifecyclePhase {
    Idle,
    Starting,
    Ready,
    Busy,
    Stopping,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerDiagnosticDto {
    pub code: String,
    pub message: String,
    pub recoverable: bool,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum AnalyzerServiceError {
    #[error("rust-analyzer process is already running")]
    AlreadyRunning,
    #[error("analysis job is already running")]
    AnalysisAlreadyRunning,
    #[error("unknown analysis job: {0}")]
    UnknownAnalysisJob(String),
    #[error("failed to spawn rust-analyzer '{executable}': {message}")]
    Spawn {
        executable: PathBuf,
        message: String,
    },
    #[error("rust-analyzer did not become ready before the startup timeout")]
    StartupTimeout,
    #[error("failed to terminate rust-analyzer: {0}")]
    Terminate(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerRequestDto {
    pub id: u64,
    pub method: String,
    pub params: serde_json::Value,
}

pub struct AnalyzerRequestBuilder;

impl AnalyzerRequestBuilder {
    pub fn document_symbols(id: u64, uri: impl Into<String>) -> AnalyzerRequestDto {
        AnalyzerRequestDto {
            id,
            method: "textDocument/documentSymbol".to_string(),
            params: serde_json::json!({
                "textDocument": {
                    "uri": uri.into(),
                },
            }),
        }
    }

    pub fn definitions(
        id: u64,
        uri: impl Into<String>,
        line: u32,
        character: u32,
    ) -> AnalyzerRequestDto {
        text_document_position_request(id, "textDocument/definition", uri, line, character)
    }

    pub fn references(
        id: u64,
        uri: impl Into<String>,
        line: u32,
        character: u32,
    ) -> AnalyzerRequestDto {
        let mut request =
            text_document_position_request(id, "textDocument/references", uri, line, character);
        if let Some(params) = request.params.as_object_mut() {
            params.insert(
                "context".to_string(),
                serde_json::json!({ "includeDeclaration": true }),
            );
        }
        request
    }

    pub fn prepare_call_hierarchy(
        id: u64,
        uri: impl Into<String>,
        line: u32,
        character: u32,
    ) -> AnalyzerRequestDto {
        text_document_position_request(
            id,
            "textDocument/prepareCallHierarchy",
            uri,
            line,
            character,
        )
    }

    pub fn incoming_calls(id: u64, item: serde_json::Value) -> AnalyzerRequestDto {
        AnalyzerRequestDto {
            id,
            method: "callHierarchy/incomingCalls".to_string(),
            params: serde_json::json!({ "item": item }),
        }
    }

    pub fn outgoing_calls(id: u64, item: serde_json::Value) -> AnalyzerRequestDto {
        AnalyzerRequestDto {
            id,
            method: "callHierarchy/outgoingCalls".to_string(),
            params: serde_json::json!({ "item": item }),
        }
    }
}

fn text_document_position_request(
    id: u64,
    method: &str,
    uri: impl Into<String>,
    line: u32,
    character: u32,
) -> AnalyzerRequestDto {
    AnalyzerRequestDto {
        id,
        method: method.to_string(),
        params: serde_json::json!({
            "textDocument": {
                "uri": uri.into(),
            },
            "position": {
                "line": line,
                "character": character,
            },
        }),
    }
}

async fn terminate_child(child: &mut Child) -> Result<(), AnalyzerServiceError> {
    if child
        .try_wait()
        .map_err(|error| AnalyzerServiceError::Terminate(error.to_string()))?
        .is_some()
    {
        return Ok(());
    }

    child
        .kill()
        .await
        .map_err(|error| AnalyzerServiceError::Terminate(error.to_string()))?;
    Ok(())
}

async fn wait_for_readiness(
    timeout: Duration,
    readiness: impl std::future::Future<Output = Result<(), AnalyzerServiceError>>,
) -> Result<(), AnalyzerServiceError> {
    time::timeout(timeout, readiness)
        .await
        .map_err(|_| AnalyzerServiceError::StartupTimeout)?
}

#[cfg(test)]
mod tests {
    use super::{
        wait_for_readiness, AnalysisStatusDto, AnalyzerLifecyclePhase, AnalyzerRequestBuilder,
        AnalyzerServiceError, RustAnalyzerService, RustAnalyzerSettings,
    };
    use crate::source::ValidatedRepoPath;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-analyzer-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    fn fixture_repo(name: &str) -> (PathBuf, ValidatedRepoPath) {
        let repo = unique_temp_dir(name);
        fs::create_dir_all(repo.join("src")).expect("create fixture repo");
        fs::write(repo.join("Cargo.toml"), "[package]\nname = \"fixture\"\n")
            .expect("write manifest");
        fs::write(repo.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write lib");
        let validated = ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo");
        (repo, validated)
    }

    #[test]
    fn default_status_is_idle() {
        assert_eq!(
            AnalysisStatusDto::default().phase,
            AnalyzerLifecyclePhase::Idle
        );
    }

    #[test]
    fn document_symbol_request_uses_lsp_method_and_uri() {
        let request = AnalyzerRequestBuilder::document_symbols(7, "file:///tmp/src/lib.rs");

        assert_eq!(request.id, 7);
        assert_eq!(request.method, "textDocument/documentSymbol");
        assert_eq!(
            request.params["textDocument"]["uri"],
            "file:///tmp/src/lib.rs"
        );
    }

    #[test]
    fn references_request_includes_declaration_context() {
        let request = AnalyzerRequestBuilder::references(9, "file:///tmp/src/lib.rs", 3, 4);

        assert_eq!(request.method, "textDocument/references");
        assert_eq!(request.params["position"]["line"], 3);
        assert_eq!(request.params["position"]["character"], 4);
        assert_eq!(request.params["context"]["includeDeclaration"], true);
    }

    #[test]
    fn typed_request_helpers_cover_symbol_navigation_methods() {
        let definition = AnalyzerRequestBuilder::definitions(10, "file:///tmp/src/lib.rs", 1, 2);
        let call_hierarchy =
            AnalyzerRequestBuilder::prepare_call_hierarchy(11, "file:///tmp/src/lib.rs", 3, 4);
        let item = serde_json::json!({ "name": "fixture" });
        let incoming = AnalyzerRequestBuilder::incoming_calls(12, item.clone());
        let outgoing = AnalyzerRequestBuilder::outgoing_calls(13, item);

        assert_eq!(definition.method, "textDocument/definition");
        assert_eq!(call_hierarchy.method, "textDocument/prepareCallHierarchy");
        assert_eq!(incoming.method, "callHierarchy/incomingCalls");
        assert_eq!(outgoing.method, "callHierarchy/outgoingCalls");
    }

    #[test]
    fn service_exposes_configured_request_timeout() {
        let service = RustAnalyzerService::new(
            RustAnalyzerSettings::default().with_request_timeout(Duration::from_secs(5)),
        );

        assert_eq!(service.request_timeout(), Duration::from_secs(5));
    }

    #[tokio::test]
    async fn service_reports_spawn_error_for_missing_binary() {
        let (repo, validated) = fixture_repo("missing-binary");
        let service = RustAnalyzerService::new(RustAnalyzerSettings::for_executable(
            "definitely-not-rust-analyzer",
        ));

        let error = service
            .start_for_workspace(&validated)
            .await
            .expect_err("missing binary must fail");

        assert!(matches!(error, AnalyzerServiceError::Spawn { .. }));
        assert_eq!(service.status().await.phase, AnalyzerLifecyclePhase::Failed);

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[tokio::test]
    async fn only_one_analysis_job_can_run_at_a_time() {
        let service = RustAnalyzerService::default();

        let first = service
            .begin_analysis_job("job-1")
            .await
            .expect("begin first job");
        assert_eq!(first.phase, AnalyzerLifecyclePhase::Busy);

        let second = service
            .begin_analysis_job("job-2")
            .await
            .expect_err("reject concurrent job");
        assert_eq!(second, AnalyzerServiceError::AnalysisAlreadyRunning);

        let completed = service
            .complete_analysis_job("job-1")
            .await
            .expect("complete active job");
        assert_eq!(completed.phase, AnalyzerLifecyclePhase::Idle);
    }

    #[tokio::test]
    async fn active_job_can_be_cancelled() {
        let service = RustAnalyzerService::default();
        service
            .begin_analysis_job("job-1")
            .await
            .expect("begin active job");

        let status = service
            .cancel_active_analysis()
            .await
            .expect("cancel active job");

        assert_eq!(status.phase, AnalyzerLifecyclePhase::Idle);
        assert_eq!(status.active_job_id, None);
    }

    #[tokio::test]
    async fn readiness_wait_times_out() {
        let result = wait_for_readiness(Duration::from_millis(1), std::future::pending()).await;

        assert_eq!(result, Err(AnalyzerServiceError::StartupTimeout));
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn shutdown_terminates_managed_process() {
        let (repo, validated) = fixture_repo("shutdown");
        let service = RustAnalyzerService::new(
            RustAnalyzerSettings::for_executable("/bin/sh")
                .with_arguments(["-c", "sleep 60"])
                .with_startup_timeout(Duration::from_millis(50)),
        );

        let ready = service
            .start_for_workspace(&validated)
            .await
            .expect("start managed process");
        assert_eq!(ready.phase, AnalyzerLifecyclePhase::Ready);

        let stopped = service.shutdown().await.expect("shutdown process");
        assert_eq!(stopped.phase, AnalyzerLifecyclePhase::Stopped);

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn restart_replaces_managed_process() {
        let (repo, validated) = fixture_repo("restart");
        let service = RustAnalyzerService::new(
            RustAnalyzerSettings::for_executable("/bin/sh")
                .with_arguments(["-c", "sleep 60"])
                .with_startup_timeout(Duration::from_millis(50)),
        );

        service
            .start_for_workspace(&validated)
            .await
            .expect("start managed process");
        let restarted = service
            .restart_for_workspace(&validated)
            .await
            .expect("restart managed process");

        assert_eq!(restarted.phase, AnalyzerLifecyclePhase::Ready);

        service.shutdown().await.expect("shutdown process");
        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn cancellation_terminates_managed_process() {
        let (repo, validated) = fixture_repo("cancel-process");
        let service = RustAnalyzerService::new(
            RustAnalyzerSettings::for_executable("/bin/sh")
                .with_arguments(["-c", "sleep 60"])
                .with_startup_timeout(Duration::from_millis(50)),
        );

        service
            .start_for_workspace(&validated)
            .await
            .expect("start managed process");
        service
            .begin_analysis_job("job-1")
            .await
            .expect("begin active job");
        let status = service
            .cancel_active_analysis()
            .await
            .expect("cancel analysis");

        assert_eq!(status.phase, AnalyzerLifecyclePhase::Stopped);
        assert_eq!(status.active_job_id, None);

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }
}
