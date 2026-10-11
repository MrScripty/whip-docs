use super::*;
use std::time::{Duration, Instant};
use tree_sitter::{Node, ParseOptions, Parser};

const MAX_NODES: usize = 250_000;
const MAX_DECLARATIONS: usize = 4096;
const MAX_FACTS: usize = 8192;
const MAX_DIAGNOSTICS: usize = 128;

pub fn analyze_file(path: &str, source: &str, dialect: Dialect) -> FileAnalysis {
    let mut file = FileAnalysis {
        identity: FileIdentity {
            path: path.to_owned(),
            dialect,
            grammars: Vec::new(),
            source_digest: hash(source),
            structure_digest: String::new(),
            byte_length: source.len(),
            coverage: Coverage::SupportedSubset,
        },
        declarations: Vec::new(),
        relations: Vec::new(),
        diagnostics: Vec::new(),
    };
    if source.len() as u64 > crate::source::MAX_SOURCE_BYTES {
        diagnostic(
            &mut file,
            "source_limit",
            None,
            "Source exceeds the 2 MiB parser limit.",
        );
        file.identity.coverage = Coverage::Unavailable;
    } else {
        parse_region(&mut file, source, dialect, 0, None);
    }
    file.declarations.sort_by(|a, b| {
        a.range
            .start_byte
            .cmp(&b.range.start_byte)
            .then(a.id.cmp(&b.id))
    });
    // Includes names, ranges, relationships and completeness but no copied source.
    let structural_bytes =
        serde_json::to_vec(&(&file.declarations, &file.relations, &file.diagnostics))
            .expect("serializable syntax metadata");
    file.identity.structure_digest = hash(structural_bytes);
    file
}

fn diagnostic(file: &mut FileAnalysis, code: &str, range: Option<ByteRange>, message: &str) {
    file.identity.coverage = Coverage::Incomplete;
    if file.diagnostics.len() < MAX_DIAGNOSTICS {
        file.diagnostics.push(SyntaxDiagnostic {
            code: code.to_owned(),
            path: file.identity.path.clone(),
            range,
            message: message.to_owned(),
        });
    }
}

fn span(node: Node<'_>, offset: usize) -> ByteRange {
    ByteRange {
        start_byte: offset + node.start_byte(),
        end_byte: offset + node.end_byte(),
    }
}

fn children(node: Node<'_>) -> Vec<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).collect()
}

fn child_kind<'a>(node: Node<'a>, kinds: &[&str]) -> Option<Node<'a>> {
    children(node)
        .into_iter()
        .find(|n| kinds.contains(&n.kind()))
}

fn text<'a>(node: Node<'_>, source: &'a str) -> &'a str {
    &source[node.byte_range()]
}

