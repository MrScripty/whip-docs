// Repository capture and graph projection are implemented independently of Cargo metadata.
use super::*;
use crate::analyzer::AnalyzedGraph;
use crate::graph::*;
use crate::source::{read_bounded_source, ValidatedRepoPath};
use std::collections::BTreeMap;

#[derive(Debug, Clone)]
pub struct AnalysisOptions {
    pub dialect_overrides: BTreeMap<String, Dialect>,
    pub max_files: usize,
    pub max_total_bytes: usize,
    pub max_entries: usize,
}
impl Default for AnalysisOptions {
    fn default() -> Self {
        Self {
            dialect_overrides: BTreeMap::new(),
            max_files: 4096,
            max_total_bytes: 64 * 1024 * 1024,
            max_entries: 100_000,
        }
    }
}

const IGNORED: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".venv",
    "venv",
    "__pycache__",
    ".svelte-kit",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
];

pub fn analyze_repository(root: &ValidatedRepoPath, options: &AnalysisOptions) -> AnalyzedGraph {
    let mut sources = BTreeMap::new();
    let mut files = Vec::new();
    let mut diagnostics = Vec::new();
    let mut total = 0;
    let mut inventory = 0;
    let mut discovery_complete = true;
    let walker = walkdir::WalkDir::new(root.as_path())
        .follow_links(false)
        .max_depth(128)
        .into_iter()
        .filter_entry(|entry| {
            entry.depth() == 0
                || !entry.file_type().is_dir()
                || !IGNORED.contains(&entry.file_name().to_str().unwrap_or(""))
        });
    // Bound discovery before sorting: WalkDir's own sorter buffers an entire wide directory.
    let mut discovered = Vec::new();
    for (count, entry) in walker.enumerate() {
        if count >= options.max_entries.min(100_000) {
            repo_diagnostic(
                &mut diagnostics,
                "entry_limit",
                "",
                "Directory traversal entry limit reached.",
            );
            discovery_complete = false;
            break;
        }
        match entry {
            Ok(entry) => {
                if entry.depth() == 128 && entry.file_type().is_dir() {
                    repo_diagnostic(
                        &mut diagnostics,
                        "depth_limit",
                        "",
                        "Directory traversal depth limit reached.",
                    );
                    discovery_complete = false;
                }
                discovered.push(entry);
            }
            Err(_) => {
                repo_diagnostic(
                    &mut diagnostics,
                    "source_walk_failed",
                    "",
                    "A directory entry could not be read.",
                );
                discovery_complete = false;
            }
        }
    }
    discovered.sort_by(|a, b| a.path().cmp(b.path()));
    for entry in discovered {
        if entry.file_type().is_dir() {
            continue;
        }
        let Some(path) = entry
            .path()
            .strip_prefix(root.as_path())
            .ok()
            .and_then(normal_relative_path)
        else {
            repo_diagnostic(
                &mut diagnostics,
                "unsupported_path",
                "",
                "Source path is not unambiguous normal UTF-8 components.",
            );
            continue;
        };
        let dialect = match route(&path, options.dialect_overrides.get(&path).copied()) {
            Ok(d) => d,
            Err(code) => {
                repo_diagnostic(
                    &mut diagnostics,
                    code,
                    &path,
                    "File has no selected supported dialect; it is outside captured-source scope.",
                );
                continue;
            }
        };
        if !entry.file_type().is_file() {
            repo_diagnostic(
                &mut diagnostics,
                "non_regular_source",
                &path,
                "Symlinks and special files are excluded.",
            );
            continue;
        }
        if sources.len() >= options.max_files.min(4096) {
            repo_diagnostic(
                &mut diagnostics,
                "file_limit",
                &path,
                "Source file count limit reached.",
            );
            break;
        }
        let source = match read_bounded_source(root, &path) {
            Ok(source) => source,
            Err(_) => {
                repo_diagnostic(
                    &mut diagnostics,
                    "source_read_failed",
                    &path,
                    "Source is unavailable, non-UTF-8, outside the root, or exceeds 2 MiB.",
                );
                continue;
            }
        };
        if total + source.len() > options.max_total_bytes.min(64 * 1024 * 1024) {
            repo_diagnostic(
                &mut diagnostics,
                "total_byte_limit",
                &path,
                "Captured source byte limit reached.",
            );
            break;
        }
        total += source.len();
        let file = analyze_file(&path, &source, dialect);
        inventory += file.declarations.len() + file.relations.len();
        files.push(file);
        sources.insert(path, source);
        if inventory >= 100_000 {
            repo_diagnostic(
                &mut diagnostics,
                "repository_inventory_limit",
                "",
                "Repository declaration/fact budget reached.",
            );
            discovery_complete = false;
            break;
        }
    }
    files.sort_by(|a, b| a.identity.path.cmp(&b.identity.path));
    let identity = AnalysisIdentity {
        schema_version: 1,
        source_scope: SOURCE_SCOPE.to_owned(),
        parser: PARSER_ID.to_owned(),
        extractor: EXTRACTOR_ID.to_owned(),
        discovery_complete: discovery_complete
            && diagnostics.iter().all(|d| d.code == "unsupported_language"),
        files: files.iter().map(|f| f.identity.clone()).collect(),
    };
    let syntax = SourceAnalysisDto {
        schema_version: 1,
        identity,
        files,
        diagnostics,
    };
    let snapshot = project(root, &syntax, &sources);
    AnalyzedGraph {
        snapshot,
        sources,
        repository_revision: None,
        syntax: Some(syntax),
    }
}

