# src/backends

## Purpose
This directory contains frontend transport adapters that convert typed frontend
method calls into Tauri command invocations.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `TauriArchitectureBackend.ts` | Tauri adapter for app status, app config, analyzer status, graph snapshot, analysis, and source repository path commands. |

## Problem
Svelte components need backend data, but direct `invoke(...)` calls spread IPC
details through the UI and make contract migration difficult.

## Constraints
- Every command payload crossing Tauri is untrusted until Rust validates it.
- Adapter methods must preserve backend DTO names and error categories.
- Components and stores consume adapter/service methods, not raw command names.

## Decision
Expose one typed adapter class per backend surface. Keep Tauri command names and
wire normalization here, then let services/components depend on typed methods.

## Alternatives Rejected
- Call `invoke(...)` from components: rejected because it couples presentation
  to transport details and weakens contract testing.
- Generate frontend bindings immediately: rejected until graph DTOs stabilize.

## Invariants
- Tauri command names are centralized in adapter methods.
- Adapter return types mirror backend DTOs.
- No adapter reads local files or GitHub URLs.

## Revisit Triggers
- A shared schema generator is introduced.
- Multiple transports are supported.
- Command DTOs become large enough to require generated type mirrors.

## Dependencies
**Internal:** backend command contracts from `src-tauri/src/commands`.
**External:** `@tauri-apps/api`.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: transport adapter shape follows the refactor plan.
- Revisit trigger: a second frontend transport appears.

## Usage Examples
```ts
const backend = new TauriArchitectureBackend();
const status = await backend.getAppStatus();
```

## API Consumer Contract
- Inputs: typed method parameters that represent frontend requests.
- Outputs: decoded command DTOs from Tauri.
- Lifecycle: adapters are stateless unless future event channels require
  explicit unsubscribe behavior.
- Errors: command failures must remain catchable by services without being
  collapsed into generic UI strings.
- Compatibility: command rename or DTO changes require adapter and tests in the
  same commit.

## Structured Producer Contract
- Stable fields: exported TypeScript DTO shapes are consumed by frontend
  services.
- Defaults: no local defaults are invented for backend-owned fields.
- Enum semantics: preserve backend casing until an explicit normalization helper
  documents a display-only mapping.
- Compatibility: DTO mirror changes must track Rust command changes.
- Regeneration or migration: future generated bindings replace hand-written DTOs
  in one coordinated slice.
