# Source-free intent journal prototype (v2)

## Purpose and boundary

Record a verbatim original human intent against a selected source-backed Rust
graph node, a SHA-256 digest of its exact UTF-8 source-file bytes, and a saved
structural graph view. Interpretations and proposals append separate records
referencing that original. There is no update, delete, merge, automatic relink,
or proposal-application command.

Full source bodies, comments, literals, and source-file secrets are never
serialized into the v2 journal. Source bytes are read only into ephemeral
backend analysis memory for parsing, hashing, and freshness checks. There is
no full-source retention option and no code-reconstruction claim. Digests verify
content; they cannot recover it. Human-authored intent is preserved verbatim,
so any source or secret a person deliberately pastes into intent remains there.

The existing extractor does not guarantee exact declaration ranges or semantic
identity. `precision` is `structural_snapshot_symbol_range_unverified`. The
saved structure consists of same-file source-backed symbol nodes and observed
edges whose endpoints are both in that node set, sorted by ID. File/workspace/
crate nodes and cross-file edges are excluded. Node names, kinds, reported
ranges, and edge provenance/confidence are retained as observed, without adding
precision or claiming complete semantic coverage. Moves, renames, changed
source or captured graph structure require a new original. Matching IDs alone
never authorize rebinding.

## IPC contract

- `append_intent_record({ nodeId, text, kind, parentId, expectedAnalysisAt })`
  returns an `IntentRecordDto`. The required `expectedAnalysisAt` equals the
  selected graph's opaque `generatedAt` token.
- `kind` is `original`, `interpretation`, or `proposal`.
- An original has `parentId: null`; derivatives require its original record ID,
  never another derivative. They inherit its digest and structure unchanged.
- `list_intent_records()` returns all records for the configured canonical
  repository root, including stale and missing bindings, in append order.
- Records contain `id`, `kind`, `text`, `parentId`, `originalId`, `createdAt`,
  `symbol`, `snapshot`, and `bindingStatus`. An original references its own ID.
- `symbol` contains `nodeId`, `label`, `kind`, `sourceRange`, and `sourceRoot`.
- `snapshot` contains `contentHash`, `hashAlgorithm: "sha256"`, `byteLength`,
  `capturedAt`, `analysisAt`, `precision`, `repositoryRevision`,
  `worktreeDigest`, `worktreeDigestScope: "analyzed_rust_sources"`, and
  `structuralSnapshot: { nodes, edges }`.
- Both digests are `sha256:` followed by 64 lowercase hexadecimal characters.
- `createdAt` and `capturedAt` are Unix-millisecond strings. Analysis tokens are
  opaque; do not parse them as dates.
- Raw source is absent from both IPC responses and persistence DTOs.

`repositoryRevision` is an optional Git HEAD observed at analysis completion.
It does not establish a clean worktree, identify uncommitted edits, or promise
that HEAD contains the saved structural snapshot. It may be null. The digests
identify the captured worktree source bytes independently of Git.

## Digest coverage and freshness

`contentHash` is SHA-256 of the entire selected file's exact UTF-8 bytes,
including CRLF and comments, although no such bytes are stored in the journal.

`worktreeDigest` has deliberately limited coverage: only successfully captured
Rust files in that analysis. It is not a whole-repository digest. It excludes
Cargo manifests, lockfiles, assets, uncaptured files, and files skipped because
of parsing, read failures, or size limits. Creating an uncaptured file is not
detected by historical disk checks until a new analysis includes it. A private
sorted manifest of relative paths, SHA-256 digests, and byte lengths establishes
the exact saved coverage without retaining file bodies.

The canonical digest encoding is SHA-256 over:

1. UTF-8 `whip-docs:analyzed-rust-sources:v1` followed by one NUL byte.
2. For each captured file in ascending Rust string/UTF-8 path order: path byte
   length as unsigned 64-bit big-endian, path UTF-8 bytes, source byte length as
   unsigned 64-bit big-endian, then the ASCII `sha256:`-prefixed content digest.

Append compares the complete current captured source set to the ephemeral
parser bytes, then writes only metadata. Derivatives additionally require the
same selected identity, selected-file digest, source-set digest, and saved
structure as the original. Binding checks after restart use the persisted
cryptographic fingerprints and retain history even if source files disappear.

`bindingStatus` is `current` only if all covered disk fingerprints match and
current analyzed selected metadata, source-set digest, and saved same-file
structure also match. `stale` means covered source or structure changed;
`missing` includes an unreadable, missing, unsafe, or oversized covered file.
`unverified` means covered source still matches but no corresponding in-memory
analysis is available. Historical structure and intent load after restart
without source reconstruction. Status is checked during commands, not
continuously while the app is idle.

## Persistence, legacy data, and privacy

App data contains `intent-journal-v2.jsonl`. Originals own a private
`sourceFiles` path/hash/size manifest; derivatives reference it and store no
manifest copy. No persisted type contains a raw-source field. The journal does
retain human intent, local paths, symbol names, graph structure, digests, and
optional revision metadata, so treat it as private project data. Nothing is
sent to a model or remote service by these commands. New journal and lock files
use owner-only permissions on Unix; platform app-data permissions apply
elsewhere. The journal is not encrypted.

If `intent-journal-v1.jsonl` exists, v2 reads and appends fail closed before
opening it. That legacy prototype format may contain full source bodies. It
is never automatically read, copied, migrated, deleted, or overwritten. Close
all app instances and deliberately archive it securely outside app data before
starting a fresh v2 journal. This is a manual privacy boundary, not a silent
migration; v1 history is not automatically imported.

Each successful append adds one JSON line and synchronizes it to disk. Prior
bytes remain untouched. This API's immutability does not prevent a person or
program from directly editing the file; hashes are not signatures. A process
mutex and exclusive `intent-journal-v2.lock` serialize reads/writes. A crash can
leave a lock or incomplete line. Neither is silently repaired. Corrupt,
unsupported, or inconsistent records block reads and appends without discarding
a prefix. After interruption, close all instances, back up the files, inspect
the journal, and recover a known-good backup before removing a stale lock.
An I/O failure can have an uncertain write outcome; inspect before retrying.

## Safeguards and limits

- Frontend callers supply node IDs, never paths or source content.
- Source reads use the analyzed canonical root, reject traversal and symlink
  escapes, require regular files, and re-resolve paths after reading.
- Freshness is a point-in-time check, not an atomic filesystem transaction or
  protection from an adversarial process racing directory replacement.
- Root changes invalidate analysis. Old-root analyses cannot commit. A binding
  gate serializes appends with root/graph commits and survives caller cancellation.
- Reads are capped at 2 MiB per Rust file, 64 MiB captured source per analysis,
  16 KiB intent text, and 128 MiB journal. Skipped files produce diagnostics.
- There is no cross-rename universal identity, repository relocation mapping,
  full-repository coverage claim, source export, or automatic code recovery.

## Tests and validation

Tests cover append immutability, source-body/comment-marker exclusion from disk
and IPC, exact source digest vectors, restart reads, saved structural history
when source is unavailable, digest coverage and changed covered files,
original-only parent binding, stale tokens, renamed/missing files, traversal,
symlink escape, malformed/corrupt journals, legacy v1 rejection, and locks.

Run `cargo test`, `cargo fmt --check`, and
`cargo clippy --workspace --all-targets` in a Rust/Tauri development environment.
This environment has no Cargo, rustc, or rustfmt, so compilation and Rust tests
remain unverified. SHA-256 uses `sha2` 0.10.9 already present in Cargo.lock; the
prototype adds a direct dependency without hand-rolled cryptography.
