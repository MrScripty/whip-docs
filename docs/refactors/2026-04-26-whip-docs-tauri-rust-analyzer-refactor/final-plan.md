# Plan: Whip Docs Tauri Rust Analyzer Refactor

## Objective

Rebuild `whip-docs` from an archived static documentation website into a local
desktop code-architecture explorer. The new application will use a Rust backend
with rust-analyzer-backed parsing, a Tauri command boundary, and a Svelte +
TypeScript frontend that displays backend-owned graph data for a user-selected
local repository directory.

## Scope

### In Scope

- Retire the old static website, GitHub-URL code viewer, handwritten DOM
  scripts, and generated website documentation flow.
- Remove the old browser/static runtime from the active product path, including
  any WASM-based parser/runtime assumptions. The replacement app is Tauri +
  Svelte assets backed by Rust services.
- Replace the current `rust-doc-tool` file-only graph with a richer backend
  architecture graph extracted from a local Rust workspace.
- Use rust-analyzer as the primary semantic source for Rust definitions,
  references, and call relationships.
- Keep `syn` as a targeted syntax helper for attributes, module declarations,
  raw signatures, and fallback extraction.
- Add a Tauri desktop app with a Svelte + TypeScript frontend.
- Store the configured source repository as a local directory path, validated
  by the backend before use.
- Define stable graph DTOs shared across the Tauri boundary.
- Generate graph views for modules, files, structs, enums, traits, impls,
  functions, methods, calls, imports, and Tauri command exposure.
- Add focused tests for backend parsing, graph normalization, path validation,
  Tauri command contracts, and frontend rendering/state behavior.

### Out of Scope

- Reproducing the `codebase-memory-mcp` frontend, graph UI, storage engine, or
  C/tree-sitter implementation.
- Shipping a hosted website or GitHub Pages documentation app.
- Supporting remote GitHub repository URLs as the source of truth.
- Using WASM as the active parser, backend, or frontend runtime strategy.
- Implementing all-language analysis. This refactor targets Rust workspaces.
- Perfect macro-expanded or feature-matrix-complete Rust analysis in the first
  implementation.
- Building a multi-user server. The app is local-first desktop tooling.

## Inputs

### Problem

The existing repo is now misaligned with the desired product. It is a static
website plus a small Rust module graph generator. The website assumes GitHub raw
source URLs and browser-side scripts. The desired tool needs backend-owned
semantic analysis of a local Rust repository and a modern desktop frontend that
renders that analysis without duplicating parsing logic in the UI.

### Constraints

- Follow standards from `/media/jeremy/OrangeCream/Linux Software/repos/owned/developer-tooling/Coding-Standards/`.
- Backend is the source of truth for repository configuration and graph data.
- Frontend may own only transient UI state such as filters, selection, pan/zoom,
  tabs, and panel sizing.
- Path inputs are untrusted until parsed into validated backend types.
- Tauri IPC payloads are untrusted and must be validated at the Rust boundary.
- The frontend must not fetch source files from GitHub, read arbitrary local
  files, or build source paths itself. It may request snippets by backend graph
  node ID only.
- Tauri capabilities must be minimal: no shell access, no arbitrary filesystem
  API exposure to the frontend, and no network permissions unless a later
  standards-reviewed milestone adds them.
- Active app code must not depend on WASM for parsing or graph generation.
- The static web stack is archived; do not preserve it as a public facade.
- rust-analyzer must be treated as a managed subprocess with explicit startup,
  readiness, cancellation, shutdown, and timeout behavior.

### Assumptions

- The target repositories are Cargo workspaces or Rust crates with a
  `Cargo.toml`.
- The local machine has or can install `rust-analyzer`.
- The first implementation can require an explicit "Analyze" action rather
  than continuous background watching.
- Existing generated Vulkan description content is historical data and may be
  archived or removed after confirmation during implementation.
- The current `rust-doc-tool` output format is not a compatibility contract.

### Dependencies

- Rust: `tauri`, `serde`, `thiserror`, `tokio`, `lsp-types`, a small owned
  JSON-RPC/process client or a dependency selected after dependency-tree review,
  `cargo_metadata`, `syn`, `walkdir`, and path validation helpers.
- Frontend: Svelte, TypeScript, Vite, Tauri JS API, graph rendering library
  chosen during implementation.
- Tooling: `cargo test`, `cargo clippy`, `cargo fmt`, `cargo tree`, `npm run
  check`, `npm run test`, `npm audit`, and Tauri build validation.

### Standards Reviewed

