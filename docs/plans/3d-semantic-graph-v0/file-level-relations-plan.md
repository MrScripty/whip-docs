# 3D Semantic Graph V0 Cross-File Relations Plan

## Objective

Add a language-neutral cross-file relation layer that lets the 3D graph show
how files pass data, call compute, import modules, and depend on other files
without making the renderer know how Rust, TypeScript, JavaScript, Python, or
C# analysis works.

Rust is the first implementation target, but the graph API must accept facts
from multiple analyzers and normalize them into one render contract.

## Scope

### In Scope

- Backend-owned cross-file relation DTOs and normalization rules.
- A Rust-first relation extraction path for imports and calls.
- Source-root validation changes needed to avoid hard-coding Cargo-only
  repository assumptions into the future multi-language graph.
- Frontend DTO mirrors, render graph adapter updates, relation visibility
  filtering, selection indexing, and relation edge styling.
- Inspector support for selected relation edges, including bounded evidence
  display.
- Tests and documentation updates needed for all touched source directories.

### Out Of Scope

- Rendering a file-internal graph.
- Rendering functions, structs, methods, variables, or other internal symbols as
  global 3D scene nodes.
- Full Rust ownership/data-flow precision beyond confidence-marked V0 facts.
- TypeScript, JavaScript, Python, or C# analyzer implementations.
- Persisted saved graph snapshots.
- Browser automation for WebGL screenshots unless a harness already exists by
  implementation time.

## Assumptions

- Backend DTOs remain the source of truth for graph facts and validation.
- Frontend relation detail state is transient UI state and does not persist.
- The first vertical slice should prove one end-to-end relation path before
  broadening to every relation kind.
- New dependencies require an explicit dependency review; small relation
  filtering, indexing, and DTO normalization helpers should be implemented
  in-house.
- The current dirty Markdown plan file is allowed plan setup; implementation
  work must start from a clean code/test/config worktree or explicit user
  approval.

## Dependencies And Affected Contracts

Internal dependencies:
- `src-tauri/src/source`: trusted source-root validation.
- `src-tauri/src/graph`: backend-owned graph DTOs, stable IDs, and
  normalization.
- `src-tauri/src/analyzer`: Rust extraction and future analyzer registry.
- `src-tauri/src/commands`: Tauri IPC command facade and app-state lifecycle.
- `src/backends` and `src/lib/services`: frontend transport and orchestration
  facades.
- `src/lib/graph-v0`: render graph adapters, selection indexes, layout, and
  Three.js scene ownership.

External dependencies:
- Existing Rust crates: `serde`, `serde_json`, `thiserror`, `tokio`,
  `cargo_metadata`, `syn`, and `walkdir`.
- Existing frontend dependencies: Svelte, Tauri API, Three.js, and current
  TypeScript tooling.
- Optional future analyzers must pass dependency review before addition.

Affected structured contracts:
- Tauri command names and payload/response DTOs.
- Rust serde enum casing and field casing.
- TypeScript DTO mirrors in `TauriArchitectureBackend.ts`.
- Render graph node/edge kind semantics consumed by pure helpers and the scene.

Affected persisted artifacts:
- None in the first implementation. Relation snapshots are not persisted.
- If saved graph snapshots are introduced later, schema versioning and migration
  become mandatory before persistence ships.

Concurrent worker plan:
- Exploratory sub-agents are useful for backend/frontend blast-radius review.
  Contract and adapter edits remain integrated serially because they touch
  shared DTO boundaries.

## Current State

- The 3D graph consumes `RenderGraph` from `src/lib/graph-v0/types.ts`.
- `RenderGraph` currently supports only `repo`, `directory`, and `file` nodes.
- `RenderGraphEdge.kind` has been widened to `contains` plus relation edge
  kinds. The legacy directory DTO still uses `tree` on the wire, and the
  frontend adapter normalizes it to render-facing `contains`.
- The backend has two graph shapes:
  - `DirectoryGraphSnapshotDto`, which represents repository structure.
  - `GraphSnapshotDto`, which already has analysis nodes and edges such as
    files, modules, functions, imports, calls, references, and provenance.
- The current visual hierarchy places file nodes inside directory spheres, so
  visible file-to-directory tree edges add clutter without adding information.
- Selection indexing already handles arbitrary node and edge IDs, so cross-file
  relation edges should extend the index rather than replace it.

## Core Decision

Use three distinct graph levels:

1. Directory structure: where directories and files live.
2. Cross-file relations: how data and compute move between files.
3. File internals: a later focused view for the inside of one selected file.

This plan covers level 2. It does not introduce a rendered symbol graph.

Keep containment and cross-file relationships separate.

Containment answers:
- Where does this file live?
- Which directory sphere contains it?
- Which nodes define layout hierarchy?

Cross-file relationships answer:
- Which files import other files?
- Which file calls code defined in another file?
- Which file reads, writes, borrows, copies, or mutably borrows data defined or
  owned elsewhere?
- Which files test, configure, implement, or otherwise coordinate with other
  files?

The renderer should receive both as one render graph, but it should be able to
hide containment edges while showing cross-file relation edges by detail level.

