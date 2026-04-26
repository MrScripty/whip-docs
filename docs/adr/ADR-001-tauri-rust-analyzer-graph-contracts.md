# ADR-001: Tauri Rust Analyzer Graph Contracts

## Status

Accepted

## Context

Whip Docs is moving from a static browser documentation site to a local desktop
architecture explorer for Rust repositories. The frontend needs stable graph,
configuration, and error contracts before analyzer extraction and graph
rendering can proceed independently.

The old `rust-doc-tool` JSON shape only represented files and simple module or
import relationships. The new product needs versioned graph snapshots with
symbols, calls, references, diagnostics, and source ranges.

## Decision

Use backend-owned Rust DTOs as the source contracts for:

- application configuration
- command errors
- validated source repository paths
- graph snapshots, nodes, edges, source ranges, diagnostics, edge provenance,
  and edge confidence

Tauri command handlers will expose serialized DTOs to the frontend. The
frontend may mirror those types in TypeScript, but the Rust backend remains the
authority for validation, graph IDs, snapshot schema version, and diagnostics.

## Consequences

- Parallel frontend/backend work starts only after DTOs are intentionally
  changed or frozen for that wave.
- Graph snapshots carry `schemaVersion` from the first implementation.
- Source snippets are addressed through graph node IDs and backend snapshot
  metadata, not frontend-provided paths.
- Future persisted snapshots or generated TypeScript bindings have an explicit
  migration point.

## Alternatives Rejected

- Reuse the old `rust-doc-tool` JSON output: rejected because it cannot model
  semantic symbols, calls, references, provenance, or diagnostics.
- Let TypeScript define the graph contract first: rejected because validation,
  source paths, and analysis are backend-owned.
- Add generated schema tooling before the first DTO pass: rejected because the
  contract is still small enough to maintain manually while implementation
  validates the shape.

## Revisit Triggers

- Direct Tauri IPC becomes too large for representative graph snapshots.
- TypeScript DTO mirrors drift from Rust DTOs.
- Saved graph snapshots are introduced.
- Non-Rust language analysis becomes in scope.