fn parse_region(
    file: &mut FileAnalysis,
    source: &str,
    dialect: Dialect,
    offset: usize,
    parent: Option<String>,
) {
    let grammar = GrammarIdentity {
        dialect,
        grammar: dialect.grammar_identity().to_owned(),
    };
    if !file.identity.grammars.contains(&grammar) {
        file.identity.grammars.push(grammar);
    }
    let mut parser = Parser::new();
    if parser.set_language(&dialect.language()).is_err() {
        diagnostic(
            file,
            "grammar_unavailable",
            None,
            "Pinned grammar is incompatible with the engine.",
        );
        file.identity.coverage = Coverage::Unavailable;
        return;
    }
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut stop = |_: &tree_sitter::ParseState| Instant::now() >= deadline;
    let tree = parser.parse_with_options(
        &mut |byte, _| source.as_bytes().get(byte..).unwrap_or_default(),
        None,
        Some(ParseOptions::new().progress_callback(&mut stop)),
    );
    let Some(tree) = tree else {
        diagnostic(
            file,
            "parse_budget_exceeded",
            None,
            "Parser exceeded its bounded time budget.",
        );
        return;
    };
    if tree.root_node().has_error() {
        diagnostic(
            file,
            "parse_error",
            Some(span(tree.root_node(), offset)),
            "Grammar reported syntax errors or missing tokens; inventory is partial.",
        );
    }
    let template_dialect = super::template::dialect(tree.root_node(), source);
    let template_deadline = Instant::now() + Duration::from_secs(2);
    let mut template_regions = 0;
    // Iterative traversal avoids stack overflow on adversarial nesting.
    let mut pending = vec![(tree.root_node(), parent)];
    let mut visited = 0;
    while let Some((node, inherited_owner)) = pending.pop() {
        visited += 1;
        if visited > MAX_NODES
            || file.declarations.len() >= MAX_DECLARATIONS
            || file.relations.len() >= MAX_FACTS
        {
            diagnostic(
                file,
                "extraction_limit",
                Some(span(node, offset)),
                "Syntax inventory exceeded its node/declaration/fact bound.",
            );
            break;
        }
        if node.is_error() || node.is_missing() {
            diagnostic(
                file,
                "parse_error",
                Some(span(node, offset)),
                "Grammar reported an error or missing token; recovered declarations are partial.",
            );
        }
        // Plain JS accepts JSX in this grammar; policy makes the ambiguity explicit.
        if dialect == Dialect::JavaScript
            && matches!(node.kind(), "jsx_element" | "jsx_self_closing_element")
        {
            diagnostic(
                file,
                "jsx_requires_override",
                Some(span(node, offset)),
                "Use the JSX dialect override for JSX in a .js file.",
            );
        }
        if dialect == Dialect::Svelte5 && node.kind() == "script_element" {
            if child_kind(node, &["raw_text"]).is_none()
                && child_kind(node, &["start_tag"]).is_some_and(|tag| {
                    children(tag).iter().any(|attr| {
                        attr.kind() == "attribute"
                            && child_kind(*attr, &["attribute_name"])
                                .is_some_and(|n| text(n, source) == "src")
                    })
                })
            {
                diagnostic(
                    file,
                    "external_or_unsupported_script",
                    Some(span(node, offset)),
                    "External script source is excluded; no external source is fetched.",
                );
            }
            if let Some(raw) = child_kind(node, &["raw_text"]) {
                let start = child_kind(node, &["start_tag"]);
                let mut embedded = Dialect::JavaScript;
                let mut external = false;
                if let Some(start) = start {
                    for attribute in children(start)
                        .into_iter()
                        .filter(|n| n.kind() == "attribute")
                    {
                        let parts = children(attribute);
                        let name = parts.first().map(|n| text(*n, source)).unwrap_or("");
                        let value = parts
                            .get(1)
                            .map(|n| text(*n, source).trim_matches(['\'', '"']))
                            .unwrap_or("");
                        if name == "lang" && matches!(value, "ts" | "typescript") {
                            embedded = Dialect::TypeScript;
                        } else if name == "lang" && !matches!(value, "js" | "javascript") {
                            diagnostic(
                                file,
                                "unsupported_embedded_language",
                                Some(span(attribute, offset)),
                                "Only JavaScript and TypeScript script regions are supported.",
                            );
                            external = true;
                        }
                        if name == "src" {
                            external = true;
                        }
                    }
                }
                if external {
                    diagnostic(
                        file,
                        "external_or_unsupported_script",
                        Some(span(node, offset)),
                        "Script region was not parsed; no external source is fetched.",
                    );
                } else {
                    parse_region(
                        file,
                        text(raw, source),
                        embedded,
                        offset + raw.start_byte(),
                        inherited_owner.clone(),
                    );
                }
            }
            continue;
        }
        if dialect == Dialect::Svelte5 && node.kind() == "svelte_raw_text" {
            if !super::template::is_expression(node) {
                diagnostic(file, "template_expression_unanalyzed", Some(span(node, offset)), "Template bindings, snippet parameters and non-expression regions are outside the extracted subset.");
            } else if template_regions >= 256 {
                diagnostic(
                    file,
                    "template_region_limit",
                    Some(span(node, offset)),
                    "Template expression region limit reached.",
                );
            } else {
                template_regions += 1;
                let grammar = GrammarIdentity {
                    dialect: template_dialect,
                    grammar: template_dialect.grammar_identity().to_owned(),
                };
                if !file.identity.grammars.contains(&grammar) {
                    file.identity.grammars.push(grammar);
                }
                match super::template::calls(text(node, source), offset + node.start_byte(), template_dialect,
                    inherited_owner.as_deref(), MAX_FACTS.saturating_sub(file.relations.len()), template_deadline) {
                    Ok(facts) => file.relations.extend(facts),
                    Err(code) => diagnostic(file, code, Some(span(node, offset)), "Template expression could not be safely qualified; no recovered call facts were emitted for this region."),
                }
            }
            continue;
        }
        let mut owner = inherited_owner;
        let names = declaration_names(node, dialect);
        let single_name = names.len() == 1;
        for (kind, name_node) in names {
            if file.declarations.len() >= MAX_DECLARATIONS {
                diagnostic(
                    file,
                    "extraction_limit",
                    Some(span(node, offset)),
                    "Declaration limit reached within a binding pattern.",
                );
                break;
            }
            let name = text(name_node, source);
            // Bound labels and accept identifier syntax only, never copied values/signatures.
            if name.len() > 256 || name.is_empty() {
                diagnostic(
                    file,
                    "declaration_name_limit",
                    Some(span(name_node, offset)),
                    "Declaration name exceeded the inventory label bound.",
                );
                continue;
            }
            let declaration_node =
                if dialect == Dialect::CSharp && node.kind() == "variable_declarator" {
                    node.parent()
                        .and_then(|p| p.parent())
                        .filter(|p| p.kind() == "field_declaration")
                        .or_else(|| node.parent().filter(|p| p.kind() == "variable_declaration"))
                        .unwrap_or(node)
                } else if dialect == Dialect::Cpp && node.kind() == "parameter_declaration" {
                    node.parent()
                        .filter(|p| p.kind() == "explicit_object_parameter_declaration")
                        .unwrap_or(node)
                } else {
                    node
                };
            let range = span(declaration_node, offset);
            let name_range = span(name_node, offset);
            let id = format!(
                "syntax:{}",
                hash(
                    serde_json::to_vec(&(
                        &file.identity.path,
                        dialect,
                        &kind,
                        name,
                        &range,
                        &name_range
                    ))
                    .unwrap()
                )
                .trim_start_matches("sha256:")
            );
            let body = declaration_node.child_by_field_name("body").or_else(|| {
                child_kind(
                    node,
                    &[
                        "block",
                        "function_body",
                        "class_body",
                        "declaration_list",
                        "extension_body",
                    ],
                )
            });
            let header_end = body
                .map(|n| n.start_byte())
                .unwrap_or(declaration_node.end_byte());
            let header_complete = !damage_before(declaration_node, header_end)
                && !name_node.has_error()
                && !name_node.is_missing();
            file.declarations.push(Declaration {
                id: id.clone(),
                name: name.to_owned(),
                kind,
                syntax_kind: node.kind().to_owned(),
                dialect,
                parent_id: owner.clone(),
                range,
                name_range,
                header_complete,
                body_complete: !declaration_node.has_error(),
            });
            // A multi-binding declaration has sibling names, not a chain.
            if dialect == Dialect::CSharp && node.kind() == "variable_declarator" {
                if let Some(typ) = node.parent().and_then(|p| p.child_by_field_name("type")) {
                    file.relations.push(RelationFact {
                        owner_id: Some(id.clone()),
                        kind: RelationKind::WrittenType,
                        range: span(declaration_node, offset),
                        target_range: span(typ, offset),
                        qualification: "written_annotation_unresolved".to_owned(),
                    });
                }
            }
            if single_name {
                owner = Some(id);
            }
        }
        if let Some(kind) = relation_kind(node) {
            let target = node
                .child_by_field_name("function")
                .or_else(|| node.child_by_field_name("name"))
                .unwrap_or(node);
            file.relations.push(RelationFact {
                owner_id: owner.clone(),
                kind,
                range: span(node, offset),
                target_range: span(target, offset),
                qualification: "written_syntax_unresolved".to_owned(),
            });
        }
        for field in ["type", "return_type", "returns", "trait"] {
            if dialect == Dialect::CSharp && node.kind() == "variable_declaration" {
                continue;
            }
            if let Some(typ) = node.child_by_field_name(field) {
                if typ.is_named() {
                    file.relations.push(RelationFact {
                        owner_id: owner.clone(),
                        kind: RelationKind::WrittenType,
                        range: span(node, offset),
                        target_range: span(typ, offset),
                        qualification: "written_annotation_unresolved".to_owned(),
                    });
                }
            }
        }
        if matches!(dialect, Dialect::Kotlin | Dialect::Odin)
            && matches!(node.kind(), "user_type" | "named_type" | "type")
        {
            file.relations.push(RelationFact {
                owner_id: owner.clone(),
                kind: RelationKind::WrittenType,
                range: span(node, offset),
                target_range: span(node, offset),
                qualification: "written_type_syntax_unresolved".to_owned(),
            });
        }
        if file.relations.len() > MAX_FACTS {
            file.relations.truncate(MAX_FACTS);
            diagnostic(
                file,
                "extraction_limit",
                Some(span(node, offset)),
                "Relation fact limit reached.",
            );
        }
        for child in children(node).into_iter().rev() {
            pending.push((child, owner.clone()));
        }
    }
}

