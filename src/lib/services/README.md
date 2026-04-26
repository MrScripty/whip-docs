# src/lib/services

## Purpose
This directory will contain frontend service facades that coordinate typed
backend adapters for the UI.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `ArchitectureService.ts` | Frontend service facade for app config, analyzer status, and source repository setup. |
| `ArchitectureService.test.ts` | Unit coverage for command error message preservation. |
| `index.ts` | Public service export point. |

## Problem
Components need ergonomic operations such as configure source repo, analyze,
load snapshot, and fetch snippet without knowing Tauri command names or backend
DTO details.

## Constraints
- Services delegate transport to `src/backends`.
- Services do not parse source code or persist backend-owned data.
- Services preserve backend error categories for UI presenters.

## Decision
Use service modules as the frontend application layer over typed backend
adapters.

## Alternatives Rejected
- Let stores call adapters directly for every operation: rejected because
  command sequencing and error shaping would be duplicated.
- Put service logic in Tauri adapters: rejected because adapters should remain
  transport-focused.

## Invariants
- Services can be tested with fake backend adapters.
- Services return backend-confirmed state for durable data.
- Long-running subscriptions expose an unsubscribe or cleanup method.

## Revisit Triggers
- Multiple backend transports are supported.
- Analyzer status becomes event-stream based.
- Service methods start duplicating backend policy.

## Dependencies
**Internal:** `src/backends`, `src/lib/api`, and UI stores.
**External:** TypeScript.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: service boundaries are scaffolded before analyzer DTOs exist.
- Revisit trigger: graph/config/error DTOs are frozen.

## Usage Examples
```ts
const service = new ArchitectureService();
const config = await service.getConfig();
const analyzer = await service.getAnalysisStatus();
```

## API Consumer Contract
- Inputs: UI-level requests and typed backend adapters.
- Outputs: frontend-ready DTOs or errors with backend context.
- Lifecycle: services own cleanup for subscriptions they create.
- Errors: backend validation errors remain distinguishable from transport
  failures.
- Compatibility: method contracts change with their store/component consumers.

## Structured Producer Contract
- Stable fields: none currently produced from this directory.
- Reason: services are not yet serializing metadata or config.
- Revisit trigger: services emit persisted view settings or cached snapshots.
