# src/lib/api

## Purpose
This directory exports frontend API type helpers that mirror backend-owned Tauri
command contracts.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `index.ts` | Public export point for frontend API helper types mirrored from backend adapters. |

## Problem
Frontend services need one place to import command DTO helpers without reaching
into implementation-specific adapter files.

## Constraints
- DTO helpers must not invent backend defaults.
- Wire-format changes need matching Rust and TypeScript updates.
- Runtime validation still belongs at the Rust command boundary.

## Decision
Start with a small export module and add normalization helpers only when the
wire shape requires explicit mapping.

## Alternatives Rejected
- Duplicate DTO types in every service: rejected because it encourages drift.
- Add schema generation before DTOs stabilize: rejected until Milestone 2
  freezes graph/config/error contracts.

## Invariants
- Exported names match the backend contract vocabulary.
- Helpers are pure and side-effect free.
- Backend-owned fields are not defaulted in this layer.

## Revisit Triggers
- JSON schema generation is adopted.
- Graph DTOs gain compatibility migrations.
- Command payloads need runtime validation in TypeScript for developer feedback.

## Dependencies
**Internal:** `src/backends`.
**External:** TypeScript.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: DTO helper shape is provisional until Milestone 2.
- Revisit trigger: graph DTO ADR is written.

## Usage Examples
```ts
import type { AppStatusDto } from './api';
```

## API Consumer Contract
- Inputs: backend DTO definitions from adapter modules.
- Outputs: type exports and future normalization helpers.
- Lifecycle: no retained resources.
- Errors: future normalization errors must preserve command context.
- Compatibility: DTO type changes require command contract updates.

## Structured Producer Contract
- Stable fields: exported TypeScript type names are consumed by services.
- Defaults: no default values are produced here.
- Enum semantics: mirror backend enum labels unless a display helper explicitly
  maps them.
- Compatibility: type changes must be coordinated with Rust DTO changes.
- Regeneration or migration: generated bindings may replace these exports later.
