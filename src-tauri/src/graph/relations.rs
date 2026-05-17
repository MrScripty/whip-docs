use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use super::{
    stable_id, AnalyzerDiagnosticDto, DirectoryGraphBuilder, DirectoryGraphError,
    DirectoryGraphNodeKind, EdgeConfidenceDto, EdgeProvenanceDto, SourceRangeDto,
};
use crate::analyzer::rust_relations::{
    RustImportRelationSnapshotDto, RustImportResolutionStatusDto,
};
use crate::source::ValidatedRepoPath;

pub const FILE_RELATION_GRAPH_SCHEMA_VERSION: u32 = 1;
const FILE_RELATION_EVIDENCE_SAMPLE_LIMIT: usize = 10;

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

    pub fn add_rust_import_relations(
        snapshot: &mut FileRelationGraphSnapshotDto,
        import_snapshot: RustImportRelationSnapshotDto,
    ) {
        snapshot.analyzers.push(AnalyzerRunDto {
            analyzer: import_snapshot.analyzer.clone(),
            language: SourceLanguageDto::Rust,
            version: None,
        });
        snapshot.diagnostics.extend(import_snapshot.diagnostics);

        for fact in import_snapshot.facts {
            if fact.status != RustImportResolutionStatusDto::Resolved {
                continue;
            }

            let Some(target_path) = fact.target_path else {
                continue;
            };

            let from_node_id = file_relation_file_id(&fact.source_path);
            let to_node_id = file_relation_file_id(&target_path);
            let edge_id = stable_file_relation_edge_id(
                FileRelationEdgeKind::Imports,
                &from_node_id,
                &to_node_id,
            );
            let evidence = FileRelationEvidenceDto {
                kind: FileRelationEvidenceKind::Import,
                source_range: fact.evidence,
                target_range: None,
                source_label: Some(fact.import_path),
                target_label: Some(target_path),
                access: None,
                analyzer: import_snapshot.analyzer.clone(),
            };

            upsert_relation_edge(
                &mut snapshot.edges,
                FileRelationEdgeDto {
                    id: edge_id,
                    kind: FileRelationEdgeKind::Imports,
                    from_node_id,
                    to_node_id,
                    weight: 1,
                    direction: FileRelationDirectionDto::Directed,
                    confidence: EdgeConfidenceDto::Exact,
                    provenance: EdgeProvenanceDto::Syn,
                    evidence_count: 1,
                    evidence_sample: vec![evidence],
                },
            );
        }
    }
}

fn upsert_relation_edge(edges: &mut Vec<FileRelationEdgeDto>, new_edge: FileRelationEdgeDto) {
    if let Some(existing_edge) = edges.iter_mut().find(|edge| edge.id == new_edge.id) {
        existing_edge.weight = existing_edge.weight.saturating_add(new_edge.weight);
        existing_edge.evidence_count = existing_edge
            .evidence_count
            .saturating_add(new_edge.evidence_count);

        for evidence in new_edge.evidence_sample {
            if existing_edge.evidence_sample.len() >= FILE_RELATION_EVIDENCE_SAMPLE_LIMIT {
                break;
            }

            existing_edge.evidence_sample.push(evidence);
        }

        return;
    }

    edges.push(new_edge);
}

fn file_relation_file_id(path: &str) -> String {
    stable_id("file", &[path])
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
    use crate::analyzer::rust_relations::{
        RustImportRelationFactDto, RustImportRelationSnapshotDto, RustImportResolutionStatusDto,
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

    fn test_source_range(path: &str, line: u32) -> SourceRangeDto {
        SourceRangeDto {
            path: path.to_string(),
            start_line: line,
            start_column: 1,
            end_line: line,
            end_column: 1,
        }
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

    #[test]
    fn rust_import_facts_merge_into_weighted_file_relation_edges() {
        let repo = unique_temp_dir("rust-import-merge");
        fs::create_dir_all(repo.join("src")).expect("create src");
        fs::write(
            repo.join("src/main.rs"),
            "use crate::lib::run;\nuse crate::lib::State;\n",
        )
        .expect("write main source");
        fs::write(
            repo.join("src/lib.rs"),
            "pub fn run() {}\npub struct State;\n",
        )
        .expect("write lib source");
        let source_root =
            ValidatedRepoPath::parse_existing_source_root(&repo).expect("valid source root");
        let mut snapshot =
            FileRelationGraphBuilder::build_structure(&source_root).expect("relation graph");

        FileRelationGraphBuilder::add_rust_import_relations(
            &mut snapshot,
            RustImportRelationSnapshotDto {
                analyzer: "syn-rust-import-relations".to_string(),
                source_root: source_root.display_path(),
                facts: vec![
                    RustImportRelationFactDto {
                        source_path: "src/main.rs".to_string(),
                        import_path: "crate::lib::run".to_string(),
                        target_path: Some("src/lib.rs".to_string()),
                        status: RustImportResolutionStatusDto::Resolved,
                        evidence: test_source_range("src/main.rs", 1),
                    },
                    RustImportRelationFactDto {
                        source_path: "src/main.rs".to_string(),
                        import_path: "crate::lib::State".to_string(),
                        target_path: Some("src/lib.rs".to_string()),
                        status: RustImportResolutionStatusDto::Resolved,
                        evidence: test_source_range("src/main.rs", 2),
                    },
                    RustImportRelationFactDto {
                        source_path: "src/main.rs".to_string(),
                        import_path: "crate::missing::Thing".to_string(),
                        target_path: None,
                        status: RustImportResolutionStatusDto::Unresolved,
                        evidence: test_source_range("src/main.rs", 3),
                    },
                ],
                diagnostics: vec![AnalyzerDiagnosticDto {
                    code: "rust_import_unresolved".to_string(),
                    message: "unresolved Rust import 'crate::missing::Thing'".to_string(),
                    source_path: Some("src/main.rs".to_string()),
                }],
            },
        );

        let import_edge = snapshot
            .edges
            .iter()
            .find(|edge| edge.id == "imports:file:src/main.rs:file:src/lib.rs")
            .expect("merged import edge");

        assert_eq!(import_edge.kind, FileRelationEdgeKind::Imports);
        assert_eq!(import_edge.weight, 2);
        assert_eq!(import_edge.evidence_count, 2);
        assert_eq!(import_edge.evidence_sample.len(), 2);
        assert_eq!(import_edge.confidence, EdgeConfidenceDto::Exact);
        assert_eq!(import_edge.provenance, EdgeProvenanceDto::Syn);
        assert!(snapshot.analyzers.iter().any(|analyzer| {
            analyzer.analyzer == "syn-rust-import-relations"
                && analyzer.language == SourceLanguageDto::Rust
        }));
        assert!(snapshot
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "rust_import_unresolved"));
        assert!(!snapshot
            .edges
            .iter()
            .any(|edge| edge.id.contains("missing")));

        fs::remove_dir_all(repo).expect("cleanup temp repo");
    }
}
