# Whip Docs

Whip Docs is now a local desktop code-architecture explorer for Rust
repositories. The previous static Studio Whip documentation website is archived
as historical context and is no longer the active product surface.

## Current Product

The active application is a Tauri desktop app with:

- a Rust backend that owns repository configuration and code analysis
- a Svelte + TypeScript frontend that renders backend-owned graph snapshots
- a local repository directory as the source of truth
- no GitHub raw source URL dependency
- no WASM parser/runtime strategy

## Historical Website Boundary

The old website files, generated Vulkan documentation, and GitHub-source viewer
scripts were removed from the active tree during the Tauri refactor. Git
history is the archive for that static-site implementation.

## Development

Install frontend dependencies before running npm scripts:

```bash
npm install
```

Install the rust-analyzer runtime if it is not already available:

```bash
rustup component add rust-analyzer
```

Run the desktop app:

```bash
npm run dev:desktop
```

Run frontend checks:

```bash
npm run check
```

Run Rust checks:

```bash
cargo test
cargo fmt --check
cargo clippy --workspace --all-targets
```

Analyze a repository from the app by setting a local Cargo workspace or crate
directory and selecting `Analyze`. Source snippets are loaded by backend graph
node ID, not by frontend-provided file paths.

## Architecture

The app follows the local Pantograph style at a smaller scale:

- `src-tauri/src/main.rs` remains a thin launcher.
- `src-tauri/src/app_setup.rs` owns Tauri composition and command registration.
- `src-tauri/src/app_lifecycle.rs` owns shutdown cleanup.
- Tauri command modules adapt IPC payloads into backend-owned services.
- Frontend backend adapters isolate `invoke(...)` from Svelte components.

## Refactor Plan

The implementation plan is tracked in
`docs/refactors/2026-04-26-whip-docs-tauri-rust-analyzer-refactor/final-plan.md`.
