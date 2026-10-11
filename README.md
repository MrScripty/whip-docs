# Whip Docs

Whip Docs is a local desktop code-architecture explorer. This feature branch adds
a Rust-owned multilingual Tree-sitter backend. The previous static Studio Whip documentation website is archived
as historical context and is no longer the active product surface.

## Intent prototype

This branch adds a bounded intent-and-symbol workspace. See [PROTOTYPE.md](PROTOTYPE.md)
for scope, run instructions, privacy and verification limits. Native execution
has not yet been qualified.

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

Optional Rust-specific enrichment can use rust-analyzer:

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

The backend accepts a local source directory without Cargo.toml. It supports
Rust, TypeScript/TSX, JavaScript/JSX, Python, Lua, Kotlin, Zig, C#, C, C++, Odin
and Svelte 5 source routes. See the [qualification matrix](docs/design/grammar-qualification.md)
for tested constructs and grammar gaps, and the [integration handoff](docs/design/multilingual-integration.md)
for required frontend work. The separate graph correction branch has not been
integrated or visually qualified with this backend. The normal inspector shows metadata and append-only intent, not raw source.
Snapshot capture is backend-owned and selected by graph node ID.

Headless backend checks (without GTK/WebKit):

```bash
cargo test --no-default-features --workspace --all-targets --locked
cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
```

See [backend verification](verification/multilingual-backend.md) for evidence and
native-integration limits.

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
