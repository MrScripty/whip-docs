# Multilingual backend verification

Date: 2026-10-11 UTC. Base: `5e9900a8baf3ac599a63532e7dd16d90a1ec0892`.
Feature branch: `feature/multilingual-tree-sitter`. Rust toolchain 1.92.0.

This is the baseline report. The later Svelte template-expression subset and
107-test qualification are recorded in the [follow-up](grammar-gap-followup.md).

## Passed

- `cargo test --no-default-features --workspace --all-targets --locked`:
  **102 Rust tests passed** (plus the development probe target).
- `cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings`.
- `cargo fmt --all --check` and `git diff --check`.
- `npm run check`: ESLint, TypeScript and **96 frontend tests** passed.
- `npm run build`: production build passed, with the existing large-chunk warning.
- Independent reviewer inspected parser safety, ranges, declarations, identity,
  journals and IPC, then independently passed 101 Rust tests, strict all-target
  Clippy and diff checking. The final additional test checks hardcoded parser and
  grammar identity strings against exact Cargo manifest/lock/provenance pins.

The fixtures and tests qualify every requested language route, aliases and
selected declarations, containment, written annotation/import/call facts. Modern
syntax gaps are asserted, not suppressed. Other checks cover Unicode/CRLF,
embedded Svelte offsets, duplicate names, malformed syntax, no-Cargo roots with
an unavailable rust-analyzer, quotas, symlink rejection, source-free journals,
legacy digest vectors, v2/v3 coexistence, restart and identity staleness.

Review fixes have regressions: 10,000-deep patterns no longer recurse; wide
binding patterns are capped without quadratic rescans; discovery is bounded
before sorting; diagnostic truncation cannot restore completeness; Unix backslash
paths cannot alias another file; damaged containers are not flattened to exact
file children; C prototypes and C# fields/annotation ownership retain their kind
and range; a legitimate C# constructor named extension is not rejected.

The pre-existing Rust test requiring rust-analyzer provenance from syn extraction
was corrected to assert syn provenance; it now works when enrichment is absent.

## Not established

`cargo test --workspace --all-targets --locked` with desktop features fails during
native dependency compilation because system `glib-2.0` / GTK / WebKit development
packages are absent. No native launch, Tauri IPC execution, screenshots, real UI
journal restart or combined-app pass is claimed. Non-Unix source-opening race
behavior has not been qualified.

The separately published graph correction at
`83aaff1dd6f4acae11a292d2bb8221adeca1e75e` was not merged or cherry-picked here.
Existing frontend tests do not prove schema-2 rendering support. Existing scene
and App files are unchanged. See the [integration handoff](../docs/design/multilingual-integration.md)
for required DTO, rendering, journal-type and native acceptance work.

The official registry grammars do not match every Passeur patched construct.
Python defaulted type parameters, Kotlin context parameters, C23 _BitInt, C++
explicit object parameters and C# extension declarations remain unqualified.
Svelte template expressions remain outside the extracted subset. See the
[coverage matrix](../docs/design/grammar-qualification.md) and
[exact provenance](../docs/design/grammar-pins.json). No custom builds were installed.

## Evidence

- [Rust tests](multilingual-rust-tests.log)
- [Strict Clippy](multilingual-clippy.log)
- [Frontend checks](multilingual-frontend-check.log)
- [Frontend build](multilingual-frontend-build.log)
- [Native dependency failure excerpt](multilingual-native-limit.log)

These logs are local verification evidence, not a merge, deployment or publication
claim. Remote branch publication is verified separately by exact SHA.