- `PLAN-STANDARDS.md`
- `DOCUMENTATION-STANDARDS.md`
- `ARCHITECTURE-PATTERNS.md`
- `FRONTEND-STANDARDS.md`
- `TESTING-STANDARDS.md`
- `SECURITY-STANDARDS.md`
- `INTEROP-STANDARDS.md`
- `languages/rust/RUST-API-STANDARDS.md`
- `languages/rust/RUST-DEPENDENCY-STANDARDS.md`
- `languages/rust/RUST-ASYNC-STANDARDS.md`
- `languages/rust/RUST-SECURITY-STANDARDS.md`
- `languages/rust/RUST-LANGUAGE-BINDINGS-STANDARDS.md`

### Reference Code Style Reviewed

- `/media/jeremy/OrangeCream/Linux Software/repos/owned/ai-systems/Pantograph`

Pantograph is the local style reference for Tauri/Svelte/Rust boundaries, but
Whip Docs must borrow its boundary discipline rather than its full scale. Start
with a smaller app and split into extra workspace crates only when reuse,
compile boundaries, or test isolation justify it.

### Current Codebase Findings

| Area | Finding | Plan Response |
| ---- | ------- | ------------- |
| Static website | `index.html`, `web-pages/`, and `scripts/` are still the active UI shape and use imperative DOM mutation patterns such as `innerHTML` and `appendChild`. | Milestones 1, 7, and 8 must archive/delete these paths from the active app and replace rendering with Svelte declarative state. |
| GitHub source model | `scripts/ui/code-viewer.js`, `scripts/ui/integrated-code-viewer.js`, `scripts/ui/commit-banner.js`, and `scripts/ui/commit-viewer-header.js` fetch GitHub APIs/raw source. | Milestones 1, 3, 7, and 8 must remove GitHub URL source behavior and route snippets through backend-validated local repo state. |
| Rust analyzer | `rust-doc-tool/src/analyzer.rs` currently builds a file/module/import graph with `syn` and filesystem walking; it does not model symbols, calls, references, workspaces, Tauri commands, or rust-analyzer lifecycle. | Milestones 2, 4, and 5 replace it with backend-owned graph contracts and rust-analyzer-backed extraction. |
| Tooling shape | The repo has no Svelte/Tauri package scaffold yet and `rust-doc-tool` is a standalone crate, not the desktop app boundary. | Milestone 1 establishes the target workspace/app layout before feature work. |
| Documentation | `README.md` and `bot-docs/` describe the archived static website and GitHub Pages deployment. | Milestones 1 and 8 update product-boundary docs and source-directory READMEs. |
| Generated artifacts | `rust-doc-tool/output/module_graph.json` is checked in as historical output. | Milestone 1 must decide whether generated artifacts move to archive or are removed; new snapshots need a versioned contract. |

### Overlapping Constraints And Resolution

| Constraint Pair | Resolution |
| --------------- | ---------- |
| Local repo selection vs path security | Store only backend-validated, canonicalized repository roots. Every later file/snippet lookup is resolved relative to the stored root and graph snapshot. |
| Backend source of truth vs frontend graph interactivity | Backend owns config, analysis status, graph snapshots, diagnostics, and snippet lookup. Svelte stores own only selection, filters, layout, pan/zoom, and component-local interaction state. |
| rust-analyzer subprocess vs responsive UI | Backend exposes cancellable analysis jobs and progress/status DTOs. Frontend observes command results/events and must not manage the process. |
| Major rewrite vs standards compliance | Preserve only license and useful historical docs. Do not maintain static website compatibility if it conflicts with the Tauri/local-repo architecture. |
| Parallel implementation vs stable contracts | Freeze graph/config/error DTOs before frontend and analyzer workers run in parallel. Shared contracts are serial ownership items. |

### Risks

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| rust-analyzer lifecycle is slow or flaky on large workspaces | High | Own lifecycle in a backend service with readiness checks, timeouts, cancellation, and user-visible diagnostics. |
| LSP call hierarchy is incomplete for macros or dynamic dispatch | Medium | Store provenance/confidence per edge and supplement with `syn` fallback where useful. |
| Tauri frontend duplicates backend state | Medium | Expose backend-owned snapshots through command DTOs; keep frontend stores to view state only. |
| Path validation misses traversal/symlink cases | High | Parse local repo paths into a validated type and canonicalize before storing or analyzing. |
| Major refactor keeps obsolete website code alive by accident | Medium | Add an explicit archive/removal milestone and update README/docs to name the new product boundary. |
| Dependency bloat from LSP/runtime choices | Medium | Run `cargo tree` before adopting LSP/client crates; feature-gate heavy optional behavior if needed. |
| Graph DTO churn blocks frontend/backend parallel work | Medium | Freeze graph contract before implementation waves that depend on it. |

## Definition of Done

