# Whip Docs: intent and symbol prototype

A bounded implementation based on public upstream commit
`3e299d6bf1e7495d80377b8e2ba47ba48366a5a3`.

## What this slice adds

- A focused Three.js workspace: expand a Rust file into typed symbol nodes,
  select a symbol, and inspect existing relationship metadata.
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

The existing graph/layout modules and backend APIs remain in the source tree.
The application entrypoint now opens the focused intent workspace rather than
its previous multi-mode explorer UI. This is a prototype branch, not a qualified
replacement release.

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

Open a local checkout of a public Rust Cargo repository using its absolute path.
Whip Docs does not clone repositories or execute proposals in this slice.
Expand a file in the left navigator, select a typed symbol, enter intent, and
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

Open the served URL with `?preview=1`. A plain browser without that opt-in shows
a desktop-required message. The banner always identifies fixture mode.

This mode uses curated graph metadata for the pinned public Whip Docs
`src-tauri/src/source/mod.rs`; the exact original source is copied to
`fixtures/intent-preview/source.rs`. It is not native analyzer output. Its
append-only API writes metadata and intent to browser localStorage, so it can
be reopened on the
same browser origin. Clearing browser storage removes these demo records.
Browser unit tests cannot establish Rust journal durability or Tauri behavior.

## Evidence and limits

See [verification/README.md](verification/README.md) for completed checks and
remaining blockers. In this environment frontend checks/build passed; native
Rust execution and visual UI verification did not run successfully. No actual
application screenshot is claimed or included.

- Existing syntax extraction gives approximate symbol locations. Historical
  snapshots retain structural nodes/edges and digests, not source bodies; they
  cannot reconstruct original code.
- Symbols have analysis-scoped identities. There is no universal identity or
  automatic matching across renames, repository relocation, or analyzer changes.
- Existing observed edges retain their original type, confidence and provenance.
  Partial/inferred edges are dashed. Unsupported and missing relationships are
  not invented. Calls remain partial; data flow and dynamic dispatch are not
  newly implemented.
- Intent/proposal records annotate the selected symbol. They never become
  observed graph edges and do not mutate repository source.
- The default journal contains your verbatim intent and structural metadata,
  not automatically copied source bodies, comments, or string literals. Intent
  you enter may itself contain sensitive information and is stored locally.
  The journal is not a tamper-proof audit log.
- SHA-256 file digests detect source changes. The worktree digest covers only
  the captured Rust source set, excluding manifests, assets and skipped files.
  The observed Git revision does not claim a clean worktree.
- Legacy V1 journals that retained source bodies block V2 reads/appends. They
  are never silently copied, deleted or migrated. Review them separately before
  using the new journal; this prototype offers no automatic migration.
- See [journal details](src-tauri/src/intent/README.md) for exact digest coverage,
  interrupted-write handling, privacy and commands.
- No voice, agent execution, code generation, standards integration, external
  model calls, or runtime dependency on Passeur, Gestalt, PortfolioVoice or Pumas.
