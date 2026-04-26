# src/lib/components

## Purpose
This directory will contain shared Svelte presentation components used by the
architecture explorer UI.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `index.ts` | Placeholder export point for future shared components. |

## Problem
Reusable UI pieces need a boundary that does not mix rendering with backend
analysis, Tauri transport, or graph extraction.

## Constraints
- Components render props/state declaratively.
- Components do not call Tauri commands directly.
- Imperative graph/canvas integrations must be isolated and cleaned up.

## Decision
Keep shared presentation components here and place app composition in
`App.svelte`.

## Alternatives Rejected
- Rebuild the old HTML fragments: rejected because they rely on runtime DOM
  injection.
- Put backend services in components: rejected because it obscures transport
  ownership and testing.

## Invariants
- Components receive data through props or stores.
- Components expose events or callbacks for user actions.
- Components do not own durable graph state.

## Revisit Triggers
- A component becomes specific to a single feature and should move closer to its
  owner.
- A graph renderer needs a dedicated integration boundary.
- Shared components become a reusable package.

## Dependencies
**Internal:** frontend stores and services.
**External:** Svelte.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: component inventory is still scaffold-level.
- Revisit trigger: graph component architecture is selected.

## Usage Examples
```ts
export {};
```

## API Consumer Contract
- Inputs: Svelte props, slots, and UI events.
- Outputs: rendered UI and component events.
- Lifecycle: components clean up listeners, observers, and timers on destroy.
- Errors: display components receive already-shaped error state.
- Compatibility: exported component props are changed with their callers.

## Structured Producer Contract
- Stable fields: none currently produced from this directory.
- Reason: no machine-consumed component metadata exists.
- Revisit trigger: components publish registry metadata or saved layouts.

