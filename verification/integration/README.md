# Combined graph and multilingual parser

The integration branch combines graph `2a6b73da3fce1ce099e91fa386986c4b2f63a44e`
with parser `91b05b696ca4bd1121137fe2a78faac36e0f630d` and its follow-ups through
`88d62abb68d3ba57deefb59c9878fdd43aaaa599` (extractor `whip-docs-syntax@5`), plus
the bounded @6 namespace-label repair below. Neither source branch nor main is
changed by this work. Native Tauri IPC remains unverified.

The original file graph and routing remain authoritative. Neutral declarations
expand in the same scene/camera, with exact syntax byte ranges and explicit
coverage. Syntax calls/imports/types are unresolved range evidence, not invented
semantic edges. The legacy Rust file-relation loader retains its original
behavior and resource/process limitations; the bounded Tree-sitter guarantees
apply to source analysis, not that older loader.

`get_source_analysis` accepts optional `expectedSourceRoot` and
`expectedAnalysisAt`; both are checked against the committed graph under one
read lock. The UI always supplies them and rejects schema/identity/range drift
while retaining file overview and history. Effective narrow .h/.js overrides
are restored from analysis identity and remain tied to the current root.

Native journal v2/v3 formats remain unchanged. The explicit mixed browser
fixture uses a separate v3 preview key; the old Rust browser fixture keeps its
existing v2 behavior/storage. A Rust-exported vector verifies the browser's
multilingual digest encoding. Unknown or semantically corrupt records fail
without rewriting storage; originals remain immutable and proposals separate.

## Current @6 privacy repair

The final independent review found comment-bearing C#/C++ namespace labels entering
same-file journal snapshots. The bounded @6 repair rejects unsafe composite names
with explicit diagnostics and omits their descendants; clean qualified and inline
namespace names retain exact ranges. See [repair verification](namespace-label-repair.md)
for current checks and independent confirmation. The compact UI and graph/journal
implementations are unchanged. Older @1–@5 records remain readable and stale without
rewriting stored bytes. The current fixture has 41 public files / 39 captured sources.

## Prior @5 checkpoint

- 135 Rust service tests passed, including the integration root/token association
  check; strict all-targets Clippy and formatting passed with desktop disabled.
- Frontend lint, TypeScript, 128 tests and production build passed. The existing
  large Three.js chunk warning remains.
- Five focused Chromium groups passed ([recorded results](parser-v5-browser-results.json))
  via `parser-v5-browser-check.cjs`: corrected
  Kotlin/Zig declarations and ownership, exact C++/Odin callable spellings, distinct
  duplicate operators, byte ranges, verbatim intent, separate proposals, source/comment
  exclusion, reload, six negative diagnostic fixtures, old @4 staleness and corrupt
  storage refusal. This uses actual WebGL UI and Rust-exported data, not native IPC.
- The fixture contains 39 public synthetic files, with 37 captured under the
  recorded overrides. Graph schema 2, SourceAnalysis schema 1 and journal schema 3
  are unchanged. Owned grammar identities fit the existing strict journal format.
- Owned provenance verification passed all 87 hashes, Cargo path/version/identity
  resolution and readable patch replay. Official C++/C# verification passed both
  exact commits, ABI 15 and all 35 hashes. Both verifiers filter metadata to the
  rustc host to avoid requiring unrelated offline target dependencies.
- No grammar tools were installed here. The parser branch's 227 corpus cases and
  reproducible generation are prior evidence at exact commit `298e63f`, documented
  in [owned grammar verification](../owned-grammars.md); they were not repeated.

## Retained UI qualification at `a5caed08`

The compact inspector follow-up removes the requested heading/help prose and
replaces stacked selection labels with one compact name/kind/parent-file row.
Inspector/form/journal spacing is tighter; precision, coverage, errors, binding
status and provenance remain available. The original graph, scene, parser @5,
intent backends and fixture were unchanged from `0efd5e8` at that UI checkpoint.

The frontend's 128 tests, lint, types and build were rerun successfully. Nine
mixed-browser regression groups and five focused inspector groups passed, including
1680/768/390/360px layout and keyboard checks, original/proposal byte preservation,
reload, stale/corrupt journals, metadata association and original graph/camera
invariants. Fresh actual @5 screenshots replace the earlier @3 captures. See
[compact inspector verification](inspector-compact.md) for evidence, measured
spacing and exact screenshot source hashes. Rust checks were not repeated for
this markup/CSS-only follow-up; the 135-test service result above is prior evidence
on the unchanged Rust code.