fn normal_relative_path(path: &std::path::Path) -> Option<String> {
    path.components()
        .map(|part| match part {
            std::path::Component::Normal(name) => name.to_str().filter(|name| !name.contains('\\')),
            _ => None,
        })
        .collect::<Option<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

fn repo_diagnostic(diagnostics: &mut Vec<SyntaxDiagnostic>, code: &str, path: &str, message: &str) {
    // Preserve a terminal capacity diagnostic rather than silently dropping it.
    if diagnostics.len() >= 512 {
        diagnostics.pop();
        diagnostics.push(SyntaxDiagnostic {
            code: "diagnostics_truncated".to_owned(),
            path: String::new(),
            range: None,
            message: "Additional discovery diagnostics were omitted at the diagnostic bound."
                .to_owned(),
        });
        return;
    }
    diagnostics.push(SyntaxDiagnostic {
        code: code.to_owned(),
        path: path.to_owned(),
        range: None,
        message: message.to_owned(),
    });
}

fn project(
    root: &ValidatedRepoPath,
    syntax: &SourceAnalysisDto,
    sources: &BTreeMap<String, String>,
) -> GraphSnapshotDto {
    let root_id = "workspace:syntax".to_owned();
    let mut nodes = vec![GraphNodeDto {
        id: root_id.clone(),
        kind: GraphNodeKind::Workspace,
        label: "sources".to_owned(),
        source_range: None,
    }];
    let mut edges = Vec::new();
    for file in &syntax.files {
        let file_id = format!("file:{}", file.identity.path);
        nodes.push(GraphNodeDto {
            id: file_id.clone(),
            kind: GraphNodeKind::File,
            label: file.identity.path.clone(),
            source_range: None,
        });
        containment(&mut edges, &root_id, &file_id);
        let by_id: BTreeMap<_, _> = file
            .declarations
            .iter()
            .map(|d| (d.id.as_str(), d))
            .collect();
        let source = &sources[&file.identity.path];
        let line_starts: Vec<_> = std::iter::once(0)
            .chain(
                source
                    .bytes()
                    .enumerate()
                    .filter_map(|(i, b)| (b == b'\n').then_some(i + 1)),
            )
            .collect();
        let valid: std::collections::BTreeSet<_> = file
            .declarations
            .iter()
            .filter(|d| {
                let mut current = Some(*d);
                while let Some(node) = current {
                    if !node.header_complete {
                        return false;
                    }
                    current = node
                        .parent_id
                        .as_deref()
                        .and_then(|id| by_id.get(id).copied());
                }
                true
            })
            .map(|d| d.id.as_str())
            .collect();
        for decl in file
            .declarations
            .iter()
            .filter(|d| valid.contains(d.id.as_str()))
        {
            let (start_line, start_column) = point(&line_starts, decl.range.start_byte);
            let (end_line, end_column) = point(&line_starts, decl.range.end_byte);
            nodes.push(GraphNodeDto {
                id: decl.id.clone(),
                kind: graph_kind(&decl.kind),
                label: decl.name.clone(),
                source_range: Some(SourceRangeDto {
                    path: file.identity.path.clone(),
                    start_line,
                    start_column,
                    end_line,
                    end_column,
                }),
            });
            // Do not silently reparent a recovered child across a damaged declaration.
            let parent = decl.parent_id.as_deref().unwrap_or(&file_id);
            containment(&mut edges, parent, &decl.id);
        }
    }
    let diagnostics = syntax
        .diagnostics
        .iter()
        .chain(syntax.files.iter().flat_map(|f| &f.diagnostics))
        .map(|d| AnalyzerDiagnosticDto {
            code: d.code.clone(),
            message: d.message.clone(),
            source_path: (!d.path.is_empty()).then(|| d.path.clone()),
        })
        .collect();
    GraphSnapshotDto {
        schema_version: SYNTAX_GRAPH_SCHEMA_VERSION,
        source_root: root.display_path(),
        generated_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
            .to_string(),
        nodes,
        edges,
        diagnostics,
    }
}
fn containment(edges: &mut Vec<GraphEdgeDto>, source: &str, target: &str) {
    edges.push(GraphEdgeDto {
        id: stable_edge_id(GraphEdgeKind::Contains, source, target),
        kind: GraphEdgeKind::Contains,
        source_id: source.to_owned(),
        target_id: target.to_owned(),
        provenance: EdgeProvenanceDto::TreeSitter,
        confidence: EdgeConfidenceDto::Exact,
    });
}
fn point(line_starts: &[usize], byte: usize) -> (u32, u32) {
    let line = line_starts
        .partition_point(|start| *start <= byte)
        .saturating_sub(1);
    (line as u32 + 1, (byte - line_starts[line]) as u32 + 1)
}

fn graph_kind(kind: &DeclarationKind) -> GraphNodeKind {
    use DeclarationKind as K;
    match kind {
        K::Function => GraphNodeKind::Function,
        K::Method => GraphNodeKind::Method,
        K::Struct => GraphNodeKind::Struct,
        K::Enum => GraphNodeKind::Enum,
        K::Trait => GraphNodeKind::Trait,
        K::Implementation => GraphNodeKind::Impl,
        K::Module => GraphNodeKind::Module,
        K::Class => GraphNodeKind::Class,
        K::Interface => GraphNodeKind::Interface,
        K::TypeAlias => GraphNodeKind::TypeAlias,
        K::Binding => GraphNodeKind::Binding,
        K::Field => GraphNodeKind::Field,
        K::Variant => GraphNodeKind::Variant,
        K::Parameter => GraphNodeKind::Parameter,
        K::Component => GraphNodeKind::Component,
        K::Snippet => GraphNodeKind::Snippet,
    }
}
