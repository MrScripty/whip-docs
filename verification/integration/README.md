# Combined graph and multilingual parser

The integration branch combines graph `2a6b73da3fce1ce099e91fa386986c4b2f63a44e`
with parser `91b05b696ca4bd1121137fe2a78faac36e0f630d` and follow-up
`1015275810f7574382fc641b15ed46e61f4106b6`, then
`2afd3c0a03d48ac05e9717d5dd6f727a44691fc3` (extractor `whip-docs-syntax@3`). Neither source branch nor
main is changed by this work. Native Tauri IPC remains unverified.

The original file graph and routing remain authoritative. Neutral declarations
expand in the same scene/camera, with exact syntax byte ranges and explicit
coverage. Syntax calls/imports/types are unresolved range evidence, not invented
semantic edges. The legacy Rust file-relation loader retains its original
behavior and resource/process limitations; the bounded Tree-sitter guarantees
apply to source analysis, not that older loader.

`get_source_analysis` accepts optional `expectedSourceRoot` and
`expectedAnalysisAt`; both are checked against the committed graph under one
read lock. The UI always supplies them and rejects schema/identity/range drift
while retaining file overview and history. Effective narrow .h/.js overrides
are restored from analysis identity and remain tied to the current root.

Native journal v2/v3 formats remain unchanged. The explicit mixed browser
fixture uses a separate v3 preview key; the old Rust browser fixture keeps its
existing v2 behavior/storage. A Rust-exported vector verifies the browser's
multilingual digest encoding. Unknown or semantically corrupt records fail
without rewriting storage; originals remain immutable and proposals separate.

## Checks after parser follow-up and compact controls

- Frontend lint, TypeScript and 121 tests passed; production build passed with
  the existing large Three.js chunk warning.
- 112 Rust tests passed with desktop features disabled; strict Clippy and
  formatting passed. The integration test covers stale graph/metadata association; the follow-up
  also qualifies bounded Svelte template call facts, official C++ explicit object
  parameters, C# extension blocks, and extractor-identity staleness.
- Real Chromium UI replayed Rust outputs from a synthetic no-Cargo mixed root:
  declaration expansion, coverage gaps, exact intent, source exclusion, proposal
  separation, reload, corrupt storage refusal and unchanged base geometry/camera.
- Nine mixed browser check groups and eleven original graph browser check groups passed.
  Desktop (1680px) and narrow (768/390/360px) screenshots were inspected. Batch
  disclosure checks preserve file objects, routes, visibility, camera and drafts.
  A clipped narrow settings menu found by independent review was fixed and retested.
- Original graph browser checks passed. Failure-path and dialect-restoration
  checks use explicit IPC stubs, not native execution.
- Independent review found and fixed permissive v3 preview record validation
  and lost restored dialect choices. Final independent review passed 14 focused
  tests, verified all 23 fixture hashes, and checked new neutral C++/C# kinds
  through projection and journal append/read.
- The host-filtered provenance verifier passed both exact official Git pins,
  ABI 15 and 35 input hashes. Its original all-target offline metadata request
  required an uncached WASI dependency; limiting metadata to the actual rustc
  host avoids unrelated target downloads without changing source verification.

The compact shell removes the large fixture banner and redundant scene copy,
keeps the honest Fixture Preview tooltip, and moves the toolbar to the scene top.
The original scene/layout/routing code is unchanged by this cleanup. Normal
disclosure changes only its target. Ctrl-click and Ctrl+Enter/Space apply that
target's new state to all eligible repository files, including filtered and
collapsed tree rows. Limits are 24 open files and 4,096 symbols; existing open
files are retained, the target takes priority, remaining slots follow path order,
and a notice reports a bound. Unsupported/empty files are ineligible. A single
file above the symbol cap is refused explicitly. Directory disclosures retain
their separate tree-only behavior. Selection and draft text survive while their
parent stays open; closing it saves the draft for reopening.

## Reproduce

```sh
npm ci
npm run check
npm run build
cargo test --no-default-features --workspace --all-targets --locked
cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
npm run dev
```

Open `http://127.0.0.1:1420/?preview=mixed` for the recorded multilingual fixture;
`?preview=1` retains the older Rust fixture. Both run real WebGL UI with recorded
data, not native IPC. In an environment already configured for Tauri,
`npm run dev:desktop` opens the native app; select a local directory, with or
without Cargo.toml. No proposals are executed and no model inference is used.

`verification/integration/browser-check.cjs` uses installed Playwright/Chromium;
set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `GRAPH_TEST_ORIGIN` and `EVIDENCE_DIR`
for local paths/port. The fixture exporter is `src-tauri/examples/integration_fixture.rs`;
run with desktop features disabled and a fresh disposable app-data directory.
Only fixture root/timestamps are normalized; syntax ranges/identity/digests/facts
come from the Rust service. Provenance is in `fixtures/mixed-workspace.provenance.json`.

Native linking, macros/IPC, desktop restart acceptance and non-Unix source races
remain unqualified. No native dependency-denial retries or package-source
bypasses were attempted. See the parser qualification matrix for language gaps;
supported_subset never means full-language support.

The recorded fixture is regenerated at extractor `@3`. Saved real `@1` and `@2`
journal vectors remain readable/stale without changing any stored byte; proposals
against them are rejected. Svelte template call facts remain unresolved. Python/Kotlin/C
grammar gaps and the Svelte binding/parameter scope exclusions remain explicit.
The newly qualified C++/C# syntax uses existing neutral kinds and unresolved facts. Full parity is not claimed.
