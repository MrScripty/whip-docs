# src

## Purpose
This directory contains the Svelte frontend for the local Whip Docs desktop
app. It renders backend-owned architecture snapshots and owns only browser-local
interaction state.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `App.svelte` | Application shell that composes the analyzer workspace. |
| `main.ts` | Browser entrypoint that mounts Svelte into `index.html`. |
| `styles.css` | App-wide layout and visual styling for the desktop shell. |
| `backends/` | Tauri transport adapters used by frontend services. |
| `lib/` | Frontend API, service, store, and component helper modules. |

## Problem
The old website mutated the DOM directly and fetched source from GitHub. The new
frontend needs a declarative app boundary that consumes local backend analysis
without becoming a second parser or source of truth.

## Constraints
- Persistent repository configuration and graph data come from Rust commands.
- Components must not call Tauri `invoke(...)` directly.
- UI state is limited to view concerns such as selection, filters, layout, and
  loading presentation.
- Direct DOM mutation is reserved for future isolated graph/canvas integration.

## Decision
Keep Svelte composition in this directory and route backend communication
through typed adapters and services. Move complex interaction behavior into
plain TypeScript helpers with colocated tests when it grows beyond component
event wiring.

## Alternatives Rejected
- Keep the static website scripts: rejected because GitHub source fetching and
  imperative DOM rendering conflict with the local desktop analyzer model.
- Put all UI state in Rust: rejected because browser-only layout and selection
  affordances do not need backend ownership.

## Invariants
- Durable graph snapshots are displayed only after backend confirmation.
- Frontend code does not read local files or construct source paths for snippets.
- Tauri transport details stay behind `backends/` or service modules.

## Revisit Triggers
- The graph viewer becomes reusable outside this app.
- Source analysis requires live subscriptions instead of explicit analyze
  commands.
- Component files begin owning parser or graph-normalization logic.

## Dependencies
**Internal:** `src-tauri` command contracts and frontend helper modules.
**External:** Svelte, Vite, TypeScript, Tauri JavaScript API.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: Contract and lifecycle ADRs are scheduled after graph DTOs are frozen.
- Revisit trigger: Milestone 2 freezes graph/config/error contracts.

## Usage Examples
```ts
import App from './App.svelte';
```

## API Consumer Contract
- Inputs: backend DTOs, Tauri command responses, and user interactions.
- Outputs: rendered graph workspace and frontend command requests.
- Lifecycle: components must clean up subscriptions and timers on teardown.
- Errors: backend error categories should remain visible to services and UI
  presenters.
- Compatibility: serialized DTO changes must update frontend types and tests in
  the same implementation slice.

## Structured Producer Contract
- Stable fields: none currently produced from this directory.
- Reason: the frontend scaffold does not yet publish templates or metadata.
- Revisit trigger: graph layout settings, saved filters, or templates become
  persisted artifacts.

