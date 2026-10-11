# Whip Docs: intent and symbol prototype

A bounded implementation based on public upstream commit
`3e299d6bf1e7495d80377b8e2ba47ba48366a5a3`.

## What this slice adds

- The original file/repository/directory Three.js graph in the new intent shell,
  using the authoritative file-relation snapshot and existing geometry, layouts,
  selection, orbit/pan/zoom and directory focus. File aggregates retain their
  direction, weight, confidence, provenance and evidence.
- Multilingual syntax detail expands above its parent file in that same scene and
  camera. Collapsing it removes only symbol detail; file nodes, routed edges and
  camera remain intact. Symbols are not inserted into the directory layout tree.
- Original human intent recorded verbatim against the selected graph node and
  SHA-256 digest of the exact file bytes used in analysis, observed ranges,
  and a same-file structural symbol snapshot. Source bodies are not journaled.
- Separate later interpretations and proposed changes referencing that original.
  No intent edit/delete endpoint and no proposal execution.
- An append-only Rust JSONL journal in the app-data directory. Historical records
  survive restart; a fresh analysis is required before adding a new record.
- Metadata and intent in the normal inspector. It does not request or show raw
  source. Existing source-snippet backend APIs remain for compatibility.
- An explicit browser fixture mode, isolated from native persistence.

The entrypoint uses the new intent workspace shell around the original
`DirectoryGraphScene`. Graph settings retain global/root/leaf edge shapes,
focused file layouts and hierarchy/adjacency circular bundling. Shapes are
layout settings, not encodings of relationship type. With the canvas focused,
arrows navigate directories, Tab toggles directory focus, period centers the
selection and R fits the graph. Shift+Tab leaves the canvas.

The compact file disclosure toggles only that file. Ctrl-click or Ctrl+Enter/Space
applies the target's new state across eligible files in the loaded repository,
including filtered or collapsed tree rows. Batch expansion retains existing open
files and is bounded to 24 files / 4,096 symbols; a notice reports partial expansion.
Disclosures preserve the camera and any selected symbol that remains visible.
Collapsing a selected symbol's parent preserves its draft for reopening.

File overview is language-neutral. Source analysis uses the owned multilingual
Tree-sitter parser without requiring Cargo. Rust file import/call aggregates keep
the existing backend behavior; multilingual unresolved facts remain separate.
Source coverage, dialect overrides and exact declaration ranges appear in the inspector.
The 14 dialect routes span 12 language families; route coverage does not establish
extraction parity. Extractor @5 corrects the bounded Kotlin/Zig declaration ownership
and C++/Odin callable inventory cases. Unsupported regions retain explicit diagnostics;
complete lexical scope, semantic resolution and display/signature normalization remain
outside this slice.
This remains a prototype, not a qualified native release.

## Run natively

In a configured Rust/Tauri development environment with native prerequisites:

```sh
npm ci
cargo test
cargo fmt --check
cargo clippy --workspace --all-targets
npm run check
npm run build
npm run dev:desktop
```

Open a local public source directory using its absolute path; Cargo.toml is optional.
Whip Docs does not clone repositories or execute proposals in this slice.
Expand a file in the left navigator, select a typed declaration, enter intent, and
choose **Preserve original intent**. Later entries use **Later interpretation**
or **Proposed change** and explicitly select an original.

After restarting, use **Show all repository history** to recover saved records
before analysis. Reopen and analyze the same repository to inspect current
bindings. Changed bytes, changed metadata, missing files and unsafe paths are
not silently rebound. Historical records remain in the all-history view.

## Browser fixture

```sh
npm ci
npm run dev
```

Open the served URL with `?preview=mixed` for recorded multilingual Rust-service
output from a no-Cargo fixture, or `?preview=1` for the original Rust fixture. A plain browser without that opt-in shows
a desktop-required message. The small Fixture Preview indicator identifies fixture
mode; its tooltip makes the absence of native Tauri IPC explicit.

This mode replays recorded output of the real Rust file-relation and symbol
services for the synthetic MIT-licensed public sample in
`fixtures/file-workspace`. Its nine files include nested directories, imports
and weighted cross-file calls. See `fixtures/file-workspace.provenance.json` for
source hashes and backend commit. The absolute root (including workspace IDs) and timestamps are normalized;
file/symbol identities, relationships and evidence are otherwise retained. Analyzer-produced duplicate symbol
labels remain distinct IDs; no UI deduplication invents identity.

The browser does not run Tauri IPC or analysis. Its append-only API writes
metadata and intent to localStorage on the same browser origin. Source bytes
are loaded only for hashing and never included automatically in saved entries.
Clearing browser storage removes demo records. Legacy preview source files are
retained for existing tests; prior V2 records are preserved, with history scoped
to the current fixture root. Browser checks cannot establish native durability.

## Evidence and limits

See [integration verification](verification/integration/README.md) and
[graph restoration verification](verification/graph-restoration/README.md)
for frontend, Rust service and actual browser checks, and
[the original record](verification/README.md) for initial publication evidence.
Native Tauri linking, IPC and desktop end-to-end acceptance remain blocked by
missing system libraries. Browser screenshots are explicitly fixture execution.

- The new parser records exact UTF-8 syntax byte ranges within its qualified
  subsets; legacy journal locations remain approximate. Historical
  snapshots retain structural nodes/edges and digests, not source bodies; they
  cannot reconstruct original code.
- Symbols have analysis-scoped identities. There is no universal identity or
  automatic matching across renames, repository relocation, or analyzer changes.
- Existing observed edges retain their original type, confidence and provenance.
  Partial/inferred symbol edges are dashed. Original file-edge rendering and
  directional focus colors remain unchanged. Unsupported and missing relationships are
  not invented. Calls remain partial; data flow and dynamic dispatch are not
  newly implemented.
- Intent/proposal records annotate the selected symbol. They never become
  observed graph edges and do not mutate repository source.
- The default journal contains your verbatim intent and structural metadata,
  not automatically copied source bodies, comments, or string literals. Intent
  you enter may itself contain sensitive information and is stored locally.
  The journal is not a tamper-proof audit log.
- SHA-256 file digests detect source changes. The worktree digest explicitly distinguishes legacy captured Rust sources
  from schema-3 captured multilingual sources and parser identity; unsupported
  files, assets and skipped files are excluded.
  The observed Git revision does not claim a clean worktree.
- Schema-2 journal records remain unchanged; they become stale against the new
  parser. Schema-3 records retain extractor identity; `@1`, `@2`, `@3` and `@4` records likewise
  become stale against `@5`. Older binaries cannot read schema-3 lines; downgrade is unsupported.
- Legacy V1 journals that retained source bodies block V2 reads/appends. They
  are never silently copied, deleted or migrated. Review them separately before
  using the new journal; this prototype offers no automatic migration.
- See [journal details](src-tauri/src/intent/README.md) for exact digest coverage,
  interrupted-write handling, privacy and commands.
- No voice, agent execution, code generation, standards integration, external
  model calls, or runtime dependency on Passeur, Gestalt, PortfolioVoice or Pumas.
