//! Bounded, context-specific Svelte injections into packaged JS/TS grammars.
//! Synthetic wrapper bytes never enter declarations or written relation ranges.
use super::{ByteRange, DeclarationKind, Dialect, RelationFact, RelationKind};
use std::time::Instant;
use tree_sitter::{Node, ParseOptions, Parser, Tree};

pub(super) struct Binding {
    pub range: ByteRange,
    pub name_range: ByteRange,
    pub kind: DeclarationKind,
}
#[derive(Default)]
pub(super) struct Inventory {
    pub bindings: Vec<Binding>,
    pub facts: Vec<RelationFact>,
    trailing_line_comment: bool,
}
#[derive(Clone, Copy)]
pub(super) enum Context {
    Expression,
    Key,
    Parameters,
    Binding,
    Each,
    Await,
    Const,
    Debug,
}

pub(super) fn dialect(root: Node<'_>, source: &str) -> Dialect {
    let mut scripts = root.walk();
    for script in root
        .named_children(&mut scripts)
        .filter(|n| n.kind() == "script_element")
    {
        let mut tags = script.walk();
        for tag in script
            .named_children(&mut tags)
            .filter(|n| n.kind() == "start_tag")
        {
            let mut attributes = tag.walk();
            let attrs: Vec<_> = tag
                .named_children(&mut attributes)
                .filter(|n| n.kind() == "attribute")
                .collect();
            for attribute in attrs {
                if let (Some(name), Some(value)) =
                    (attribute.named_child(0), attribute.named_child(1))
                {
                    if &source[name.byte_range()] == "lang"
                        && matches!(
                            source[value.byte_range()].trim_matches(['\'', '"']),
                            "ts" | "typescript"
                        )
                    {
                        return Dialect::TypeScript;
                    }
                }
            }
        }
    }
    Dialect::JavaScript
}

pub(super) fn context(node: Node<'_>) -> Option<Context> {
    let parent = node.parent()?;
    Some(match parent.kind() {
        "expression" | "render_tag" | "html_tag" | "if_start" | "else_if_start" | "key_start" => {
            Context::Expression
        }
        "each_start" if parent.child_by_field_name("identifier") == Some(node) => {
            Context::Expression
        }
        "each_start" => Context::Each,
        "await_start" => Context::Await,
        "then_start" | "catch_start" => Context::Binding,
        "snippet_start" => Context::Parameters,
        "const_tag" => Context::Const,
        "debug_tag" => Context::Debug,
        _ => return None,
    })
}

pub(super) struct Request<'a> {
    pub raw: &'a str,
    pub start: usize,
    pub dialect: Dialect,
    pub owner: Option<&'a str>,
    pub max_facts: usize,
    pub max_bindings: usize,
    pub deadline: Instant,
}
impl Request<'_> {
    fn slice(&self, begin: usize, end: usize) -> Request<'_> {
        Request {
            raw: &self.raw[begin..end],
            start: self.start + begin,
            ..*self
        }
    }
}

