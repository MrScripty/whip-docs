# src/lib

## Purpose
This directory groups frontend helper modules that support the app shell without
owning Tauri transport or backend analysis policy.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `api/` | DTO helper exports and future transport normalization. |
| `stores/` | Svelte stores for transient view state. |
| `components/` | Shared presentation components. |
| `services/` | Frontend service facades over backend adapters. |
| `graph-v0/` | Pure layout and ID-map selection helpers for the V0 3D directory/file graph. |

## Problem
Frontend helpers need discoverable boundaries so parsing, transport, rendering,
and view-state responsibilities do not collapse into large components.

## Constraints
- Helpers may not become a second source of graph truth.
- Backend-owned DTO normalization must remain explicit.
- Shared helpers need colocated tests when behavior is non-trivial.

## Decision
Use small subdirectories by role and promote helpers into more specific modules
as the analyzer UI grows.

## Alternatives Rejected
- Put all helpers beside `App.svelte`: rejected because graph interactions and
  services will outgrow a single component boundary.
- Create a reusable package now: rejected because Whip Docs has no second graph
  consumer yet.

## Invariants
- `api/` contains contract helpers, not command execution.
- `graph-v0/` contains pure projection helpers, not Three.js objects or Svelte
  components.
- `stores/` owns only transient UI state.
- `services/` delegates backend communication to `backends/`.

## Revisit Triggers
- Helpers become reusable outside the app.
- A subdirectory accumulates unrelated responsibilities.
- A helper starts requiring backend policy knowledge.

## Dependencies
**Internal:** `src/backends`, Svelte components, and backend DTO types.
**External:** Svelte and TypeScript.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: helper boundaries are part of the initial scaffold.
- Revisit trigger: the frontend graph contract is frozen.

## Usage Examples
```ts
export * from './api';
```

## API Consumer Contract
- Inputs: frontend-local DTOs and state values.
- Outputs: helper results consumed by components and services.
- Lifecycle: helpers with timers or subscriptions must expose cleanup.
- Errors: helpers preserve backend error context when transforming results.
- Compatibility: helper exports should change with their consumers in the same
  commit.

## Structured Producer Contract
- Stable fields: none currently produced from this directory.
- Reason: current files are scaffold exports only.
- Revisit trigger: saved view settings or graph layout metadata are introduced.
