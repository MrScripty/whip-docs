# Grammar gap follow-up verification

Date: 2026-10-11 UTC. Baseline: `91b05b696ca4bd1121137fe2a78faac36e0f630d`.
Feature branch: `feature/multilingual-tree-sitter`. Rust toolchain 1.92.0.

Historical report for the first follow-up; see the later
[official C++/C# qualification](official-grammars.md).

## Passed

- `cargo test --no-default-features --workspace --all-targets --locked`:
  **107 Rust tests passed**, plus the development probe target.
- `cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings`.
- `cargo fmt --all --check` and `git diff --check`.
- Independent reviewer found no blocking issues and independently passed the
  preceding 106-test snapshot, strict Clippy and diff checking. The final added
  test proves previous extractor journal records remain readable, byte-preserved
  and stale against the new identity, rejecting derivatives.

Svelte tests exercise exact Unicode/CRLF ranges, snippet ownership, expression
contexts, wrapper escapes, malformed regions and the 256-region limit. Individual
negative tests reproduce all five installed modern-syntax grammar gaps. These
failures remain structured partial-support diagnostics, not accepted syntax.

## Scope and limits

Official upstream source and registry inspection was read-only. No grammar was
updated, built or installed, and dependency manifests/lockfiles are unchanged.
The official C++ and C# candidates have the relevant productions and corpus
examples, but are **not build/runtime qualified**. Python, Kotlin and C still need
suitable grammar enhancements. The Svelte change extracts a call-fact subset;
binding/parameter/key-tail and other remaining exclusions are documented in the
[qualification report](../docs/design/grammar-gap-followup.md).

Extractor identity changes to `whip-docs-syntax@2`; graph/IPC DTO shapes, source
scope/digest domains and journal format do not change. Old records are not
rewritten or silently reinterpreted. No source text is persisted in journals.

No frontend files were changed. Frontend/native checks were not repeated for this
backend-only follow-up; the [baseline evidence and limits](multilingual-backend.md)
remain applicable. In particular, native Tauri execution is blocked by unavailable
system GTK/GLib/WebKit development packages, non-Unix source-opening races remain
unqualified, and the separate combined graph integration branch was not modified
or tested here. No combined-app compatibility is claimed.

## Evidence

- [Rust tests](grammar-gap-tests.log)
- [Strict Clippy](grammar-gap-clippy.log)
- [Exact upstream provenance](../docs/design/grammar-gap-audit.json)

Remote branch publication is verified separately by exact SHA.