- Repo builds as a Tauri + Svelte + TypeScript desktop app.
- The source repository is configured as a local directory, validated by the
  backend, and persisted in backend-owned configuration.
- Backend can analyze a Rust workspace and produce a versioned graph snapshot.
- Graph snapshot includes nodes and edges for at least files/modules,
  structs/enums/traits/impls, functions/methods, imports, calls, and
  Tauri commands.
- Frontend renders the graph and supports filtering/search/selection without
  owning persistent graph data.
- Old static website and GitHub raw source URL assumptions are removed from the
  active app path.
- Tests cover parsing contracts, path validation, command DTOs, and core UI
  behavior.
- README and source-directory READMEs describe the new architecture and
  verification commands.

## Architecture Decision

### Chosen Shape

Use a local Tauri app:

```text
Svelte UI
  -> TypeScript services/stores for transient view state
  -> Tauri command DTOs
  -> Rust app crate
  -> analyzer core module/crate
  -> rust-analyzer LSP process + syn fallback
  -> graph snapshot DTO
```

### Target Workspace Layout

Use one active desktop-app layout and archive or delete the old static layout:

```text
src-tauri/
  Cargo.toml
  src/
    main.rs              # Tauri composition only
    app_setup.rs         # builder, managed state, command registration
    app_lifecycle.rs     # shutdown cleanup for jobs/processes
    commands/            # thin command handlers and DTO validation
    config/              # AppConfig, persistence, migrations
    graph/               # graph contracts, IDs, normalization
    analyzer/            # rust-analyzer process client and extraction pipeline
    source/              # validated path and snippet services
src/
  backends/
    TauriArchitectureBackend.ts # typed Tauri invoke adapter
  lib/
    api/                 # command DTO helpers and transport normalization
    stores/              # transient UI state only
    components/          # declarative Svelte components
    services/            # frontend service facades over backend adapters
  routes or App.svelte   # app composition
docs/
  refactors/
  adr/                   # ADRs added when contracts are frozen
```

Module roles must stay explicit even if implementation starts as one Tauri Rust
crate. Split Rust workspace crates later only when compile boundaries or reuse
justify it:

- `graph` and `config` are domain/contract modules with validated types.
- `analyzer` and `source` are infrastructure/service modules.
- `commands` maps Tauri IPC to domain services and structured errors.
- `main.rs` stays a thin launcher and module declaration surface.
- `app_setup.rs` wires Tauri builder setup, managed state, command
  registration, and startup resources.
- `app_lifecycle.rs` owns shutdown cleanup for active analysis jobs,
  rust-analyzer subprocesses, and background tasks.

### Pantograph Style Adaptation

Adopt these Pantograph patterns:

- Tauri commands are transport adapters over backend-owned services.
- Typed frontend backend classes isolate `invoke(...)` calls from components and
  stores.
- Frontend services may normalize transport payloads but must not invent a
  second source of graph truth.
- Complex frontend behavior belongs in pure TypeScript helpers with colocated
  tests; Svelte components focus on composition, rendering, and event wiring.
- Source-directory READMEs document purpose, contents, constraints, decisions,
  invariants, revisit triggers, dependencies, consumer contracts, and testing.
- Root-owned scripts provide the stable development surface:
  `dev`, `build`, `dev:desktop`, `build:desktop`, `lint`, `lint:full`,
  `typecheck`, `test:frontend`, and `check`.

Do not copy these Pantograph choices unless Whip Docs grows to need them:

- large multi-crate decomposition for every backend concern
- package-level reusable graph library before reuse exists
- broad runtime registry/gateway abstractions unrelated to code architecture
  analysis

Backend-owned data:

- configured repository path
- analyzer process state
- analysis progress/status
- graph snapshots
- source snippets returned for selected graph nodes
- diagnostics and extraction warnings

Frontend-owned transient state:

- selected node/edge
- active graph view
- filters/search text
- layout mode
- panel sizes
- loading spinners derived from backend status

### Borrowed Design Ideas From codebase-memory-mcp

- Multi-pass backend pipeline: discovery, definitions, imports, usages, calls,
  semantic edges, snapshot export.
- Explicit node and edge labels instead of ad hoc JSON blobs.
- Query/export layer separate from visualization.
- Edge provenance and confidence metadata.
- Architecture summary API as a high-level read model.

These are design patterns, not code reuse.

## Target Contracts

### App Configuration DTO

Configuration is a backend-owned, versioned contract:

```rust
pub struct AppConfigDto {
    pub schema_version: u32,
    pub source_repo_path: Option<String>,
    pub source_repo_status: SourceRepoStatusDto,
}
```

Implementation rules:

- Persist only canonical paths that have passed `ValidatedRepoPath`.
- Store a config schema version and add migration behavior before changing the
  persisted shape.
