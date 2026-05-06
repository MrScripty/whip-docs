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

## Discovered Issues

| Date | Area | Issue | Follow-up |
| ---- | ---- | ----- | --------- |
| 2026-05-06 | Source validation | V0 directory graph loading currently reuses `ValidatedRepoPath::parse_existing_cargo_repo`, so non-Cargo and mixed-language repositories cannot be opened even though later V0 work should support them. | Add a validated local-repository root type that does not require `Cargo.toml`, then keep the Cargo-specific validator for Rust analyzer entry points. |
| 2026-05-06 | Frontend bundling | `npm run build` succeeds but Vite reports the main JavaScript chunk is above 500 kB after adding Three.js. | Add route-level or scene-level dynamic import/code splitting before expanding renderer dependencies further. |
| 2026-05-06 | Renderer verification | Playwright is not installed in the repo, so automated desktop/mobile screenshot and canvas-pixel verification is not available yet. | Add a Playwright smoke test harness for the Three.js scene before expanding scene interaction and selection behavior. |