pub(super) fn analyze(request: &Request<'_>, context: Context) -> Result<Inventory, &'static str> {
    match context {
        Context::Each => {
            if let Some(result) = try_basic(request, Context::Each)? {
                return Ok(result);
            }
            // Parse both sides of each possible key boundary. The grammar checks,
            // not string splitting alone, establish a valid binding and key.
            for (attempt, (index, _)) in request.raw.match_indices('(').enumerate() {
                if attempt >= 64 {
                    return Err("template_boundary_limit");
                }
                let prefix = request.slice(0, index);
                let suffix = request.slice(index, request.raw.len());
                if let Some(mut bindings) = try_basic(&prefix, Context::Each)? {
                    if bindings.trailing_line_comment {
                        continue;
                    }
                    let Some(key) = try_basic(&suffix, Context::Key)? else {
                        continue;
                    };
                    bindings.facts.extend(key.facts);
                    if bindings.facts.len() > request.max_facts {
                        return Err("template_fact_limit");
                    }
                    return Ok(bindings);
                }
            }
            Err("template_binding_parse_error")
        }
        Context::Await => {
            if let Some(result) = try_basic(request, Context::Expression)? {
                return Ok(result);
            }
            for keyword in ["then", "catch"] {
                for (attempt, (index, _)) in request.raw.match_indices(keyword).enumerate() {
                    if attempt >= 64 {
                        return Err("template_boundary_limit");
                    }
                    let end = index + keyword.len();
                    // Conservatively keep all non-ASCII non-whitespace code
                    // points inside a token, including combining marks and ZWJ.
                    let word = |c: char| {
                        c.is_alphanumeric()
                            || c == '_'
                            || c == '$'
                            || !c.is_ascii() && !c.is_whitespace()
                    };
                    if request.raw[..index].chars().next_back().is_some_and(word)
                        || request.raw[end..]
                            .chars()
                            .next()
                            .is_some_and(|c| !c.is_whitespace())
                    {
                        continue;
                    }
                    let prefix = request.slice(0, index);
                    let suffix = request.slice(end, request.raw.len());
                    if let Some(mut expression) = try_basic(&prefix, Context::Expression)? {
                        if expression.trailing_line_comment {
                            continue;
                        }
                        let binding = if suffix.raw.trim().is_empty() {
                            Some(Inventory::default())
                        } else {
                            try_basic(&suffix, Context::Binding)?
                        };
                        if let Some(binding) = binding {
                            expression.bindings.extend(binding.bindings);
                            expression.facts.extend(binding.facts);
                            if expression.facts.len() > request.max_facts {
                                return Err("template_fact_limit");
                            }
                            return Ok(expression);
                        }
                    }
                }
            }
            Err("template_await_parse_error")
        }
        _ => basic(request, context),
    }
}

// Retry only syntactic alternatives. Time, size and grammar failures stay explicit.
fn try_basic(request: &Request<'_>, context: Context) -> Result<Option<Inventory>, &'static str> {
    match basic(request, context) {
        Ok(inventory) => Ok(Some(inventory)),
        Err(code) if code.ends_with("_parse_error") => Ok(None),
        Err(code) => Err(code),
    }
}

fn parse(wrapped: &str, request: &Request<'_>) -> Result<Tree, &'static str> {
    if Instant::now() >= request.deadline {
        return Err("template_parse_budget_exceeded");
    }
    let mut parser = Parser::new();
    parser
        .set_language(&request.dialect.language())
        .map_err(|_| "template_grammar_unavailable")?;
    let mut stop = |_: &tree_sitter::ParseState| Instant::now() >= request.deadline;
    let tree = parser
        .parse_with_options(
            &mut |byte, _| wrapped.as_bytes().get(byte..).unwrap_or_default(),
            None,
            Some(ParseOptions::new().progress_callback(&mut stop)),
        )
        .ok_or("template_parse_budget_exceeded")?;
    if tree.root_node().has_error() {
        return Err("template_expression_parse_error");
    }
    Ok(tree)
}

fn basic(request: &Request<'_>, context: Context) -> Result<Inventory, &'static str> {
    let (prefix, suffix) = match context {
        Context::Parameters | Context::Binding | Context::Each => ("(", "\n)=>0"),
        Context::Const => ("const ", "\n;"),
        _ => ("(", "\n)"),
    };
    let wrapped = format!("{prefix}{}{suffix}", request.raw);
    let tree = parse(&wrapped, request)?;
    let root = tree.root_node();
    let roots = named(root);
    if roots.len() != 1 {
        return Err("template_expression_parse_error");
    }
    let statement = roots[0];
    let value = if matches!(context, Context::Const) {
        statement
    } else {
        if statement.kind() != "expression_statement" {
            return Err("template_expression_parse_error");
        }
        statement
            .named_child(0)
            .ok_or("template_expression_parse_error")?
    };
    if value.start_byte() != 0 || value.end_byte() != wrapped.len() {
        return Err("template_expression_parse_error");
    }
    let map = |node: Node<'_>| -> Option<ByteRange> {
        (node.start_byte() >= prefix.len() && node.end_byte() <= prefix.len() + request.raw.len())
            .then(|| ByteRange {
                start_byte: request.start + node.start_byte() - prefix.len(),
                end_byte: request.start + node.end_byte() - prefix.len(),
            })
    };
    let mut inventory = Inventory::default();
    let mut binding_nodes = Vec::new();
    match context {
        Context::Parameters | Context::Binding | Context::Each => {
            if value.kind() != "arrow_function"
                || !value
                    .child_by_field_name("body")
                    .is_some_and(|b| b.start_byte() == wrapped.len() - 1 && b.kind() == "number")
            {
                return Err("template_binding_parse_error");
            }
            let params = value
                .child_by_field_name("parameters")
                .ok_or("template_binding_parse_error")?;
            if params.start_byte() != 0 || params.end_byte() != prefix.len() + request.raw.len() + 2
            {
                return Err("template_binding_parse_error");
            }
            binding_nodes = named(params);
            if matches!(context, Context::Binding) && binding_nodes.len() != 1
                || matches!(context, Context::Each) && !(1..=2).contains(&binding_nodes.len())
            {
                return Err("template_binding_parse_error");
            }
            if matches!(context, Context::Each) && binding_nodes.len() == 2 {
                let index = binding_nodes[1];
                let pattern = index.child_by_field_name("pattern").unwrap_or(index);
                if pattern.kind() != "identifier"
                    || index.child_by_field_name("type").is_some()
                    || index.child_by_field_name("value").is_some()
                {
                    return Err("template_binding_parse_error");
                }
            }
        }
        Context::Const => {
            if value.kind() != "lexical_declaration" {
                return Err("template_binding_parse_error");
            }
            binding_nodes = named(value);
            if binding_nodes.len() != 1
                || !binding_nodes[0]
                    .child_by_field_name("value")
                    .is_some_and(|n| map(n).is_some())
            {
                return Err("template_binding_parse_error");
            }
        }
        _ => {
            if value.kind() != "parenthesized_expression" {
                return Err("template_expression_parse_error");
            }
            if matches!(context, Context::Key) {
                let enclosed = named(value);
                if enclosed.len() != 1 || enclosed[0].kind() != "parenthesized_expression" {
                    return Err("template_key_parse_error");
                }
            }
            if matches!(context, Context::Debug) {
                let mut nodes = named(value);
                while let Some(node) = nodes.pop() {
                    match node.kind() {
                        "identifier" => (),
                        "sequence_expression" => nodes.extend(named(node)),
                        _ => return Err("template_debug_parse_error"),
                    }
                }
                return Ok(inventory);
            }
        }
    }
    for node in binding_nodes {
        let pattern = node
            .child_by_field_name("pattern")
            .or_else(|| node.child_by_field_name("name"))
            .unwrap_or(node);
        if matches!(
            context,
            Context::Parameters | Context::Binding | Context::Each
        ) {
            if node.kind() == "required_parameter" || node.kind() == "optional_parameter" {
                // TS constructor parameter properties and decorators are not
                // template parameters. Pattern/type/default are the only fields.
                let mut cursor = node.walk();
                if node
                    .children(&mut cursor)
                    .filter(|child| !child.is_extra())
                    .any(|child| {
                        if !child.is_named() {
                            return !matches!(child.kind(), "?" | "=");
                        }
                        Some(child) != node.child_by_field_name("pattern")
                            && Some(child) != node.child_by_field_name("type")
                            && Some(child) != node.child_by_field_name("value")
                    })
                {
                    return Err("template_binding_parse_error");
                }
            }
            if matches!(context, Context::Binding | Context::Each)
                && (pattern.kind() == "assignment_pattern"
                    || node.child_by_field_name("value").is_some()
                    || node.kind() == "optional_parameter")
            {
                return Err("template_binding_parse_error");
            }
        }
        if pattern.kind() == "rest_pattern" {
            return Err("template_binding_parse_error");
        }
        let range = map(node).ok_or("template_binding_parse_error")?;
        let mut pending = vec![pattern];
        let mut visited = 0;
        while let Some(pattern) = pending.pop() {
            visited += 1;
            if visited > 250_000 || Instant::now() >= request.deadline {
                return Err("template_parse_budget_exceeded");
            }
            match pattern.kind() {
                "identifier" | "shorthand_property_identifier_pattern" => {
                    if inventory.bindings.len() >= request.max_bindings {
                        return Err("template_binding_limit");
                    }
                    inventory.bindings.push(Binding {
                        range: range.clone(),
                        name_range: map(pattern).ok_or("template_binding_parse_error")?,
                        kind: if matches!(context, Context::Parameters) {
                            DeclarationKind::Parameter
                        } else {
                            DeclarationKind::Binding
                        },
                    });
                }
                "pair_pattern" => pending.extend(pattern.child_by_field_name("value")),
                "assignment_pattern" | "object_assignment_pattern" => {
                    pending.extend(pattern.child_by_field_name("left"))
                }
                "array_pattern" | "object_pattern" | "rest_pattern" => {
                    pending.extend(named(pattern))
                }
                _ => return Err("template_binding_parse_error"),
            }
        }
    }
    let mut pending = vec![root];
    let mut visited = 0;
    while let Some(node) = pending.pop() {
        visited += 1;
        if visited > 250_000 || Instant::now() >= request.deadline {
            return Err("template_parse_budget_exceeded");
        }
        if node.kind() == "comment"
            && wrapped[node.byte_range()].starts_with("//")
            && node.end_byte() == prefix.len() + request.raw.len()
        {
            inventory.trailing_line_comment = true;
        }
        if node.kind().starts_with("jsx_") {
            return Err("unsupported_template_expression");
        }
        let relation = match node.kind() {
            "call_expression" => node
                .child_by_field_name("function")
                .map(|target| (RelationKind::CallSyntax, target)),
            "type_annotation" => named(node)
                .first()
                .copied()
                .map(|target| (RelationKind::WrittenType, target)),
            _ => None,
        };
        if let Some((kind, target)) = relation {
            if let (Some(range), Some(target_range)) = (map(node), map(target)) {
                if inventory.facts.len() >= request.max_facts {
                    return Err("template_fact_limit");
                }
                inventory.facts.push(RelationFact {
                    owner_id: request.owner.map(str::to_owned),
                    kind,
                    range,
                    target_range,
                    qualification: "written_syntax_unresolved".to_owned(),
                });
            }
        }
        let mut cursor = node.walk();
        pending.extend(node.named_children(&mut cursor));
    }
    Ok(inventory)
}
fn named(node: Node<'_>) -> Vec<Node<'_>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor)
        .filter(|n| !n.is_extra())
        .collect()
}
