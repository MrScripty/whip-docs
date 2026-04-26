# src-tauri/src/config

## Purpose
This directory will own backend app configuration, including the validated local
source repository path and config schema migration.

## Contents
| File/Folder | Description |
|-------------|-------------|
| `mod.rs` | Versioned app config DTOs, source repo status labels, and JSON config store. |

## Problem
The app needs durable local configuration without letting the frontend persist
unchecked paths or repair config state locally.

## Constraints
- Persist only canonical paths that passed backend validation.
- Include schema versioning before changing persisted config shape.
- Tests must use isolated temp config roots.

## Decision
Centralize config DTOs, persistence, defaults, and migration in this module.

## Alternatives Rejected
- Store source repo path in frontend local storage: rejected because it bypasses
  backend validation.
- Keep config unversioned JSON: rejected because persisted app state may survive
  upgrades.

## Invariants
- Raw path strings are parsed into validated types before storage.
- Config load failures produce structured diagnostics or defaults.
- Tests do not touch the user's real config directory.

## Revisit Triggers
- Multiple source roots are supported.
- Config becomes shared with a CLI.
- Schema migrations need backward compatibility tests.

## Dependencies
**Internal:** `source` path validation and command DTOs.
**External:** serde and platform config directories when persistence is added.

## Related ADRs
- `docs/adr/ADR-001-tauri-rust-analyzer-graph-contracts.md`: defines the
  backend-owned app config DTO and versioning stance.

## Usage Examples
```rust
let store = ConfigStore::new(app_data_dir);
let config = store.load_or_default().await?;
```

## API Consumer Contract
- Inputs: raw config DTOs from commands and persisted config files.
- Outputs: validated config types and command DTOs.
- Lifecycle: config loads at startup and saves only after validation.
- Errors: invalid paths are rejected with user-facing diagnostics.
- Compatibility: schema version changes require migration notes and tests.

## Structured Producer Contract
- Stable fields: persisted app config and config DTOs.
- Defaults: omitted optional fields mean no source repository is configured.
- Enum semantics: status labels describe backend validation state.
- Compatibility: schema changes require version bump and migration behavior.
- Regeneration or migration: migrations run before commands expose config to the
  frontend.
