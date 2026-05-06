# 3D Semantic Graph V0 Selection Index Plan

## Objective

Make graph selection scale by treating clicks and highlight changes as indexed
view-state updates, not graph or scene rebuilds.

Selection must be able to move from a clicked node or edge to its forward and
backward relationships with near-instant lookup. This is required before adding
function, struct, impl, and call/reference layers because those layers will
multiply graph size and edge density.

## Current State

Completed implementation slices since the initial V0 plan:

- Backend directory/file graph DTOs and deterministic tree graph loading.
- Async `load_directory_graph` command with filesystem traversal moved to
  `spawn_blocking`.
- Frontend V0 render graph helpers, deterministic radial/grid layouts, and
  ID-map selection helpers.
- Direct Three.js scene system mounted from Svelte.
- 3D scene owns the center workspace once directory graph data is loaded.
- Pan/orbit/zoom controls are implemented in the scene system.
- Click selection uses ID-map sampling with raycast fallback.
- Selected-node first/second-level neighborhood labels and edge highlights are
  available.
- Pantograph large local dependency directories are filtered from V0 directory
  graph traversal.
- Profiling showed pure graph layout/neighborhood math is sub-frame on the
  current Pantograph-sized V0 graph, while selection response was slowed by
  scene object churn.
- The latest optimization avoids full geometry rebuilds for selection changes,
  but it still iterates broad scene maps to apply selection state.

## Scope

### In Scope

- Add a dedicated pure TypeScript selection index for V0 render graphs.
- Index nodes, edges, incident edges, adjacent nodes, and first/second-level
  neighborhoods.
- Add selection-state diff helpers so only changed nodes, edges, and labels are
  restyled.
- Keep backend graph facts immutable during selection.
- Keep Svelte responsible only for transient selected node/edge state and
  passing index-derived sets into the scene.
- Keep Three.js object lookup and styling inside the scene system.
- Add unit tests for index construction, bidirectional adjacency, neighborhood
  lookup, and selection diffs.
- Add profiling notes or focused checks that demonstrate selection no longer
  requires full graph traversal for each click.

### Out Of Scope

- Adding Rust symbol/function/struct parsing.
- Adding rust-analyzer call/reference relationships.
- Persisting selection state.
- Replacing the Three.js renderer.
- Full viewport culling or progressive graph streaming.
- Playwright screenshot/canvas-pixel automation; this remains a known follow-up
  until the test harness exists.

## Milestones

### 1. Pure Selection Index Contract

Tasks:
- Add `src/lib/graph-v0/selectionIndex.ts`.
- Define index shape:
  - `nodeById`
  - `edgeById`
  - `incidentEdgeIdsByNodeId`
  - `adjacentNodeIdsByNodeId`
  - `edgeIdsByNodePair`
- Provide lookup helpers:
  - `buildSelectionIndex(graph)`
  - `selectionNeighborhood(index, selectedNodeId)`
  - `selectionStateForNode(index, selectedNodeId)`
  - `diffSelectionState(previous, next)`
- Replace or delegate the existing `neighborhood.ts` logic to the index so
  neighborhood calculation does not rescan every edge per selection.

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`
- Unit tests for parent, child, and sibling traversal.
- Unit tests proving first-level and second-level sets are bidirectional.
- Unit tests proving diff output contains only entered/exited node, edge, and
  label IDs.

### 2. App-Level Index Integration

Tasks:
- Build the selection index only when `directoryRenderGraph` changes.
- Derive selected-node neighborhood from the index instead of from raw graph
  scans.
- Keep selected node/edge IDs as transient Svelte state.
- Preserve existing side-panel selected node and edge display.

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`
- Existing graph helper tests still pass.
- Add tests only to pure helpers; avoid Svelte component coupling unless a
  behavior regression requires it.

### 3. Scene-Level Incremental Styling

Tasks:
- Add scene-owned active selection state:
  - active highlighted node IDs
  - active highlighted edge IDs
  - active labeled node IDs
