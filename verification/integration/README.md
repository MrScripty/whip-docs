# Combined graph and multilingual parser

The integration branch combines graph `2a6b73da3fce1ce099e91fa386986c4b2f63a44e`
with parser `91b05b696ca4bd1121137fe2a78faac36e0f630d`. Neither source branch nor
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

## Checks at initial integration

- Frontend lint, TypeScript and 114 tests passed; production build passed with
  the existing large Three.js chunk warning.
- 103 Rust tests passed with desktop features disabled; strict Clippy and
  formatting passed. The added test covers stale graph/metadata association.
- Real Chromium UI replayed Rust outputs from a synthetic no-Cargo mixed root:
  declaration expansion, coverage gaps, exact intent, source exclusion, proposal
  separation, reload, corrupt storage refusal and unchanged base geometry/camera.
- Original graph browser checks passed. Failure-path and dialect-restoration
  checks use explicit IPC stubs, not native execution.
- Independent review found and fixed permissive v3 preview record validation
  and lost restored dialect choices.

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