fn damage_before(node: Node<'_>, end: usize) -> bool {
    if !node.has_error() && !node.is_missing() {
        return false;
    }
    let mut pending = vec![node];
    let mut visited = 0;
    while let Some(n) = pending.pop() {
        visited += 1;
        if visited > MAX_NODES {
            return true;
        }
        // Some generated grammars hide missing tokens inside a public leaf
        // (for example C# identifier -> MISSING _identifier_token). Such a leaf
        // has_error() but exposes no missing child and is not itself is_missing().
        if (n.is_error() || n.is_missing() || n.has_error() && n.child_count() == 0)
            && n.start_byte() <= end
        {
            return true;
        }
        if n.start_byte() <= end && n.has_error() {
            let mut cursor = n.walk();
            pending.extend(n.children(&mut cursor));
        }
    }
    false
}

fn relation_kind(node: Node<'_>) -> Option<RelationKind> {
    Some(match node.kind() {
        "call"
        | "call_expression"
        | "function_call"
        | "invocation_expression"
        | "macro_invocation" => RelationKind::CallSyntax,
        "use_declaration"
        | "import_statement"
        | "import_from_statement"
        | "import_declaration"
        | "import"
        | "using_directive"
        | "preproc_include" => RelationKind::ImportSyntax,
        "base_list"
        | "class_heritage"
        | "extends_type_clause"
        | "base_class_clause"
        | "delegation_specifiers" => RelationKind::InheritanceSyntax,
        _ => return None,
    })
}

