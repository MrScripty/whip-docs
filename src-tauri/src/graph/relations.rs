use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{
    stable_id, AnalyzerDiagnosticDto, DirectoryGraphBuilder, DirectoryGraphError,
    DirectoryGraphNodeKind, EdgeConfidenceDto, EdgeProvenanceDto, SourceRangeDto,
};
use crate::source::ValidatedRepoPath;

pub const FILE_RELATION_GRAPH_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelationGraphSnapshotDto {
    pub schema_version: u32,
    pub source_root: String,
    pub generated_at: String,
    pub root_node_id: String,
    pub nodes: Vec<FileRelationNodeDto>,
    pub edges: Vec<FileRelationEdgeDto>,
    pub analyzers: Vec<AnalyzerRunDto>,
    pub diagnostics: Vec<AnalyzerDiagnosticDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelationNodeDto {
    pub id: String,
    pub kind: FileRelationNodeKind,
    pub name: String,
    pub path: String,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub language: Option<SourceLanguageDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileRelationNodeKind {
    Repo,
    Directory,
    File,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelationEdgeDto {
    pub id: String,
    pub kind: FileRelationEdgeKind,
    pub from_node_id: String,
    pub to_node_id: String,
    pub weight: u32,
    pub direction: FileRelationDirectionDto,
    pub confidence: EdgeConfidenceDto,
    pub provenance: EdgeProvenanceDto,
    pub evidence_count: u32,
    pub evidence_sample: Vec<FileRelationEvidenceDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileRelationEdgeKind {
    Contains,
    Imports,
    Calls,
    ReferencesType,
    PassesData,
    ReadsData,
    WritesData,
    BorrowsData,
    MutablyBorrowsData,
    CopiesData,
    Tests,
    Configures,
    ImplementsContract,
}

impl FileRelationEdgeKind {
    fn id_prefix(&self) -> &'static str {
        match self {
            Self::Contains => "contains",
            Self::Imports => "imports",
            Self::Calls => "calls",
            Self::ReferencesType => "references_type",
            Self::PassesData => "passes_data",
            Self::ReadsData => "reads_data",
            Self::WritesData => "writes_data",
            Self::BorrowsData => "borrows_data",
            Self::MutablyBorrowsData => "mutably_borrows_data",
            Self::CopiesData => "copies_data",
            Self::Tests => "tests",
            Self::Configures => "configures",
            Self::ImplementsContract => "implements_contract",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileRelationDirectionDto {
    Directed,
    Undirected,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRelationEvidenceDto {
    pub kind: FileRelationEvidenceKind,
    pub source_range: SourceRangeDto,
    pub target_range: Option<SourceRangeDto>,
    pub source_label: Option<String>,
    pub target_label: Option<String>,
    pub access: Option<FileRelationAccessDto>,
    pub analyzer: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileRelationEvidenceKind {
    Import,
    FunctionCall,
    TypeReference,
    DataPass,
    ValueRead,
    ValueWrite,
    Borrow,
    MutableBorrow,
    Copy,
    TestCoverage,
    Configuration,
    ContractImplementation,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileRelationAccessDto {
    Read,
    Write,
    Borrow,
    MutableBorrow,
    Copy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzerRunDto {
    pub analyzer: String,
    pub language: SourceLanguageDto,
    pub version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SourceLanguageDto {
    #[serde(rename = "rust")]
    Rust,
    #[serde(rename = "typescript")]
    TypeScript,
    #[serde(rename = "javascript")]
    JavaScript,
    #[serde(rename = "python")]
    Python,
    #[serde(rename = "csharp")]
    CSharp,
    #[serde(rename = "unknown")]
    Unknown,
}

pub fn stable_file_relation_edge_id(
    kind: FileRelationEdgeKind,
    from_node_id: &str,
    to_node_id: &str,
) -> String {
    stable_id(kind.id_prefix(), &[from_node_id, to_node_id])
}

pub struct FileRelationGraphBuilder;

impl FileRelationGraphBuilder {
    pub fn build_structure(
        source_root: &ValidatedRepoPath,
    ) -> Result<FileRelationGraphSnapshotDto, DirectoryGraphError> {
        let directory_snapshot = DirectoryGraphBuilder::build(source_root)?;
        let nodes = directory_snapshot
            .nodes
            .into_iter()
            .map(|node| {
                let language = if matches!(&node.kind, DirectoryGraphNodeKind::File) {
                    source_language_for_path(&node.path)
                } else {
                    None
                };

                FileRelationNodeDto {
                    id: node.id,
                    kind: match node.kind {
                        DirectoryGraphNodeKind::Repo => FileRelationNodeKind::Repo,
                        DirectoryGraphNodeKind::Directory => FileRelationNodeKind::Directory,
                        DirectoryGraphNodeKind::File => FileRelationNodeKind::File,
                    },
                    name: node.name,
                    path: node.path,
                    parent_id: node.parent_id,
                    child_ids: node.child_ids,
                    language,
                }
            })
            .collect::<Vec<_>>();
        let edges = directory_snapshot
            .edges
            .into_iter()
            .map(|edge| FileRelationEdgeDto {
                id: stable_file_relation_edge_id(
                    FileRelationEdgeKind::Contains,
                    &edge.from_node_id,
                    &edge.to_node_id,
                ),
                kind: FileRelationEdgeKind::Contains,
                from_node_id: edge.from_node_id,
                to_node_id: edge.to_node_id,
                weight: 1,
                direction: FileRelationDirectionDto::Directed,
                confidence: EdgeConfidenceDto::Exact,
                provenance: EdgeProvenanceDto::Normalized,
                evidence_count: 0,
                evidence_sample: Vec::new(),
            })
            .collect();

        Ok(FileRelationGraphSnapshotDto {
            schema_version: FILE_RELATION_GRAPH_SCHEMA_VERSION,
            source_root: source_root.display_path(),
            generated_at: generated_at_string(),
            root_node_id: directory_snapshot.root_node_id,
            nodes,
            edges,
            analyzers: Vec::new(),
            diagnostics: Vec::new(),
        })
    }
}

fn source_language_for_path(path: &str) -> Option<SourceLanguageDto> {
    if path.ends_with(".rs") {
        return Some(SourceLanguageDto::Rust);
    }

    if path.ends_with(".ts") || path.ends_with(".tsx") {
        return Some(SourceLanguageDto::TypeScript);
    }

    if path.ends_with(".js") || path.ends_with(".jsx") {
        return Some(SourceLanguageDto::JavaScript);
    }

    if path.ends_with(".py") {
        return Some(SourceLanguageDto::Python);
    }

    if path.ends_with(".cs") {
        return Some(SourceLanguageDto::CSharp);
    }

    None
}

fn generated_at_string() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    format!("unix:{seconds}")
}

#[cfg(test)]
mod tests {
    use super::{
        stable_file_relation_edge_id, AnalyzerRunDto, FileRelationDirectionDto,
        FileRelationEdgeDto, FileRelationEdgeKind, FileRelationEvidenceDto,
        FileRelationEvidenceKind, FileRelationGraphBuilder, FileRelationGraphSnapshotDto,
        FileRelationNodeDto, FileRelationNodeKind, SourceLanguageDto,
        FILE_RELATION_GRAPH_SCHEMA_VERSION,
    };
    use crate::graph::{
        AnalyzerDiagnosticDto, EdgeConfidenceDto, EdgeProvenanceDto, SourceRangeDto,
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
            "whip-docs-relation-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    #[test]
    fn file_relation_graph_snapshot_serializes_wire_contract() {
        let source_range = SourceRangeDto {
            path: "src/main.rs".to_string(),
            start_line: 3,
            start_column: 1,
            end_line: 3,
            end_column: 12,
        };
        let snapshot = FileRelationGraphSnapshotDto {
            schema_version: FILE_RELATION_GRAPH_SCHEMA_VERSION,
            source_root: "/repo".to_string(),
            generated_at: "unix:1".to_string(),
            root_node_id: "repo:.".to_string(),
            nodes: vec![FileRelationNodeDto {
                id: "file:src/main.rs".to_string(),
                kind: FileRelationNodeKind::File,
                name: "main.rs".to_string(),
                path: "src/main.rs".to_string(),
                parent_id: Some("dir:src".to_string()),
                child_ids: Vec::new(),
                language: Some(SourceLanguageDto::Rust),
            }],
            edges: vec![FileRelationEdgeDto {
                id: "calls:file:src/main.rs:file:src/lib.rs".to_string(),
                kind: FileRelationEdgeKind::Calls,
                from_node_id: "file:src/main.rs".to_string(),
                to_node_id: "file:src/lib.rs".to_string(),
                weight: 2,
                direction: FileRelationDirectionDto::Directed,
                confidence: EdgeConfidenceDto::Partial,
                provenance: EdgeProvenanceDto::Syn,
                evidence_count: 2,
                evidence_sample: vec![FileRelationEvidenceDto {
                    kind: FileRelationEvidenceKind::FunctionCall,
                    source_range,
                    target_range: None,
                    source_label: Some("main".to_string()),
                    target_label: Some("run".to_string()),
                    access: None,
                    analyzer: "syn".to_string(),
                }],
            }],
            analyzers: vec![AnalyzerRunDto {
                analyzer: "syn".to_string(),
                language: SourceLanguageDto::Rust,
                version: None,
            }],
            diagnostics: vec![AnalyzerDiagnosticDto {
                code: "partial_call_resolution".to_string(),
                message: "call target was inferred".to_string(),
                source_path: Some("src/main.rs".to_string()),
            }],
        };

        let serialized =
            serde_json::to_string(&snapshot).expect("serialize relation graph snapshot");
        let decoded: FileRelationGraphSnapshotDto =
            serde_json::from_str(&serialized).expect("deserialize relation graph snapshot");

        assert_eq!(decoded, snapshot);
        assert!(serialized.contains(r#""schemaVersion":1"#));
        assert!(serialized.contains(r#""kind":"calls""#));
        assert!(serialized.contains(r#""direction":"directed""#));
        assert!(serialized.contains(r#""language":"rust""#));
        assert!(serialized.contains(r#""evidenceCount":2"#));
    }

    #[test]
    fn stable_relation_edge_ids_include_relation_kind_and_files() {
        let id = stable_file_relation_edge_id(
            FileRelationEdgeKind::Imports,
            "file:src/main.rs",
            "file:src/lib.rs",
        );

        assert_eq!(id, "imports:file:src/main.rs:file:src/lib.rs");
    }

    #[test]
    fn structure_builder_promotes_directory_graph_to_relation_graph() {
        let repo = unique_temp_dir("structure");
        fs::create_dir_all(repo.join("src")).expect("create src");
        fs::write(repo.join("src/lib.rs"), "pub fn fixture() {}\n").expect("write rust source");
        fs::write(repo.join("src/view.ts"), "export const fixture = 1;\n")
            .expect("write typescript source");
        let source_root =
            ValidatedRepoPath::parse_existing_source_root(&repo).expect("valid source root");

        let snapshot =
            FileRelationGraphBuilder::build_structure(&source_root).expect("relation graph");

        assert_eq!(snapshot.schema_version, FILE_RELATION_GRAPH_SCHEMA_VERSION);
        assert_eq!(snapshot.root_node_id, "repo:.");
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.id == "file:src/lib.rs"
                && node.kind == FileRelationNodeKind::File
                && node.language == Some(SourceLanguageDto::Rust)));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.id == "file:src/view.ts"
                && node.language == Some(SourceLanguageDto::TypeScript)));
        assert!(snapshot.edges.iter().any(|edge| {
            edge.kind == FileRelationEdgeKind::Contains
                && edge.id == "contains:repo:.:dir:src"
                && edge.confidence == EdgeConfidenceDto::Exact
                && edge.provenance == EdgeProvenanceDto::Normalized
        }));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }
}
