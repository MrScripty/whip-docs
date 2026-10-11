# Official C++ / C# grammar verification

Date: 2026-10-11 UTC. Baseline: `1015275810f7574382fc641b15ed46e61f4106b6`.
Branch: `feature/multilingual-tree-sitter`. Rust toolchain 1.92.0; Linux headless.

## Qualified

- Exact official C++ `c009222808634c1014f82438d4883753516a2c24` and C#
  `8c0abe0b84a3681d3e6852ce2e2a1eecb4f731c5` generated sources compile, load
  and exercise modern constructs using Tree-sitter 0.25.10 / ABI 15.
- `cargo test --no-default-features --workspace --all-targets --locked`:
  **111 Rust tests passed**, plus the probe target.
- `cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings`.
- `cargo fmt --all --check` and `git diff --check`.
- `python3 scripts/verify-grammar-provenance.py`: **35 input hashes** and both
  exact Git revisions verified offline against Cargo metadata.
- Independent review reran all 111 tests, strict Clippy, diff checking and the
  provenance verifier after the review fixes; no remaining blockers found.

Positive tests cover C++ explicit receiver values/references/const/generics,
method definitions/prototypes and pointer fields, and C# extension containers,
named/unnamed/generic/ref receivers, methods, properties, operators and contextual
identifiers. Exact declaration/name/type/call ranges are tested with Unicode and
CRLF. Negative fixtures exercise damaged receivers/headers/bodies and graph
projection. All relationship facts remain written/unresolved.

Review found and fixed two omissions, now covered by fixtures:

- Official C# recovery can hide a missing receiver token inside an errored public
  leaf. Empty `extension()` now marks its header incomplete and excludes the
  invalid container and its children from exact graph projection.
- Comments inside C++ reference or parenthesized declarators no longer hide
  receiver/field names; exact ranges still include the original comment bytes.

Journal tests verify both @1 and @2 records remain byte-preserved/readable and
become stale against extractor @3, rejecting derivatives. Graph/IPC/journal
schemas, source scope and digest domains are unchanged.

## Limits

This qualifies the specific constructs and existing extraction subset, not entire
language or Passeur parity. Python/Kotlin/C enhancements are
[proposed source work](../docs/design/owned-grammar-enhancements.md), not implemented.
Svelte still has documented binding/parameter/key-tail exclusions.

The provenance verifier checks exact upstream committed generated source, not
fresh generator reproducibility. No generator or unrecognized third-party artifact
was installed; no Passeur code/artifact was used. Only two grammar source pins
changed in Cargo.lock. See the [design and reproduction commands](../docs/design/official-grammar-qualification.md).

No frontend edits or tests were needed for this backend-only follow-up. Native
Tauri/UI, combined graph integration, non-Unix race behavior and wasm remain
unqualified. Native system GTK/GLib/WebKit development packages remain unavailable,
as recorded in the [baseline report](multilingual-backend.md). The graph worker
must integrate this commit deliberately and validate its combined application.

## Evidence

- [Rust tests](official-grammar-tests.log)
- [Strict Clippy](official-grammar-clippy.log)
- [Offline provenance check](official-grammar-provenance.log)
- [Exact sources and hashes](../docs/design/grammar-pins.json)

Remote publication is verified separately by exact SHA; no merge, PR or deployment.
