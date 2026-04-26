use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use cargo_metadata::MetadataCommand;
use syn::visit::{self, Visit};
use syn::{Attribute, Expr, File, ImplItem, Item, ItemImpl, ItemMod, ItemUse, Type, UseTree};
use walkdir::WalkDir;

use crate::graph::{
    stable_edge_id, stable_node_id, AnalyzerDiagnosticDto, EdgeConfidenceDto, EdgeProvenanceDto,
    GraphEdgeDto, GraphEdgeKind, GraphNodeDto, GraphNodeKind, GraphSnapshotDto, SourceRangeDto,
    GRAPH_SCHEMA_VERSION,
};
use crate::source::ValidatedRepoPath;

const SNAPSHOT_SIZE_WARNING_THRESHOLD: usize = 10_000;

#[derive(Debug, Default)]
pub struct RustGraphExtractor;

impl RustGraphExtractor {
    pub fn extract(
        &self,
        source_root: &ValidatedRepoPath,
    ) -> Result<GraphSnapshotDto, RustGraphExtractionError> {
        let metadata = MetadataCommand::new()
            .manifest_path(source_root.as_path().join("Cargo.toml"))
            .exec()
            .map_err(|error| RustGraphExtractionError::CargoMetadata(error.to_string()))?;

        let mut graph = GraphAccumulator::new(source_root.display_path());
        let workspace_id = graph.add_node(
            GraphNodeKind::Workspace,
            "workspace".to_string(),
            &[source_root.display_path().as_str()],
            None,
        );

        let mut package_roots = BTreeSet::new();
        for package in metadata.workspace_packages() {
            let package_name = package.name.to_string();
            let crate_id = graph.add_node(
                GraphNodeKind::Crate,
                package_name.clone(),
                &[package_name.as_str()],
                None,
            );
            graph.add_edge(
                GraphEdgeKind::Contains,
                &workspace_id,
                &crate_id,
                EdgeProvenanceDto::Normalized,
                EdgeConfidenceDto::Exact,
            );

            let package_root = package
                .manifest_path
                .parent()
                .map(PathBuf::from)
                .unwrap_or_else(|| source_root.as_path().to_path_buf());
            package_roots.insert(package_root.clone());

            for target in &package.targets {
                let source_path = PathBuf::from(target.src_path.as_std_path());
                if source_path
                    .extension()
                    .and_then(|extension| extension.to_str())
                    == Some("rs")
                {
                    self.extract_source_file(
                        source_root.as_path(),
                        &package_name,
                        &crate_id,
                        &source_path,
                        &mut graph,
                    );
                }
            }
        }

        for package_root in package_roots {
            for entry in WalkDir::new(package_root.join("src")) {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(error) => {
                        graph.add_diagnostic(
                            "walkdir_error",
                            format!("failed to read source entry: {error}"),
                            None,
                        );
                        continue;
                    }
                };

                if !entry.file_type().is_file() {
                    continue;
                }

                let path = entry.path();
                if path.extension().and_then(|extension| extension.to_str()) != Some("rs") {
                    continue;
                }

                let already_seen = graph
                    .file_paths
                    .contains(&relative_path(source_root.as_path(), path));
                if !already_seen {
                    self.extract_source_file(
                        source_root.as_path(),
                        "workspace",
                        &workspace_id,
                        path,
                        &mut graph,
                    );
                }
            }
        }

