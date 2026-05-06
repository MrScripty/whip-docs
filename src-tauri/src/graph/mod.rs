//! Versioned architecture graph contracts and normalization.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::source::ValidatedRepoPath;

pub const GRAPH_SCHEMA_VERSION: u32 = 1;
pub const DIRECTORY_GRAPH_SCHEMA_VERSION: u32 = 1;

const DIRECTORY_GRAPH_ROOT_ID: &str = "repo:.";
const DIRECTORY_GRAPH_ROOT_PATH: &str = ".";
const IGNORED_DIRECTORY_NAMES: &[&str] = &[".git", "target", "node_modules", "dist"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSnapshotDto {
    pub schema_version: u32,
    pub source_root: String,
    pub generated_at: String,
    pub nodes: Vec<GraphNodeDto>,
    pub edges: Vec<GraphEdgeDto>,
    pub diagnostics: Vec<AnalyzerDiagnosticDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNodeDto {
    pub id: String,
    pub kind: GraphNodeKind,
    pub label: String,
    pub source_range: Option<SourceRangeDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdgeDto {
    pub id: String,
    pub kind: GraphEdgeKind,
    pub source_id: String,
    pub target_id: String,
    pub provenance: EdgeProvenanceDto,
    pub confidence: EdgeConfidenceDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GraphNodeKind {
    Workspace,
    Crate,
    Module,
    File,
    Struct,
    Enum,
    Trait,
    Impl,
    Function,
    Method,
    TauriCommand,
}

impl GraphNodeKind {
    fn id_prefix(&self) -> &'static str {
        match self {
            Self::Workspace => "workspace",
            Self::Crate => "crate",
            Self::Module => "module",
            Self::File => "file",
            Self::Struct => "struct",
            Self::Enum => "enum",
            Self::Trait => "trait",
            Self::Impl => "impl",
            Self::Function => "function",
            Self::Method => "method",
            Self::TauriCommand => "tauri_command",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GraphEdgeKind {
    Contains,
    Defines,
    DefinesMethod,
    Imports,
    Calls,
    Implements,
    References,
    ExposesCommand,
}

impl GraphEdgeKind {
    fn id_prefix(&self) -> &'static str {
        match self {
            Self::Contains => "contains",
            Self::Defines => "defines",
            Self::DefinesMethod => "defines_method",
            Self::Imports => "imports",
            Self::Calls => "calls",
            Self::Implements => "implements",
            Self::References => "references",
            Self::ExposesCommand => "exposes_command",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRangeDto {
    pub path: String,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeProvenanceDto {
    RustAnalyzer,
    Syn,
    Normalized,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeConfidenceDto {
    Exact,
    Inferred,
    Partial,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerDiagnosticDto {
    pub code: String,
    pub message: String,
    pub source_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryGraphSnapshotDto {
    pub schema_version: u32,
    pub root_node_id: String,
    pub nodes: Vec<DirectoryGraphNodeDto>,
    pub edges: Vec<DirectoryGraphEdgeDto>,
    pub excluded_path_count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryGraphNodeDto {
    pub id: String,
    pub kind: DirectoryGraphNodeKind,
    pub name: String,
    pub path: String,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub expanded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectoryGraphNodeKind {
    Repo,
    Directory,
    File,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryGraphEdgeDto {
    pub id: String,
    pub kind: DirectoryGraphEdgeKind,
    pub from_node_id: String,
    pub to_node_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectoryGraphEdgeKind {
    Tree,
}

#[derive(Debug, thiserror::Error)]
pub enum DirectoryGraphError {
    #[error("failed to read directory `{path}`")]
    ReadDirectory {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to read directory entry under `{path}`")]
    ReadDirectoryEntry {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("failed to read metadata for `{path}`")]
    Metadata {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("path `{path}` is not under repository root `{root}`")]
    RelativePath { path: PathBuf, root: PathBuf },
}

#[derive(Debug, Default)]
pub struct DirectoryGraphBuilder {
    excluded_path_count: usize,
}

impl DirectoryGraphBuilder {
    pub fn build(
        repo_path: &ValidatedRepoPath,
    ) -> Result<DirectoryGraphSnapshotDto, DirectoryGraphError> {
        Self::default().build_snapshot(repo_path.as_path())
    }

    fn build_snapshot(
        mut self,
        root: &Path,
    ) -> Result<DirectoryGraphSnapshotDto, DirectoryGraphError> {
        let root_name = root
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("repository")
            .to_owned();
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let child_ids =
            self.collect_children(root, root, DIRECTORY_GRAPH_ROOT_ID, &mut nodes, &mut edges)?;

        nodes.insert(
            0,
            DirectoryGraphNodeDto {
                id: DIRECTORY_GRAPH_ROOT_ID.to_owned(),
                kind: DirectoryGraphNodeKind::Repo,
                name: root_name,
                path: DIRECTORY_GRAPH_ROOT_PATH.to_owned(),
                parent_id: None,
                child_ids,
                expanded: true,
            },
        );

        Ok(DirectoryGraphSnapshotDto {
            schema_version: DIRECTORY_GRAPH_SCHEMA_VERSION,
            root_node_id: DIRECTORY_GRAPH_ROOT_ID.to_owned(),
            nodes,
            edges,
            excluded_path_count: self.excluded_path_count,
        })
    }

    fn collect_children(
        &mut self,
        root: &Path,
        directory: &Path,
        parent_id: &str,
        nodes: &mut Vec<DirectoryGraphNodeDto>,
        edges: &mut Vec<DirectoryGraphEdgeDto>,
    ) -> Result<Vec<String>, DirectoryGraphError> {
        let entries = sorted_directory_entries(directory)?;
        let mut child_ids = Vec::new();

        for entry in entries {
            let path = entry.path();
            let metadata = std::fs::symlink_metadata(&path).map_err(|source| {
                DirectoryGraphError::Metadata {
                    path: path.clone(),
                    source,
                }
            })?;

            if metadata.file_type().is_symlink() {
                self.excluded_path_count += 1;
                continue;
            }

            if metadata.is_dir() && should_ignore_directory(&path) {
                self.excluded_path_count += 1;
                continue;
            }

            let relative_path = normalized_relative_path(root, &path)?;
            let (kind, node_id, nested_child_ids) = if metadata.is_dir() {
                let node_id = directory_graph_directory_id(&relative_path);
                let nested_child_ids =
                    self.collect_children(root, &path, &node_id, nodes, edges)?;
                (DirectoryGraphNodeKind::Directory, node_id, nested_child_ids)
            } else {
                (
                    DirectoryGraphNodeKind::File,
                    directory_graph_file_id(&relative_path),
                    Vec::new(),
                )
            };

            edges.push(DirectoryGraphEdgeDto {
                id: directory_graph_tree_edge_id(parent_id, &node_id),
                kind: DirectoryGraphEdgeKind::Tree,
                from_node_id: parent_id.to_owned(),
                to_node_id: node_id.clone(),
            });
            child_ids.push(node_id.clone());
            nodes.push(DirectoryGraphNodeDto {
                id: node_id,
                kind,
                name: entry.file_name().to_string_lossy().into_owned(),
                path: relative_path,
                parent_id: Some(parent_id.to_owned()),
                child_ids: nested_child_ids,
                expanded: false,
            });
        }

        Ok(child_ids)
    }
}

fn sorted_directory_entries(
    directory: &Path,
) -> Result<Vec<std::fs::DirEntry>, DirectoryGraphError> {
    let mut entries = std::fs::read_dir(directory)
        .map_err(|source| DirectoryGraphError::ReadDirectory {
            path: directory.to_path_buf(),
            source,
        })?
        .map(|entry| {
            entry.map_err(|source| DirectoryGraphError::ReadDirectoryEntry {
                path: directory.to_path_buf(),
                source,
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    entries.sort_by(|left, right| {
        directory_graph_entry_sort_kind(left)
            .cmp(&directory_graph_entry_sort_kind(right))
            .then_with(|| left.file_name().cmp(&right.file_name()))
    });
    Ok(entries)
}

fn directory_graph_entry_sort_kind(entry: &std::fs::DirEntry) -> u8 {
    entry
        .file_type()
        .map(|file_type| if file_type.is_dir() { 0 } else { 1 })
        .unwrap_or(2)
}

fn should_ignore_directory(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| IGNORED_DIRECTORY_NAMES.contains(&name))
}

fn normalized_relative_path(root: &Path, path: &Path) -> Result<String, DirectoryGraphError> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| DirectoryGraphError::RelativePath {
            path: path.to_path_buf(),
            root: root.to_path_buf(),
        })?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn directory_graph_directory_id(relative_path: &str) -> String {
    stable_id("dir", &[relative_path])
}

fn directory_graph_file_id(relative_path: &str) -> String {
    stable_id("file", &[relative_path])
}

fn directory_graph_tree_edge_id(from_node_id: &str, to_node_id: &str) -> String {
    stable_id("tree", &[from_node_id, to_node_id])
}

pub fn stable_node_id(kind: GraphNodeKind, parts: &[&str]) -> String {
    stable_id(kind.id_prefix(), parts)
}

pub fn stable_edge_id(kind: GraphEdgeKind, source_id: &str, target_id: &str) -> String {
    stable_id(kind.id_prefix(), &[source_id, target_id])
}

fn stable_id(prefix: &str, parts: &[&str]) -> String {
    let mut id = String::from(prefix);
    for part in parts {
        id.push(':');
        id.push_str(&sanitize_id_part(part));
    }
    id
}

fn sanitize_id_part(part: &str) -> String {
    part.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.' | '/' | ':')
            {
                character
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{
        stable_edge_id, stable_node_id, AnalyzerDiagnosticDto, DirectoryGraphBuilder,
        DirectoryGraphNodeKind, EdgeConfidenceDto, EdgeProvenanceDto, GraphEdgeDto, GraphEdgeKind,
        GraphNodeDto, GraphNodeKind, GraphSnapshotDto, SourceRangeDto, DIRECTORY_GRAPH_ROOT_ID,
        GRAPH_SCHEMA_VERSION,
    };
    use crate::source::ValidatedRepoPath;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-graph-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    fn create_directory_graph_fixture() -> PathBuf {
        let repo = unique_temp_dir("directory-fixture");
        fs::create_dir_all(repo.join("src/nested")).expect("create source dirs");
        fs::create_dir_all(repo.join("target/debug")).expect("create ignored target dir");
        fs::write(
            repo.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\n",
        )
        .expect("write manifest");
        fs::write(repo.join("README.md"), "# Fixture\n").expect("write readme");
        fs::write(repo.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write lib");
        fs::write(repo.join("src/nested/mod.rs"), "").expect("write nested mod");
        fs::write(repo.join("target/debug/output"), "").expect("write ignored output");
        repo
    }

    #[test]
    fn stable_node_ids_are_deterministic_and_sanitized() {
        let first = stable_node_id(
            GraphNodeKind::Function,
            &["crate-a", "src/main.rs", "run()"],
        );
        let second = stable_node_id(
            GraphNodeKind::Function,
            &["crate-a", "src/main.rs", "run()"],
        );

        assert_eq!(first, second);
        assert_eq!(first, "function:crate-a:src/main.rs:run__");
    }

    #[test]
    fn stable_edge_ids_include_kind_source_and_target() {
        let edge_id = stable_edge_id(GraphEdgeKind::Calls, "function:a", "function:b");

        assert_eq!(edge_id, "calls:function:a:function:b");
    }

    #[test]
    fn graph_snapshot_serializes_versioned_contract() {
        let source_range = SourceRangeDto {
            path: "src/main.rs".to_string(),
            start_line: 1,
            start_column: 1,
            end_line: 3,
            end_column: 1,
        };
        let node = GraphNodeDto {
            id: "function:main".to_string(),
            kind: GraphNodeKind::Function,
            label: "main".to_string(),
            source_range: Some(source_range),
        };
        let edge = GraphEdgeDto {
            id: "contains:crate:function".to_string(),
            kind: GraphEdgeKind::Contains,
            source_id: "crate:fixture".to_string(),
            target_id: "function:main".to_string(),
            provenance: EdgeProvenanceDto::Normalized,
            confidence: EdgeConfidenceDto::Exact,
        };
        let snapshot = GraphSnapshotDto {
            schema_version: GRAPH_SCHEMA_VERSION,
            source_root: "/repo".to_string(),
            generated_at: "2026-04-26T00:00:00Z".to_string(),
            nodes: vec![node],
            edges: vec![edge],
            diagnostics: vec![AnalyzerDiagnosticDto {
                code: "partial_macro".to_string(),
                message: "macro expansion skipped".to_string(),
                source_path: Some("src/main.rs".to_string()),
            }],
        };

        let serialized = serde_json::to_string(&snapshot).expect("serialize graph snapshot");
        let decoded: GraphSnapshotDto =
            serde_json::from_str(&serialized).expect("deserialize graph snapshot");

        assert_eq!(decoded, snapshot);
        assert!(serialized.contains(r#""schemaVersion":1"#));
        assert!(serialized.contains(r#""kind":"function""#));
        assert!(serialized.contains(r#""provenance":"normalized""#));
    }

    #[test]
    fn directory_graph_builder_creates_repo_directory_file_nodes_and_tree_edges() {
        let repo = create_directory_graph_fixture();
        let validated = ValidatedRepoPath::parse_existing_cargo_repo(&repo)
            .expect("fixture should be a valid repo");

        let snapshot = DirectoryGraphBuilder::build(&validated).expect("directory graph builds");

        assert_eq!(snapshot.root_node_id, DIRECTORY_GRAPH_ROOT_ID);
        assert_eq!(snapshot.excluded_path_count, 1);
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.id == "dir:src" && node.kind == DirectoryGraphNodeKind::Directory));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.id == "file:Cargo.toml" && node.kind == DirectoryGraphNodeKind::File));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.id == "tree:repo:.:dir:src"));

        fs::remove_dir_all(repo).expect("cleanup fixture");
    }

    #[test]
    fn directory_graph_builder_sorts_directories_before_files() {
        let repo = create_directory_graph_fixture();
        let validated = ValidatedRepoPath::parse_existing_cargo_repo(&repo)
            .expect("fixture should be a valid repo");

        let snapshot = DirectoryGraphBuilder::build(&validated).expect("directory graph builds");
        let root = snapshot
            .nodes
            .iter()
            .find(|node| node.id == DIRECTORY_GRAPH_ROOT_ID)
            .expect("root node exists");

        assert_eq!(
            root.child_ids,
            vec![
                "dir:src".to_string(),
                "file:Cargo.toml".to_string(),
                "file:README.md".to_string()
            ]
        );

        fs::remove_dir_all(repo).expect("cleanup fixture");
    }
}
