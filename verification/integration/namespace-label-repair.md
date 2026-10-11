# Namespace-label privacy repair

Bounded repair after independent review of PR #2 at
`a5caed08ad159de53896753b7cf9eecf98e83e7b`.

## Defect and correction

Tree-sitter composite namespace name ranges may include comments between name
segments. C# `namespace Alpha /* comment */ . Beta` and C++
`namespace Alpha /* comment */ :: Beta` previously copied the comment into a
module label. Recording intent on any symbol in that file could then persist
that label through the same-file structural snapshot.

Composite declaration labels now pass an iterative, bounded token check before
extraction. Only qualified-name structure, identifiers, qualification punctuation
and the C++ `inline` namespace keyword are accepted. Extras/comments, recovery
nodes and other syntax reject the declaration with `unsupported_declaration_name`
and `Incomplete` coverage. Its descendants are omitted rather than silently
assigned to another owner. Safe siblings remain available. Clean qualified names
retain exact spelling, byte ranges and ownership; labels are not normalized into
synthetic text that would disagree with their name ranges.

Extractor identity advances to `whip-docs-syntax@6`, as required when extraction
behavior changes. Graph/analysis/journal schemas, digest domains and grammars are
unchanged. The real @5 journal vector from `a5caed08` is preserved alongside @1–@4;
old records remain readable, unchanged and stale, with new derivatives rejected.
This prevents newly extracted comment contamination; historical journals are not
silently scrubbed, migrated or deleted.

## Validation

- **138 headless Rust tests passed**, strict all-targets Clippy and formatting passed.
  The namespace regressions cover C#/C++ block and line comments, nested names,
  UTF-8/CRLF ranges, clean names, inline namespaces, safe-sibling ownership and
  absent orphan descendants.
- The real Rust `IntentStore` regression covers both languages: append verbatim
  intent, append a separate proposal, compare the unchanged original journal prefix,
  inspect serialized graph/record/JSONL for forbidden comment/source fragments,
  reopen the store and verify current records and unchanged disk bytes.
- **131 frontend tests**, lint, TypeScript and production build passed. New cases
  cover diagnosed projection, comment-free structural snapshots, separate proposals,
  reload and the real @5 vector's byte-preserved stale state. Existing Three.js
  chunk-size warning remains.
- Focused actual-browser evidence is recorded in
  [namespace browser results](namespace-browser-results.json). It exercises both
  diagnosed files and safe classes, new @6 persistence/privacy, exact original and
  separate proposal, reload, real @5 staleness/derivative refusal and invalid storage.
- The real Rust fixture was regenerated: 41 public files, 39 captured sources.
  [Provenance](../../fixtures/mixed-workspace.provenance.json) records the unchanged
  parser base, integration base, exact current parser source hashes and fixture hashes.
- The stale journal README validation note is corrected. Rust tooling and headless
  passes are distinguished from the remaining native desktop limit.

The independent reviewer reproduced the repair in both languages and identified
that the first whitelist rejected valid C++ inline namespaces. That was corrected
with targeted clean-name regression cases. Final independent probes against the
fresh library confirmed the comment rejection, clean/Unicode/inline name support,
real journal append/proposal/reopen behavior and byte preservation. The reviewer
found no remaining blocker in the bounded repair diff against `a5caed08` and
independently verified all 41 fixture hashes, six parser source hashes, the actual
saved @5 vector and unchanged previous captured-file analyses. This is local
independent review, not a submitted GitHub review or native acceptance.

Reviewed SHA-256 fingerprints:

```text
src-tauri/src/syntax/extract.rs:
4955dc7912b79e4dedd4a82df4f197685f602998085ed16891a2eb4316c73ac8
fixtures/mixed-workspace.snapshot.json:
5b05c0e7e03469f7c559c13c5cb0b4f35052734d8db1efd349bf7918889fa5c3
```

The compact inspector component/styles, original graph/overlay, intent backends,
workspace loading and expansion implementations are unchanged from `a5caed08`.
Its 14 browser groups and genuine @5 screenshots remain prior UI evidence; their
capture hashes refer to that commit's fixture, not the newer @6 fixture. No new
UI captures were made for this parser-only repair.

## Reproduce and limits

```sh
cargo test --offline --no-default-features --workspace --all-targets --locked
cargo clippy --offline --no-default-features --workspace --all-targets --locked -- -D warnings
cargo fmt --all --check
npm run check
npm run build
# With Vite running and installed Playwright/Chromium:
PLAYWRIGHT_MODULE=/path/to/playwright-core GRAPH_TEST_ORIGIN=http://127.0.0.1:1420 \
  EVIDENCE_DIR=/tmp/whip-namespace node verification/integration/namespace-browser-check.cjs
```

Native Tauri build/linking, actual IPC and desktop restart remain unverified due
to missing GTK/GLib/WebKit development prerequisites. Browser fixture and headless
service passes do not establish native end-to-end acceptance. Complete language
or Passeur semantic parity is not claimed. No merge or draft-status change is made.
