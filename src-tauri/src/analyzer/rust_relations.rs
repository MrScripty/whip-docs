use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use syn::visit::{self, Visit};
use syn::{ItemUse, UseTree};
use walkdir::WalkDir;

use crate::graph::{AnalyzerDiagnosticDto, SourceRangeDto};
use crate::source::ValidatedRepoPath;

const RUST_IMPORT_RELATION_ANALYZER: &str = "syn-rust-import-relations";

#[derive(Debug, Default)]
pub struct RustImportRelationExtractor;

impl RustImportRelationExtractor {
    pub fn extract(
        &self,
        source_root: &ValidatedRepoPath,
    ) -> Result<RustImportRelationSnapshotDto, RustImportRelationExtractionError> {
        let mut accumulator = RustImportRelationAccumulator::new(source_root);
        accumulator.collect_source_files();
        accumulator.extract_imports();
        Ok(accumulator.finish())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustImportRelationSnapshotDto {
    pub analyzer: String,
    pub source_root: String,
    pub facts: Vec<RustImportRelationFactDto>,
    pub diagnostics: Vec<AnalyzerDiagnosticDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RustImportRelationFactDto {
    pub source_path: String,
    pub import_path: String,
    pub target_path: Option<String>,
    pub status: RustImportResolutionStatusDto,
    pub evidence: SourceRangeDto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RustImportResolutionStatusDto {
    Resolved,
    Unresolved,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum RustImportRelationExtractionError {}

struct RustImportRelationAccumulator<'a> {
    source_root: &'a ValidatedRepoPath,
    file_paths: BTreeSet<String>,
    facts: Vec<RustImportRelationFactDto>,
    diagnostics: Vec<AnalyzerDiagnosticDto>,
}

impl<'a> RustImportRelationAccumulator<'a> {
    fn new(source_root: &'a ValidatedRepoPath) -> Self {
        Self {
            source_root,
            file_paths: BTreeSet::new(),
            facts: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn collect_source_files(&mut self) {
        for entry in WalkDir::new(self.source_root.as_path()) {
            let entry = match entry {
                Ok(entry) => entry,
                Err(error) => {
                    self.add_diagnostic(
                        "rust_import_walkdir_error",
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

            self.file_paths
                .insert(relative_path(self.source_root.as_path(), path));
        }
    }

    fn extract_imports(&mut self) {
        let file_paths = self.file_paths.iter().cloned().collect::<Vec<_>>();
        for relative_path in file_paths {
            let source_path = self.source_root.as_path().join(&relative_path);
            let source = match fs::read_to_string(&source_path) {
                Ok(source) => source,
                Err(error) => {
                    self.add_diagnostic(
                        "rust_import_read_source_failed",
                        format!("failed to read Rust source: {error}"),
                        Some(relative_path),
                    );
                    continue;
                }
            };

            let parsed = match syn::parse_file(&source) {
                Ok(parsed) => parsed,
                Err(error) => {
                    self.add_diagnostic(
                        "rust_import_parse_source_failed",
                        format!("failed to parse Rust source: {error}"),
                        Some(relative_path),
                    );
                    continue;
                }
            };

            let mut visitor = UseVisitor::new(&relative_path, &source);
            visitor.visit_file(&parsed);

            for pending_import in visitor.imports {
                self.add_import_fact(pending_import);
            }
        }
    }

    fn add_import_fact(&mut self, pending_import: PendingImportFact) {
        let target_path = resolve_import_path(
            &pending_import.source_path,
            &pending_import.import_path,
            &self.file_paths,
        );
        let status = if target_path.is_some() {
            RustImportResolutionStatusDto::Resolved
        } else {
            RustImportResolutionStatusDto::Unresolved
        };
        let is_explicit_local = is_explicit_local_import(&pending_import.import_path);

        if status == RustImportResolutionStatusDto::Unresolved && !is_explicit_local {
            return;
        }

        if status == RustImportResolutionStatusDto::Unresolved {
            self.add_diagnostic(
                "rust_import_unresolved",
                format!("unresolved Rust import '{}'", pending_import.import_path),
                Some(pending_import.source_path.clone()),
            );
        }

        self.facts.push(RustImportRelationFactDto {
            source_path: pending_import.source_path,
            import_path: pending_import.import_path,
            target_path,
            status,
            evidence: pending_import.evidence,
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

    fn finish(self) -> RustImportRelationSnapshotDto {
        RustImportRelationSnapshotDto {
            analyzer: RUST_IMPORT_RELATION_ANALYZER.to_string(),
            source_root: self.source_root.display_path(),
            facts: self.facts,
            diagnostics: self.diagnostics,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PendingImportFact {
    source_path: String,
    import_path: String,
    evidence: SourceRangeDto,
}

struct UseVisitor<'a> {
    relative_path: &'a str,
    source: &'a str,
    imports: Vec<PendingImportFact>,
}

impl<'a> UseVisitor<'a> {
    fn new(relative_path: &'a str, source: &'a str) -> Self {
        Self {
            relative_path,
            source,
            imports: Vec::new(),
        }
    }
}

impl<'ast> Visit<'ast> for UseVisitor<'_> {
    fn visit_item_use(&mut self, node: &'ast ItemUse) {
        for import_path in use_tree_labels(&node.tree) {
            self.imports.push(PendingImportFact {
                evidence: source_range(
                    self.relative_path,
                    find_use_line(self.source, &import_path),
                ),
                source_path: self.relative_path.to_string(),
                import_path,
            });
        }

        visit::visit_item_use(self, node);
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

fn resolve_import_path(
    source_path: &str,
    import_path: &str,
    file_paths: &BTreeSet<String>,
) -> Option<String> {
    let mut segments = import_path
        .split("::")
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    if segments.is_empty() {
        return None;
    }

    if matches!(segments.first(), Some(&"std" | &"core" | &"alloc")) {
        return None;
    }

    let candidates = match segments.first().copied() {
        Some("crate") => {
            segments.remove(0);
            vec![crate_source_prefix(source_path)]
        }
        Some("self") => {
            segments.remove(0);
            vec![current_module_prefix(source_path)]
        }
        Some("super") => {
            segments.remove(0);
            vec![parent_module_prefix(source_path)]
        }
        _ => vec![
            crate_source_prefix(source_path),
            current_module_prefix(source_path),
        ],
    };

    for base_prefix in candidates {
        if let Some(target_path) = resolve_segments_from_prefix(&base_prefix, &segments, file_paths)
        {
            return Some(target_path);
        }
    }

    None
}

fn resolve_segments_from_prefix(
    base_prefix: &str,
    segments: &[&str],
    file_paths: &BTreeSet<String>,
) -> Option<String> {
    for length in (1..=segments.len()).rev() {
        let module_path = segments[..length].join("/");
        let direct_file = join_relative_path(base_prefix, &format!("{module_path}.rs"));
        let module_file = join_relative_path(base_prefix, &format!("{module_path}/mod.rs"));

        if file_paths.contains(&direct_file) {
            return Some(direct_file);
        }

        if file_paths.contains(&module_file) {
            return Some(module_file);
        }
    }

    None
}

fn is_explicit_local_import(import_path: &str) -> bool {
    import_path
        .split("::")
        .next()
        .is_some_and(|segment| matches!(segment, "crate" | "self" | "super"))
}

fn crate_source_prefix(source_path: &str) -> String {
    if let Some(index) = source_path.rfind("/src/") {
        return source_path[..index + "/src".len()].to_string();
    }

    if source_path.starts_with("src/") {
        return "src".to_string();
    }

    Path::new(source_path)
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .to_string_lossy()
        .replace('\\', "/")
}

fn current_module_prefix(source_path: &str) -> String {
    let source_path = source_path.replace('\\', "/");
    if source_path.ends_with("/lib.rs")
        || source_path.ends_with("/main.rs")
        || source_path.ends_with("/mod.rs")
    {
        return parent_path(&source_path);
    }

    source_path
        .strip_suffix(".rs")
        .unwrap_or(source_path.as_str())
        .to_string()
}

fn parent_module_prefix(source_path: &str) -> String {
    let current = current_module_prefix(source_path);
    parent_path(&current)
}

fn parent_path(path: &str) -> String {
    Path::new(path)
        .parent()
        .unwrap_or_else(|| Path::new(""))
        .to_string_lossy()
        .replace('\\', "/")
}

fn join_relative_path(prefix: &str, suffix: &str) -> String {
    if prefix.is_empty() {
        suffix.to_string()
    } else {
        format!("{prefix}/{suffix}")
    }
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

fn find_use_line(source: &str, import_path: &str) -> u32 {
    let needle = import_path
        .split("::")
        .find(|segment| !matches!(*segment, "crate" | "self" | "super"))
        .unwrap_or(import_path);

    source
        .lines()
        .position(|line| line.contains("use ") && line.contains(needle))
        .map(|index| index as u32 + 1)
        .unwrap_or(1)
}

#[cfg(test)]
mod tests {
    use super::{resolve_import_path, RustImportRelationExtractor, RustImportResolutionStatusDto};
    use crate::source::ValidatedRepoPath;
    use std::collections::BTreeSet;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "whip-docs-rust-relations-{name}-{}-{timestamp}",
            std::process::id()
        ))
    }

    fn fixture_source_root(name: &str) -> (PathBuf, ValidatedRepoPath) {
        let repo = unique_temp_dir(name);
        fs::create_dir_all(repo.join("src")).expect("create fixture source root");
        let validated =
            ValidatedRepoPath::parse_existing_source_root(&repo).expect("valid source root");
        (repo, validated)
    }

    #[test]
    fn resolves_crate_self_and_simple_module_imports_to_rust_files() {
        let (repo, source_root) = fixture_source_root("resolved-imports");
        fs::create_dir_all(repo.join("src/domain")).expect("create domain module dir");
        fs::write(
            repo.join("src/lib.rs"),
            r#"
use crate::domain::model::Model;
use domain::service;
"#,
        )
        .expect("write lib");
        fs::write(
            repo.join("src/domain/mod.rs"),
            r#"
use self::model::Model;
pub mod model;
"#,
        )
        .expect("write domain mod");
        fs::write(repo.join("src/domain/model.rs"), "pub struct Model;\n")
            .expect("write model module");
        fs::write(repo.join("src/domain/service.rs"), "pub fn run() {}\n")
            .expect("write service module");

        let snapshot = RustImportRelationExtractor
            .extract(&source_root)
            .expect("extract Rust import relations");

        assert!(snapshot.facts.iter().any(|fact| {
            fact.source_path == "src/lib.rs"
                && fact.import_path == "crate::domain::model::Model"
                && fact.target_path.as_deref() == Some("src/domain/model.rs")
                && fact.status == RustImportResolutionStatusDto::Resolved
        }));
        assert!(snapshot.facts.iter().any(|fact| {
            fact.source_path == "src/lib.rs"
                && fact.import_path == "domain::service"
                && fact.target_path.as_deref() == Some("src/domain/service.rs")
                && fact.status == RustImportResolutionStatusDto::Resolved
        }));
        assert!(snapshot.facts.iter().any(|fact| {
            fact.source_path == "src/domain/mod.rs"
                && fact.import_path == "self::model::Model"
                && fact.target_path.as_deref() == Some("src/domain/model.rs")
                && fact.status == RustImportResolutionStatusDto::Resolved
        }));
        assert!(snapshot.diagnostics.is_empty());

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[test]
    fn unresolved_local_imports_are_retained_as_facts_and_diagnostics() {
        let (repo, source_root) = fixture_source_root("unresolved-imports");
        fs::write(
            repo.join("src/lib.rs"),
            r#"
use crate::missing::Thing;
use std::path::PathBuf;
"#,
        )
        .expect("write lib");

        let snapshot = RustImportRelationExtractor
            .extract(&source_root)
            .expect("extract Rust import relations");

        assert!(snapshot.facts.iter().any(|fact| {
            fact.import_path == "crate::missing::Thing"
                && fact.target_path.is_none()
                && fact.status == RustImportResolutionStatusDto::Unresolved
        }));
        assert!(!snapshot
            .facts
            .iter()
            .any(|fact| fact.import_path == "std::path::PathBuf"));
        assert!(snapshot.diagnostics.iter().any(|diagnostic| {
            diagnostic.code == "rust_import_unresolved"
                && diagnostic.source_path.as_deref() == Some("src/lib.rs")
                && diagnostic.message.contains("crate::missing::Thing")
        }));
        assert!(!snapshot
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("std::path::PathBuf")));

        fs::remove_dir_all(repo).expect("cleanup fixture repo");
    }

    #[test]
    fn resolver_prefers_deepest_module_prefix_before_symbol_segments() {
        let file_paths = BTreeSet::from([
            "src/domain.rs".to_string(),
            "src/domain/model.rs".to_string(),
        ]);

        let resolved =
            resolve_import_path("src/lib.rs", "crate::domain::model::Model", &file_paths);

        assert_eq!(resolved.as_deref(), Some("src/domain/model.rs"));
    }
}
