# 3D Semantic Graph V0 Implementation Log

## Completed Slices

### Backend Directory/File Graph Command

- Added backend-owned V0 directory/file graph DTOs and deterministic tree
  graph building.
- Added the `load_directory_graph` Tauri command so the frontend can request a
  directory/file snapshot without running rust-analyzer.
- Registered the command in Tauri setup.
- Updated backend module READMEs for the graph, command, and source boundaries.
- Verified with `cargo fmt` and `cargo test`.

## Discovered Issues

| Date | Area | Issue | Follow-up |
| ---- | ---- | ----- | --------- |
| 2026-05-06 | Source validation | V0 directory graph loading currently reuses `ValidatedRepoPath::parse_existing_cargo_repo`, so non-Cargo and mixed-language repositories cannot be opened even though later V0 work should support them. | Add a validated local-repository root type that does not require `Cargo.toml`, then keep the Cargo-specific validator for Rust analyzer entry points. |
