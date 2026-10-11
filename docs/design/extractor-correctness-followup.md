# Bounded extractor correctness acceptance

2026-10-11. Baseline `298e63fb11ac37c29f7a89d9a57f16a866f1d4b3`.
The read-only comparison against Passeur `725c45c` found extractor omissions and
wrong owners despite successful grammar parsing. Passeur remains a reference;
new fixtures and implementation are independently written for Whip Docs.

Scope: correct Kotlin property names/ownership and secondary constructors; accept
only actual Zig var/const declarations, with enum cases classified as variants;
inventory C++ destructor/operator members and Odin qualified procedures/procedure
groups. Unsupported callable names must produce a diagnostic and must not leak
parameters or body declarations into an unrelated owner. Preserve exact UTF-8
source/name ranges, distinguish duplicate source scopes, and keep comments and
literal values out of stored labels. Qualify only syntax, not overload resolution.

Keep explicit local diagnostics for remaining unsupported Kotlin destructuring,
Odin variant inventories and C++ callable forms. Add narrow diagnostics for the
audited JavaScript private-field/parameter-pattern, C# file-scoped namespace and
C preprocessor-alternative gaps. Do not implement the separate Svelte script-scope,
qualified-display-name, masked-signature or change-comparison product features.

Acceptance: independent positive/negative fixtures with source-based expected
names, kinds, ownership and ranges; no phantom assignment bindings; no orphan
parameters from unsupported callables; bounded traversal; all existing Rust tests,
strict Clippy, formatting and independent review. No grammar/dependency, graph,
IPC, source-scope or journal schema changes. Advance extractor to @5, keep prior
@1–@4 journal records readable/byte-preserved and stale, and reject derivatives.
Publish one verified commit on the parser feature branch for deliberate integration.
