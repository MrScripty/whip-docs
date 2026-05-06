# 3D Semantic Graph V0 Implementation Log

## Completed Slices

### Backend Directory/File Graph Command

- Added backend-owned V0 directory/file graph DTOs and deterministic tree
  graph building.
- Added the `load_directory_graph` Tauri command so the frontend can request a
  directory/file snapshot without running rust-analyzer.
- Registered the command in Tauri setup.
- Updated backend module READMEs for the graph, command, and source boundaries.
- Verified with `cargo fmt` and `cargo test`.

### Frontend Graph Helper Foundation

- Added pure TypeScript render graph, layout, vector, and ID-map selection
  types.
- Added deterministic radial tree and layered grid layout helpers.
- Added selection ID encode/decode helpers and sampled ID-map hit testing with
  node-over-edge, depth, and distance ordering.
- Documented the `src/lib/graph-v0` boundary.
- Verified with `npm run lint`, `npm run typecheck`, and
  `npm run test:frontend`.

### First Visible 3D Directory Graph

- Added the frontend `load_directory_graph` adapter and service method.
- Added directory graph snapshot state separate from analyzer graph state.
- Added a DTO adapter from backend directory graph snapshots to V0 render graph
  data.
- Added a direct Three.js scene system mounted by Svelte for V0 directory/file
  graph rendering.
- Added layout selection between radial tree and layered grid.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### ID-Map Scene Selection

- Added an offscreen color-ID render pass for directory graph nodes and edges.
- Added click selection through the 2D ID-map sampling helper so visible
  camera-view occlusion determines the selected object.
- Added thicker invisible edge selection meshes so tree edges are selectable.
- Added selected node and selected edge state in the frontend graph store.
- Added side-panel directory graph selection details and node list selection.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Depth And Label Readability

- Added centralized depth fade and scene label styling constants.
- Added depth-based node/edge opacity and color desaturation.
- Added bounded 3D sprite labels for the repo, nearby directories, highlighted
  nodes, and selected nodes.
- Ensured label textures are disposed with scene materials.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Non-Blocking Directory Graph Loading

- Changed `load_directory_graph` to an async Tauri command.
- Kept source path validation at the command boundary.
- Moved directory graph filesystem traversal into `tokio::task::spawn_blocking`
  so graph loading does not occupy the async command path.
- Verified with `cargo fmt` and `cargo test`.

### Source Repo Load Hang Fix

- Added a Tauri runtime availability guard so plain browser tabs show a clear
  desktop-runtime message instead of waiting on unavailable backend commands.
- Added initial-load error handling so the title moves out of `Starting` when
  backend commands cannot run.
- Decoupled source repository save from the first 3D graph load so Set returns
  promptly and graph loading owns its own state.
- Added `.venv`, Python cache, Svelte build, and build-cache directory ignores
  to prevent local dependency trees from flooding the V0 graph.
- Verified with `cargo fmt`, `cargo test`, `npm run lint`,
  `npm run typecheck`, and `npm run test:frontend`.

### Scene Pan And Node Selection Controls

- Added explicit mouse control mapping for the 3D scene.
- Left click selects through the ID-map pass.
- Left drag orbits around the current camera target.
- Middle/right drag pans by moving both camera and target together.
- Shift/Alt-left drag also pans for trackpads and mice without middle buttons.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Node Neighborhood Highlighting

- Added a graph-neighborhood helper for selected-node first and second level
  connections.
- Selecting a node now highlights the node and its immediate edges.
- Selected, first-level, and second-level connected nodes are labeled.
- Scene click selection now falls back to Three.js raycasting when the ID-map
  sample misses.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Selection Response Profiling And Optimization

- Profiled a Pantograph-sized V0 render graph after ignore filtering: 2,071
  nodes and 2,070 edges.
- Measured pure graph work as low cost: radial layout averaged about 1.4 ms,
  layered grid averaged about 0.8 ms, and selected-node neighborhood averaged
  about 0.5 ms.
- Identified the slow path as full Three.js object teardown/rebuild on every
  selection state change.
- Split scene updates into structural rebuilds for graph/layout changes and
  in-place style updates for selection/highlight changes.
- Selection now restyles existing node/edge materials and recreates only the
  active label sprites.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Dedicated Selection Index Planning

- Captured the current selection-scaling concern: selection should not require
  repeated full graph scans or broad scene-map restyling.
- Added `selection-index-plan.md` for a dedicated derived frontend selection
  index, selection-state diffing, and scene-level incremental styling.
- Checked the plan against the repository planning, frontend, architecture,
  testing, documentation, and commit standards.

### Pure Selection Index Contract

- Added `selectionIndex.ts` as a pure frontend graph helper for derived
  selection lookup state.
