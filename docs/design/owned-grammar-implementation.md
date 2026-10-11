# Whip-owned grammar implementation acceptance

2026-10-11. Baseline `2afd3c0a03d48ac05e9717d5dd6f727a44691fc3`.
The user authorized implementation of the [three proposals](owned-grammar-enhancements.md).

Implement narrow source packages under `grammars/`, with official exact base
revision/archive digest, upstream license, original input hashes, readable Whip
patches, generated parser/node types, and patched version/identity. Build-time
Rust dependencies compile committed C only; no network/generation at app startup.
Use official crates.io Tree-sitter CLI 0.25.10 and existing Node solely for local
grammar generation/corpus tests. Record tool checksum, commands, input/output hashes
and compare two generations. No Passeur source or artifact enters these packages.

Acceptance includes positive/negative AST shapes and owned declarations, exact
UTF-8/CRLF ranges, containment and written-type facts for defaulted Python type
parameters, Kotlin named context parameters/legacy receiver syntax, and C23
_BitInt. Run inherited corpus suites; document expected AST changes explicitly
instead of silently rewriting accepted expectations. Remaining recovery/semantic
limits must stay visible.

Audit Svelte against the previously identified template bindings, snippet
parameters, each index/key tails, await then/catch bindings, const/debug tags and
script dialect selection. Add bounded context-specific JS/TS validation and mapped
structural output where feasible. Keep synthetic bytes outside all ranges and
retain explicit diagnostics where structure cannot be qualified. No resolved
runtime edges or compiler semantics. No new graph/IPC/journal schema; extractor
identity advances when behavior changes and old journal bytes remain untouched.