## Contract Shape

### Backend Snapshot

Add a new backend-owned DTO that combines directory structure with normalized
file relations:

```rust
pub struct FileRelationGraphSnapshotDto {
    pub schema_version: u32,
    pub source_root: String,
    pub generated_at: String,
    pub root_node_id: String,
    pub nodes: Vec<FileRelationNodeDto>,
    pub edges: Vec<FileRelationEdgeDto>,
    pub analyzers: Vec<AnalyzerRunDto>,
    pub diagnostics: Vec<AnalyzerDiagnosticDto>,
}
```

This should not replace the existing directory graph immediately. It should be
introduced as the next renderable graph contract and then the directory graph
can be adapted into it.

### Nodes

V0 should stay file-focused for rendering:

```rust
pub enum FileRelationNodeKind {
    Repo,
    Directory,
    File,
}
```

Do not render function, struct, enum, trait, impl, method, or local variable
nodes in the main 3D scene. An analyzer may inspect those internals to discover
cross-file relationships, but the visible V0 relation graph remains file to
file.

Each node should carry stable identity and path metadata:

```rust
pub struct FileRelationNodeDto {
    pub id: String,
    pub kind: FileRelationNodeKind,
    pub name: String,
    pub path: String,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub language: Option<SourceLanguageDto>,
}
```

### Edges

Edges need separate visual categories and analysis evidence:

```rust
pub enum FileRelationEdgeKind {
    Contains,
    Imports,
    Calls,
    ReferencesType,
    PassesData,
    ReadsData,
    WritesData,
    BorrowsData,
    MutablyBorrowsData,
    CopiesData,
    Tests,
    Configures,
    ImplementsContract,
}

pub struct FileRelationEdgeDto {
    pub id: String,
    pub kind: FileRelationEdgeKind,
    pub from_node_id: String,
    pub to_node_id: String,
    pub weight: u32,
    pub direction: FileRelationDirectionDto,
    pub confidence: EdgeConfidenceDto,
    pub provenance: EdgeProvenanceDto,
    pub evidence_count: u32,
    pub evidence_sample: Vec<FileRelationEvidenceDto>,
}
```

`weight` is a collapsed count for repeated facts between the same two files.
`evidence_count` preserves the full number of underlying facts, while
`evidence_sample` gives the UI enough explanation without forcing the renderer
or IPC payload to carry every internal fact.

### Evidence

Evidence lets language analyzers explain cross-file relations in a shared shape:

```rust
pub struct FileRelationEvidenceDto {
    pub kind: FileRelationEvidenceKind,
    pub source_range: SourceRangeDto,
    pub target_range: Option<SourceRangeDto>,
    pub source_label: Option<String>,
    pub target_label: Option<String>,
    pub access: Option<FileRelationAccessDto>,
    pub analyzer: String,
}

pub enum FileRelationEvidenceKind {
    Import,
    FunctionCall,
    TypeReference,
    DataPass,
    ValueRead,
    ValueWrite,
    Borrow,
    MutableBorrow,
    Copy,
    TestCoverage,
    Configuration,
    ContractImplementation,
}
```

Rust-specific concepts like borrow, mutable borrow, and copy should appear as
shared access/evidence types. Languages that cannot supply those facts simply
omit them or report lower confidence.

Evidence can reference internal names such as a function, type, field, or local
binding, but those names are explanatory metadata. They are not rendered as
nodes in the cross-file relation view.

## Analyzer API

Add a backend analyzer boundary that returns normalized file relation facts:

```rust
pub trait FileRelationAnalyzer {
    fn language(&self) -> SourceLanguageDto;

    fn analyze(
        &self,
        source_root: &ValidatedRepoPath,
        files: &[SourceFileDto],
    ) -> Result<FileRelationAnalysisDto, AnalyzerError>;
}
```

Each analyzer can use its own implementation detail:
- Rust: rust-analyzer plus `syn` fallback for imports and simple calls.
- TypeScript/JavaScript: TypeScript compiler API or tree-sitter first pass.
- Python: tree-sitter or Python AST first pass, with optional type-aware
  analyzer later.
- C#: Roslyn, if running the required toolchain is available.

The important boundary is that all analyzers emit the same normalized DTOs.

## Normalization Rules

Analyzer output should be normalized before reaching the frontend:

- Stable node IDs remain path-based for files and directories.
- Internal analysis facts collapse into file-to-file edges.
- Multiple facts of the same kind between two files merge into one edge with
  `weight += 1`, `evidence_count += 1`, and a bounded evidence sample.
- Cross-language edges are allowed if evidence can resolve both files.
- Unresolved targets become diagnostics, not partial fake edges.
- Same-file facts are hidden from the cross-file relation graph by default, but
  can be retained for the later file-internals view.
- `contains` edges drive layout but are hidden for file children because the
  containing directory sphere already communicates membership.

## Frontend Render Types

Extend the frontend render contract instead of replacing the scene:

