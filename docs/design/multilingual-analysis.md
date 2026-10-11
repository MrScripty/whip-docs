# Whip Docs multilingual syntax analysis

Status: implemented backend; frontend/native integration pending, 2026-10-11. Base: prototype
`5e9900a8baf3ac599a63532e7dd16d90a1ec0892`. Ownership: backend only.

## Decision and boundaries

Whip Docs owns an independent Rust Tree-sitter extractor. Passeur commit
`725c45cfc1fcd9fae0980bceebe051debdc11cb2` is a language/qualification reference
only. No Passeur runtime, Node process, code import, or agent platform is used.
Registry grammar dependencies are exact-pinned and Cargo.lock checksummed.
No patched Passeur grammar is installed. Grammar failures are observable gaps,
not claims of modern-syntax parity.

Default analysis accepts a canonical directory without Cargo.toml and reads only
bounded UTF-8 regular source files. No dependency build, Cargo metadata, or
rust-analyzer is necessary. The existing Rust extractor and rust-analyzer service
remain available for explicit optional Rust enrichment; syntax facts do not
claim resolved calls, types, or compiler semantics.

## Proposed shared contract (before implementation)

- Preserve GraphSnapshot's original fields and use schemaVersion 2 for the new
  projection. Add neutral node kinds and tree_sitter provenance. Graph containment
  is exact syntax containment. Unresolved written relations live in a separate
  SourceAnalysis DTO, never fabricated graph target IDs or exact semantic edges.
- Provide get_source_analysis IPC for the neutral payload: sorted files,
  declarations, containment, written annotation/import/call facts, exact UTF-8
  byte ranges, coverage and structured diagnostics. Range columns are UTF-8 byte
  columns; all byte intervals are half-open. Source bodies are backend-only.
- Version parser, grammar, dialect, extractor and source-scope identities. Grammar
  identity includes exact registry version; engine and extractor are pinned too.
- Retain schema-2 journal lines, analyzed_rust_sources scope and its digest domain
  exactly. Add schema-3 records with an explicit multilingual captured-source
  scope and identity in the existing append-only journal. Old lines are never
  rewritten. Changed identities, source sets, moved/missing symbols or changed
  structure invalidate bindings. No name-based automatic relinking.
- Persist metadata/digests only: no source bodies, comments, literal values or
  copied signatures. Written relation evidence remains in memory/IPC; journal
  identity includes structural digests rather than copied annotation text.

## Acceptance

Real fixtures exercise Rust, TS/TSX, JS/JSX, Python, Lua, Kotlin, Zig, C#, C, C++,
Odin and Svelte 5. Check declarations and containers, aliases, members, bindings,
written annotations, duplicate/nested names, malformed headers/bodies, Unicode
and CRLF ranges. Check .mts/.cts/.mjs/.cjs/.pyi/.kts/C++ header aliases, explicit
.h ambiguity, JSX .js override, and Svelte embedded-script offsets.

Qualify Rust 2024 unsafe extern, Python defaulted type parameters, Kotlin context
parameters, C23 _BitInt, C++ explicit object parameters, C# extension declarations,
and Svelte runes/snippets. Publish grammar gaps with incomplete coverage.
Test no-Cargo mixed roots, absent enrichment, safe paths, limits, old journal
compatibility, identity changes and no source leakage. Run formatting, Rust tests,
Clippy and an independent review. Native Tauri UI qualification requires GTK /
WebKit and a display; headless backend tests must remain runnable without them.

Frontend worker integration: consume graph schema 2 and new kinds defensively;
use the separate analysis payload for parser/coverage/range details. Geometry and
App ownership remains with that worker. Existing file relation graph remains a
separate legacy Rust relation surface until explicitly integrated.

## Implementation outcome

See [grammar qualification](grammar-qualification.md), [exact registry provenance](grammar-pins.json),
[integration contract](multilingual-integration.md) and [verification](../../verification/multilingual-backend.md).
The syntax payload is additive; exact byte ranges live there rather than adding
fields to legacy SourceRangeDto. This preserves old journal structural records.
The standalone TypeScript adapter leaves all existing frontend files unchanged.
