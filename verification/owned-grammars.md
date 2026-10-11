# Whip-owned grammar and Svelte qualification

2026-10-11 UTC. Branch `feature/multilingual-tree-sitter`; baseline
`2afd3c0a03d48ac05e9717d5dd6f727a44691fc3`. Rust 1.92.0, Linux headless.
Implementation acceptance was recorded before broad changes in
[owned-grammar-implementation.md](../docs/design/owned-grammar-implementation.md).

## Delivered scope

The existing 14 dialect routes cover Rust, TypeScript/TSX, JavaScript/JSX,
Python, Lua, Kotlin, Zig, C#, C, C++, Odin and Svelte 5. This follow-up closes the
three audited grammar gaps for the tested syntax subset:

| Owned package | Official base revision | Qualified additions |
| --- | --- | --- |
| tree-sitter-python 0.25.0-whip.1 | `26855eabccb19c6abf499fbc5b8dc7cc9ab8bc64` | PEP 696 ordinary/bounded, TypeVarTuple and ParamSpec defaults on definitions and aliases; declarations, owners and exact bound/default ranges |
| tree-sitter-kotlin-ng 1.1.0-whip.1 | `3dea6dfa9c0129deb7c4315afbda806c85c41667` | Named/anonymous context parameters on functions and properties, modifiers, extension receivers, generic/nullable/function types, and legacy context receivers |
| tree-sitter-c 0.24.2-whip.1 | `b780e47fc780ddc8da13afa35a3f4ed5c157823d` | C23 `_BitInt`, both signedness positions, typedefs, returns/parameters, fields/pointers/locals and written width expressions |

These are narrow Whip-authored grammar/extraction changes based on official source,
with upstream licenses retained. Passeur remains a design/coverage reference only.
No Passeur code, patched grammar artifact, runtime, Node sidecar or agent platform
is included. Rust-analyzer remains optional Rust-specific enrichment; default mixed
roots require neither it nor Cargo.toml.

Svelte now inventories destructured/default snippet parameters, each bindings and
index/key expressions, await then/catch bindings including shorthand, const bindings,
and debug identifiers. It maps call/type evidence from packaged JS/TS grammars to
original UTF-8 byte ranges. Any script with `lang="ts"`, including module-only,
enables template TypeScript. Siblings in one destructuring pattern have distinct
name ranges/IDs; shared annotations retain the containing owner. No new scope
containers, resolved targets or runtime edges are invented.

## Reproducibility and evidence

- [All-targets headless tests](owned-grammar-tests.log): **122 passed** plus the
  syntax-probe target. Tests include exact Unicode/CRLF ranges, containment,
  positive/negative modern constructs, bounded extraction, real mixed-language
  journal append/reopen and source/comment exclusion.
- [Strict Clippy](owned-grammar-clippy.log): `-D warnings`.
- `cargo fmt --all --check` and `git diff --check`.
- [Python corpus](owned-python-corpus.log): **118/118**;
  [Kotlin corpus](owned-kotlin-corpus.log): **23/23**;
  [C corpus](owned-c-corpus.log): **86/86**.
- [Owned-source verification](owned-grammar-provenance.log): **87 file hashes**,
  exact Cargo path/version resolution, original upstream input hashes, and readable
  source patch replay. Fresh generation in temporary copies produced identical
  hashes for all six generated outputs of each package.
- [Existing official Git-source verification](official-grammar-provenance.log):
  C++/C# exact revisions and **35 input hashes** remain verified.

The inherited corpus baseline was Python 117, Kotlin 22, C 85. Whip added one
explicit AST corpus case per package, in addition to richer Rust extraction
fixtures. Two inherited Python cases intentionally change their expected ASTs:
`Type Alias Statements` and `Generic Function Definitions` now use declaration
parameter/alias-head nodes; their source cases are unchanged. Other inherited
expectations are unchanged. The readable `grammars/python/whip.patch` includes
these two AST updates and their original file is retained under `upstream/`.

Official crates.io `tree-sitter-cli@0.25.10` was installed with `--locked` after
inspection of its build behavior. Each package's `owned-provenance.json` records
the tool's registry checksum and official commit, base archive checksum, Node
version, source/build/test input hashes, patch and generated output hashes.
Generation used `tree-sitter generate --abi 15`; existing Node was used solely
for grammar generation. Cargo compiles committed C and does not run the generator.

Reproduce from a checkout with the locked Cargo dependencies already fetched:

```sh
cargo test --no-default-features --workspace --all-targets --locked
cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
python3 scripts/verify-grammar-provenance.py
python3 scripts/verify-owned-grammars.py
python3 scripts/verify-owned-grammars.py --regenerate --cli /path/to/tree-sitter
```

The last command requires the pinned official CLI and Node already installed;
neither verifier installs tools or fetches code. Run `tree-sitter test` separately
inside each `grammars/{python,kotlin,c}` directory. Use writable XDG cache/config
directories in restricted environments. The Python generator emits an inherited
unnecessary-conflict warning; output hashes and all corpus cases still match.

## Review corrections and limits

Independent review reran all 122 headless tests, strict all-targets Clippy,
all three corpus suites and the offline provenance verifier, and found no remaining
concrete parser blocker after corrections. It found and drove regression fixes for journal identity syntax
and whitespace, Kotlin destructuring ownership, Python starred defaults, damaged
Svelte headers, modifier/default/key restrictions, script dialect selection and
candidate boundaries inside comments/Unicode identifiers. Python's upstream
expression grammar remains permissive; an additional bounded AST-context check
rejects misplaced starred expressions in the owned type-parameter declarations.
Valid tuple/list/set/argument/subscript unpacking remains qualified. This check
does not perform CPython evaluation or type checking.

All successful files still report `supported_subset`. This is **not full-language
or complete Passeur extraction parity**. Kotlin context-qualified destructuring
properties emit `unsupported_context_property`. C width values, Python type
constraints/default ordering and Kotlin contextual resolution are not evaluated.
The inherited grammars retain their general parsing limitations.

Svelte supports the tested structural subset, not compiler scope, placement or
runtime semantics. Anonymous declarations inside arbitrary template expressions
are not fully inventoried. Newer generic snippets/directives are not qualified by
this fixture set. External/unsupported scripts are not fetched and retain explicit
diagnostics. Failed or damaged injections emit no recovered declarations/facts;
region/name/binding limits mark enclosing snippet completeness appropriately.
Template parsing uses the existing two-second shared budget and 256-region cap,
with at most 64 candidate boundaries per each/await keyword search.

Extractor identity is now `whip-docs-syntax@4`. Each owned grammar identity hashes
its complete provenance manifest using the existing journal-safe identity alphabet.
Graph schema 2, SourceAnalysis schema 1, journal schema 3, source scope and digest
domains are unchanged. Prior @1/@2/@3 journal records remain readable and byte
preserved, become stale, and cannot receive derivatives against a changed analysis.
Source bodies, comments and literal/default text remain outside persisted journals.

No frontend scene/App/geometry edits were made. Native Tauri/UI, combined graph
integration, non-Unix race behavior and wasm remain unqualified. GTK/GLib/WebKit
development packages are unavailable in this cloud environment. The graph worker
should deliberately integrate this backend follow-up and run the scenarios in
[multilingual-integration.md](../docs/design/multilingual-integration.md), including
mixed roots, new binding kinds, diagnostic display and journal restart/staleness.
No further DTO/IPC migration is needed for this follow-up.

Publication is verified separately against the exact remote branch SHA. No merge,
PR, deployment or user's local-machine changes are part of this work.