```ts
export type GraphEdgeKind =
  | 'contains'
  | 'imports'
  | 'calls'
  | 'references_type'
  | 'passes_data'
  | 'reads_data'
  | 'writes_data'
  | 'borrows_data'
  | 'mutably_borrows_data'
  | 'copies_data'
  | 'tests'
  | 'configures'
  | 'implements_contract';

export type RenderGraphEdge = {
  readonly id: string;
  readonly kind: GraphEdgeKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly weight?: number;
  readonly visibleAtDetails?: readonly FileRelationDetail[];
  readonly evidenceCount?: number;
  readonly confidence?: 'exact' | 'inferred' | 'partial';
};
```

The existing `directorySnapshotToRenderGraph` adapter can keep emitting only
`contains` edges. A new `fileRelationSnapshotToRenderGraph` adapter should
consume the combined backend snapshot.

The render graph should keep all containment and relation edges in one stable
graph object. Detail-level filtering should produce visible edge ID sets and
selection indexes, not a new graph object, so relation toggles do not force the
Three.js scene to rebuild every node and layout position.

## Detail Levels

The graph should expose a detail selection that maps to edge filters:

```ts
export type GraphViewLevel =
  | 'directory'
  | 'file-relations'
  | 'file-internals';

export type FileRelationDetail =
  | 'structure'
  | 'imports'
  | 'calls'
  | 'data'
  | 'tests'
  | 'configuration'
  | 'contracts';
```

Suggested defaults:

| Detail Level | Visible Edges |
| --- | --- |
| `structure` | Directory containment, no visible file containment edges |
| `imports` | `imports` |
| `calls` | `imports`, `calls` |
| `data` | `references_type`, `passes_data`, `reads_data`, `writes_data`, `borrows_data`, `mutably_borrows_data`, `copies_data` plus previous levels |
| `tests` | `tests` plus previous levels |
| `configuration` | `configures` plus previous levels |
| `contracts` | `implements_contract` plus previous levels |

The UI can start as a segmented control or select in the existing 3D graph
settings panel. The filtering should happen before selection indexing so hidden
relation types do not affect neighborhood highlighting.

## Renderer Behavior

The scene should continue using containment for layout, but relation edges
should be rendered differently from containment:

- Do not draw file-to-directory containment edges.
- Keep directory-to-directory containment edges visible in `structure` mode if
  useful for navigation.
- Draw file-to-file relation edges as curved arcs outside or across directory
  spheres.
- Use edge color/style by relationship kind.
- Use edge thickness or opacity by `weight` and confidence.
- Keep selection hit targets for relation edges.
- When a relation edge is selected, the side panel should show edge kind,
  source file, target file, weight, confidence, provenance, and top evidence.

The first implementation can draw relation edges using existing edge geometry.
If edges visually cut through directory spheres too aggressively, add a later
arc-routing pass that raises file-to-file edges away from the local directory
container.

The later file-internals view should be entered from a selected file and should
use a separate focused graph contract. It should not be mixed into the global
directory/file relation scene.

## Lifecycle And Concurrency

- Relation graph loading is user-initiated from the frontend and backend-owned
  once requested.
- Backend command handlers must validate raw IPC payloads, derive trusted
  source-root types, and then call service/builder code.
- Blocking filesystem, Cargo metadata, and subprocess work must run outside the
  async request path, using async process APIs or `spawn_blocking` where
  blocking work is unavoidable.
- The analyzer lifecycle owner remains `AppState`/`RustAnalyzerService`; new
  relation jobs should use an explicit job ID and complete/cancel paths so
  stale busy status is not left behind.
- Frontend requests that can overlap, such as loading a graph for one path and
  then quickly loading another, need request IDs or equivalent stale-response
  guards before applying returned snapshots to stores.
- Three.js resources remain owned by the scene class. Detail-level changes must
  update edge visibility/style in place, while graph/layout changes rebuild
  scene structure.

## Public Facade And Compatibility

- Preserve existing `load_directory_graph`, `analyze_source_repo`, and
  `get_graph_snapshot` command names and response shapes while relation support
  is added.
- Add relation graph capability with a new command and DTO rather than breaking
  the directory graph contract.
- Keep the existing `DirectoryGraphScene` public constructor/update facade for
  the first implementation. Rename only after relation rendering has landed and
  tests prove the wrapper compatibility path.
- Update Rust and TypeScript DTO mirrors in the same commit whenever a Tauri
  wire contract changes.
- If DTOs become long-lived persisted artifacts, add explicit schema migration
  handling before saving them.

## Standards Compliance Review

Standards reviewed from `/media/jeremy/OrangeCream/Linux Software/repos/owned/developer-tooling/Coding-Standards/`:
- `PLAN-STANDARDS.md`
- `CODING-STANDARDS.md`
- `ARCHITECTURE-PATTERNS.md`
- `FRONTEND-STANDARDS.md`
- `ACCESSIBILITY-STANDARDS.md`
- `TESTING-STANDARDS.md`
- `DOCUMENTATION-STANDARDS.md`
- `SECURITY-STANDARDS.md`
- `CONCURRENCY-STANDARDS.md`
- `INTEROP-STANDARDS.md`
- `DEPENDENCY-STANDARDS.md`
- `TOOLING-STANDARDS.md`
- `COMMIT-STANDARDS.md`
- `languages/rust/RUST-API-STANDARDS.md`
- `languages/rust/RUST-ASYNC-STANDARDS.md`
- `languages/rust/RUST-SECURITY-STANDARDS.md`
- `languages/rust/RUST-INTEROP-STANDARDS.md`
- `languages/rust/RUST-TOOLING-STANDARDS.md`

