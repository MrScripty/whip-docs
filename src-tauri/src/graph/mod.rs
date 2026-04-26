//! Versioned architecture graph contracts and normalization.

use serde::{Deserialize, Serialize};

pub const GRAPH_SCHEMA_VERSION: u32 = 1;

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
        stable_edge_id, stable_node_id, AnalyzerDiagnosticDto, EdgeConfidenceDto,
        EdgeProvenanceDto, GraphEdgeDto, GraphEdgeKind, GraphNodeDto, GraphNodeKind,
        GraphSnapshotDto, SourceRangeDto, GRAPH_SCHEMA_VERSION,
    };

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
}