- Keep config storage paths deterministic and test-isolated.
- Never accept a frontend-provided source path for snippet lookup after analysis;
  use graph node IDs and backend snapshot metadata.

### Graph DTO

Create a versioned backend contract before frontend implementation:

```rust
pub struct GraphSnapshot {
    pub schema_version: u32,
    pub source_root: ValidatedRepoPath,
    pub generated_at: String,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub diagnostics: Vec<AnalyzerDiagnostic>,
}

pub enum GraphNodeKind {
    Workspace,
    Crate,
    Module,
    File,
    Struct,
    Enum,
    Trait,
    Impl,
    Function,
    Method,
    TauriCommand,
}

pub enum GraphEdgeKind {
    Contains,
    Defines,
    DefinesMethod,
    Imports,
    Calls,
    Implements,
    References,
    ExposesCommand,
}
```

The final implementation may adjust field names, but it must keep:

- schema version
- stable node IDs
- stable edge IDs
- source path/range where available
- provenance/confidence where extraction is not exact
- diagnostics for skipped or uncertain data

### Tauri Commands

Initial command surface:

- `get_app_config() -> AppConfigDto`
- `set_source_repo_path(path: String) -> AppConfigDto`
- `get_analysis_status() -> AnalysisStatusDto`
- `analyze_source_repo() -> GraphSnapshotDto`
- `get_graph_snapshot() -> Option<GraphSnapshotDto>`
- `get_source_snippet(node_id: String) -> SourceSnippetDto`

All commands validate input and return structured errors.

Command and analyzer paths must not use `unwrap` or `expect` for user-controlled
input, filesystem state, subprocess state, or IPC payloads. Convert those cases
into structured errors and diagnostics.

### Test Placement Strategy

- Rust unit tests live beside the module they exercise.
- Rust integration tests and fixture crates live under `src-tauri/tests/` and
  `src-tauri/tests/fixtures/`.
- Frontend component/store tests live beside the Svelte/TypeScript source when
  narrowly scoped; cross-component flows live under the frontend test directory
  selected by the scaffold.
- Tests that touch durable state must use per-test temp directories, unique config
  paths, fixture repos, and fake rust-analyzer adapters where possible.
- No test may rely on the user's real config directory, real Whip Docs checkout,
  or a globally running rust-analyzer process.

## Milestones

### Milestone 1: Archive Boundary And Repo Shape

**Goal:** Make the product pivot explicit and prepare the repo for a Tauri app.

**Tasks:**
- [x] Add top-level README section stating the old website is archived and the
      active product is a local desktop analyzer.
- [x] Decide whether old website files move under `archive/static-website/` or
      are deleted in a later cleanup commit.
- [x] Decide whether `rust-doc-tool/output/module_graph.json` is archived as
      historical output or removed as generated data.
- [x] Remove WASM/static-site assumptions from active product docs and scripts.
- [x] Add workspace structure for `src-tauri/`, `frontend/` or conventional
      Tauri app layout.
- [x] Add package manager, Rust workspace, Tauri config, and verification script
      names before feature work starts.
- [x] Establish Pantograph-style entrypoints: thin `main.rs`, `app_setup.rs` for
      composition, and `app_lifecycle.rs` for shutdown cleanup.
- [x] Add root npm scripts matching the local desktop style: `dev`, `build`,
      `dev:desktop`, `build:desktop`, `lint`, `lint:full`, `typecheck`,
      `test:frontend`, and `check`.
- [x] Add source-directory READMEs for new active source directories.
- [x] Remove active references to GitHub raw source URLs from product docs.

**Implementation Notes:**
- Active app scaffold added at `src/` and `src-tauri/`.
- Historical static website assets and `rust-doc-tool/output/module_graph.json`
  will be deleted in Milestone 8 rather than moved into an archive directory.
  Git history preserves the old website, and the new product does not need a
  checked-in static-site archive.
- Root `index.html` is now the Vite/Svelte mount point, not the historical
  documentation website.

**Verification:**
- Manual doc review against `DOCUMENTATION-STANDARDS.md`: passed.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.
- Source README presence check for `src` and `src-tauri/src`: passed.
- `git status --short` checked before implementation continues.

**Status:** Completed in commit `d01060c`.

### Milestone 2: Core Graph Contracts

**Goal:** Define backend graph contracts before parser or UI work depends on
them.

**Tasks:**
- [x] Create Rust domain module for validated paths, graph nodes, graph edges,
      diagnostics, and snapshot metadata.
- [x] Add serde DTOs for Tauri IPC.
- [x] Add versioned `AppConfigDto`, `GraphSnapshotDto`, `CommandErrorDto`, and
      migration/versioning notes.