Compliance decisions:
- Plan structure includes scope, assumptions, milestones, verification, risks,
  re-plan triggers, lifecycle ownership, facade compatibility, and completion
  criteria.
- Backend-owned data remains authoritative. Frontend stores own only transient
  UI state, derived indexes, visible edge IDs, and renderer lifecycle.
- Tauri IPC DTOs are interop contracts. Serde `rename_all` choices must be
  mirrored in TypeScript and covered by serialization/adapter tests.
- External paths are parsed once into validated source-root types at command
  boundaries. Internal analyzers do not accept raw unchecked path strings.
- Blocking filesystem/process work does not run directly under async locks or
  async command handlers.
- Pure relation visibility, relation edge style planning, evidence capping, and
  selection indexing should be unit tested outside WebGL.
- Cross-layer work requires at least one vertical slice acceptance check from a
  fixture repository through the Tauri command/service layer into a frontend
  render graph adapter.
- New UI controls for relation detail must use labeled semantic controls,
  keyboard-accessible interactions, and tests or manual smoke checks for
  parent gesture conflicts inside the 3D graph workspace.
- New source directories or files that change an existing source directory
  boundary require README updates or ADR updates in the same slice.
- New third-party analyzers or parser dependencies are deferred until an
  explicit dependency review records why they beat in-house or existing
  dependencies.
- Commits during implementation should be conventional, atomic by logical
  slice, and include code/tests/docs for that slice together.

## Codebase Impact Review

### Cross-Cutting Decomposition Review

Current file sizes already exceed the coding standards decomposition trigger:
- `src/lib/graph-v0/ThreeDirectoryGraphScene.ts`: about 2,085 lines.
- `src/lib/graph-v0/layouts.ts`: about 1,359 lines.
- `src-tauri/src/analyzer/extraction.rs`: about 1,125 lines.
- `src/App.svelte`: about 788 lines.
- `src-tauri/src/graph/mod.rs`: about 590 lines.
- `src-tauri/src/commands/mod.rs`: about 499 lines, before any new command.

Anti-pattern risk:
- Adding relation DTOs, extraction, scene rendering, and UI controls directly
  into these files would deepen existing large-file and multi-responsibility
  problems.

Maintainability response:
- New relation logic should enter through focused modules and pure helpers, not
  by continuing to expand the largest files.
- Keep each implementation slice reviewable by pairing contract changes with
  narrow owner modules and tests.
- Only defer extraction when a wrapper/facade is needed to preserve existing
  public imports.

### Backend Graph Contracts

Touched files:
- `src-tauri/src/graph/mod.rs`
- `src-tauri/src/graph/README.md`
- `docs/adr/ADR-001-tauri-rust-analyzer-graph-contracts.md`

Impact:
- `graph/mod.rs` already owns both analyzer graph DTOs and directory graph
  DTOs. Adding relation DTOs here fits the existing ownership model, but the
  file is already carrying several responsibilities.
- Avoid growing a third independent graph language. The new relation snapshot
  should be the renderable projection contract, while the current
  `GraphSnapshotDto` remains an analyzer/symbol fact snapshot until it is
  retired or moved behind relation extraction.
- Use `contains` as the render-facing containment edge kind. The current
  directory-only `tree` edge can remain in the directory DTO, but adapters
  should normalize it to `contains` before the 3D scene sees it.

Maintainability response:
- Add relation DTOs in a new backend submodule such as `graph/relations.rs`
  exposed as `graph::relations`, rather than expanding `graph/mod.rs` further.
- If directory graph code is touched heavily, consider moving the existing
  directory builder into `graph/directory.rs` in the same slice that modifies
  it, preserving `DirectoryGraphBuilder` as the public facade.
- Keep stable ID helpers shared, but add relation-specific stable edge IDs that
  include relation kind plus source/target file IDs.
- Mark public DTO enums as intentionally extensible. If non-exhaustive Rust
  enums cannot be used because serde wire compatibility requires exhaustive
  string values, document append-only enum semantics in the README and tests.

### Source Root Validation

Touched files:
- `src-tauri/src/source/mod.rs`
- `src-tauri/src/source/README.md`
- `src-tauri/src/config/mod.rs`
- command tests that currently expect Cargo-only validation

Impact:
- `ValidatedRepoPath::parse_existing_cargo_repo` blocks multi-language
  repositories because it requires `Cargo.toml`.
- The plan's multi-language direction needs a generic source-root validator
  plus analyzer-specific readiness checks.

Maintainability response:
- Split validation into `parse_existing_source_root` and
  `require_cargo_manifest`.
- Keep current Rust commands using the Cargo check until non-Rust analyzers are
  implemented.
- Let directory/file graph loading accept any validated source root once the UI
  is ready for mixed-language repositories.
