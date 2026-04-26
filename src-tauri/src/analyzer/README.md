# src-tauri/src/analyzer

## Purpose
This directory will own rust-analyzer process lifecycle and Rust workspace
extraction services.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `mod.rs` | Placeholder module for analyzer lifecycle and extraction pipeline. |

## Problem
Whip Docs needs semantic Rust facts that `syn` alone cannot provide, while the
frontend must not spawn or manage analyzer processes.

## Constraints
- rust-analyzer is a managed backend subprocess.
- Startup, readiness, cancellation, restart, timeout, and shutdown are explicit.
- Only one active analysis job is allowed until a queue policy is added.

## Decision
Create an analyzer service boundary that owns the LSP process and emits facts
for graph normalization.

## Alternatives Rejected
- Parse only with `syn`: rejected because definitions, references, and call
  hierarchy need semantic context.
- Let the frontend launch rust-analyzer: rejected because process lifecycle and
  path trust belong in Rust.

## Invariants
- Child processes are terminated during shutdown and tests.
- LSP failures produce diagnostics instead of panics.
- Analyzer state is never exposed directly to the frontend.

## Revisit Triggers
- rust-analyzer cannot provide stable call hierarchy for target fixtures.
- Analysis latency requires incremental background updates.
- Multiple concurrent source roots become necessary.

## Dependencies
**Internal:** source validation and graph normalization.
**External:** rust-analyzer process, Tokio process APIs, LSP types.

## Related ADRs
- None identified as of 2026-04-26.
- Reason: analyzer ownership ADR is scheduled after DTO freeze.
- Revisit trigger: LSP client approach is selected.

## Usage Examples
```rust
// Future app state will call analyzer services with a ValidatedRepoPath.
```

## API Consumer Contract
- Inputs: validated Cargo workspace roots and explicit analyze requests.
- Outputs: analyzer facts, progress status, and diagnostics.
- Lifecycle: service starts rust-analyzer on demand and stops it during
  cancellation or app shutdown.
- Errors: missing binary, timeout, and partial data are structured diagnostics.
- Compatibility: extracted fact shapes change with graph normalization tests.

## Structured Producer Contract
- Stable fields: analyzer facts are internal until normalized into graph DTOs.
- Defaults: unavailable semantic data becomes diagnostic-backed low confidence.
- Enum semantics: lifecycle states describe process ownership.
- Compatibility: analyzer fact changes must preserve graph contract behavior.
- Regeneration or migration: no persisted analyzer artifacts are produced yet.