- [x] Add stable ID strategy for workspace/crate/file/symbol nodes.
- [x] Add edge provenance/confidence fields.
- [x] Add executable schema/round-trip tests for graph and config DTOs.
- [x] Document graph contract lifecycle and compatibility expectations.
- [x] Add ADR for Tauri/rust-analyzer ownership and graph contract boundaries.

**Implementation Notes:**
- Added `AppConfigDto`, `SourceRepoStatusDto`, `CommandErrorDto`,
  `ValidatedRepoPath`, graph snapshot/node/edge/source-range DTOs, analyzer
  diagnostics, edge provenance/confidence enums, and deterministic ID helpers.
- Added `docs/adr/ADR-001-tauri-rust-analyzer-graph-contracts.md`.
- Added a placeholder Tauri icon because `generate_context!` requires an icon
  path even before release packaging assets are finalized.

**Verification:**
- Unit tests for `ValidatedRepoPath`, stable ID generation, and DTO
  serialization: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: passed.
- `git diff --check`: passed.

**Status:** Completed in commit `e5d310d`.

### Milestone 3: Local Repository Configuration

**Goal:** Replace remote GitHub assumptions with backend-validated local repo
configuration.

**Tasks:**
- [x] Add backend configuration storage for source repository path.
- [x] Parse and canonicalize user-provided paths into `ValidatedRepoPath`.
- [x] Reject missing paths, non-directories, and paths without a Cargo
      manifest unless explicitly allowed by a future mode.
- [x] Reject traversal attempts and symlink escapes after canonicalization.
- [x] Add Tauri commands for reading/updating configuration.
- [x] Configure Tauri capabilities so the frontend cannot read arbitrary files,
      spawn shell commands, or fetch source from the network.
- [x] Add frontend controls for selecting or typing a local directory.

**Implementation Notes:**
- Added backend-owned `ConfigStore` persistence under the Tauri app data
  directory with schema-versioned JSON config loading and saving.
- Expanded `AppState` so commands load, update, validate, persist, and expose
  repository configuration through structured DTOs.
- Added `ValidatedRepoPath::resolve_existing_child` so later snippet lookup can
  reject absolute child paths, traversal, and symlink escapes after
  canonicalization.
- Added typed frontend backend/service/store layers for config reads and
  updates. `App.svelte` now lets the user enter a local repository path and
  displays backend validation errors without calling `invoke(...)` directly.
- Added `package-lock.json` after dependency installation to pin the frontend
  toolchain used by the new Tauri/Svelte app.

**Verification:**
- Unit tests for valid, invalid, symlink escape, relative, absolute child, and
  missing paths: passed.
- Tauri command tests for config DTOs and persisted source repo updates:
  passed.
- Frontend tests for backend validation error normalization: passed.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run test:frontend`: passed.
- `npm run check`: passed.
- `git diff --check`: passed.

**Status:** Completed in commit `e0d1cff`.

### Milestone 4: rust-analyzer Service Boundary

**Goal:** Add a backend-owned rust-analyzer client with explicit lifecycle.

**Tasks:**
- [x] Add an analyzer service that starts rust-analyzer for a validated Cargo
      workspace.
- [x] Implement initialization, readiness, timeout, cancellation, shutdown, and
      restart behavior.
- [x] Add bounded concurrency policy: one active analysis job per app state until
      a later milestone explicitly supports queues.
- [x] Kill or gracefully terminate child processes on cancellation, restart, app
      shutdown, and test teardown.
- [x] Add typed request helpers for document symbols, definitions, references,
      and call hierarchy.
- [x] Select the LSP client approach only after `cargo tree` review; avoid
      server-oriented LSP framework crates unless justified in the plan.
- [x] Add structured diagnostics when rust-analyzer is missing or returns
      partial data.
- [x] Keep rust-analyzer process state out of the frontend.

**Implementation Notes:**
- Added `RustAnalyzerService` with backend-owned settings, lifecycle status,
  process start, restart, cancellation, shutdown, startup timeout handling, and
  one-active-job enforcement.
- Added `AnalysisStatusDto`, analyzer lifecycle phases, structured diagnostics,
  and Tauri/frontend mirrors for `get_analysis_status`.
- Added typed JSON-RPC/LSP request builders for document symbols, definitions,
  references, prepare call hierarchy, incoming calls, and outgoing calls.
- Reviewed the current dependency tree with `cargo tree` and chose a small
  owned JSON-RPC request boundary for this milestone instead of introducing a
  server-oriented LSP framework crate.
- Wired app shutdown to request analyzer cleanup asynchronously while keeping
  process handles private to the Rust backend.

**Verification:**
- Unit tests for lifecycle status defaults, request builders, request timeout,
  single active analysis job, job completion, and job cancellation: passed.
- Integration-style tests against a tiny fixture Cargo project using a managed
  `/bin/sh` process for start, restart, cancellation, and shutdown cleanup:
  passed on Unix.
- Missing rust-analyzer binary test with structured failed status diagnostic:
  passed.
- Timeout test using a controlled pending readiness future: passed.
- `cargo tree --manifest-path src-tauri/Cargo.toml`: reviewed before selecting
  the owned JSON-RPC request boundary.
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed.
- `cargo fmt --check --manifest-path src-tauri/Cargo.toml`: passed.
- `npm run check`: passed.
- `git diff --check`: passed.

**Status:** Completed in `feat(analyzer): add rust analyzer lifecycle boundary`.

### Milestone 5: Rust Graph Extraction Pipeline

**Goal:** Build a staged backend parser that emits the graph snapshot.

**Tasks:**
- [ ] Discover Cargo workspace crates using `cargo_metadata`.
- [ ] Discover source files/modules.
- [ ] Extract definitions through rust-analyzer document symbols.
- [ ] Extract imports, `mod`, and `#[tauri::command]` attributes with `syn`.
- [ ] Extract call edges with rust-analyzer call hierarchy where available.
- [ ] Extract references/usages where needed for graph search and diagnostics.
- [ ] Normalize all data into `GraphSnapshot`.
- [ ] Use graph snapshot metadata for all later source snippet lookups; snippets
      are addressed by node ID, not frontend-provided file paths.
