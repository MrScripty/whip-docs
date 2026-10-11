# Backend integration handoff

This branch is based on prototype `5e9900a8baf3ac599a63532e7dd16d90a1ec0892`.
The graph correction commit `83aaff1dd6f4acae11a292d2bb8221adeca1e75e` is on a
separate branch and has not been integrated or tested with this parser branch.
No existing frontend scene, App, geometry or navigation code was changed.

## IPC

`set_source_repo_path`, `load_directory_graph`, snippets and `analyze_source_repo`
accept a canonical directory without Cargo.toml. Default source analysis never
starts rust-analyzer or Cargo. The existing RustGraphExtractor and analyzer service
remain available; the legacy file-relation graph still uses Rust-specific
extraction when appropriate. It is not a multilingual semantic relation graph.

`analyze_source_repo` keeps its command name and returns GraphSnapshot schema 2.
Existing fields and Rust node kinds remain. New kinds: `class`, `interface`,
`type_alias`, `binding`, `field`, `variant`, `parameter`, `component`, `snippet`.
`component` is reserved; current Svelte scripts/snippets are source-backed file
children. Containment provenance is `tree_sitter`; confidence `exact` means
syntax containment only. No unresolved calls/imports become exact semantic edges.

Optional IPC argument:

```json
{"dialectOverrides":{"include/api.h":"cpp","src/View.js":"jsx"}}
```

`get_source_analysis` returns null before analysis or SourceAnalysis schema 1.
See the standalone typed adapter in `src/backends/SyntaxAnalysis.ts`. It describes
files, declarations (including parentId, dialect, syntaxKind, header/body flags),
relation facts, diagnostics and identities. Paths are relative canonical UTF-8
components using `/`; ambiguous Unix backslash filenames are rejected. Byte
intervals are half-open offsets into captured UTF-8 bytes. Graph ranges use
one-based lines and UTF-8 byte columns. Svelte embedded offsets are file-relative.

The get command returns the currently committed analysis, like get_graph_snapshot;
callers fetching both commands should serialize their analysis workflows. The
capture is sampled files, not an atomic repository transaction.

## Journal and identities

Existing `intent-journal-v2.jsonl` lines are never rewritten. Schema-2 records keep
`analyzed_rust_sources`, `structural_snapshot_symbol_range_unverified` precision,
and the exact original `whip-docs:analyzed-rust-sources:v1` digest domain/vector.

New syntax analyses append schema-3 records in that same journal with:

- scope `captured_multilingual_sources_v1`;
- precision `syntax_byte_ranges_v1`;
- analysisIdentity schema 1 with engine, extractor and per-file dialect, grammar,
  source hash, structure hash, byte length and coverage;
- a separate `whip-docs:captured-multilingual-sources:v1` digest domain.

The journal stores intent plus structural metadata/digests. No source bodies,
comments, literal/default values, written annotation text or copied signatures are
persisted. Facts expose ranges rather than source text even through IPC. Identity
changes, renamed/missing symbols, content/structure changes or source-set changes
stale bindings. No name-based relinking. Existing v2 records become stale against
the new parser even when names match; without analysis they remain unverified.
A missing file remains missing. Derivatives retain their original's identity.
Older binaries cannot read schema-3 lines; journal downgrade is not supported.

## Source bounds and platform limits

