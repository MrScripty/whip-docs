use serde::{Deserialize, Serialize};
use tree_sitter::Language;

/// Dialects are explicit even when they share a grammar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Dialect {
    Rust,
    #[serde(rename = "typescript")]
    TypeScript,
    Tsx,
    #[serde(rename = "javascript")]
    JavaScript,
    Jsx,
    Python,
    Lua,
    Kotlin,
    Zig,
    #[serde(rename = "csharp")]
    CSharp,
    C,
    Cpp,
    Odin,
    Svelte5,
}

impl Dialect {
    pub fn language(self) -> Language {
        match self {
            Self::Rust => tree_sitter_rust::LANGUAGE.into(),
            Self::TypeScript => tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into(),
            Self::Tsx => tree_sitter_typescript::LANGUAGE_TSX.into(),
            Self::JavaScript | Self::Jsx => tree_sitter_javascript::LANGUAGE.into(),
            Self::Python => tree_sitter_python::LANGUAGE.into(),
            Self::Lua => tree_sitter_lua::LANGUAGE.into(),
            Self::Kotlin => tree_sitter_kotlin_ng::LANGUAGE.into(),
            Self::Zig => tree_sitter_zig::LANGUAGE.into(),
            Self::CSharp => tree_sitter_c_sharp::LANGUAGE.into(),
            Self::C => tree_sitter_c::LANGUAGE.into(),
            Self::Cpp => tree_sitter_cpp::LANGUAGE.into(),
            Self::Odin => tree_sitter_odin::LANGUAGE.into(),
            Self::Svelte5 => tree_sitter_svelte_ng::LANGUAGE.into(),
        }
    }

    pub fn grammar_identity(self) -> &'static str {
        match self {
            Self::Rust => "crates.io/tree-sitter-rust@0.24.2",
            Self::TypeScript => "crates.io/tree-sitter-typescript@0.23.2/typescript",
            Self::Tsx => "crates.io/tree-sitter-typescript@0.23.2/tsx",
            Self::JavaScript | Self::Jsx => "crates.io/tree-sitter-javascript@0.25.0",
            Self::Python => "crates.io/tree-sitter-python@0.25.0",
            Self::Lua => "crates.io/tree-sitter-lua@0.4.1",
            Self::Kotlin => "crates.io/tree-sitter-kotlin-ng@1.1.0",
            Self::Zig => "crates.io/tree-sitter-zig@1.1.2",
            Self::CSharp => "git+https://github.com/tree-sitter/tree-sitter-c-sharp@8c0abe0b84a3681d3e6852ce2e2a1eecb4f731c5",
            Self::C => "crates.io/tree-sitter-c@0.24.2",
            Self::Cpp => "git+https://github.com/tree-sitter/tree-sitter-cpp@c009222808634c1014f82438d4883753516a2c24",
            Self::Odin => "crates.io/tree-sitter-odin@1.3.0",
            Self::Svelte5 => "crates.io/tree-sitter-svelte-ng@1.0.2",
        }
    }
}

/// Overrides are deliberately narrow: ambiguous headers and JSX-in-JS only.
pub fn route(path: &str, explicit: Option<Dialect>) -> Result<Dialect, &'static str> {
    if let Some(dialect) = explicit {
        return match (path.rsplit('.').next(), dialect) {
            (Some("h"), Dialect::C | Dialect::Cpp) => Ok(dialect),
            (Some("js"), Dialect::Jsx) if !path.ends_with(".svelte.js") => Ok(dialect),
            _ => Err("invalid_dialect_override"),
        };
    }
    Ok(match path.rsplit('.').next().unwrap_or("") {
        "rs" => Dialect::Rust,
        "ts" | "mts" | "cts" => Dialect::TypeScript,
        "tsx" => Dialect::Tsx,
        "js" | "mjs" | "cjs" => Dialect::JavaScript,
        "jsx" => Dialect::Jsx,
        "py" | "pyi" => Dialect::Python,
        "lua" => Dialect::Lua,
        "kt" | "kts" => Dialect::Kotlin,
        "zig" => Dialect::Zig,
        "cs" => Dialect::CSharp,
        "c" => Dialect::C,
        "cpp" | "cc" | "cxx" | "hpp" | "hh" | "hxx" => Dialect::Cpp,
        "odin" => Dialect::Odin,
        "svelte" => Dialect::Svelte5,
        "h" => return Err("ambiguous_header_dialect"),
        _ => return Err("unsupported_language"),
    })
}