- [ ] Add snapshot size checks and re-plan if direct IPC payloads are too large.
- [ ] Preserve diagnostics for skipped files, unresolved symbols, macro-heavy
      code, and low-confidence edges.

**Verification:**
- Golden snapshot tests for small fixture crates.
- Fixture test for trait impl edges.
- Fixture test for Tauri command detection.
- Fixture test for module/import edges.
- `cargo test`.

**Status:** Not started.

### Milestone 6: Tauri App Composition

**Goal:** Wire backend analysis into a Tauri desktop application.

**Tasks:**
- [ ] Create Tauri app shell and command registration.
- [ ] Put Tauri builder setup, managed state registration, startup resource
      loading, and command registration in `app_setup.rs`.
- [ ] Keep command handlers thin; delegate to backend services.
- [ ] Add app state owner for config, analyzer service, and latest graph
      snapshot.
- [ ] Add command-level input validation and structured error mapping.
- [ ] Put shutdown behavior in `app_lifecycle.rs`; cancel active jobs, terminate
      rust-analyzer, and drain tracked background tasks there.
- [ ] Add capability configuration review for filesystem, shell, network, and
      dialog permissions.
- [ ] Add startup behavior that loads config but does not auto-run expensive
      analysis unless explicitly enabled later.

**Verification:**
- Tauri command tests where feasible.
- Manual smoke test: set local repo path, run analysis, retrieve snapshot.
- `cargo clippy --workspace --all-targets`.

**Status:** Not started.

### Milestone 7: Svelte Frontend

**Goal:** Replace imperative static website scripts with a declarative app UI.

**Tasks:**
- [ ] Add Svelte + TypeScript app scaffold.
- [ ] Add a typed frontend backend adapter such as
      `src/backends/TauriArchitectureBackend.ts`; components and stores must not
      call `invoke(...)` directly.
- [ ] Add frontend services over the backend adapter for analysis, config,
      graph snapshots, snippets, and diagnostics.
- [ ] Add stores for transient UI state only.
- [ ] Use event-driven command responses/status events for analysis progress. If
      polling is unavoidable, scope it to one owner and add cleanup tests.
- [ ] Move graph interaction/filter/search helpers into pure TypeScript modules
      with colocated tests instead of burying behavior in large Svelte files.
- [ ] Render graph snapshot with search/filter/selection.
- [ ] Add source snippet panel backed by `get_source_snippet`.
- [ ] Add diagnostics/progress panel for analyzer status.
- [ ] Remove old DOM-script rendering from the active app path.
- [ ] Do not use `innerHTML`/manual DOM tree construction for normal rendering;
      isolate any graph-canvas imperative integration behind a component with
      teardown tests.

**Verification:**
- `npm run check` or equivalent Svelte typecheck.
- Frontend unit/component tests for source path validation errors, analysis
  status display, graph rendering, filter behavior, and snippet loading.
- Accessibility checks for controls and graph navigation where practical.

**Status:** Not started.

### Milestone 8: Cleanup, Documentation, And Release Readiness

**Goal:** Remove obsolete active code paths and document the new architecture.