- Keep all path traversal and symlink escape checks in `source/mod.rs`; command
  handlers must not duplicate inline path validation logic.

### Analyzer Extraction

Touched files:
- `src-tauri/src/analyzer/extraction.rs`
- `src-tauri/src/analyzer/mod.rs`
- analyzer tests in `extraction.rs`

Impact:
- `RustGraphExtractor` currently emits symbol-rich `GraphSnapshotDto` directly.
  It also spawns `rust-analyzer symbols` once per file and uses fallback `syn`
  extraction, so scaling this path directly into relation evidence could become
  expensive.
- Existing `pending_imports` and `pending_calls` are useful starting points,
  but they currently resolve to symbol/file graph edges, not weighted relation
  edges with capped evidence.
- Function lookup is name-based today, which is acceptable for partial
  architecture hints but too ambiguous for exact relation evidence.

Maintainability response:
- Add a relation accumulator separate from `GraphAccumulator`, preferably in a
  new `analyzer/rust_relations.rs` or similar module. It should own file IDs,
  relation edge merging, evidence counting, and diagnostics.
- Treat `syn` call resolution as `partial` unless a language server or compiler
  can resolve the target file exactly.
- Do not make rust-analyzer process spawning part of the generic analyzer trait;
  keep analyzer-specific process management behind the Rust implementation.
- Keep relation normalization synchronous where possible and put only filesystem
  and process boundaries in async/blocking shells.
- Avoid `unwrap()`/`expect()` in production extraction paths; convert failures
  into diagnostics or typed errors with bounded context.
- Do not extend the current per-file `rust-analyzer symbols` subprocess pattern
  for relation precision without measuring representative repositories; it is a
  likely scaling bottleneck.

### Command And App State

