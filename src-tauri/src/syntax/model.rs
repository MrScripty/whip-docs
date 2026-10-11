use super::Dialect;
use serde::{Deserialize, Serialize};

pub const SOURCE_SCOPE: &str = "captured_multilingual_sources_v1";
pub const PARSER_ID: &str = "tree-sitter@0.25.10";
pub const EXTRACTOR_ID: &str = "whip-docs-syntax@3";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ByteRange {
    pub start_byte: usize,
    pub end_byte: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Coverage {
    SupportedSubset,
    Incomplete,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeclarationKind {
    Function,
    Method,
    Class,
    Struct,
    Enum,
    Interface,
    Trait,
    Implementation,
    Module,
    TypeAlias,
    Binding,
    Field,
    Variant,
    Parameter,
    Component,
    Snippet,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Declaration {
    pub id: String,
    pub name: String,
    pub kind: DeclarationKind,
    pub syntax_kind: String,
    pub dialect: Dialect,
    pub parent_id: Option<String>,
    pub range: ByteRange,
    pub name_range: ByteRange,
    pub header_complete: bool,
    pub body_complete: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RelationKind {
    WrittenType,
    ImportSyntax,
    CallSyntax,
    InheritanceSyntax,
}

/// Written syntax only: target_range points into this file, not a resolved symbol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationFact {
    pub owner_id: Option<String>,
    pub kind: RelationKind,
    pub range: ByteRange,
    pub target_range: ByteRange,
    pub qualification: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyntaxDiagnostic {
    pub code: String,
    pub path: String,
    pub range: Option<ByteRange>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GrammarIdentity {
    pub dialect: Dialect,
    pub grammar: String,
}

/// Safe for persistence: metadata and hashes, never source or copied signatures.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileIdentity {
    pub path: String,
    pub dialect: Dialect,
    pub grammars: Vec<GrammarIdentity>,
    pub source_digest: String,
    pub structure_digest: String,
    pub byte_length: usize,
    pub coverage: Coverage,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AnalysisIdentity {
    pub schema_version: u32,
    pub source_scope: String,
    pub parser: String,
    pub extractor: String,
    /// True only when traversal completed without skipped candidate/error/limit.
    pub discovery_complete: bool,
    pub files: Vec<FileIdentity>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileAnalysis {
    pub identity: FileIdentity,
    pub declarations: Vec<Declaration>,
    pub relations: Vec<RelationFact>,
    pub diagnostics: Vec<SyntaxDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAnalysisDto {
    pub schema_version: u32,
    pub identity: AnalysisIdentity,
    pub files: Vec<FileAnalysis>,
    pub diagnostics: Vec<SyntaxDiagnostic>,
}
