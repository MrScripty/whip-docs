# src/lib/graph-v0

## Purpose
This directory owns pure frontend helpers for the V0 3D directory/file graph
projection.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `types.ts` | Render-facing graph, layout, vector, and ID-map selection types. |
| `constants.ts` | Centralized layout geometry, scene styling, camera, interaction, depth, and selection constants. |
| `adapters.ts` | Directory graph DTO to render graph normalization. |
| `layouts.ts` | Deterministic directory/file graph layout algorithms. |
| `neighborhood.ts` | Selected-node first/second level neighborhood highlighting and labeling sets. |
| `selectionIndex.ts` | Derived graph selection indexes, indexed neighborhood lookup, and selection-state diff helpers. |
| `selection.ts` | ID-map selection encoding, decoding, and sampled hit testing. |
| `ThreeDirectoryGraphScene.ts` | Direct Three.js scene system for the V0 directory/file graph. |
| `*.test.ts` | Node test coverage for layout determinism and selection behavior. |
| `index.ts` | Public exports for graph V0 helpers. |

## Problem
The Three.js scene needs deterministic layout and selection behavior without
letting Svelte components or renderer code invent graph facts.

## Constraints
- Layout, adapter, and selection helpers are pure TypeScript and do not import
  Three.js or Svelte.
- The scene system may import Three.js directly but must not depend on Svelte
  components.
- Backend graph snapshots remain the source of graph truth.
- Selection indexes are derived frontend view state and can be rebuilt from the
  render graph at any time.
- Layout algorithms must be deterministic for equivalent graph inputs.
- Selection helpers operate on renderer-provided ID/depth buffers only.

## Decision
Keep layout, DTO adaptation, selection indexing, and ID-map selection as tested
pure helpers. Keep Three.js object lifecycle in a scene class that Svelte
mounts and disposes.

## Alternatives Rejected
- Put layout math inside Svelte components: rejected because component state and
  graph projection math would become coupled.
- Put layout math inside Three.js object classes: rejected because algorithms
  must be testable without a WebGL renderer.

## Invariants
- Layout helpers return positions keyed by stable backend node IDs.
- Child ordering is deterministic and sorts directories before files.
- Radial and layered-grid layout helpers branch by the render graph's
  parent/child structure; they do not special-case directories or files when
  grouping descendants.
- Radial branches use parent-local child rings whose radius grows with sibling
  subtree footprint and spacing. Layered-grid branches use parent-local x/z
  grids with subtree footprints so branches can occupy actual 3D space.
- ID-map selection gives visible nodes priority over visible edges, then uses
  depth and distance as tie breakers.
- Scene click selection falls back to Three.js raycasting if the ID-map sample
  misses.
- Three.js renderer resources are disposed by the scene class, not Svelte
  component code.
- Scene labels are bounded to repo, nearby directories, highlighted nodes, and
  selected nodes.
- Selecting a node highlights the node, highlights its immediate edges, and
  labels first- and second-level connected nodes.
- Indexed selection lookup must not rescan all graph edges for each selected
  node.
- Selection/highlight changes restyle existing Three.js objects in place;
  full geometry rebuilds are reserved for graph or layout algorithm changes.
- Scene controls are centralized in the scene system: left click selects,
  left drag orbits, middle/right drag pans, and Shift/Alt-left drag also pans.
- Pressing `.` centers the 3D camera on the selected node, or the graph root
  when no node is selected.

## Revisit Triggers
- Layout options become persisted user settings.
- Directory/file graph rendering starts using semantic edges.
- ID-map selection needs multi-hit inspection instead of a single best hit.

## Dependencies
**Internal:** backend directory graph DTO shape after frontend adapter
normalization.
**External:** TypeScript and Node test runner.

## Related ADRs
- None identified as of 2026-05-06.
- Reason: this is V0 renderer support code under the existing Tauri/Svelte
  architecture direction.
- Revisit trigger: renderer abstraction or graph API contract is frozen.

## Usage Examples
```ts
import { DirectoryGraphScene, layoutRadialTree, selectFromIdMap } from './graph-v0';
```

## API Consumer Contract
- Inputs: render graph snapshots normalized from backend-owned graph data.
- Outputs: deterministic layout positions and selection hits.
- Lifecycle: helpers have no subscriptions, timers, or renderer resources.
- Errors: invalid graph roots or out-of-range selection IDs throw immediately.
- Compatibility: exported type changes must update scene, store, and tests in
  the same slice.

## Structured Producer Contract
- Stable fields: layout node positions include node ID, position, radius, depth,
  and order.
- Defaults: layout and selection defaults live in `constants.ts`.
- Enum semantics: node and edge kind labels mirror the backend V0 graph
  contract after adapter normalization.
- Compatibility: add fields where possible; breaking return shape changes need
  coordinated renderer updates.
- Regeneration or migration: no generated artifacts are produced here.
