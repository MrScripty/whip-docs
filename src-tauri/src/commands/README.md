# src-tauri/src/commands

## Purpose
This directory contains Tauri command adapters and command-facing DTOs.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `mod.rs` | Initial app-state type and app status command. |

## Problem
Frontend IPC needs a stable Rust boundary while backend services retain
ownership of repository configuration, graph snapshots, and analyzer lifecycle.

## Constraints
- All command inputs are untrusted.
- Commands remain thin and delegate to service modules.
- Command errors preserve backend error categories.

## Decision
Keep command registration and DTO projection here, and move durable behavior
into `config`, `graph`, `source`, or `analyzer` modules.

## Alternatives Rejected
- Let frontend services construct local source paths: rejected by path security
  requirements.
- Put rust-analyzer process logic in commands: rejected because lifecycle needs
  a dedicated owner.

## Invariants
- Boundary validation happens before filesystem or subprocess access.
- Command DTOs are serializable and version-aware when persisted or reused.
- Command handlers do not hold locks across long async work.

## Revisit Triggers
- Command count grows enough to require per-feature submodules.
- Generated schemas replace hand-written DTO mirrors.
- Error envelopes become a shared graph/config contract.

## Dependencies
**Internal:** app state and backend service modules.
**External:** Tauri and serde.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: command contract ADR is planned after core DTOs stabilize.
- Revisit trigger: `GraphSnapshotDto` and `CommandErrorDto` are implemented.

## Usage Examples
```rust
#[tauri::command]
pub fn get_app_status(state: tauri::State<'_, std::sync::Arc<AppState>>) -> AppStatusDto {
    AppStatusDto {
        app_name: "Whip Docs",
        active_product: "local_architecture_analyzer",
        shutdown_requested: state.shutdown_requested(),
    }
}
```

## API Consumer Contract
- Inputs: Tauri invoke payloads and managed app state.
- Outputs: serde DTOs returned to the frontend adapter.
- Lifecycle: commands may request work but do not own app shutdown.
- Errors: recoverable failures return structured command errors once error DTOs
  are introduced.
- Compatibility: command names and payload shapes are frontend-visible
  contracts.

## Structured Producer Contract
- Stable fields: command response fields are consumed by TypeScript adapters.
- Defaults: command DTOs do not invent frontend-only defaults.
- Enum semantics: command enum labels must be documented before frontend use.
- Compatibility: breaking DTO changes update Rust, TypeScript, tests, and docs
  together.
- Regeneration or migration: future schema generation must preserve existing
  command compatibility or document the break.

