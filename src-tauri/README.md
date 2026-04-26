# src-tauri

## Purpose
This directory contains the Tauri desktop application crate for Whip Docs.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `Cargo.toml` | Rust package manifest for the desktop app crate. |
| `tauri.conf.json` | Tauri build, window, and bundle configuration. |
| `capabilities/` | Tauri permission policy for the main window. |
| `src/` | Rust desktop backend source and command adapters. |

## Problem
Whip Docs needs a local desktop shell that can safely connect a Svelte frontend
to Rust repository analysis without exposing arbitrary filesystem or process
access to the renderer.

## Constraints
- Tauri commands validate IPC payloads in Rust.
- Frontend capabilities remain minimal.
- Startup and shutdown resources are owned by Rust app lifecycle code.

## Decision
Use one Tauri crate as the composition root and keep reusable analysis logic in
focused modules until separate crates are justified.

## Alternatives Rejected
- Keep a static browser site: rejected because local repository analysis needs a
  trusted backend boundary.
- Split into many crates immediately: rejected because the first implementation
  benefits from tighter iteration while contracts are still settling.

## Invariants
- Tauri capability configuration does not expose shell or arbitrary filesystem
  APIs to the frontend.
- `src/main.rs` stays thin.
- Long-lived subprocesses and background tasks have shutdown paths.

## Revisit Triggers
- Analyzer logic becomes reusable outside the desktop app.
- Tauri command DTOs need generated schemas.
- Platform-specific packaging requires separate build policy.

## Dependencies
**Internal:** root frontend build output and `src-tauri/src` modules.
**External:** Tauri 2, Tokio, serde.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: desktop shell boundary is currently defined by the refactor plan.
- Revisit trigger: graph/analyzer contracts are frozen.

## Usage Examples
```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

## API Consumer Contract
- Inputs: Tauri invoke payloads, app lifecycle events, and app configuration
  storage.
- Outputs: command responses, window lifecycle behavior, and packaged desktop
  artifacts.
- Lifecycle: setup creates shared state; shutdown drains owned jobs and child
  processes.
- Errors: startup and command failures are returned or logged without panicking
  in production paths.
- Compatibility: command payload changes require frontend adapter updates.

## Structured Producer Contract
- Stable fields: `tauri.conf.json` and capability files are consumed by Tauri.
- Defaults: omitted permissions are denied.
- Enum semantics: Tauri permission labels carry security behavior.
- Compatibility: capability changes require security review.
- Regeneration or migration: generated Tauri schemas are not hand-edited.

