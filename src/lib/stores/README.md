# src/lib/stores

## Purpose
This directory will contain Svelte stores for transient architecture-view state.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `configStore.ts` | Transient frontend projection of backend app config and source path errors. |
| `index.ts` | Public store export point. |

## Problem
The graph UI needs local selection, filter, layout, and panel state without
persisting or mutating backend-owned graph facts.

## Constraints
- Stores must not persist repository configuration or graph snapshots.
- Stores must not perform Tauri `invoke(...)` calls.
- Any polling store needs explicit cleanup tests.

## Decision
Reserve this directory for view-state stores and keep backend communication in
services/adapters.

## Alternatives Rejected
- Store graph snapshots as mutable frontend truth: rejected because the backend
  owns analyzed data.
- Put all state in components: rejected because shared graph controls will need
  consistent selection/filter state.

## Invariants
- Store state is transient and reconstructable from backend DTOs plus user
  interaction.
- Timers or subscriptions expose deterministic teardown.
- Backend errors are represented, not swallowed.

## Revisit Triggers
- Saved view preferences become a product requirement.
- A store starts owning backend command sequencing.
- Polling is introduced for analyzer status.

## Dependencies
**Internal:** frontend services and Svelte components.
**External:** Svelte stores.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: no durable frontend state exists yet.
- Revisit trigger: saved graph layouts or persisted filters are added.

## Usage Examples
```ts
import { appConfig } from './stores';
```

## API Consumer Contract
- Inputs: backend snapshots and UI events.
- Outputs: Svelte-readable transient state.
- Lifecycle: subscriptions and timers must be released by the owner.
- Errors: store-visible errors remain tied to their backend operation.
- Compatibility: store shape changes require updating dependent components and
  tests.

## Structured Producer Contract
- Stable fields: none currently produced from this directory.
- Reason: store modules are not implemented yet.
- Revisit trigger: a store exports serialized settings or fixtures.
