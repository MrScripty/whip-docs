# src-tauri/src/source

## Purpose
This directory will own validated local repository paths and source snippet
lookup by backend graph node ID.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `mod.rs` | Placeholder module for path validation and source lookup services. |

## Problem
The app must read a user-selected local Rust repository without allowing path
traversal, symlink escapes, or frontend-controlled snippet file paths.

## Constraints
- External paths are parsed once into validated backend types.
- Canonicalized paths must remain inside the configured source root.
- Snippets are addressed by graph node ID after analysis.

## Decision
Centralize source-root validation and snippet resolution here so command
handlers and analyzer modules consume trusted types.

## Alternatives Rejected
- Validate paths inline in each command: rejected because duplicated validation
  is easy to drift.
- Accept frontend-provided snippet file paths: rejected because graph snapshot
  metadata already identifies source locations safely.

## Invariants
- Raw path strings do not cross into internal analyzer APIs.
- Symlink escapes are rejected after canonicalization.
- Unknown graph node IDs cannot resolve snippets.

## Revisit Triggers
- Non-Cargo roots are supported.
- Multiple source roots are configured.
- Snippet lookup needs cached file content.

## Dependencies
**Internal:** config, graph snapshot metadata, analyzer services.
**External:** standard filesystem APIs.

## Related ADRs
- `docs/adr/ADR-001-tauri-rust-analyzer-graph-contracts.md`: records
  `ValidatedRepoPath` as a backend-owned boundary type.

## Usage Examples
```rust
// Future command handlers will parse raw path strings into ValidatedRepoPath.
```

## API Consumer Contract
- Inputs: raw source root paths at the command boundary and graph node IDs for
  snippet lookup.
- Outputs: validated repository paths and source snippets.
- Lifecycle: paths are validated before config persistence or analysis.
- Errors: missing path, non-directory path, missing Cargo manifest, traversal,
  and symlink escape are distinct validation failures.
- Compatibility: path validation behavior changes require command tests.

## Structured Producer Contract
- Stable fields: source snippet DTOs will be consumed by frontend panels.
- Defaults: no source root means commands return an unconfigured status.
- Enum semantics: validation status labels are frontend-visible.
- Compatibility: source DTO changes require frontend adapter updates.
- Regeneration or migration: no generated artifacts are produced here.