fn declaration_names(node: Node<'_>, dialect: Dialect) -> Vec<(DeclarationKind, Node<'_>)> {
    use DeclarationKind as K;
    let typ = node.kind();
    // Anonymous extension containers and operators use exact written tokens as
    // labels. They are syntax identities, never invented compiler symbol names.
    if dialect == Dialect::CSharp {
        if typ == "extension_declaration" {
            return (0..node.child_count())
                .filter_map(|i| node.child(i))
                .find(|child| child.kind() == "extension")
                .map(|keyword| vec![(K::Implementation, keyword)])
                .unwrap_or_default();
        }
        if typ == "operator_declaration" {
            return node
                .child_by_field_name("operator")
                .map(|operator| vec![(K::Method, operator)])
                .unwrap_or_default();
        }
    }
    // C/C++ tagged type references are not new declarations.
    if matches!(
        typ,
        "struct_specifier" | "enum_specifier" | "union_specifier"
    ) && node.child_by_field_name("body").is_none()
        && node.parent().is_some_and(|p| {
            !(matches!(p.kind(), "translation_unit" | "type_definition")
                || p.kind() == "declaration" && p.named_child_count() == 1)
        })
    {
        return Vec::new();
    }
    let mut kind = match typ {
        "function_item"
        | "function_signature_item"
        | "function_declaration"
        | "function_definition"
        | "function_signature"
        | "generator_function_declaration"
        | "procedure_declaration"
        | "local_function_statement" => K::Function,
        "method_definition"
        | "method_declaration"
        | "method_signature"
        | "constructor_declaration"
        | "destructor_declaration" => K::Method,
        "class_specifier" | "class_declaration" | "class_definition" | "record_declaration"
        | "object_declaration" => K::Class,
        "struct_item" | "struct_specifier" | "struct_declaration" | "union_specifier"
        | "union_declaration" => K::Struct,
        "enum_item" | "enum_specifier" | "enum_declaration" => K::Enum,
        "interface_declaration" => K::Interface,
        "trait_item" => K::Trait,
        "impl_item" => K::Implementation,
        "foreign_mod_item"
        | "mod_item"
        | "namespace_definition"
        | "namespace_declaration"
        | "file_scoped_namespace_declaration"
        | "internal_module"
        | "package_declaration" => K::Module,
        "type_item"
        | "type_alias_declaration"
        | "type_alias_statement"
        | "type_alias"
        | "type_definition"
        | "alias_declaration"
        | "const_type_declaration" => K::TypeAlias,
        "field" if dialect == Dialect::Odin => K::Field,
        "field_definition"
        | "field_declaration"
        | "public_field_definition"
        | "property_signature"
        | "property_declaration"
        | "container_field"
        | "struct_member"
        | "event_declaration" => K::Field,
        "enum_variant" | "enum_member_declaration" | "enumerator" => K::Variant,
        "const_item"
        | "static_item"
        | "let_declaration"
        | "variable_declarator"
        | "variable_declaration"
        | "var_declaration"
        | "const_declaration"
        | "init_declarator" => K::Binding,
        "assignment" if dialect == Dialect::Python => K::Binding,
        "assignment_statement"
            if dialect == Dialect::Odin
                && (0..node.child_count())
                    .filter_map(|i| node.child(i))
                    .any(|n| n.kind() == ":=") =>
        {
            K::Binding
        }
        "using_directive"
            if dialect == Dialect::CSharp && node.child_by_field_name("name").is_some() =>
        {
            K::TypeAlias
        }
        "identifier"
            if node
                .parent()
                .is_some_and(|p| matches!(p.kind(), "parameters" | "formal_parameters"))
                && matches!(
                    dialect,
                    Dialect::JavaScript | Dialect::Jsx | Dialect::Python | Dialect::Lua
                ) =>
        {
            return vec![(K::Parameter, node)]
        }
        "parameter"
        | "required_parameter"
        | "optional_parameter"
        | "typed_parameter"
        | "typed_default_parameter"
        | "default_parameter"
        | "parameter_declaration"
        | "receiver_parameter"
        | "class_parameter" => K::Parameter,
        "snippet_statement" => K::Snippet,
        "declaration" if matches!(dialect, Dialect::C | Dialect::Cpp) => K::Binding,
        _ => return Vec::new(),
    };
    if typ == "variable_declarator"
        && node.child_by_field_name("value").is_some_and(|n| {
            matches!(
                n.kind(),
                "arrow_function" | "function_expression" | "generator_function"
            )
        })
    {
        kind = K::Function;
    }
    if dialect == Dialect::Zig && typ == "variable_declaration" {
        if child_kind(
            node,
            &[
                "struct_declaration",
                "union_declaration",
                "opaque_declaration",
            ],
        )
        .is_some()
        {
            kind = K::Struct;
        } else if child_kind(node, &["enum_declaration"]).is_some() {
            kind = K::Enum;
        }
    }
    if dialect == Dialect::Odin
        && typ == "const_declaration"
        && child_kind(node, &["distinct_type"]).is_some()
    {
        kind = K::TypeAlias;
    }
    let mut candidates = Vec::new();
    let named = node
        .child_by_field_name("name")
        .or_else(|| node.child_by_field_name("pattern"))
        .or_else(|| {
            if typ == "field_definition" {
                node.child_by_field_name("property")
            } else {
                None
            }
        });
    if let Some(name) = named {
        candidates.extend(binding_identifiers(name));
    } else if let Some(declarator) = node.child_by_field_name("declarator") {
        // Own outer declarations, not nested declarator wrappers.
        if !matches!(typ, "init_declarator") {
            let mut cursor = node.walk();
            for declarator in node.children_by_field_name("declarator", &mut cursor) {
                candidates.extend(declarator_names(declarator));
            }
        }
        let _ = declarator;
    } else if typ == "foreign_mod_item" {
        if let Some(modifier) = child_kind(node, &["extern_modifier"]) {
            if let Some(keyword) = (0..modifier.child_count())
                .filter_map(|i| modifier.child(i))
                .find(|child| child.kind() == "extern")
            {
                candidates.push(keyword);
            }
        }
    } else if typ == "impl_item" {
        if let Some(name) = node.child_by_field_name("type") {
            candidates.extend(type_name(name));
        }
    } else if dialect == Dialect::Python && typ == "assignment" {
        if let Some(left) = node.child_by_field_name("left") {
            candidates.extend(binding_identifiers(left));
        }
    } else if dialect == Dialect::Python && typ == "type_alias_statement" {
        if let Some(left) = node.child_by_field_name("left") {
            candidates.extend(type_name(left));
        }
    } else if dialect == Dialect::Svelte5 {
        if let Some(start) = child_kind(node, &["snippet_start"]) {
            if let Some(name) = child_kind(start, &["snippet_name"]) {
                candidates.push(name);
            }
        }
    } else if dialect == Dialect::Lua && typ == "variable_declaration" {
        let assignment = child_kind(node, &["assignment_statement"]).unwrap_or(node);
        if let Some(vars) = child_kind(assignment, &["variable_list"]) {
            candidates.extend(
                children(vars)
                    .into_iter()
                    .filter(|n| n.kind() == "identifier"),
            );
        }
    } else if matches!(
        dialect,
        Dialect::Odin | Dialect::Zig | Dialect::Kotlin | Dialect::Python
    ) {
        if let Some(name) = child_kind(
            node,
            &[
                "identifier",
                "type_identifier",
                "field_identifier",
                "simple_identifier",
            ],
        ) {
            candidates.push(name);
        } else if dialect == Dialect::Odin {
            if let Some(expression) = child_kind(node, &["expression"]) {
                candidates.extend(binding_identifiers(expression));
            }
        }
    }
    // Skip wrapper declarations whose child variable_declarator owns the names.
    if matches!(
        dialect,
        Dialect::TypeScript | Dialect::Tsx | Dialect::JavaScript | Dialect::Jsx | Dialect::CSharp
    ) && typ == "variable_declaration"
    {
        candidates.clear();
    }
    candidates
        .into_iter()
        .map(|name| {
            let mut selected = kind.clone();
            if matches!(dialect, Dialect::C | Dialect::Cpp)
                && (typ == "declaration" || dialect == Dialect::Cpp && typ == "field_declaration")
                && name
                    .parent()
                    .is_some_and(|p| p.kind() == "function_declarator")
            {
                selected = K::Function;
            }
            if dialect == Dialect::CSharp
                && typ == "variable_declarator"
                && node
                    .parent()
                    .and_then(|p| p.parent())
                    .is_some_and(|p| p.kind() == "field_declaration")
            {
                selected = K::Field;
            }
            if selected == K::Function && is_member(node) {
                selected = K::Method;
            }
            (selected, name)
        })
        .collect()
}

