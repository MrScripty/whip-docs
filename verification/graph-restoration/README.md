# File graph restoration verification

2026-10-11 UTC. Correction based on prototype branch commit
`5e9900a8baf3ac599a63532e7dd16d90a1ec0892`, following validation of the originally
published `01edd0626c2c60c9912ac4558eb65bd2ba0c40d1`.

## Implementation boundary

`loadFileRelationGraph` feeds the existing `fileRelationSnapshotToRenderGraph`
adapter and `DirectoryGraphScene`. Repository/directory/file IDs, child lists,
original file OBJ meshes, containment layout and normalized relation metadata
remain authoritative. The original edge geometry, root/leaf styles, focused
layouts, hierarchy and adjacency-fanout routing and directional focus colors
are reused. The new interface theme, navigator and intent inspector remain.

`SymbolSceneLayer` adds typed symbol meshes to the same Three.js scene and
camera, anchored to the expanded file's position and quaternion. It never adds
symbols to directory child lists or synthesizes replacement file aggregates.
The current UI expands one file at a time. Collapse and selection do not rebuild
the base graph or frame the camera; Frame symbols is an explicit user action.

File loading is independent of optional Cargo/symbol enrichment. Backend
mutations serialize; stale responses, failures and completion events cannot
overwrite a newer workspace. Failure to open a replacement clears the old
scene. Successful repository configuration enables existing journal history
even when symbol analysis fails. No Rust code, parser, dependency manifest,
native journal schema or source-retention rule changed in this correction.

## Passed

- `npm run check`: ESLint, TypeScript and 105 frontend tests.
- `npm run build`: production output; the existing Three.js chunk-size warning
  remains (approximately 757 kB entry chunk before gzip).
- `cargo fmt --check` for the application workspace.
- 79 Rust backend tests, including all 25 authored prototype tests, in the
  isolated headless harness. Original analyzer/config/graph/intent/source files
  are included directly; AppState and tests are verbatim except omission of
  the Tauri command adapters. This does not compile Tauri macros or desktop IPC.
- The disposable multi-file Cargo fixture compiles and its integration test
  passes, with Rust 1.92.0 and no third-party fixture dependencies.
- Actual Chromium/Three.js browser fixture UI: authoritative nine-file overview,
  weighted directed relation evidence, repeated expansion/collapse, symbol
  selection, exact whitespace/Unicode intent, separate proposal, unchanged
  original, draft navigation, source/comment/literal exclusion from storage and
  journal history after page reload.
- Actual scene-object assertions: six expansion/collapse cycles retain every
  base mesh/edge UUID, position, routed path, visibility, camera and target.
  Directory focus moves symbols with their parent; hierarchy and adjacency
  produce different routed geometry; outgoing colors and focus exit survive.
- Keyboard mouse-focus, plain Tab directory focus, Shift+Tab escape and form
  navigation. Scene clear removes all meshes and labels and permits reopening.
- Browser failure-path tests, using an explicit IPC stub: a failed replacement
  removes obsolete detail; optional symbol-analysis failure retains files and
  reloads unverified history. These are not native IPC tests.
- Independent review reproduced and rechecked the keyboard, failed-open and
  optional-analysis history defects; no blocking findings remained after fixes.

Earlier validation on the unchanged Rust backend also used separate processes
to append and recover native JSONL originals/interpretations/proposals, verify
SHA-256 bindings, and audit source exclusion. Malformed, truncated, unsupported
and legacy journals rejected reads/appends without changing or deleting bytes.
Browser fixture restart, malformed storage and legacy refusal passed separately.

## Fixture and repeatable browser checks

`fixtures/file-workspace.snapshot.json` is actual output from
`AppState::load_file_relation_graph` and `AppState::analyze_source_repo` on the
synthetic MIT sample in `fixtures/file-workspace`, using the unchanged backend
at `5e9900a` and rust-analyzer 1.92.0. The absolute root is replaced everywhere,
including workspace IDs and their containment-edge references; `generatedAt`
is fixed for replay. All other data matches service output. All seven Rust file hashes are recorded in
`fixtures/file-workspace.provenance.json`. The evidence archive includes the
headless harness, exporter, lockfile and unnormalized service output.

The snapshot includes nine files, four repository/directory nodes, twelve
containment edges, four imports and three calls. Checkout-to-receipt has weight
two and two original evidence samples. Partial/unresolved relationships and
distinct analyzer IDs with duplicate labels are retained, not deduplicated.

```sh
npm run check
npm run build
cargo fmt --check
cargo test --locked --offline --manifest-path fixtures/file-workspace/Cargo.toml
npm run dev
# In another shell, using already installed Playwright and Chromium:
PLAYWRIGHT_MODULE=/path/to/playwright-core CHROMIUM_PATH=/path/to/chromium \
  EVIDENCE_DIR=/tmp/whip-graph-validation \
  node verification/graph-restoration/browser-check.cjs
```

The browser script captures overview, expanded symbols and focused-directory
screenshots and writes `browser-results.json`. It uses an isolated browser
context. No private repository, credentials, model inference or proposal
execution is involved. Screenshots show the real UI with recorded fixture
data, not a live desktop app. The structural scene assertions load source
modules through the Vite development server.

## Still blocked

Full `cargo test`, workspace clippy and `npm run dev:desktop` stop at `glib-sys`:
`glib-2.0.pc` is missing, along with GTK3/WebKitGTK4.1 prerequisites. The configured
Debian snapshot sources returned HTTP 403 in the earlier attempt. No alternate
package source, restriction bypass or further native-launch attempt was made.

Native desktop linking, actual UI-to-Tauri-to-analyzer-to-journal integration,
native window screenshots and native UI restart acceptance remain unverified.
The headless Rust and browser evidence must not be combined into a native
end-to-end pass. PR creation, merge and deployment are outside this correction.