**Tasks:**
- [ ] Archive or delete old website files according to Milestone 1 decision.
- [ ] Remove old GitHub URL source-viewer behavior from active code.
- [ ] Confirm no active app path contains WASM parser/runtime assumptions.
- [ ] Update README with install, run, analyze, test, and troubleshooting
      commands.
- [ ] Add architecture documentation for backend pipeline, Tauri commands, and
      frontend state ownership.
- [ ] Ensure active source-directory READMEs follow the Pantograph-compatible
      shape: Purpose, Contents, Problem, Constraints, Decision, Invariants,
      Revisit Triggers, Dependencies, API Consumer Contract, Structured Producer
      Contract where applicable, and Testing.
- [ ] Add dependency audit notes for rust-analyzer/LSP/Tauri dependencies.
- [ ] Run and record dependency checks: `cargo tree --duplicates`, `cargo tree`
      for new Rust dependencies, and `npm audit` after package setup.
- [ ] Add final verification checklist.

**Verification:**
- `cargo test`
- `cargo fmt --check`
- `cargo clippy --workspace --all-targets`
- `npm run check`
- `npm run test`
- Tauri dev smoke test against a local fixture repo.
- Final documentation review against `DOCUMENTATION-STANDARDS.md`.

**Status:** Not started.

## Ownership And Lifecycle Notes

- rust-analyzer lifecycle is owned by the Rust backend analyzer service.
- The frontend can request analysis but cannot spawn, kill, or directly manage
  analyzer processes.
- Analysis jobs must have a single active owner. Starting a new analysis either
  rejects while one is running or cancels/replaces through an explicit backend
  policy.
- Cancellation and shutdown must clean up child processes.
- Frontend progress state is derived from backend status, not local prediction.
- App-state locks must be short-lived and must not be held across `.await` while
  starting rust-analyzer, sending LSP requests, reading files, or serializing
  graph snapshots.
- Source snippet requests must resolve through the latest backend graph snapshot
  and validated source root. A snippet command must reject unknown node IDs and
  paths outside the source root.
- Analysis status is either event-driven or explicitly scoped polling with timer
  cleanup tests.

## Public Facade Preservation

This is an API-breaking rewrite. The old public facade was a static website and
generated JSON file. That facade is intentionally not preserved because the repo
has been archived as a website and the new product is a local desktop analyzer.

Compatibility to preserve:

- License attribution.
- Any useful historical documentation moved to an archive directory if it is not
  deleted.
- The conceptual ability to generate a module graph, but not the old JSON shape
  as a stable contract.

## Concurrent Worker Plan

Parallel implementation is possible only after Milestone 2 freezes graph,
config, and error contracts. Use one worker wave at a time, starting from a
clean integration commit.

| Owner/Agent | Scope | Primary Write Set | Allowed Adjacent Write Set | Read-Only Context | Forbidden/Shared Files | Output Contract | Handoff Checkpoint | Worker Report Path |
| ----------- | ----- | ----------------- | -------------------------- | ----------------- | ---------------------- | --------------- | ------------------ | ------------------ |
| Backend core | graph contracts, path validation, analyzer service | `src-tauri/src/analyzer/`, `src-tauri/src/graph/`, `src-tauri/src/source/`, Rust tests/fixtures | module READMEs for owned dirs | frontend DTO client, Tauri command signatures | root manifests, lockfiles, Tauri config, README, graph DTOs after freeze unless assigned | typed graph/config APIs, analyzer lifecycle, fixture tests | Milestones 2-5 complete | `docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/reports/backend-core.md` |
| Tauri app | command registration, app state, security capabilities | `src-tauri/src/commands/`, `src-tauri/src/main.rs`, Tauri capability config | Tauri-specific tests and `src-tauri/README.md` | backend service APIs, frontend command client | graph DTO definitions, frontend components, root lockfiles unless assigned | command DTOs wired to services with validation and shutdown behavior | after Milestone 3 contracts | `docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/reports/tauri-app.md` |
| Frontend | Svelte app, typed client, transient view state | `src/` or chosen frontend app directory, frontend tests | frontend README and frontend-only config | frozen DTO docs, command names, graph sample fixtures | Rust backend modules, Tauri config, root lockfiles unless assigned | UI consuming frozen Tauri DTOs with declarative state and cleanup tests | after Milestone 2 DTO freeze | `docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/reports/frontend.md` |
| Docs/tooling | README, directory READMEs, verification scripts, archive decision records | `README.md`, `docs/`, source READMEs, assigned config files | generated verification logs when needed | all source changes for documentation accuracy | source implementation except README/doc updates; lockfiles unless assigned | documented architecture, commands, standards traceability | after each major milestone | `docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/reports/docs-tooling.md` |

Coordination ledger:

- `docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/coordination.md`