- Apply `diffSelectionState` output to update only changed scene objects.
- Keep structural rebuilds limited to graph identity or layout algorithm
  changes.
- Keep label sprite creation/removal limited to changed label IDs.
- Ensure ID-map/raycast target lookup maps remain built once per structural
  rebuild.

Verification:
- `npm run lint`
- `npm run typecheck`
- `npm run test:frontend`
- `npm run build`
- Add pure tests for the selection-state diff. If scene-specific behavior needs
  coverage, extract the update planner to a testable helper instead of testing
  WebGL directly in Node.

### 4. Performance Measurement Update

Tasks:
- Re-run the current Pantograph-sized pure graph benchmark.
- Add a lightweight dev-only measurement note or documented manual profiling
  path for scene selection updates.
- Record results in `implementation-log.md`.

Verification:
- Document measured node/edge count and timings.
- Confirm no new plan issues are discovered, or record them in the discovered
  issues table.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| ---- | ------ | ---------- |
| Selection index duplicates backend-owned graph truth | Medium | Treat the index as derived, rebuildable frontend view state. Do not mutate graph DTOs. |
| Scene and app indexes drift | Medium | Keep graph relationship index pure in `selectionIndex.ts`; keep Three.js object index private to `ThreeDirectoryGraphScene`. |
| Diff logic misses a previously highlighted object | Medium | Unit test entered/exited sets and use active-set replacement only after updates complete. |
| Label churn remains expensive on dense selections | Medium | Label only selected, first-level, and second-level nodes for V0; add capping if a selected node exceeds a threshold. |
| No browser-level smoke automation | Medium | Keep logic in pure helpers where possible; keep Playwright smoke harness as a tracked follow-up. |

## Re-Plan Triggers

- Selection of one node can still visibly stall on the Pantograph graph.
- A selected node has enough neighbors that first/second-level labels overwhelm
  the scene.
- Function/struct layers require relationship types that tree-only adjacency
  cannot represent cleanly.
- Scene object update planning cannot be tested without introducing browser
  automation.
- A new renderer approach changes scene lifecycle ownership.

## Completion Criteria

- Selection lookup is backed by a dedicated index, not repeated full edge scans.
- Selection style updates touch only changed node, edge, and label sets.
- Clicking a node highlights the selected node, its immediate edges, and labels
  first/second-level connected nodes.
- Layout or graph changes still rebuild structure deterministically.
- Tests cover index construction, neighborhood lookup, and diff behavior.
- The implementation log records verification and any new issues.

## Standards Compliance Check

| Standard | Requirement Applied | Plan Response |
| -------- | ------------------- | ------------- |
| `PLAN-STANDARDS.md` | Multi-file staged work needs objective, scope, milestones, verification, risks, re-plan triggers, and completion criteria. | This file records those sections and keeps the next implementation as ordered thin slices. |
| `FRONTEND-STANDARDS.md` | Direct DOM/WebGL access must be isolated, documented, and cleaned up. Prefer event-driven state updates over polling. | Three.js work remains isolated in `ThreeDirectoryGraphScene`; selection updates are event-driven from pointer input and Svelte state. No polling is introduced. |
| `ARCHITECTURE-PATTERNS.md` | Backend-owned graph data remains source of truth; frontend can own transient UI state and derived view indexes. | The selection index is rebuildable derived view state. Backend DTOs are not mutated. |
| `TESTING-STANDARDS.md` | Pure logic should have colocated unit tests; cross-layer changes need focused verification. | Selection index and diff logic will have colocated Node tests. Scene integration will be verified through lint/typecheck/build until Playwright exists. |
| `DOCUMENTATION-STANDARDS.md` | Source-directory README updates must capture new files and boundary decisions. | `src/lib/graph-v0/README.md` must be updated in the implementation slice that adds `selectionIndex.ts`. |
| `COMMIT-STANDARDS.md` | Commits must be atomic conventional commits and should not include command logs in commit bodies. | The implementation should use a focused commit such as `perf(graph): index selection updates`; verification details stay in the plan/log and final summary. |