        graph.link_calls();
        graph.warn_if_large();
        Ok(graph.finish())
    }

    fn extract_source_file(
        &self,
        source_root: &Path,
        package_name: &str,
        owner_id: &str,
        source_path: &Path,
        graph: &mut GraphAccumulator,
    ) {
        let relative_path = relative_path(source_root, source_path);
        graph.file_paths.insert(relative_path.clone());

        let source = match fs::read_to_string(source_path) {
            Ok(source) => source,
            Err(error) => {
                graph.add_diagnostic(
                    "read_source_failed",
                    format!("failed to read source file: {error}"),
                    Some(relative_path),
                );
                return;
            }
        };

        let parsed = match syn::parse_file(&source) {
            Ok(parsed) => parsed,
            Err(error) => {
                graph.add_diagnostic(
                    "parse_source_failed",
                    format!("failed to parse Rust source: {error}"),
                    Some(relative_path),
                );
                return;
            }
        };

        let file_id = graph.add_node(
            GraphNodeKind::File,
            relative_path.clone(),
            &[relative_path.as_str()],
            Some(source_range(&relative_path, 1)),
        );
        graph.add_edge(
            GraphEdgeKind::Contains,
            owner_id,
            &file_id,
            EdgeProvenanceDto::Normalized,
            EdgeConfidenceDto::Exact,
        );

        let module_label = module_label_from_path(&relative_path);
        let module_id = graph.add_node(
            GraphNodeKind::Module,
            module_label.clone(),
            &[package_name, module_label.as_str()],
            Some(source_range(&relative_path, 1)),
        );
        graph.add_edge(
            GraphEdgeKind::Defines,
            &file_id,
            &module_id,
            EdgeProvenanceDto::Normalized,
            EdgeConfidenceDto::Exact,
        );

        extract_items(
            &parsed,
            package_name,
            &relative_path,
            &source,
            &file_id,
            &module_id,
            graph,
        );
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RustGraphExtractionError {
    #[error("failed to read Cargo metadata: {0}")]
    CargoMetadata(String),
}

#[derive(Debug, Default)]
struct GraphAccumulator {
    source_root: String,
    nodes: BTreeMap<String, GraphNodeDto>,
    edges: BTreeMap<String, GraphEdgeDto>,
    diagnostics: Vec<AnalyzerDiagnosticDto>,
    file_paths: BTreeSet<String>,
    functions_by_name: BTreeMap<String, String>,
    pending_calls: Vec<PendingCall>,
}

impl GraphAccumulator {
    fn new(source_root: String) -> Self {
        Self {
            source_root,
            ..Self::default()
        }
    }

    fn add_node(
        &mut self,
        kind: GraphNodeKind,
        label: String,
        id_parts: &[&str],
        source_range: Option<SourceRangeDto>,
    ) -> String {
        let id = stable_node_id(kind.clone(), id_parts);
        self.nodes.entry(id.clone()).or_insert(GraphNodeDto {
            id: id.clone(),
            kind,
            label,
            source_range,
        });
        id
    }

    fn add_edge(
        &mut self,
        kind: GraphEdgeKind,
        source_id: &str,
        target_id: &str,
        provenance: EdgeProvenanceDto,
        confidence: EdgeConfidenceDto,
    ) {
        let id = stable_edge_id(kind.clone(), source_id, target_id);
        self.edges.entry(id.clone()).or_insert(GraphEdgeDto {
            id,
            kind,
            source_id: source_id.to_string(),
            target_id: target_id.to_string(),
            provenance,
            confidence,
        });
    }

    fn add_diagnostic(
        &mut self,
        code: impl Into<String>,
        message: impl Into<String>,
        source_path: Option<String>,
    ) {
        self.diagnostics.push(AnalyzerDiagnosticDto {
            code: code.into(),
            message: message.into(),
            source_path,
        });
    }

    fn link_calls(&mut self) {
        for pending_call in std::mem::take(&mut self.pending_calls) {
            if let Some(target_id) = self
                .functions_by_name
                .get(&pending_call.target_name)
                .cloned()
            {
                self.add_edge(
                    GraphEdgeKind::Calls,
                    &pending_call.source_id,
                    &target_id,
                    EdgeProvenanceDto::Syn,
                    EdgeConfidenceDto::Partial,
                );
            } else {
                self.add_diagnostic(
                    "unresolved_call",
                    format!("unresolved call target '{}'", pending_call.target_name),
                    Some(pending_call.source_path),
                );
            }
        }
    }

    fn warn_if_large(&mut self) {
        let snapshot_size = self.nodes.len() + self.edges.len();
        if snapshot_size > SNAPSHOT_SIZE_WARNING_THRESHOLD {
            self.add_diagnostic(
                "snapshot_size_warning",
                format!("snapshot contains {snapshot_size} graph records"),
                None,
            );
        }
    }

    fn finish(self) -> GraphSnapshotDto {
        GraphSnapshotDto {
            schema_version: GRAPH_SCHEMA_VERSION,
            source_root: self.source_root,
            generated_at: generated_at_string(),
            nodes: self.nodes.into_values().collect(),
            edges: self.edges.into_values().collect(),
            diagnostics: self.diagnostics,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingCall {
    source_id: String,
    target_name: String,
    source_path: String,
}

fn extract_items(
    parsed: &File,
    package_name: &str,
    relative_path: &str,
    source: &str,
    file_id: &str,
    module_id: &str,
    graph: &mut GraphAccumulator,
) {
    for item in &parsed.items {
        match item {
            Item::Struct(item) => {
                add_definition(
                    graph,
                    GraphNodeKind::Struct,
                    GraphEdgeKind::Defines,
                    item.ident.to_string(),
                    &[package_name, relative_path, item.ident.to_string().as_str()],
                    relative_path,
                    source,
                    module_id,
                );
            }
            Item::Enum(item) => {
                add_definition(
                    graph,
                    GraphNodeKind::Enum,
                    GraphEdgeKind::Defines,
                    item.ident.to_string(),
                    &[package_name, relative_path, item.ident.to_string().as_str()],
                    relative_path,
                    source,
                    module_id,
                );
            }
            Item::Trait(item) => {
                add_definition(
                    graph,
                    GraphNodeKind::Trait,
                    GraphEdgeKind::Defines,
                    item.ident.to_string(),
                    &[package_name, relative_path, item.ident.to_string().as_str()],
                    relative_path,
                    source,
                    module_id,
                );
            }
            Item::Fn(item) => {
                let function_name = item.sig.ident.to_string();
                let function_id = add_definition(
                    graph,
                    GraphNodeKind::Function,
                    GraphEdgeKind::Defines,
                    function_name.clone(),
                    &[package_name, relative_path, function_name.as_str()],
                    relative_path,
                    source,
                    module_id,
                );
                graph
                    .functions_by_name
                    .insert(function_name, function_id.clone());
                add_tauri_command_if_needed(
                    graph,
                    &item.attrs,
                    package_name,
                    relative_path,
                    source,
                    file_id,
                    &function_id,
                    &item.sig.ident.to_string(),
                );
                collect_calls(&function_id, relative_path, &item.block, graph);
            }
            Item::Impl(item) => {
                extract_impl(package_name, relative_path, source, module_id, graph, item)
            }
            Item::Use(item) => extract_use(relative_path, file_id, graph, item),
            Item::Mod(item) => {
                extract_mod(package_name, relative_path, source, module_id, graph, item)
            }
            _ => {}
        }
    }
}

fn add_definition(
    graph: &mut GraphAccumulator,
    kind: GraphNodeKind,
    edge_kind: GraphEdgeKind,
    label: String,
    id_parts: &[&str],
    relative_path: &str,
    source: &str,
    owner_id: &str,
) -> String {
    let line = find_line(source, &label);
    let node_id = graph.add_node(
        kind,
        label,
        id_parts,
        Some(source_range(relative_path, line)),
    );
    graph.add_edge(
        edge_kind,
        owner_id,
        &node_id,
        EdgeProvenanceDto::Syn,
        EdgeConfidenceDto::Exact,
    );
    node_id
}

fn extract_impl(
    package_name: &str,
    relative_path: &str,
    source: &str,
    module_id: &str,
    graph: &mut GraphAccumulator,
    item: &ItemImpl,
) {
    let self_ty = type_label(&item.self_ty);
    let label = match &item.trait_ {
        Some((_, trait_path, _)) => format!("impl {} for {self_ty}", path_label(trait_path)),
        None => format!("impl {self_ty}"),
    };
    let impl_id = add_definition(
        graph,
        GraphNodeKind::Impl,
        GraphEdgeKind::Defines,
        label.clone(),
        &[package_name, relative_path, label.as_str()],
        relative_path,
        source,
        module_id,
    );

    if item.trait_.is_some() {
        graph.add_edge(
            GraphEdgeKind::Implements,
            &impl_id,
            module_id,
            EdgeProvenanceDto::Syn,
            EdgeConfidenceDto::Partial,
        );
    }

    for impl_item in &item.items {
        if let ImplItem::Fn(method) = impl_item {
            let method_name = method.sig.ident.to_string();
            let method_id = add_definition(
                graph,
                GraphNodeKind::Method,
                GraphEdgeKind::DefinesMethod,
                method_name.clone(),
                &[
                    package_name,
                    relative_path,
                    self_ty.as_str(),
                    method_name.as_str(),
                ],
                relative_path,
                source,
                &impl_id,
            );
            graph
                .functions_by_name
                .insert(method_name.clone(), method_id.clone());
            add_tauri_command_if_needed(
                graph,
                &method.attrs,
                package_name,
                relative_path,
                source,
                module_id,
                &method_id,
                method_name.as_str(),
            );
            collect_calls(&method_id, relative_path, &method.block, graph);
        }
    }
}

fn extract_use(relative_path: &str, file_id: &str, graph: &mut GraphAccumulator, item: &ItemUse) {
    for import in use_tree_labels(&item.tree) {
        let import_id = graph.add_node(
            GraphNodeKind::Module,
            import.clone(),
            &["import", import.as_str()],
            Some(source_range(relative_path, 1)),
        );
        graph.add_edge(
            GraphEdgeKind::Imports,
            file_id,
            &import_id,
            EdgeProvenanceDto::Syn,
            EdgeConfidenceDto::Partial,
        );
    }
}

fn extract_mod(
    package_name: &str,
    relative_path: &str,
    source: &str,
    module_id: &str,
    graph: &mut GraphAccumulator,
    item: &ItemMod,
) {
    let label = item.ident.to_string();
    let child_id = add_definition(
        graph,
        GraphNodeKind::Module,
        GraphEdgeKind::Contains,
        label.clone(),
        &[package_name, relative_path, label.as_str()],
        relative_path,
        source,
        module_id,
    );

    if let Some((_, items)) = &item.content {
        for item in items {
            if let Item::Fn(function) = item {
                let function_name = function.sig.ident.to_string();
                let function_id = add_definition(
                    graph,
                    GraphNodeKind::Function,
                    GraphEdgeKind::Defines,
                    function_name.clone(),
                    &[
                        package_name,
                        relative_path,
                        label.as_str(),
                        function_name.as_str(),
                    ],
                    relative_path,
                    source,
                    &child_id,
                );
                graph.functions_by_name.insert(function_name, function_id);
            }
        }
    }
}

fn add_tauri_command_if_needed(
    graph: &mut GraphAccumulator,
    attributes: &[Attribute],
    package_name: &str,
    relative_path: &str,
    source: &str,
    file_id: &str,
    function_id: &str,
    function_name: &str,
) {
    if !attributes.iter().any(|attribute| {
        attribute
            .path()
            .segments
            .iter()
            .any(|segment| segment.ident == "command")
    }) {
        return;
    }

    let command_id = graph.add_node(
        GraphNodeKind::TauriCommand,
        function_name.to_string(),
        &[package_name, relative_path, "tauri_command", function_name],
        Some(source_range(
            relative_path,
            find_line(source, function_name),
        )),
    );
    graph.add_edge(
        GraphEdgeKind::ExposesCommand,
        file_id,
        &command_id,
        EdgeProvenanceDto::Syn,
        EdgeConfidenceDto::Exact,
    );
    graph.add_edge(
        GraphEdgeKind::References,
        &command_id,
        function_id,
        EdgeProvenanceDto::Normalized,
        EdgeConfidenceDto::Exact,
    );
}

fn collect_calls(
    source_id: &str,
    relative_path: &str,
    block: &syn::Block,
    graph: &mut GraphAccumulator,
) {
    let mut visitor = CallVisitor {
        source_id,
        relative_path,
        graph,
    };
    visitor.visit_block(block);
}

struct CallVisitor<'a> {
    source_id: &'a str,
    relative_path: &'a str,
    graph: &'a mut GraphAccumulator,
}

impl<'ast> Visit<'ast> for CallVisitor<'_> {
    fn visit_expr_call(&mut self, node: &'ast syn::ExprCall) {
        if let Expr::Path(path) = node.func.as_ref() {
            if let Some(segment) = path.path.segments.last() {
                self.graph.pending_calls.push(PendingCall {
                    source_id: self.source_id.to_string(),
                    target_name: segment.ident.to_string(),
                    source_path: self.relative_path.to_string(),
                });
            }
        }
        visit::visit_expr_call(self, node);
    }

    fn visit_expr_method_call(&mut self, node: &'ast syn::ExprMethodCall) {
        self.graph.pending_calls.push(PendingCall {
            source_id: self.source_id.to_string(),
            target_name: node.method.to_string(),
            source_path: self.relative_path.to_string(),
        });
        visit::visit_expr_method_call(self, node);
    }
}

fn use_tree_labels(tree: &UseTree) -> Vec<String> {
    let mut labels = Vec::new();
    collect_use_tree_labels(tree, String::new(), &mut labels);
    labels
}

fn collect_use_tree_labels(tree: &UseTree, prefix: String, labels: &mut Vec<String>) {
    match tree {
        UseTree::Path(path) => {
            let next_prefix = join_path(prefix, &path.ident.to_string());
            collect_use_tree_labels(&path.tree, next_prefix, labels);
        }
        UseTree::Name(name) => labels.push(join_path(prefix, &name.ident.to_string())),
        UseTree::Rename(rename) => labels.push(join_path(prefix, &rename.ident.to_string())),
        UseTree::Glob(_) => labels.push(join_path(prefix, "*")),
        UseTree::Group(group) => {
            for item in &group.items {
                collect_use_tree_labels(item, prefix.clone(), labels);
            }
        }
    }
}

fn join_path(prefix: String, segment: &str) -> String {
    if prefix.is_empty() {
        segment.to_string()
    } else {
        format!("{prefix}::{segment}")
    }
}

fn type_label(ty: &Type) -> String {
    match ty {
        Type::Path(path) => path_label(&path.path),
        _ => "unknown".to_string(),
    }
}

fn path_label(path: &syn::Path) -> String {
    path.segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>()
        .join("::")
}

fn module_label_from_path(relative_path: &str) -> String {
    let label = relative_path
        .trim_start_matches("src/")
        .trim_end_matches(".rs")
        .replace('/', "::");

    label
        .strip_suffix("::mod")
        .unwrap_or(label.as_str())
        .to_string()
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn source_range(relative_path: &str, line: u32) -> SourceRangeDto {
    SourceRangeDto {
        path: relative_path.to_string(),
        start_line: line,
        start_column: 1,
        end_line: line,
        end_column: 1,
    }
}

fn find_line(source: &str, needle: &str) -> u32 {
    source
        .lines()
        .position(|line| line.contains(needle))
        .map(|index| index as u32 + 1)
        .unwrap_or(1)
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
    use super::{module_label_from_path, RustGraphExtractor};
    use crate::graph::{GraphEdgeKind, GraphNodeKind};
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
            "whip-docs-extractor-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    fn fixture_repo(name: &str, lib_rs: &str) -> (PathBuf, ValidatedRepoPath) {
        let repo = unique_temp_dir(name);
        fs::create_dir_all(repo.join("src")).expect("create fixture src");
        fs::write(
            repo.join("Cargo.toml"),
            "[package]\nname = \"fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
        )
        .expect("write manifest");
        fs::write(repo.join("src/lib.rs"), lib_rs).expect("write lib");
        let validated = ValidatedRepoPath::parse_existing_cargo_repo(&repo).expect("valid repo");
        (repo, validated)
    }

    #[test]
    fn module_label_strips_src_and_extension() {
        assert_eq!(module_label_from_path("src/lib.rs"), "lib");
        assert_eq!(
            module_label_from_path("src/domain/model.rs"),
            "domain::model"
        );
    }

    #[test]
    fn extracts_definitions_and_call_edges() {
        let (repo, validated) = fixture_repo(
            "definitions",
            r#"
pub struct Widget;
pub enum Mode { Fast }
pub trait Run { fn run(&self); }
pub fn helper() {}
pub fn entry() { helper(); }
"#,
        );

        let snapshot = RustGraphExtractor
            .extract(&validated)
            .expect("extract graph");

        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Struct && node.label == "Widget"));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Enum && node.label == "Mode"));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Trait && node.label == "Run"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.kind == GraphEdgeKind::Calls));

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[test]
    fn extracts_trait_impl_methods_and_tauri_commands() {
        let (repo, validated) = fixture_repo(
            "tauri-command",
            r#"
pub trait Run { fn run(&self); }
pub struct Worker;
impl Run for Worker {
    fn run(&self) {}
}
#[tauri::command]
pub fn open_project() {}
"#,
        );

        let snapshot = RustGraphExtractor
            .extract(&validated)
            .expect("extract graph");

        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Impl && node.label.contains("Run")));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Method && node.label == "run"));
        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::TauriCommand && node.label == "open_project"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.kind == GraphEdgeKind::ExposesCommand));

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[test]
    fn extracts_modules_and_imports() {
        let (repo, validated) = fixture_repo(
            "modules-imports",
            r#"
use std::{fs, path::PathBuf};
mod nested {
    pub fn child() {}
}
"#,
        );

        let snapshot = RustGraphExtractor
            .extract(&validated)
            .expect("extract graph");

        assert!(snapshot
            .nodes
            .iter()
            .any(|node| node.kind == GraphNodeKind::Module && node.label == "nested"));
        assert!(snapshot
            .edges
            .iter()
            .any(|edge| edge.kind == GraphEdgeKind::Imports));

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }
}