- Indexed nodes, edges, incident edge IDs, adjacent node IDs, and edge IDs by
  unordered node pair.
- Added indexed first/second-level neighborhood lookup plus selection-state
  diff helpers for future incremental scene styling.
- Kept `graphNeighborhood` as a compatibility wrapper while moving relationship
  lookup behind the selection index.
- Updated graph-v0 documentation to capture the derived-index boundary.
- Verified with `npm run lint`, `npm run typecheck`, and
  `npm run test:frontend`.

### App-Level Selection Index Integration

- Built the directory graph selection index as derived app state only when the
  V0 render graph changes.
- Switched selected directory node and edge lookups from linear array searches
  to index lookups.
- Switched selected-node neighborhood derivation from raw graph scans to the
  dedicated selection index.
- Preserved transient selected node and edge Svelte stores and existing
  side-panel display behavior.
- Verified with `npm run lint`, `npm run typecheck`, and
  `npm run test:frontend`.

### Scene-Level Incremental Selection Styling

- Added scene-owned active selection state for highlighted nodes, highlighted
  edges, labeled nodes, selected node, and selected edge.
- Added a scene label index so selection updates can add, remove, or recreate
  only changed labels.
- Kept base repo and near-directory labels as structural scene state rebuilt
  only when the graph or layout changes.
- Changed selection-only scene updates to apply selection-state diffs plus
  old/new selected IDs instead of iterating every scene node and edge.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

### Selection Index Performance Measurement

- Ran a focused Node measurement against a deterministic 2,071-node /
  2,070-edge graph shape matching the current filtered Pantograph V0 graph
  scale.
- Measured `buildSelectionIndex` at about 1.91 ms average over 500 iterations.
- Measured indexed `selectionNeighborhood` at about 0.002 ms average over 500
  iterations.
- Measured `selectionStateForNode` plus `diffSelectionState` at about 0.008 ms
  average over 500 iterations.
- Confirmed selection lookup is now orders of magnitude below the previous
  roughly 0.5 ms full-scan neighborhood measurement for the same graph scale.
- Browser-level scene timing still needs Playwright or an in-app dev profiler;
  the existing renderer verification issue remains open for that harness.

### Branching Tree Layouts

- Changed radial tree layout from one global ring per depth to subtree-owned
  angular sectors based on render graph parent/child relationships.
- Changed layered grid layout from one global grid per depth to a deterministic
  layered tree layout where parents are centered over descendant branch spans.
- Kept grouping generic to `childIds` rather than directory/file-specific
  hierarchy so later symbol/consumer graphs can reuse the algorithms.
- Added layout tests proving radial descendants stay in their parent branch
  sector and layered branches do not overlap.
- Verified with `npm run lint`, `npm run typecheck`, `npm run test:frontend`,
  and `npm run build`.

## Discovered Issues

| Date | Area | Issue | Follow-up |
| ---- | ---- | ----- | --------- |
| 2026-05-06 | Source validation | V0 directory graph loading currently reuses `ValidatedRepoPath::parse_existing_cargo_repo`, so non-Cargo and mixed-language repositories cannot be opened even though later V0 work should support them. | Add a validated local-repository root type that does not require `Cargo.toml`, then keep the Cargo-specific validator for Rust analyzer entry points. |
| 2026-05-06 | Frontend bundling | `npm run build` succeeds but Vite reports the main JavaScript chunk is above 500 kB after adding Three.js. | Add route-level or scene-level dynamic import/code splitting before expanding renderer dependencies further. |
| 2026-05-06 | Renderer verification | Playwright is not installed in the repo, so automated desktop/mobile screenshot and canvas-pixel verification is not available yet. | Add a Playwright smoke test harness for the Three.js scene before expanding scene interaction and selection behavior. |
| 2026-05-06 | Large repo loading | Pantograph contained a checked-out `.venv` with roughly 59k files; the first V0 renderer tried to load all emitted directory/file nodes and could lock the UI. | Continue expanding backend exclusion rules and add progressive/viewport-scoped rendering before attempting very large unfiltered graphs. |
| 2026-05-06 | Selection scaling | Selection previously had optimized scene reuse, but the next scale target still needed a dedicated graph relationship index and selection-state diff so future symbol layers would not depend on repeated full graph scans. | V0 directory/file selection lookup is resolved by `selectionIndex.ts` and scene diff styling; revisit when function, struct, impl, or call/reference relationship layers are added. |
| 2026-05-06 | Layout scaling | Branching layered-grid layout now preserves tree grouping, but very wide trees can sprawl horizontally because wrapping/culling is not yet solved for subtree-preserving layouts. | Add configurable branch compaction or viewport-aware level collapse before relying on layered-grid for very large graphs. |