Earlier independent review fixed permissive preview record validation, lost
restored dialect choices and a clipped narrow settings menu. The original file
scene and symbol overlay implementation remain unchanged from application commit
`85c9cea426e7fc9abe55c0f4e7ba706cdea572c2`; the inspector markup and styling have
now been compacted separately.

The compact shell removes the large fixture banner and redundant scene copy,
keeps the honest Fixture Preview tooltip, and moves the toolbar to the scene top.
The original scene/layout/routing code is unchanged by this cleanup. Normal
disclosure changes only its target. Ctrl-click and Ctrl+Enter/Space apply that
target's new state to all eligible repository files, including filtered and
collapsed tree rows. Limits are 24 open files and 4,096 symbols; existing open
files are retained, the target takes priority, remaining slots follow path order,
and a notice reports a bound. Unsupported/empty files are ineligible. A single
file above the symbol cap is refused explicitly. Directory disclosures retain
their separate tree-only behavior. Selection and draft text survive while their
parent stays open; closing it saves the draft for reopening.

## Reproduce

```sh
npm ci
npm run check
npm run build
cargo test --no-default-features --workspace --all-targets --locked
cargo clippy --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
npm run dev
```

Open `http://127.0.0.1:1420/?preview=mixed` for the recorded multilingual fixture;
`?preview=1` retains the older Rust fixture. Both run real WebGL UI with recorded
data, not native IPC. In an environment already configured for Tauri,
`npm run dev:desktop` opens the native app; select a local directory, with or
without Cargo.toml. No proposals are executed and no model inference is used.

`verification/integration/namespace-browser-check.cjs` runs the repair checks;
`parser-v5-browser-check.cjs` retains the broader parser-contract replay;
`browser-check.cjs` retains the broader visual suite. All use installed Playwright/Chromium;
set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `GRAPH_TEST_ORIGIN` and `EVIDENCE_DIR`
for local paths/port. The fixture exporter is `src-tauri/examples/integration_fixture.rs`;
run with desktop features disabled and a fresh disposable app-data directory.
Only fixture root/timestamps are normalized; syntax ranges/identity/digests/facts
come from the Rust service. Provenance is in `fixtures/mixed-workspace.provenance.json`.

Native linking, macros/IPC, desktop restart acceptance and non-Unix source races
remain unqualified. No native dependency-denial retries or package-source
bypasses were attempted. See the parser qualification matrix for language gaps;
supported_subset never means full-language support.

The recorded fixture is regenerated at extractor `@6`. Saved real `@1`, `@2`, `@3`,
`@4` and `@5` journal vectors remain readable/stale without changing stored bytes;
proposals against them are rejected. The @5 vector equals the actual vector from
published checkpoint `a5caed08`; earlier saved vector files remain byte-for-byte unchanged.

Fourteen dialect routes span twelve language families. This is language-family
coverage, not complete language or Passeur extraction parity. The qualified
Python PEP 696, Kotlin context, C23 `_BitInt` and Svelte template-binding subset
is described in the parser report. Kotlin context destructuring properties and
damaged template headers remain explicit negative cases. Types/calls remain
unresolved; file/snippet containment does not establish lexical visibility.
Python types/defaults, Kotlin context resolution and C widths are not evaluated.

This completes the bounded extractor follow-up. Kotlin property/constructor ownership,
Zig bindings/enum variants, C++ destructor/operator names and Odin qualified/overloaded
callable inventories now project through the existing overlay, inspector and journal.
No grammar, dependency, graph/analysis/journal schema or digest-domain change was
introduced in @5. Parser base `88d62ab` is followed by the bounded @6 namespace-label
privacy repair; current parser source hashes are recorded in fixture provenance.

Remaining explicit gaps include Kotlin destructuring, Odin enum/union member inventories,
JavaScript private fields and parameter patterns, C# file-scoped namespace membership,
C/C++ preprocessor alternatives and unsupported callable names. Unsupported callable
regions exclude their descendants. Complete lexical scopes, semantic resolution,
display/signature normalization, masked signatures and body/default change comparison
remain outside the bounded scope. No full-language or Passeur parity is claimed.