fn type_name(mut node: Node<'_>) -> Vec<Node<'_>> {
    // Follow only the base-name chain, never generic arguments.
    for _ in 0..MAX_NODES {
        if matches!(node.kind(), "identifier" | "type_identifier") {
            return vec![node];
        }
        match node
            .child_by_field_name("name")
            .or_else(|| node.child_by_field_name("type"))
            .or_else(|| node.named_child(0))
        {
            Some(child) => node = child,
            None => break,
        }
    }
    Vec::new()
}

fn declarator_names(mut node: Node<'_>) -> Vec<Node<'_>> {
    for _ in 0..MAX_NODES {
        if matches!(
            node.kind(),
            "identifier" | "field_identifier" | "type_identifier"
        ) {
            return vec![node];
        }
        match node
            .child_by_field_name("declarator")
            .or_else(|| node.child_by_field_name("name"))
        {
            Some(child) => node = child,
            None if matches!(
                node.kind(),
                "parenthesized_declarator" | "reference_declarator"
            ) =>
            {
                let mut cursor = node.walk();
                let child = node
                    .named_children(&mut cursor)
                    .find(|child| !child.is_extra());
                if let Some(child) = child {
                    node = child;
                } else {
                    break;
                }
            }
            None => break,
        }
    }
    Vec::new()
}

fn binding_identifiers(node: Node<'_>) -> Vec<Node<'_>> {
    let mut pending = vec![node];
    let mut found = Vec::new();
    while let Some(node) = pending.pop() {
        if matches!(
            node.kind(),
            "identifier"
                | "type_identifier"
                | "field_identifier"
                | "property_identifier"
                | "shorthand_property_identifier_pattern"
                | "namespace_identifier"
                | "qualified_name"
                | "qualified_identifier"
                | "nested_namespace_specifier"
                | "simple_identifier"
                | "snippet_name"
        ) {
            found.push(node);
            continue;
        }
        let selected = match node.kind() {
            "pair_pattern" | "keyword_pattern" => node.child_by_field_name("value"),
            "assignment_pattern" | "object_assignment_pattern" => node.child_by_field_name("left"),
            "tuple_pattern" | "list_pattern" | "pattern_list" | "array_pattern"
            | "object_pattern" | "rest_pattern" | "expression" => {
                pending.extend(children(node).into_iter().rev());
                continue;
            }
            _ => node
                .child_by_field_name("method")
                .or_else(|| node.child_by_field_name("field")),
        };
        if let Some(child) = selected {
            pending.push(child);
        }
    }
    found
}

fn is_member(node: Node<'_>) -> bool {
    let mut parent = node.parent();
    while let Some(node) = parent {
        match node.kind() {
            "class_body" | "class_definition" | "impl_item" | "trait_item"
            | "struct_declaration" | "struct_specifier" | "class_specifier" => return true,
            "block" | "statement_block" | "compound_statement" | "function_body"
            | "source_file" | "program" | "translation_unit" => return false,
            _ => parent = node.parent(),
        }
    }
    false
}
