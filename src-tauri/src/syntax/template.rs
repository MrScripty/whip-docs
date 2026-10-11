//! Bounded Svelte expression injection into the already packaged JS/TS grammar.
//! Only unresolved call facts are emitted. Synthetic wrapper bytes never escape.
use std::time::Instant;
use tree_sitter::{Node, ParseOptions, Parser};

use super::{ByteRange, Dialect, RelationFact, RelationKind};

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
            for attribute in tag
                .named_children(&mut attributes)
                .filter(|n| n.kind() == "attribute")
            {
                let Some(name) = attribute.named_child(0) else {
                    continue;
                };
                let Some(value) = attribute.named_child(1) else {
                    continue;
                };
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
    Dialect::JavaScript
}

pub(super) fn is_expression(node: Node<'_>) -> bool {
    let Some(parent) = node.parent() else {
        return false;
    };
    match parent.kind() {
        "expression" | "render_tag" | "html_tag" | "if_start" | "else_if_start" | "key_start"
        | "await_start" => true,
        "each_start" => parent.child_by_field_name("identifier") == Some(node),
        // Each bindings/keys, const declarations, snippet parameters, then/catch
        // bindings and debug lists need separate context-aware extraction.
        _ => false,
    }
}

pub(super) fn calls(
    raw: &str,
    start_byte: usize,
    dialect: Dialect,
    owner_id: Option<&str>,
    max_facts: usize,
    deadline: Instant,
) -> Result<Vec<RelationFact>, &'static str> {
    if Instant::now() >= deadline {
        return Err("template_parse_budget_exceeded");
    }
    // Parentheses establish expression context for objects, functions and arrows.
    // A newline prevents a final line comment from consuming the closing wrapper.
    let wrapped = format!("({raw}\n)");
    let mut parser = Parser::new();
    parser
        .set_language(&dialect.language())
        .map_err(|_| "template_grammar_unavailable")?;
    let mut stop = |_: &tree_sitter::ParseState| Instant::now() >= deadline;
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
    // Reject text that closes the wrapper and creates extra statements. Only one
    // complete parenthesized expression is a qualified Svelte expression region.
    let root = tree.root_node();
    let expression = root
        .named_child(0)
        .filter(|statement| statement.kind() == "expression_statement")
        .and_then(|statement| statement.named_child(0));
    if root.named_child_count() != 1
        || !expression.is_some_and(|expression| {
            expression.kind() == "parenthesized_expression"
                && expression.start_byte() == 0
                && expression.end_byte() == wrapped.len()
        })
    {
        return Err("template_expression_parse_error");
    }
    let map = |node: Node<'_>| -> Option<ByteRange> {
        (node.start_byte() >= 1 && node.end_byte() <= raw.len() + 1).then(|| ByteRange {
            start_byte: start_byte + node.start_byte() - 1,
            end_byte: start_byte + node.end_byte() - 1,
        })
    };
    let mut pending = vec![tree.root_node()];
    let mut facts = Vec::new();
    let mut visited = 0;
    while let Some(node) = pending.pop() {
        visited += 1;
        if visited > 250_000 || Instant::now() >= deadline {
            return Err("template_parse_budget_exceeded");
        }
        if node.kind().starts_with("jsx_") {
            return Err("unsupported_template_expression");
        }
        if node.kind() == "call_expression" {
            if facts.len() >= max_facts {
                return Err("template_fact_limit");
            }
            if let (Some(range), Some(target_range)) = (
                map(node),
                node.child_by_field_name("function").and_then(map),
            ) {
                facts.push(RelationFact {
                    owner_id: owner_id.map(str::to_owned),
                    kind: RelationKind::CallSyntax,
                    range,
                    target_range,
                    qualification: "written_syntax_unresolved".to_owned(),
                });
            }
        }
        let mut cursor = node.walk();
        pending.extend(node.named_children(&mut cursor));
    }
    Ok(facts)
}