External-change escalation rule:

- Workers may read broadly but may edit only their primary or allowed adjacent
  write set. If a needed change falls outside that set, the worker records it in
  the report and stops that slice until the integration owner assigns it.
- If a worker sees unplanned edits in its write set, it records the files and
  coordinates before modifying them.

Integration sequence:

1. Integrate backend contracts first.
2. Integrate Tauri command/app-state wiring.
3. Integrate frontend against frozen DTOs.
4. Integrate docs/tooling updates and archive cleanup.
5. Run the wave verification before starting the next wave.

Cleanup requirements:

- Remove worker worktrees/clones only after reports are preserved, branches are
  integrated or explicitly abandoned, and each workspace has no uncommitted
  changes.

## Re-Plan Triggers

- rust-analyzer cannot provide stable call hierarchy for target fixture crates.
- Tauri dependency or platform requirement conflicts with local development
  constraints.
- The graph contract needs a breaking change after frontend work starts.
- Source repository configuration needs multiple roots or non-Cargo support.
- Generated graph snapshots are too large for direct Tauri IPC transfer.
- Analysis runtime exceeds acceptable interactive limits on representative
  target repos.
- The implementation needs background watching or incremental analysis before
  the explicit analyze flow is complete.

## Unexpected Issues During Execution

- 2026-04-26: `cargo test --manifest-path src-tauri/Cargo.toml` failed during
  Milestone 2 because Tauri's bundle configuration attempted to load the
  default `src-tauri/icons/icon.png`, which does not exist in the new scaffold.
  This is directly related to the Tauri app setup. Disabling bundling did not
  stop `generate_context!` from resolving the default icon path. Resolution: add
  a minimal placeholder icon for compile-time context generation and replace it
  with release-grade assets during release readiness.
- 2026-04-26: `npm run test:frontend` failed during Milestone 3 because Node's
  strip-only TypeScript runner does not support parameter properties, and
  `npm run typecheck` rejected explicit `.ts` imports before
  `allowImportingTsExtensions` was enabled. Resolution: use an explicit
  constructor field assignment in `ArchitectureService` and configure the
  no-emit TypeScript checker to accept explicit `.ts` test/runtime imports.

## Recommendations

- Prefer `rust-analyzer` for semantic truth and `syn` for syntax-specific
  augmentation. This gives better Rust accuracy than a pure `syn` or
  tree-sitter-only approach while keeping attribute/module parsing simple.
- Freeze graph DTOs before building graph UI. This reduces cross-layer churn and
  follows the immutable contract standard.
- Start with explicit analysis, not file watching. It reduces lifecycle risk and
  lets the graph pipeline become correct before adding incremental behavior.
- Use a fixture-first backend test suite. Small Cargo fixtures will catch
  regressions faster than app-level smoke tests.

## Completion Summary

### Completed

- Plan created.
- Standards/codebase review completed and plan patched with enforceable
  compliance requirements.
- Milestone 1 completed: active Tauri/Svelte workspace scaffold, README update,
  source-directory READMEs, root scripts, and Tauri entrypoint boundaries.
- Milestone 2 completed: backend-owned config, command error, source path, and
  graph DTO contracts with unit coverage and ADR traceability.
- Milestone 3 completed: backend-owned local repository config persistence,
  validated canonical path handling, symlink-safe child resolution, Tauri config
  commands, typed frontend service/store wiring, and pinned npm dependencies.
- Milestone 4 completed: backend-owned rust-analyzer lifecycle service,
  analyzer status command, single-job concurrency guard, startup timeout,
  cancellation/restart/shutdown cleanup, and typed LSP request builders.

### Deviations

- None.

### Follow-Ups

- Confirm the preferred graph rendering library before Milestone 7.
- Confirm whether rust-analyzer is allowed as an external runtime prerequisite
  or must be bundled/discovered by the app.

### Verification Summary

- Planning-only change. No code verification run.
- Reviewed the plan against the current `whip-docs` tree and Coding Standards.
- Scanned active static/GitHub/WASM-related code paths with `rg`.
- Milestone 1 verification passed: `cargo fmt --check --manifest-path
  src-tauri/Cargo.toml`, `git diff --check`, source README presence check, and
  `git status --short`.
- Milestone 2 verification passed: `cargo test --manifest-path
  src-tauri/Cargo.toml`, `cargo fmt --check --manifest-path src-tauri/Cargo.toml`,
  and `git diff --check`.

### Traceability Links

- Module README updated: N/A for plan creation.
- ADR added/updated:
  `docs/adr/ADR-001-tauri-rust-analyzer-graph-contracts.md`.
- PR notes completed per `templates/PULL_REQUEST_TEMPLATE.md`: N/A.
