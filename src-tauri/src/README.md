# src-tauri/src

## Purpose
This directory owns Whip Docs desktop backend composition, Tauri command
transport, local app lifecycle, and app-specific service wiring.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `main.rs` | Thin launcher and module declaration surface. |
| `app_setup.rs` | Tauri builder setup, managed state, plugins, and command registration. |
| `app_lifecycle.rs` | Shutdown entrypoint for active jobs and subprocess cleanup. |
| `commands/` | Tauri command adapters and command DTOs. |
| `graph/`, `config/`, `analyzer/`, `source/` | Backend service boundaries for the analyzer product. |

## Problem
The desktop backend must compose Tauri, local repository configuration,
rust-analyzer, graph snapshots, and frontend IPC without moving core analysis
policy into command handlers.

## Constraints
- Command handlers are adapters over backend-owned services.
- rust-analyzer lifecycle is backend-owned.
- App-state locks must not be held across expensive async work.
- Startup and shutdown failures return structured errors where possible.

## Decision
Follow the Pantograph-style split: `main.rs` launches, `app_setup.rs` composes,
`app_lifecycle.rs` shuts down, and feature modules own domain/infrastructure
logic.

## Alternatives Rejected
- Inline all setup in `main.rs`: rejected because lifecycle and command
  registration will grow during the analyzer implementation.
- Put parser policy directly in commands: rejected because tests and future
  non-Tauri consumers need the same backend behavior.

## Invariants
- `main.rs` remains a small launcher.
- Command modules validate boundary input and delegate work.
- Long-lived tasks and child processes are tracked by an owner.
- Production paths do not use `unwrap()` or `expect()` for recoverable failure.

## Revisit Triggers
- Analyzer services become reusable outside Tauri.
- A command starts accumulating graph extraction policy.
- Shutdown needs asynchronous task draining beyond the current hook.

## Dependencies
**Internal:** `src-tauri` config, frontend command adapters, graph/analyzer modules.
**External:** Tauri, Tokio, serde.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: ownership ADR is scheduled after core contracts are frozen.
- Revisit trigger: Milestone 2 freezes graph/config/error contracts.

## Usage Examples
```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![])
    .run(tauri::generate_context!())?;
```

## API Consumer Contract
- Inputs: Tauri invoke payloads and lifecycle events.
- Outputs: command DTOs, app state, diagnostics, and shutdown behavior.
- Lifecycle: setup creates shared services; shutdown requests cleanup through
  `app_lifecycle`.
- Errors: backend errors stay categorized when mapped to command responses.
- Compatibility: command DTO changes require matching frontend adapter changes.

## Structured Producer Contract
- Stable fields: command DTOs and app status payloads are machine-consumed.
- Defaults: config defaults live with config owners.
- Enum semantics: command labels and DTO enum strings are compatibility values.
- Compatibility: command response changes require frontend tests.
- Regeneration or migration: generated schema adoption must replace manual DTOs
  in one coordinated slice.

