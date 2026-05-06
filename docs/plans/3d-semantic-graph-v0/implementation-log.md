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

## Discovered Issues

| Date | Area | Issue | Follow-up |
| ---- | ---- | ----- | --------- |
| 2026-05-06 | Source validation | V0 directory graph loading currently reuses `ValidatedRepoPath::parse_existing_cargo_repo`, so non-Cargo and mixed-language repositories cannot be opened even though later V0 work should support them. | Add a validated local-repository root type that does not require `Cargo.toml`, then keep the Cargo-specific validator for Rust analyzer entry points. |
| 2026-05-06 | Frontend bundling | `npm run build` succeeds but Vite reports the main JavaScript chunk is above 500 kB after adding Three.js. | Add route-level or scene-level dynamic import/code splitting before expanding renderer dependencies further. |
| 2026-05-06 | Renderer verification | Playwright is not installed in the repo, so automated desktop/mobile screenshot and canvas-pixel verification is not available yet. | Add a Playwright smoke test harness for the Three.js scene before expanding scene interaction and selection behavior. |
| 2026-05-06 | Large repo loading | Pantograph contained a checked-out `.venv` with roughly 59k files; the first V0 renderer tried to load all emitted directory/file nodes and could lock the UI. | Continue expanding backend exclusion rules and add progressive/viewport-scoped rendering before attempting very large unfiltered graphs. |