2 MiB per UTF-8 file; 64 MiB total; 4,096 files; 100,000 discovered entries;
128 directory levels; 250,000 visited syntax nodes per parsed region; 4,096
declarations and 8,192 facts per file; two seconds parser budget per region.
Svelte template expressions share an additional two-second budget and a
256-region cap per file.
Repository inventory stops after a file crosses 100,000 declarations/facts (at
most one file's bounded inventory beyond that threshold). Diagnostics are capped
at 128/file and 512/discovery with explicit incompleteness on truncation.

Discovery is bounded before sorting, skips symlinks/special files, and excludes
.git, node_modules, target, dist, build, .venv, venv, __pycache__, .svelte-kit,
.mypy_cache, .pytest_cache and .ruff_cache. Unsupported files are outside the
captured-source scope; this is not a whole-repository digest. Unix reads use
rustix directory handles with NOFOLLOW for every child and NONBLOCK before
regular-file verification. Non-Unix uses metadata/canonical checks and remains
unqualified against concurrent reparse-point replacement. Live files can still
change during sampling; journal appends compare captured bytes before writing.

## Graph worker actions

1. Integrate branches deliberately; use SyntaxGraphSnapshotDto/schema 2 and add
   neutral-kind geometry/colors/fallback handling without losing existing geometry.
2. Extend native intent types to accept both precisions/scopes and optional
   analysisIdentity. Preserve the browser preview's existing v2 fixture behavior.
3. Surface dialect choices, coverage and structured diagnostics. Use parser facts
   as syntax evidence, with unresolved status visible; no semantic target guessing.
4. If migrating the file-relation surface, define its multilingual facts contract
   separately. This branch does not change its legacy DTO or behavior.
5. Run native integration after installing supported Tauri system dependencies:
   no-Cargo mixed root, .h override, missing rust-analyzer, snippets, source changes,
   journal restart/staleness, and graph interactions using actual application pixels.

Headless backend tests do not establish combined application or visual correctness.

The [grammar-gap follow-up](grammar-gap-followup.md) adds a bounded Svelte template
call-fact subset and bumps extractor identity to @2, without changing DTO shapes.

The [official C++/C# qualification](official-grammar-qualification.md) advances
extractor identity to @3 and adds exact Git grammar identities. C# extension
containers use the existing `implementation` kind with the written `extension`
keyword label; named receivers use `parameter`, operators use `method` with an
operator-token label. C++ explicit receiver ranges include `this`. No new DTO
fields, enums, graph edges or journal schema are introduced. @1/@2 records remain
readable and preserved but become stale; the integration branch must deliberately
include this backend follow-up. Native/combined-app testing remains separate.

## Owned grammar and Svelte follow-up

Extractor @4 adds Python PEP 696 parameters/bounds/defaults, Kotlin named context
parameters and C `_BitInt` width facts. Grammar identities are `whip/<package>@<version>+sha256:<manifest>`;
the manifest binds official base, local patch, compiled inputs and generated output.
The original source scope, graph schema 2, SourceAnalysis schema 1 and journal
schema 3 remain unchanged. @1/@2/@3 records remain byte-preserved, readable and stale.

Svelte snippet parameters use `parameter`; each/await/const bindings use `binding`.
Bindings carry exact source/name ranges and the nearest reported snippet/file
containment; there is no synthetic each/await scope node. Destructuring siblings
share the written pattern range but have different name ranges and IDs. A written
type belongs to a single binding only when that pattern declares one name;
destructured annotations remain owned by the containing snippet/file. Default/key
calls remain unresolved syntax facts. Any script with `lang="ts"` selects template TypeScript parsing, including a
module-only script, following Svelte's parser dialect selection.

Graph integration requires no additional DTO/IPC migration for this follow-up.
Display the existing completeness and diagnostics; damaged injected snippet headers
are excluded from exact graph projection. Do not infer lexical visibility or
resolved calls from file/snippet containment. Native/combined-app validation and
frontend diagnostics presentation remain the graph integration worker's work.

## Extractor correctness follow-up

Extractor @5 corrects Kotlin property ownership, adds secondary constructors and
simple property-lambda parameters, rejects Zig assignment RHS bindings, and uses
`variant` for actual Zig enum cases. C++ destructors/operators use existing
`method`/`function` kinds and exact written names such as `~Gear`, `operator()` and
`operator[]`. Odin qualified procedures use their exact written member-expression
name, such as `(Parcel) .grow`; named procedure groups use `function` with
`overloaded_procedure_declaration` syntaxKind. No receiver or overload resolution
is inferred. Lambda declarations remain contained by the nearest reported property
or declaration; no anonymous lexical scope node is introduced.

Unsupported, comment-bearing or overlong callable names and multi-callable
declarators produce `unsupported_callable_declaration`; their descendants are
excluded so parameters do not acquire another declaration's owner. Targeted
diagnostics also expose omitted Kotlin destructuring properties, Odin enum/union
members, JavaScript private fields/parameter patterns, C# file-scoped namespace
membership and unresolved C/C++ preprocessor alternatives. Consumers should show
the existing `incomplete` coverage and diagnostic fields, not assume an empty
diagnostic list establishes complete language coverage.

No grammar, dependency, DTO/IPC, graph schema, source-scope or journal-schema change
is required. Existing @1–@4 journal records remain byte-preserved, readable and
stale against @5. Include this follow-up deliberately with the parser branch;
frontend/native integration remains untested here.
