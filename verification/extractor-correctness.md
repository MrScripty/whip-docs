# Bounded extractor correctness verification

2026-10-11 UTC. Branch `feature/multilingual-tree-sitter`, baseline
`298e63fb11ac37c29f7a89d9a57f16a866f1d4b3`; Rust 1.92.0, Linux headless.
[Acceptance](../docs/design/extractor-correctness-followup.md) was recorded before
the implementation. Passeur `725c45c` was read as a coverage reference only;
fixtures and fixes here are independently authored for Whip Docs.

## Qualified changes

| Family | Extractor behavior verified |
| --- | --- |
| Kotlin | Property names come from the written binding, never its initializer. Class properties are fields; local/top-level properties are bindings. Secondary constructors own their parameters. Simple property-lambda parameters and locals retain syntax containment without becoming class members. |
| Zig | Only identifiers following actual var/const tokens become bindings. Assignment RHS identifiers produce no phantom declarations. Enum cases use `variant`; the nonexhaustive marker is excluded. |
| C++ | Destructors and named operator members retain exact names and parameter ownership across duplicate scopes. Unsupported conversion/literal operators, comment-bearing names, multiple callable declarators and overlong names are diagnosed and excluded with their descendants. |
| Odin | Qualified procedures use their exact written member-expression name and own parameters. Named procedure groups are inventoried without invented overload links. Body parse damage stays separate from header completeness. |

The existing all-family fixtures still qualify all 14 dialect routes: Rust,
TypeScript/TSX, JavaScript/JSX, Python, Lua, Kotlin, Zig, C#, C, C++, Odin and
Svelte 5. Successful parsing remains `supported_subset`, not a parity claim.
There are no grammar or dependency changes in this follow-up.

Remaining audited limits now have targeted diagnostics: Kotlin destructuring
properties, Odin enum/union members, JavaScript private fields and
default/rest/destructured parameters, C# file-scoped namespace membership and
unresolved C/C++ preprocessor alternatives. Unsupported callable regions do not
assign their parameters or body declarations to another owner. Syntax facts stay
unresolved; no compiler semantics or exact cross-file call edges are added.

## Evidence

- [All-targets headless tests](extractor-correctness-tests.log): **134 passed**,
  plus the syntax-probe target. Independent review reran all 134 successfully.
- [Strict all-targets Clippy](extractor-correctness-clippy.log): `-D warnings`;
  independently rerun successfully.
- `cargo fmt --all --check` and `git diff --check` passed.
- Offline grammar verifiers passed unchanged: **87 owned input/output hashes**,
  Cargo identities and patch replay, plus **35 official C++/C# input hashes**.
  Grammars were neither regenerated nor installed for this follow-up.
- New fixtures and tests assert whole declaration inventories, kinds, exact
  UTF-8/CRLF ranges, duplicate-scope IDs, graph containment, malformed bodies,
  unsupported names, literal/comment exclusion and journal append/reopen.
- Extractor identity advances to `whip-docs-syntax@5`. Tests verify @1–@4 records
  remain readable, byte-preserved and stale. Source-scope domains, graph schema 2,
  SourceAnalysis schema 1 and journal schema 3 are unchanged.

Independent review found and drove fixes for overlong names leaving orphan
parameters, recovered malformed C++ operators, Kotlin lambda locals becoming
members, and a new quadratic initializer rescan. C++ callable detection now follows
only declarator paths; a direct AST assertion and 3,000-level nested-initializer
case guard against rescanning initializer bodies. Reviewer measurements improved
that debug probe from 31.5 seconds to 8.25 seconds. Residual deep parent-lookup cost
also exists in the baseline; this is not a general extraction-latency guarantee.
No remaining blocker was found in the bounded follow-up.

Reproduce with locked dependencies available:

```sh
cargo test --no-default-features --workspace --all-targets --locked
cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
python3 scripts/verify-owned-grammars.py
python3 scripts/verify-grammar-provenance.py
```

## Integration limits

No frontend scene/App/geometry, DTO/IPC shape or journal schema changes are needed.
The [handoff](../docs/design/multilingual-integration.md) describes @5 names,
kinds and diagnostics for deliberate graph integration. Default mixed-language
analysis still needs neither Cargo.toml nor rust-analyzer; Rust enrichment remains
optional. Native desktop and combined frontend validation have not run here
because the GTK/GLib/WebKit development environment is unavailable.

Complete lexical scopes, qualified display conventions, masked signatures,
body/default change classification and Passeur-wide semantic equivalence remain
outside this bounded syntax extraction work. No merge, PR or deployment is made.