Touched files:
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/commands/README.md`
- `src-tauri/src/app_setup.rs`
- `src-tauri/capabilities/default.json`

Impact:
- Adding `load_file_relation_graph` or similar is a new frontend-visible Tauri
  command.
- `AppState` currently stores only `GraphSnapshotDto`. Relation snapshots can
  initially be returned on demand like directory graphs, avoiding another state
  cache until there is a clear need for `get_file_relation_graph_snapshot`.

Maintainability response:
- Keep commands thin: validate path, start a job if needed, call a backend
  builder/extractor, return DTO.
- Reuse the analyzer status job lifecycle so long relation extraction does not
  leave the UI guessing whether work is in progress.
- Do not hold `RwLock` guards across long-running analysis or blocking work.
- Add command tests for invalid payload/path handling and stale job cleanup
  after extractor errors.
- If `commands/mod.rs` grows materially beyond the current threshold, split
  graph-related command implementation/tests into a command submodule while
  preserving the existing `commands::load_directory_graph` facade.

### Frontend Backend Mirror And Services

Touched files:
- `src/backends/TauriArchitectureBackend.ts`
- `src/lib/api/index.ts`
- `src/lib/services/ArchitectureService.ts`
- `src/lib/services/graphView.ts`
- `src/lib/stores/graphStore.ts`
- service tests

Impact:
- TypeScript DTO mirrors must be updated in lockstep with Rust DTOs.
- Adding relation snapshots to the existing `directoryGraphSnapshot` store
  would blur structure and relation ownership.
- `graphView.ts` already has a 2D `projectGraph` helper that collapses symbol
  facts into file-level edges. It is useful legacy context but should not become
  the 3D relation API because it loses relation evidence, detail visibility,
  relation direction, and renderer metadata.

Maintainability response:
- Add explicit `FileRelationGraphSnapshotDto` types and a separate store such
  as `fileRelationGraphSnapshot`.
- Keep transport methods in `TauriArchitectureBackend` and request sequencing
  in `ArchitectureService`.
- Keep the existing 2D `GraphSnapshotDto` view as legacy/analyzer-focused until
  it is intentionally replaced.
- Add stale-response guards in the service or component owner before applying
  async relation graph loads to stores.
- Use `src/lib/api` only as a type/export facade if needed; keep transport in
  `src/backends` and relation projection in `src/lib/graph-v0`.

### Graph V0 Pure Helpers

Touched files:
- `src/lib/graph-v0/types.ts`
- `src/lib/graph-v0/adapters.ts`
- `src/lib/graph-v0/selectionIndex.ts`
- `src/lib/graph-v0/neighborhood.ts`
- `src/lib/graph-v0/*.test.ts`

Impact:
- `RenderGraphEdge.kind` is currently only `tree`; the plan needs relation
  kinds plus render metadata.
- `selectionIndex.ts` currently treats every edge as undirected adjacency. That
  is fine for directory neighborhood highlighting, but relation edges need
  incoming/outgoing lookup so the UI can distinguish "calls into" from "called
  by".
- Filtering by detail level before building the index is correct, but returning
  a new filtered graph object would trigger scene rebuilds.

Maintainability response:
- Add a pure `relationVisibility.ts` helper that returns visible edge IDs for a
  detail level.
- Add a pure relation style/planning helper if edge color, opacity, width, or
  routing rules become more than simple constants.
- Extend the selection index with incoming edge IDs, outgoing edge IDs, adjacent
  node IDs, and edge IDs by kind.
- Build selection indexes from the stable graph plus visible edge ID sets, not
  by allocating a structurally different graph for each detail toggle.
- Keep relation constants, detail-level definitions, and style-planning tables
  centralized to avoid string drift across UI, helpers, and tests.

### Layout And Scene

Touched files:
- `src/lib/graph-v0/layouts.ts`
- `src/lib/graph-v0/ThreeDirectoryGraphScene.ts`
- `src/lib/graph-v0/edgeGeometry.ts`
- `src/lib/graph-v0/constants.ts`

Impact:
- Layout helpers already use `childIds`, not graph edges, so layout can remain
  based on containment even while relation edges are toggled.
- `DirectoryGraphScene.updateGraph` currently rebuilds structure when the graph
  object changes. Detail changes must be passed as edge visibility/style state
  instead of replacing the graph.
- Current edge geometry assumes containment-style source/target anchors. File
  relation edges will need separate geometry, likely raised arcs between file
  positions, otherwise cross-directory edges may cut through containing
  spheres.
- `EdgeSceneEntry` currently lacks edge kind, confidence, and weight, so edge
  styling cannot be relation-aware yet.

Maintainability response:
- Split scene updates into node/layout rebuilds, edge structural rebuilds, and
  edge visibility/style updates.
- Keep relation edge style mapping in a pure helper where possible; Three.js
  should apply material/color/opacity, not decide product-level relation
  semantics.
- Consider renaming the class from `DirectoryGraphScene` only after relation
  rendering lands; premature rename would add churn without behavior.
- Ensure every new Three.js material, geometry, texture, and selection mesh is
  disposed through the existing scene cleanup path.
- Do not modify layout algorithms for relation visibility. Layout should remain
  a containment concern unless a future edge-routing milestone explicitly needs
  relation-aware placement.
- If relation edge creation adds meaningful code volume, extract edge object
  creation/update planning from `ThreeDirectoryGraphScene.ts` before adding more
  scene responsibilities.

### App UI And Inspector

Touched files:
- `src/App.svelte`
- `src/styles.css`

Impact:
- `App.svelte` already owns many graph state variables. Adding relation detail,
  relation snapshot state, visible edge sets, and selected relation evidence
  directly here will make the component harder to reason about.
- The inspector currently shows selected directory edge endpoints only; it will
  need relation kind, direction, confidence, weight, and evidence sample.

Maintainability response:
- Add only minimal wiring to `App.svelte`. Extract a `Graph3DWorkspace` or
  equivalent component before adding relation-specific control and inspector
  markup that would further grow the 788-line app component.
- Put detail-level option definitions in pure graph helper constants so UI,
  filtering, and tests share one source.
- New selects, segmented controls, or buttons must have visible labels or
  accessible names and must not interfere with orbit/pan pointer handling.

### Tests And Verification

Touched areas:
- Rust DTO serialization tests.
- Rust relation extraction fixtures.
- TypeScript adapter, visibility, and selection-index tests.
- Manual 3D renderer checks until browser automation exists.

Impact:
- Existing pure tests are a good fit for relation filtering and selection
  indexing.
- Scene behavior remains hard to test without browser automation. Keep relation
  style/visibility planning pure enough to test outside WebGL.

Maintainability response:
- Add tests for weighted edge merging, evidence count/sample capping,
  direction-aware selection indexes, and detail visibility.
- Keep visual smoke checks documented until a Playwright/canvas harness exists.
- Add a vertical slice acceptance check for Rust imports or calls that exercises
  backend relation extraction and frontend adapter normalization together.

## Implementation Slices

### 1. Source Root And Contract Foundation

- Split generic source-root validation from Cargo-specific validation.
- Add backend DTOs for `FileRelationGraphSnapshotDto` in a focused relation
  module exposed by `graph/mod.rs`.
- Mirror the DTOs in `TauriArchitectureBackend.ts`.
- Extend frontend `RenderGraphEdge.kind` beyond `tree`.
- Add `fileRelationSnapshotToRenderGraph`.
- Add tests proving containment and cross-file relation edges normalize
  correctly.
- Update affected READMEs or ADRs for source validation, graph contracts, and
  frontend adapter contracts in the same slice.

Verification:
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `npm run typecheck`
- `npm run test:frontend`

### 2. Render Visibility And Detail Level

- Add a pure helper that returns visible edge IDs for a relation detail level.
- Hide file containment edges by default.
- Build the selection index from the stable graph plus visible edge IDs.
- Add UI state for selected graph detail level.
- Preserve layout from containment child IDs, not from the visible relation edge
  set.
- Avoid extending the legacy 2D `projectGraph` path for 3D relation behavior.

Verification:
- Unit tests for each detail level.
- Existing selection index tests should still pass.
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`
- Manual 3D check that files still sit inside directories without visible
  file-to-directory edges.

### 3. Scene Relation Edge Styling

- Add edge style mapping by relation kind.
- Keep containment and relation edge materials separate enough to update
  opacity/color without rebuilding the whole graph.
- Keep ID-map selection support for relation edges.
- Add selected relation edge display in the existing side panel.
- Pass relation detail changes as edge visibility/style state so toggles do not
  rebuild node meshes or layout positions.
- Extract relation control/inspector markup out of `App.svelte` if adding it
  would materially increase that component's responsibility.
- Extract relation edge creation/update planning out of
  `ThreeDirectoryGraphScene.ts` if relation rendering adds more than a narrow
  adapter over existing edge objects.

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`
- `npm run build`
- Manual interaction check for relation detail controls inside the 3D workspace:
  pointer capture/release, focus/blur, keyboard operation, and parent pan/orbit
  conflicts.

### 4. Rust Import Relations

- Use the existing Rust extractor as the first analyzer source.
- Normalize current file-level import edges into the new relation snapshot.
- Keep internal extraction available for evidence and source snippets.
- Treat unresolved imports as diagnostics.
- Implement relation accumulation in a focused Rust relation module instead of
  adding more responsibilities to `extraction.rs`.

Verification:
- Backend tests with a small Rust fixture containing `mod`, `use`, and nested
  module files.
- Vertical slice acceptance check from fixture repository to relation snapshot
  to frontend render graph adapter.
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `npm run test:frontend`

### 5. Rust Call Relations

- Resolve function and method definitions to owning files.
- Collapse function-to-function calls into file-to-file `calls` edges.
- Attach evidence with caller range, callee label, target range when
  known, and analyzer provenance.
- Start with exact calls from rust-analyzer where available and partial calls
  from `syn` fallback.
- Measure or at least record representative latency before expanding
  per-file rust-analyzer subprocess usage.

Verification:
- Backend fixture with calls across files.
- Test that multiple calls between the same two files produce one weighted edge
  with multiple evidence records.
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`

### 6. Rust Data And Ownership Relations

- Add Rust-specific evidence for type references, reads, writes, borrows,
  mutable borrows, and copies.
- Normalize into shared edge kinds.
- Mark facts as `partial` unless rust-analyzer or compiler-backed analysis can
  prove the access mode.

Verification:
- Backend fixture for shared structs, immutable borrow, mutable borrow, and
  copied values.
- Diagnostic test for unresolved or ambiguous ownership facts.
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`

### 7. Multi-Language Analyzer Registration

- Add an analyzer registry keyed by language and file extension.
- Let each analyzer return normalized facts.
- Add diagnostics for files skipped because no analyzer is registered.
- Keep the frontend unchanged when a new analyzer is added.

Verification:
- Unit test that mixed file sets dispatch to the expected analyzers.
- Snapshot test that unknown languages do not break graph generation.
- Dependency review for any newly introduced analyzer/parser dependency.
- `cargo fmt --all -- --check`
- `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- `cargo test --workspace`
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`

## Implementation Log

### 2026-05-17 Slice 1: Contract Foundation

Status: completed.

Implemented:
- Split generic source-root validation from Cargo-manifest validation so future
  relation graph commands can validate mixed-language roots without inheriting
  Rust-only assumptions.
- Added backend-owned `FileRelationGraphSnapshotDto` relation contracts in a
  focused graph module rather than expanding the existing graph module body.
- Added a structure-only `load_file_relation_graph` vertical path that promotes
  directory graph facts into the relation graph contract while Rust import/call
  extraction remains pending.
- Added TypeScript DTO mirrors and a frontend render adapter that normalizes
  legacy directory `tree` edges to render-facing `contains` edges and preserves
  relation edge metadata.

Discovered issues:
- The existing directory graph command still emits `tree` on the wire. This is
  retained for compatibility, but all render-facing graph code should use
  `contains` after adapter normalization.
- Relation detail names should stay close to current edge categories for V0.
  The plan now uses `data`, `tests`, `configuration`, and `contracts` instead
  of broader names that would need a second mapping table immediately.
- A contract-only Rust module fails the standards gate under `clippy
  -D warnings` as dead code. The slice therefore includes a structure-only
  backend command path that exercises the relation DTOs without adding fake
  semantic edges.

Validation:
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`

### 2026-05-17 Slice 2: Frontend Relation Visibility Foundation

Status: completed.

Implemented:
- Added pure relation detail visibility helpers that derive visible edge ID sets
  from stable render graphs.
- Extended selection indexing to accept visible edge IDs so hidden relation
  edges do not affect neighborhoods, highlighted edges, or graph-distance
  styling.
- Kept relation detail filtering outside the Three.js scene and outside the
  render graph object so future toggles can update interaction state without
  forcing a node/layout rebuild.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`

### 2026-05-17 Slice 3: Scene File Containment Edge Visibility

Status: completed.

Implemented:
- Added a pure scene visibility helper that keeps directory containment and
  file-to-file relation edges renderable while hiding file containment edges.
- Updated the Three.js scene rebuild path to skip hidden file containment edge
  geometry and selection meshes without mutating the stable render graph.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`

### 2026-05-17 Slice 4: Rust Import Relation Facts

Status: completed.

Implemented:
- Added a Rust import relation extractor that walks Rust source files, parses
  `use` items with existing `syn` support, and emits file-scoped import facts.
- Resolved local `crate::`, `self::`, `super::`, and simple module imports to
  target Rust files where possible.
- Kept unresolved explicit local imports as facts plus diagnostics, while
  excluding standard library imports from local relation output.

Discovered issues:
- Import extraction facts are intentionally not yet folded into
  `FileRelationGraphSnapshotDto`; that remains the next integration slice so
  extraction and graph normalization stay separately reviewable.

Validation:
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml analyzer::rust_relations`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`

### 2026-05-17 Slice 5: Rust Import Relation Graph Integration

Status: completed.

Implemented:
- Folded Rust import extraction facts into `FileRelationGraphSnapshotDto` as
  weighted `imports` file-to-file edges with bounded evidence samples.
- Extended `load_file_relation_graph` so the command returns directory
  structure plus Rust import relations in one snapshot.
- Preserved unresolved local imports as diagnostics and skipped them as edges.

Validation:
- `cargo fmt --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`
- `npm run typecheck`
- `npm run test:frontend`

### 2026-05-17 Slice 6: Frontend Relation Graph Consumption

Status: completed.

Implemented:
- Added transient frontend store state for `FileRelationGraphSnapshotDto`.
- Changed the 3D graph load path to call `load_file_relation_graph` and adapt
  relation snapshots into the existing render graph.
- Updated the inspector/counts so loaded relation graphs show analyzer,
  diagnostic, edge kind, and evidence-count context without requiring the old
  directory snapshot shape.

Validation:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`

## Re-Plan Triggers

- `GraphSnapshotDto`, `DirectoryGraphSnapshotDto`, and
  `FileRelationGraphSnapshotDto` start duplicating enough behavior that a
  contract split or deprecation path is required.
- Relation detail toggles still trigger full Three.js node/layout rebuilds.
- Source-root validation changes break existing Cargo repository flows.
- Rust analyzer process usage creates unacceptable latency or unowned child
  process lifecycle risk.
- Evidence payloads exceed practical IPC or inspector rendering limits despite
  sampling.
- New UI controls cannot be made keyboard-accessible without restructuring the
  graph workspace controls.
- A planned analyzer dependency exceeds dependency standards thresholds or
  duplicates existing project capability.
- Cross-layer acceptance tests reveal contract drift between Rust serde output
  and TypeScript DTO mirrors.
- Implementation touches large files past decomposition thresholds without a
  clear split or documented exception.

## Open Design Questions

- Should cross-file relation snapshots be generated on demand for the selected
  detail level, or should the backend send all relations and let the frontend
  filter? Start with all relations for simplicity; revisit if IPC payloads get
  large.
- Should the directory graph command evolve into the file relation command, or
  should both commands remain? Start with both so the current graph remains
  stable while the new contract lands.
- What should the initial evidence sample cap be? Start with a small fixed cap
  such as 10 records per edge, preserve the full count in `evidence_count`, and
  revisit if the inspector needs on-demand expansion.
- Should external package/library imports become nodes? Not for V0. Keep them
  as diagnostics or optional evidence until local file-to-file relations are
  solid.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Relation edges overwhelm the 3D scene | High | Detail levels, default hidden file containment edges, edge weighting, and later edge bundling. |
| Analyzer contracts drift by language | High | All analyzers emit one normalized file relation DTO and diagnostics. |
| Rust ownership facts are overclaimed | High | Use confidence aggressively; report partial/inferred when not compiler-backed. |
| Layout changes when filters change | Medium | Layout from containment graph; filter only renderable/interactive relation edges. |
| Selection neighborhoods include hidden facts | Medium | Build selection index from the stable graph plus visible edge ID sets. |
| IPC payloads become too large | Medium | Collapse facts into weighted file edges and keep evidence cap/streaming as revisit trigger. |

## Final Standards Gate

Before treating the feature as complete:
- `git status --short` shows no unrelated implementation changes.
- Rust and TypeScript DTO mirrors are changed together for every wire contract
  update.
- Touched source directories have README or ADR updates explaining new
  responsibilities and contracts.
- At least one vertical slice acceptance check proves backend relation
  extraction reaches frontend render graph normalization.
- Relation detail controls pass labeled-control and keyboard interaction
  checks.
- Baseline verification passes:
  - `cargo fmt --all -- --check`
  - `cargo clippy --workspace --all-targets --all-features -- -D warnings`
  - `cargo test --workspace`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test:frontend`
  - `npm run build`

## Completion Criteria

- File-to-directory edges are no longer visibly drawn when files are contained
  inside directory spheres.
- The 3D graph can display file-to-file imports and calls as relation edges.
- Relationship detail level changes update visible edges without changing the
  directory/file layout.
- Rust import and call relationships are normalized into the same API future
  TypeScript, JavaScript, Python, and C# analyzers will use.
- Edge selection can explain why the edge exists through evidence records.
- File-internal graph rendering remains out of scope for this plan and is
  reserved for a later focused selected-file view.
- Tests cover DTO serialization, adapter normalization, detail filtering, and
  Rust relation extraction.
