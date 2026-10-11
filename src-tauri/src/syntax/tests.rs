use super::*;
use std::path::PathBuf;

fn fixture(path: &str) -> String {
    std::fs::read_to_string(
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../fixtures/syntax")
            .join(path),
    )
    .unwrap()
}

#[test]
fn all_language_families_extract_real_declarations() {
    let cases: &[(&str, Dialect, &[&str])] = &[
        (
            "rust.rs",
            Dialect::Rust,
            &["Boxed", "value", "Alias", "read", "outer", "nested"],
        ),
        (
            "typescript.ts",
            Dialect::TypeScript,
            &[
                "Reader", "Alias", "Boxed", "value", "read", "arrow", "local", "nested",
            ],
        ),
        ("react.tsx", Dialect::Tsx, &["Props", "Card"]),
        (
            "javascript.js",
            Dialect::JavaScript,
            &["Boxed", "value", "read", "arrow", "local", "nested"],
        ),
        ("react.jsx", Dialect::Jsx, &["Card"]),
        (
            "python.py",
            Dialect::Python,
            &["Alias", "Boxed", "value", "read", "local", "nested"],
        ),
        (
            "lua.lua",
            Dialect::Lua,
            &["value", "read", "inside", "nested"],
        ),
        (
            "kotlin.kt",
            Dialect::Kotlin,
            &["Alias", "Boxed", "value", "read", "local", "nested"],
        ),
        (
            "zig.zig",
            Dialect::Zig,
            &["Boxed", "Alias", "value", "read", "local", "outer"],
        ),
        (
            "csharp.cs",
            Dialect::CSharp,
            &["Sample", "Reader", "Boxed", "Value", "Read", "local"],
        ),
        (
            "c.c",
            Dialect::C,
            &["Alias", "Boxed", "value", "read", "local"],
        ),
        (
            "cpp.cpp",
            Dialect::Cpp,
            &["Alias", "Sample", "Boxed", "value", "read", "local"],
        ),
        (
            "odin.odin",
            Dialect::Odin,
            &["sample", "Boxed", "Alias", "value", "read", "local"],
        ),
        (
            "svelte.svelte",
            Dialect::Svelte5,
            &["Props", "title", "count", "read", "card"],
        ),
    ];
    let mut failures = Vec::new();
    for (path, dialect, names) in cases {
        let source = fixture(&format!("basic/{path}"));
        let file = analyze_file(path, &source, *dialect);
        let actual: Vec<_> = file.declarations.iter().map(|d| d.name.as_str()).collect();
        for name in *names {
            if !actual.contains(name) {
                failures.push(format!("{path}: missing {name}; got {actual:?}"));
            }
        }
        if file
            .diagnostics
            .iter()
            .any(|d| d.code != "template_expression_unanalyzed")
        {
            failures.push(format!("{path}: {:?}", file.diagnostics));
        }
        for declaration in &file.declarations {
            assert_eq!(
                &source[declaration.name_range.start_byte..declaration.name_range.end_byte],
                declaration.name
            );
            assert!(declaration.name_range.start_byte >= declaration.range.start_byte);
            assert!(declaration.name_range.end_byte <= declaration.range.end_byte);
            if let Some(parent) = &declaration.parent_id {
                let parent = file.declarations.iter().find(|d| &d.id == parent).unwrap();
                assert!(
                    parent.range.start_byte <= declaration.range.start_byte
                        && parent.range.end_byte >= declaration.range.end_byte
                );
            }
        }
        assert!(file
            .relations
            .iter()
            .all(|r| r.qualification.contains("unresolved")));
        for relation in &file.relations {
            assert!(
                relation.range.start_byte <= relation.target_range.start_byte
                    && relation.range.end_byte >= relation.target_range.end_byte,
                "{path}: {relation:?}"
            );
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn pinned_modern_syntax_is_qualified_and_gaps_are_visible() {
    for (path, dialect, expected_acceptance) in [
        ("rust.rs", Dialect::Rust, true),
        ("python.py", Dialect::Python, false),
        ("kotlin.kt", Dialect::Kotlin, false),
        ("c.c", Dialect::C, false),
        ("cpp.cpp", Dialect::Cpp, true),
        ("csharp.cs", Dialect::CSharp, true),
        ("zig.zig", Dialect::Zig, true),
    ] {
        let source = fixture(&format!("modern/{path}"));
        let file = analyze_file(path, &source, dialect);
        let accepted = !file
            .diagnostics
            .iter()
            .any(|d| d.code == "parse_error" || d.code == "unsupported_modern_syntax");
        assert_eq!(accepted, expected_acceptance, "{path}: {file:?}");
        if !accepted {
            assert_eq!(file.identity.coverage, Coverage::Incomplete);
        }
    }
}

#[test]
fn dialect_routing_covers_aliases_and_requires_ambiguous_choices() {
    for (paths, dialect) in [
        (vec!["a.mts", "a.cts", "a.svelte.ts"], Dialect::TypeScript),
        (vec!["a.mjs", "a.cjs", "a.svelte.js"], Dialect::JavaScript),
        (vec!["a.pyi"], Dialect::Python),
        (vec!["a.kts"], Dialect::Kotlin),
        (
            vec!["a.cc", "a.cxx", "a.hpp", "a.hxx", "a.hh"],
            Dialect::Cpp,
        ),
    ] {
        for path in paths {
            assert_eq!(route(path, None), Ok(dialect));
        }
    }
    assert_eq!(route("a.h", None), Err("ambiguous_header_dialect"));
    assert_eq!(route("a.h", Some(Dialect::C)), Ok(Dialect::C));
    assert_eq!(route("a.h", Some(Dialect::Cpp)), Ok(Dialect::Cpp));
    assert_eq!(route("a.js", Some(Dialect::Jsx)), Ok(Dialect::Jsx));
    assert!(route("a.svelte.js", Some(Dialect::Jsx)).is_err());
    assert!(route("a.py", Some(Dialect::Cpp)).is_err());
    assert_eq!(route("a.html", None), Err("unsupported_language"));
    let js = "function Card() { return <h1/>; }";
    assert!(analyze_file("a.js", js, Dialect::JavaScript)
        .diagnostics
        .iter()
        .any(|d| d.code == "jsx_requires_override"));
    assert!(analyze_file("a.js", js, Dialect::Jsx)
        .diagnostics
        .is_empty());
}

#[test]
fn exact_unicode_crlf_ranges_and_embedded_offsets() {
    for (path,dialect,source,name) in [
        ("a.py",Dialect::Python,"# 蟹🦀\r\ndef café(x: int):\r\n    return x\r\n","café"),
        ("a.svelte",Dialect::Svelte5,"<!-- 蟹🦀 -->\r\n<script lang='ts'>\r\nfunction café(x: number) { return x; }\r\n</script>\r\n","café"),
    ] {
        let file = analyze_file(path,source,dialect);
        assert!(file.diagnostics.is_empty(),"{:?}",file.diagnostics);
        let declaration = file.declarations.iter().find(|d| d.name == name).unwrap();
        assert_eq!(declaration.name_range.start_byte, source.find(name).unwrap());
        assert_eq!(&source[declaration.name_range.start_byte..declaration.name_range.end_byte],name);
        assert!(source[declaration.range.start_byte..declaration.range.end_byte].starts_with(if dialect == Dialect::Python {"def"} else {"function"}));
        for relation in file.relations {
            assert!(source.is_char_boundary(relation.range.start_byte));
            assert!(source.is_char_boundary(relation.target_range.end_byte));
            assert!(relation.target_range.start_byte >= declaration.range.start_byte);
        }
    }
}

#[test]
fn duplicated_names_have_distinct_ids_and_syntax_containment() {
    let file = analyze_file(
        "a.ts",
        "class A { read() {} } class B { read() {} } function outer() { function read() {} }",
        Dialect::TypeScript,
    );
    let reads: Vec<_> = file
        .declarations
        .iter()
        .filter(|d| d.name == "read")
        .collect();
    assert_eq!(reads.len(), 3);
    let ids: std::collections::BTreeSet<_> = reads.iter().map(|d| &d.id).collect();
    assert_eq!(ids.len(), 3);
    let parents: Vec<_> = reads
        .iter()
        .map(|d| {
            file.declarations
                .iter()
                .find(|p| Some(&p.id) == d.parent_id.as_ref())
                .unwrap()
                .name
                .as_str()
        })
        .collect();
    assert_eq!(parents, vec!["A", "B", "outer"]);
    assert_ne!(
        file.identity.structure_digest,
        analyze_file("a.ts", "class A { renamed() {} }", Dialect::TypeScript)
            .identity
            .structure_digest
    );
}

#[test]
fn malformed_headers_and_bodies_are_partial_never_clean() {
    for (dialect, source) in [
        (Dialect::Rust, "fn broken( {"),
        (Dialect::Rust, "fn body() { let x = ; }"),
        (Dialect::TypeScript, "function broken(: {"),
        (Dialect::TypeScript, "function body() {"),
        (Dialect::Python, "def broken(:\n pass"),
        (Dialect::C, "int broken( {"),
    ] {
        let file = analyze_file("fixture", source, dialect);
        assert_eq!(file.identity.coverage, Coverage::Incomplete, "{file:?}");
        assert!(file.diagnostics.iter().any(|d| d.code == "parse_error"));
        if source.contains("broken") {
            assert!(!file
                .declarations
                .iter()
                .any(|d| d.name == "broken" && d.header_complete));
        }
    }
}

struct Repo(std::path::PathBuf);
impl Repo {
    fn new() -> Self {
        static NEXT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
        let path = std::env::temp_dir().join(format!(
            "whip-syntax-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        ));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn root(&self) -> crate::source::ValidatedRepoPath {
        crate::source::ValidatedRepoPath::parse_existing_source_root(&self.0).unwrap()
    }
}
impl Drop for Repo {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn mixed_root_capture_limits_and_qualified_graph() {
    let repo = Repo::new();
    std::fs::write(repo.0.join("a.py"), "def read(x: int):\n return x\n").unwrap();
    std::fs::write(repo.0.join("a.ts"), "function read() { unknown(); }").unwrap();
    std::fs::write(repo.0.join("header.h"), "int read(void);").unwrap();
    std::fs::write(repo.0.join("notes.md"), "not code").unwrap();
    std::fs::create_dir(repo.0.join("node_modules")).unwrap();
    std::fs::write(repo.0.join("node_modules/skip.js"), "ignored").unwrap();
    let result = analyze_repository(&repo.root(), &AnalysisOptions::default());
    let syntax = result.syntax.as_ref().unwrap();
    assert_eq!(result.snapshot.schema_version, 2);
    assert_eq!(result.sources.len(), 2);
    assert!(syntax
        .diagnostics
        .iter()
        .any(|d| d.code == "ambiguous_header_dialect"));
    assert!(syntax
        .diagnostics
        .iter()
        .any(|d| d.code == "unsupported_language"));
    assert!(!syntax.identity.discovery_complete);
    assert!(result
        .snapshot
        .edges
        .iter()
        .all(|e| e.kind == crate::graph::GraphEdgeKind::Contains
            && e.provenance == crate::graph::EdgeProvenanceDto::TreeSitter));
    let fact = syntax
        .files
        .iter()
        .flat_map(|f| &f.relations)
        .find(|r| r.kind == RelationKind::CallSyntax)
        .unwrap();
    assert!(fact.qualification.ends_with("unresolved"));
    let mut options = AnalysisOptions::default();
    options
        .dialect_overrides
        .insert("header.h".to_owned(), Dialect::C);
    assert_eq!(analyze_repository(&repo.root(), &options).sources.len(), 3);
    options.max_files = 1;
    let limited = analyze_repository(&repo.root(), &options);
    assert_eq!(limited.sources.len(), 1);
    assert!(limited
        .syntax
        .unwrap()
        .diagnostics
        .iter()
        .any(|d| d.code == "file_limit"));
    options.max_total_bytes = 1;
    assert!(analyze_repository(&repo.root(), &options)
        .sources
        .is_empty());
    options.max_entries = 1;
    assert!(analyze_repository(&repo.root(), &options)
        .syntax
        .unwrap()
        .diagnostics
        .iter()
        .any(|d| d.code == "entry_limit"));
}

#[cfg(unix)]
#[test]
fn capture_rejects_symlinks_and_non_utf8_files() {
    let repo = Repo::new();
    std::fs::write(repo.0.join("a.py"), [255]).unwrap();
    std::os::unix::fs::symlink("a.py", repo.0.join("b.py")).unwrap();
    std::os::unix::fs::symlink("/tmp", repo.0.join("outside")).unwrap();
    let result = analyze_repository(&repo.root(), &AnalysisOptions::default());
    assert!(result.sources.is_empty());
    let diagnostics = result.syntax.unwrap().diagnostics;
    assert!(diagnostics.iter().any(|d| d.code == "source_read_failed"));
    assert!(diagnostics.iter().any(|d| d.code == "non_regular_source"));
}

#[test]
fn source_and_inventory_budgets_are_explicit() {
    let source = "x".repeat(crate::source::MAX_SOURCE_BYTES as usize + 1);
    assert_eq!(
        analyze_file("a.py", &source, Dialect::Python)
            .identity
            .coverage,
        Coverage::Unavailable
    );
    let source = "const x = 1;\n".repeat(4200);
    let file = analyze_file("a.ts", &source, Dialect::TypeScript);
    assert!(file.declarations.len() <= 4096);
    assert!(file
        .diagnostics
        .iter()
        .any(|d| d.code == "extraction_limit"));
}

#[test]
fn prototypes_members_and_written_annotation_owners_are_typed() {
    let c = analyze_file(
        "a.c",
        "int read(int x); int (*callback)(int); struct A { int field; };",
        Dialect::C,
    );
    assert_eq!(
        c.declarations
            .iter()
            .find(|d| d.name == "read")
            .unwrap()
            .kind,
        DeclarationKind::Function
    );
    assert_eq!(
        c.declarations
            .iter()
            .find(|d| d.name == "field")
            .unwrap()
            .kind,
        DeclarationKind::Field
    );
    assert_eq!(
        c.declarations
            .iter()
            .find(|d| d.name == "callback")
            .unwrap()
            .kind,
        DeclarationKind::Binding
    );
    let cs = analyze_file("a.cs", "class A { public int field; }", Dialect::CSharp);
    let field = cs.declarations.iter().find(|d| d.name == "field").unwrap();
    assert_eq!(field.kind, DeclarationKind::Field);
    assert!(cs
        .relations
        .iter()
        .any(|r| r.owner_id.as_ref() == Some(&field.id) && r.kind == RelationKind::WrittenType));
}

#[test]
fn deep_and_wide_patterns_are_bounded_without_recursion_or_quadratic_rescans() {
    let deep = format!(
        "const {}x{} = value;",
        "[".repeat(10_000),
        "]".repeat(10_000)
    );
    let file = analyze_file("a.ts", &deep, Dialect::TypeScript);
    assert!(file.declarations.iter().any(|d| d.name == "x"));
    let wide = format!(
        "const [{}] = value;",
        (0..5000)
            .map(|i| format!("x{i}"))
            .collect::<Vec<_>>()
            .join(",")
    );
    let file = analyze_file("a.ts", &wide, Dialect::TypeScript);
    assert_eq!(file.declarations.len(), 4096);
    assert_eq!(file.identity.coverage, Coverage::Incomplete);
}

#[test]
fn diagnostic_truncation_cannot_restore_discovery_completeness() {
    let repo = Repo::new();
    for i in 0..511 {
        std::fs::write(repo.0.join(format!("a{i:03}.txt")), "").unwrap();
    }
    std::fs::write(repo.0.join("b.h"), "int x;").unwrap();
    std::fs::write(repo.0.join("z.txt"), "").unwrap();
    let result = analyze_repository(&repo.root(), &AnalysisOptions::default())
        .syntax
        .unwrap();
    assert!(!result.identity.discovery_complete);
    assert!(result
        .diagnostics
        .iter()
        .any(|d| d.code == "diagnostics_truncated"));
}

#[test]
fn damaged_containers_do_not_get_flattened_to_exact_file_children() {
    let repo = Repo::new();
    std::fs::write(repo.0.join("a.rs"), "fn bad(,:) { fn good() {} }").unwrap();
    let result = analyze_repository(&repo.root(), &AnalysisOptions::default());
    assert!(!result.snapshot.nodes.iter().any(|n| n.label == "good"));
}

#[test]
fn csharp_contextual_identifier_is_not_an_extension_block() {
    let file = analyze_file(
        "a.cs",
        "class extension { public extension() {} }",
        Dialect::CSharp,
    );
    assert!(file.diagnostics.is_empty());
    assert!(file
        .declarations
        .iter()
        .any(|d| d.name == "extension" && d.kind == DeclarationKind::Method));
}

#[cfg(unix)]
#[test]
fn unix_backslash_paths_cannot_alias_a_different_source_or_duplicate_identity() {
    let repo = Repo::new();
    std::fs::create_dir(repo.0.join("a")).unwrap();
    std::fs::write(repo.0.join("a/b.py"), "def nested(): pass\n").unwrap();
    std::fs::write(repo.0.join("a\\b.py"), "def other(): pass\n").unwrap();
    let result = analyze_repository(&repo.root(), &AnalysisOptions::default());
    let syntax = result.syntax.unwrap();
    assert_eq!(result.sources.len(), 1);
    assert_eq!(syntax.identity.files.len(), 1);
    assert!(syntax
        .diagnostics
        .iter()
        .any(|d| d.code == "unsupported_path"));
    let ids: std::collections::BTreeSet<_> = result.snapshot.nodes.iter().map(|n| &n.id).collect();
    assert_eq!(ids.len(), result.snapshot.nodes.len());
}

#[test]
fn modern_acceptance_requires_expected_grammar_shapes() {
    for (path, dialect, expected_kind, supported) in [
        ("rust.rs", Dialect::Rust, "foreign_mod_item", true),
        (
            "python.py",
            Dialect::Python,
            "default_type_parameter",
            false,
        ),
        ("kotlin.kt", Dialect::Kotlin, "context_parameter", false),
        ("c.c", Dialect::C, "bitint_type", false),
        (
            "cpp.cpp",
            Dialect::Cpp,
            "explicit_object_parameter_declaration",
            true,
        ),
        ("csharp.cs", Dialect::CSharp, "extension_declaration", true),
    ] {
        let source = fixture(&format!("modern/{path}"));
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&dialect.language()).unwrap();
        let tree = parser.parse(&source, None).unwrap();
        let mut pending = vec![tree.root_node()];
        let mut found = false;
        while let Some(node) = pending.pop() {
            found |= node.kind() == expected_kind;
            let mut cursor = node.walk();
            pending.extend(node.named_children(&mut cursor));
        }
        assert_eq!(
            found, supported,
            "{path}: expected grammar shape {expected_kind}"
        );
    }
    let rust = analyze_file("a.rs", &fixture("modern/rust.rs"), Dialect::Rust);
    let foreign = rust
        .declarations
        .iter()
        .find(|d| d.name == "foreign")
        .unwrap();
    assert!(foreign.parent_id.is_some());
}

#[test]
fn typed_families_publish_annotation_evidence_and_external_svelte_stays_unfetched() {
    for (path, dialect) in [
        ("rust.rs", Dialect::Rust),
        ("typescript.ts", Dialect::TypeScript),
        ("python.py", Dialect::Python),
        ("kotlin.kt", Dialect::Kotlin),
        ("zig.zig", Dialect::Zig),
        ("csharp.cs", Dialect::CSharp),
        ("c.c", Dialect::C),
        ("cpp.cpp", Dialect::Cpp),
        ("odin.odin", Dialect::Odin),
    ] {
        let file = analyze_file(path, &fixture(&format!("basic/{path}")), dialect);
        assert!(
            file.relations
                .iter()
                .any(|r| r.kind == RelationKind::WrittenType),
            "{path}"
        );
    }
    let file = analyze_file(
        "a.svelte",
        "<script src='./external.ts'></script>",
        Dialect::Svelte5,
    );
    assert!(file.declarations.is_empty());
    assert!(file
        .diagnostics
        .iter()
        .any(|d| d.code == "external_or_unsupported_script"));
}

#[test]
fn parser_identities_and_provenance_match_exact_manifest_and_lock_pins() {
    let manifest = include_str!("../../Cargo.toml");
    let lock = include_str!("../../../Cargo.lock");
    let provenance: serde_json::Value =
        serde_json::from_str(include_str!("../../../docs/design/grammar-pins.json")).unwrap();
    let mut identities = vec![PARSER_ID.to_owned()];
    identities.extend(
        [
            Dialect::Rust,
            Dialect::TypeScript,
            Dialect::Tsx,
            Dialect::JavaScript,
            Dialect::Jsx,
            Dialect::Python,
            Dialect::Lua,
            Dialect::Kotlin,
            Dialect::Zig,
            Dialect::CSharp,
            Dialect::C,
            Dialect::Cpp,
            Dialect::Odin,
            Dialect::Svelte5,
        ]
        .map(|d| {
            let identity = d.grammar_identity();
            identity
                .strip_prefix("crates.io/")
                .map(|value| value.split('/').next().unwrap())
                .unwrap_or(identity)
                .to_owned()
        }),
    );
    for identity in identities {
        let (origin, version_or_commit) = identity.split_once('@').unwrap();
        let package = origin.rsplit('/').next().unwrap();
        let pin = provenance["packages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["package"] == package)
            .unwrap();
        let block = lock
            .split("[[package]]")
            .find(|block| block.contains(&format!("name = \"{package}\"")))
            .unwrap();
        if let Some(repository) = origin.strip_prefix("git+") {
            assert_eq!(pin["repository"], repository);
            assert_eq!(pin["upstreamCommit"], version_or_commit);
            assert!(manifest.contains(&format!(
                "{package} = {{ git = \"{repository}\", rev = \"{version_or_commit}\" }}"
            )));
            assert!(block.contains(&format!(
                "source = \"git+{repository}?rev={version_or_commit}#{version_or_commit}\""
            )));
            assert_eq!(pin["generatedParser"]["abi"], 15);
            assert!(!pin["generatedParser"]["files"]["src/parser.c"]
                .as_str()
                .unwrap()
                .is_empty());
        } else {
            assert_eq!(pin["version"], version_or_commit);
            assert!(manifest.contains(&format!("{package} = \"={version_or_commit}\"")));
            assert!(block.contains(&format!(
                "checksum = \"{}\"",
                pin["sha256"].as_str().unwrap()
            )));
        }
        assert!(block.contains(&format!(
            "version = \"{}\"",
            pin["version"].as_str().unwrap()
        )));
    }
}

#[test]
fn svelte_template_calls_use_existing_grammars_with_exact_mapped_byte_ranges() {
    let source = fixture("modern/template-expressions.svelte").replace('\n', "\r\n");
    let file = analyze_file("template.svelte", &source, Dialect::Svelte5);
    let calls: Vec<_> = file
        .relations
        .iter()
        .filter(|r| r.kind == RelationKind::CallSyntax)
        .map(|r| &source[r.target_range.start_byte..r.target_range.end_byte])
        .collect();
    for expected in [
        "ready",
        "show",
        "hide",
        "select",
        "label",
        "retry",
        "rows.filter",
        "format",
        "fetchRows",
        "pending",
        "render",
        "report",
        "key",
        "refresh",
        "card",
        "markup",
    ] {
        assert!(calls.contains(&expected), "missing {expected}: {calls:?}");
    }
    // Const bindings/each keys/snippet parameters are deliberately still partial.
    assert!(!calls.contains(&"count"));
    assert_eq!(calls.iter().filter(|name| **name == "key").count(), 1);
    assert_eq!(file.identity.coverage, Coverage::Incomplete);
    assert!(
        file.diagnostics
            .iter()
            .all(|d| d.code == "template_expression_unanalyzed"),
        "{:?}",
        file.diagnostics
    );
    for fact in &file.relations {
        assert!(fact.range.start_byte <= fact.target_range.start_byte);
        assert!(fact.target_range.end_byte <= fact.range.end_byte);
        assert!(fact.range.end_byte <= source.len());
        assert!(source.is_char_boundary(fact.range.start_byte));
        assert!(source.is_char_boundary(fact.range.end_byte));
    }
    let snippet = file.declarations.iter().find(|d| d.name == "card").unwrap();
    let inner = file
        .relations
        .iter()
        .find(|r| source[r.range.start_byte..r.range.end_byte] == *"format(value)")
        .unwrap();
    assert_eq!(inner.owner_id.as_ref(), Some(&snippet.id));
    assert!(file
        .identity
        .grammars
        .iter()
        .any(|g| g.dialect == Dialect::TypeScript));
}

#[test]
fn svelte_expression_wrappers_never_escape_or_invent_calls_from_recovery() {
    for (source, targets) in [
        ("<!-- 蟹 -->{({ value: read() })}", vec!["read"]),
        (
            "{(function() { return read(); })()}",
            vec!["read", "(function() { return read(); })"],
        ),
        ("{read() // comment\n}", vec!["read"]),
        ("{items?.map(x => read(x))}", vec!["items?.map", "read"]),
        (
            "<script lang='ts'></script>{read(value as Item)}",
            vec!["read"],
        ),
    ] {
        let file = analyze_file("a.svelte", source, Dialect::Svelte5);
        assert!(
            file.diagnostics.is_empty(),
            "{source}: {:?}",
            file.diagnostics
        );
        let actual: Vec<_> = file
            .relations
            .iter()
            .map(|r| &source[r.target_range.start_byte..r.target_range.end_byte])
            .collect();
        for target in targets {
            assert!(actual.contains(&target), "{actual:?}");
        }
    }
    for source in [
        "{read(}",
        "{a); injected(); (b}",
        "{#await read() then item}{show(item)}{/await}",
    ] {
        let file = analyze_file("a.svelte", source, Dialect::Svelte5);
        assert_eq!(file.identity.coverage, Coverage::Incomplete);
        assert!(!file.relations.iter().any(|r| source
            [r.target_range.start_byte..r.target_range.end_byte]
            .contains("injected")));
        assert!(!file
            .relations
            .iter()
            .any(|r| &source[r.target_range.start_byte..r.target_range.end_byte] == "read"));
    }
}

#[test]
fn svelte_template_region_budget_remains_explicit() {
    let source = "{read()}\n".repeat(260);
    let file = analyze_file("a.svelte", &source, Dialect::Svelte5);
    assert_eq!(file.relations.len(), 256);
    assert!(file
        .diagnostics
        .iter()
        .any(|d| d.code == "template_region_limit"));
    assert_eq!(file.identity.coverage, Coverage::Incomplete);
}

#[test]
fn each_reported_registry_grammar_gap_is_qualified_individually() {
    for (dialect, source) in [
        (Dialect::Python, "class Box[T = int]:\n pass\n"),
        (
            Dialect::Python,
            "def read[T = int](x: T) -> T:\n return x\n",
        ),
        (Dialect::Python, "type Alias[T = int] = list[T]\n"),
        (
            Dialect::Python,
            "class Pack[*Ts = tuple[int, ...], **P = None]:\n pass\n",
        ),
        (
            Dialect::Kotlin,
            "context(user: User) fun read(): String = user.name\n",
        ),
        (
            Dialect::Kotlin,
            "context(user: User) val current: String get() = user.name\n",
        ),
        (
            Dialect::Kotlin,
            "context(User) fun read(): String = \"x\"\n",
        ),
        (Dialect::C, "unsigned _BitInt(17) bits;"),
        (Dialect::C, "void read(_BitInt(17) value) {}"),
    ] {
        let file = analyze_file("gap", source, dialect);
        assert_eq!(
            file.identity.coverage,
            Coverage::Incomplete,
            "{dialect:?}: {source}"
        );
        assert!(
            file.diagnostics
                .iter()
                .any(|d| matches!(d.code.as_str(), "parse_error" | "unsupported_modern_syntax")),
            "{:?}",
            file.diagnostics
        );
    }
}

fn assert_exact_ranges(file: &FileAnalysis, source: &str) {
    for declaration in &file.declarations {
        assert_eq!(
            &source[declaration.name_range.start_byte..declaration.name_range.end_byte],
            declaration.name
        );
        assert!(declaration.range.start_byte <= declaration.name_range.start_byte);
        assert!(declaration.range.end_byte >= declaration.name_range.end_byte);
        assert!(source
            .get(declaration.range.start_byte..declaration.range.end_byte)
            .is_some());
        if let Some(parent) = &declaration.parent_id {
            let parent = file.declarations.iter().find(|d| &d.id == parent).unwrap();
            assert!(parent.range.start_byte <= declaration.range.start_byte);
            assert!(parent.range.end_byte >= declaration.range.end_byte);
        }
    }
    for fact in &file.relations {
        assert!(source
            .get(fact.range.start_byte..fact.range.end_byte)
            .is_some());
        assert!(source
            .get(fact.target_range.start_byte..fact.target_range.end_byte)
            .is_some());
        assert!(fact.range.start_byte <= fact.target_range.start_byte);
        assert!(fact.range.end_byte >= fact.target_range.end_byte);
        assert!(fact.qualification.ends_with("unresolved"));
        if let Some(owner) = &fact.owner_id {
            assert!(file.declarations.iter().any(|d| &d.id == owner));
        }
    }
}

#[test]
fn official_cpp_explicit_receivers_preserve_methods_parameters_and_ranges() {
    let source = fixture("modern/explicit-object.cpp").replace('\n', "\r\n");
    let file = analyze_file("a.cpp", &source, Dialect::Cpp);
    assert_eq!(
        file.identity.coverage,
        Coverage::SupportedSubset,
        "{:?}",
        file.diagnostics
    );
    assert_exact_ranges(&file, &source);
    let container = file
        .declarations
        .iter()
        .find(|d| d.name == "Sample")
        .unwrap();
    for (method, receiver, typ) in [
        ("copy", "this Sample self", "Sample"),
        ("view", "this Sample const& /* receiver */ self", "Sample"),
        ("update", "this Sample& self", "Sample"),
        ("forward", "this Self&& /* generic */ self", "Self"),
        ("declared", "this Sample const& self", "Sample"),
    ] {
        let method = file.declarations.iter().find(|d| d.name == method).unwrap();
        assert_eq!(method.kind, DeclarationKind::Method);
        assert_eq!(method.parent_id.as_ref(), Some(&container.id));
        let parameter = file
            .declarations
            .iter()
            .find(|d| d.name == "self" && d.parent_id.as_ref() == Some(&method.id))
            .unwrap();
        assert_eq!(parameter.kind, DeclarationKind::Parameter);
        assert_eq!(
            &source[parameter.range.start_byte..parameter.range.end_byte],
            receiver
        );
        assert!(parameter.header_complete && parameter.body_complete);
        assert!(file
            .relations
            .iter()
            .any(|fact| fact.kind == RelationKind::WrittenType
                && fact.owner_id.as_ref() == Some(&parameter.id)
                && &source[fact.target_range.start_byte..fact.target_range.end_byte] == typ));
    }
    assert_eq!(
        file.declarations
            .iter()
            .find(|d| d.name == "ordinary")
            .unwrap()
            .kind,
        DeclarationKind::Method
    );
    assert_eq!(
        file.declarations
            .iter()
            .find(|d| d.name == "callback")
            .unwrap()
            .kind,
        DeclarationKind::Field
    );
    let call = file
        .relations
        .iter()
        .find(|r| r.kind == RelationKind::CallSyntax)
        .unwrap();
    assert_eq!(
        &source[call.range.start_byte..call.range.end_byte],
        "inspect(self)"
    );
    assert_eq!(
        &source[call.target_range.start_byte..call.target_range.end_byte],
        "inspect"
    );
}

#[test]
fn official_csharp_extensions_inventory_containers_receivers_and_members() {
    let source = fixture("modern/extension-blocks.cs").replace('\n', "\r\n");
    let file = analyze_file("a.cs", &source, Dialect::CSharp);
    assert_eq!(
        file.identity.coverage,
        Coverage::SupportedSubset,
        "{:?}",
        file.diagnostics
    );
    assert_exact_ranges(&file, &source);
    let extensions: Vec<_> = file
        .declarations
        .iter()
        .filter(|d| d.syntax_kind == "extension_declaration")
        .collect();
    assert_eq!(extensions.len(), 4);
    let class = file
        .declarations
        .iter()
        .find(|d| d.name == "Extensions")
        .unwrap();
    for extension in &extensions {
        assert_eq!(extension.name, "extension");
        assert_eq!(extension.kind, DeclarationKind::Implementation);
        assert_eq!(extension.parent_id.as_ref(), Some(&class.id));
        assert!(extension.header_complete && extension.body_complete);
        assert!(
            source[extension.range.start_byte..extension.range.end_byte].starts_with("extension")
        );
    }
    for (name, typ, receiver, members) in [
        ("text", "string", "string text", vec!["Read", "Size"]),
        (
            "values",
            "IEnumerable<T>",
            "IEnumerable<T> values",
            vec!["Count"],
        ),
        ("number", "int", "ref int number", vec!["Increment"]),
    ] {
        let parameter = file
            .declarations
            .iter()
            .find(|d| d.syntax_kind == "receiver_parameter" && d.name == name)
            .unwrap();
        assert_eq!(parameter.kind, DeclarationKind::Parameter);
        assert_eq!(
            &source[parameter.range.start_byte..parameter.range.end_byte],
            receiver
        );
        assert!(extensions
            .iter()
            .any(|e| Some(&e.id) == parameter.parent_id.as_ref()));
        for member in members {
            let member = file
                .declarations
                .iter()
                .find(|d| d.name == member && d.parent_id == parameter.parent_id)
                .unwrap();
            assert!(matches!(
                member.kind,
                DeclarationKind::Field | DeclarationKind::Method
            ));
        }
        assert!(file
            .relations
            .iter()
            .any(|r| r.kind == RelationKind::WrittenType
                && r.owner_id.as_ref() == Some(&parameter.id)
                && &source[r.target_range.start_byte..r.target_range.end_byte] == typ));
    }
    assert_eq!(
        file.declarations
            .iter()
            .filter(|d| d.syntax_kind == "receiver_parameter")
            .count(),
        3
    );
    let operator = file
        .declarations
        .iter()
        .find(|d| d.syntax_kind == "operator_declaration")
        .unwrap();
    assert_eq!(operator.name, "+");
    assert_eq!(operator.kind, DeclarationKind::Method);
    let anonymous = extensions
        .iter()
        .find(|e| Some(&e.id) == operator.parent_id.as_ref())
        .unwrap();
    assert!(file
        .relations
        .iter()
        .any(|r| r.owner_id.as_ref() == Some(&anonymous.id)
            && r.kind == RelationKind::WrittenType
            && &source[r.target_range.start_byte..r.target_range.end_byte] == "List<int>"));
    assert!(file
        .declarations
        .iter()
        .any(|d| d.name == "extension" && d.syntax_kind == "constructor_declaration"));
    assert!(file
        .declarations
        .iter()
        .any(|d| d.name == "extension" && d.syntax_kind == "method_declaration"));
    for expected in ["measure", "count", "merge", "extension"] {
        assert!(file
            .relations
            .iter()
            .any(|r| r.kind == RelationKind::CallSyntax
                && &source[r.target_range.start_byte..r.target_range.end_byte] == expected));
    }
}

#[test]
fn official_new_constructs_reject_damaged_headers_and_preserve_partial_bodies() {
    for (path, dialect, source) in [
        (
            "a.cpp",
            Dialect::Cpp,
            "struct Sample { int broken(this & self) { return 1; } };",
        ),
        (
            "a.cpp",
            Dialect::Cpp,
            "struct Sample { int broken(this Sample& self, ) { return 1; } };",
        ),
        (
            "a.cs",
            Dialect::CSharp,
            "static class E { extension(string text, int other) { public int Value => 1; } }",
        ),
        (
            "a.cs",
            Dialect::CSharp,
            "static class E { extension(string text) { public int Value => ; } }",
        ),
        (
            "a.cs",
            Dialect::CSharp,
            "static class E { extension() { public int Value => 1; } }",
        ),
    ] {
        let repo = Repo::new();
        std::fs::write(repo.0.join(path), source).unwrap();
        let analysis = analyze_repository(&repo.root(), &AnalysisOptions::default());
        let file = &analysis.syntax.as_ref().unwrap().files[0];
        assert_eq!(file.identity.dialect, dialect);
        assert_eq!(file.identity.coverage, Coverage::Incomplete, "{source}");
        assert!(file.diagnostics.iter().any(|d| d.code == "parse_error"));
        assert_exact_ranges(file, source);
        for declaration in &file.declarations {
            let mut current = Some(declaration);
            let mut damaged = false;
            while let Some(node) = current {
                damaged |= !node.header_complete;
                current = node
                    .parent_id
                    .as_ref()
                    .and_then(|id| file.declarations.iter().find(|d| &d.id == id));
            }
            if damaged {
                assert!(!analysis
                    .snapshot
                    .nodes
                    .iter()
                    .any(|n| n.id == declaration.id));
            }
        }
        if source.contains("extension()") {
            let extension = file
                .declarations
                .iter()
                .find(|d| d.syntax_kind == "extension_declaration")
                .unwrap();
            assert!(!extension.header_complete);
            assert!(!analysis
                .snapshot
                .nodes
                .iter()
                .any(|n| n.label == "extension" || n.label == "Value"));
        }
        if source.contains("Value => ;") {
            let extension = file
                .declarations
                .iter()
                .find(|d| d.syntax_kind == "extension_declaration")
                .unwrap();
            assert!(extension.header_complete);
            assert!(!extension.body_complete);
        }
    }
}

#[test]
fn official_git_grammars_are_abi_compatible_and_match_recorded_node_types() {
    for (dialect, node_types) in [
        (Dialect::Cpp, tree_sitter_cpp::NODE_TYPES),
        (Dialect::CSharp, tree_sitter_c_sharp::NODE_TYPES),
    ] {
        let language = dialect.language();
        assert_eq!(language.abi_version(), 15);
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&language).unwrap();
        let provenance: serde_json::Value =
            serde_json::from_str(include_str!("../../../docs/design/grammar-pins.json")).unwrap();
        let (_, commit) = dialect.grammar_identity().split_once('@').unwrap();
        let pin = provenance["packages"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["upstreamCommit"] == commit)
            .unwrap();
        assert_eq!(
            format!(
                "{:x}",
                <sha2::Sha256 as sha2::Digest>::digest(node_types.as_bytes())
            ),
            pin["generatedParser"]["files"]["src/node-types.json"]
        );
    }
}
