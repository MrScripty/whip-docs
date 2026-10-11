# Verification record

Date: 2026-10-11 (UTC).

This is the original publication record for `01edd062`. Later cloud validation
compiled 79 backend tests in an isolated headless harness and captured real
browser screenshots. See [the current graph restoration record](graph-restoration/README.md)
for the approved correction on top of `5e9900a` and its remaining native blockers.
The absent-toolchain and browser restrictions below describe the earlier environment.

## Passed

- All 145 baseline Git blob hashes matched public upstream commit
  `3e299d6bf1e7495d80377b8e2ba47ba48366a5a3`. See source-provenance.json.
  Git transport was unavailable; the local baseline is a verified materialized
  snapshot, not upstream history.
- Baseline npm check: lint, TypeScript and 77 tests passed before edits.
- Final npm check: ESLint, TypeScript and 96 tests passed. The 19 additional
  frontend tests cover conservative file expansion and graph metadata, original
  preservation, separate derivatives, source-body exclusion, structural-history
  reopening, stale/renamed source,
  stale selection, input bounds, corrupt storage, legacy-journal refusal and
  SHA-256 vectors and structural-change rejection.
- Production Vite build passed. It reports a bundle-size warning for the
  Three.js-containing entry chunk; this is not a build failure.
- Independent code review found and fixed a native concurrency race. Intent
  appends now serialize with repository/analysis commits. This review is not
  Rust compilation or runtime evidence.

## Blocked / not verified

- Rust compiler, Cargo and rustfmt are absent. Twenty-five Rust tests were
  added but could not be compiled or run. Required: cargo test; cargo fmt --check;
  cargo clippy --workspace --all-targets.
- Tauri native app launch, real repository analysis, native disk-journal restart
  recovery, and end-to-end integration have not been verified.
- Browser visual verification was attempted, not completed. Launching cloud
  Chromium from the executor failed with `socket() failed: Operation not
  permitted`. The existing cloud browser could not reach the executor-local
  server (`ERR_CONNECTION_REFUSED`). Its URL policy disallows file URLs.
  No screenshot was captured and no visual pass is claimed.
- An additional optional svelte-check tool attempt was cancelled by the tool
  approval layer before it ran. The existing TypeScript check and Svelte/Vite
  compilation passed; dedicated Svelte semantic checking remains outstanding.

## Native acceptance checklist

1. Run all commands above and fix any compiler, formatting or lint failures.
2. Start npm run dev:desktop in a supported native environment.
3. Open a public Rust repository with Cargo.toml; expand and collapse a file
   repeatedly. Select both a typed symbol and a graph label; orbit and zoom.
4. Save original intent containing exact whitespace/Unicode. Append a separate
   interpretation and a proposal. Confirm original text and source binding stay
   unchanged. Inspect the V2 journal: it must contain no source bodies, comments
   or source string literals, only intent, structural metadata and digests.
5. Quit and reopen the app. Show all repository history before reanalysis, then
   analyze the same root. Confirm recovered records and current binding status.
6. Modify/rename the source externally, reload history and try to append against
   the old analysis. Confirm a stale/missing status or rejection; no relinking.
7. Switch repositories and repeat Analyze while navigating. No old root/analysis
   may accept a new intent after a transition has committed.
8. Test storage failure, an interrupted journal, empty text, repeated save,
   selection changes with drafts, and closing/reopening. Never silently rewrite
   or truncate damaged journal data.
9. Capture real application pixels and label fixture/native execution accurately.

This record establishes local verification only. Publication status is reported
separately with the remote branch. PR creation requires approval. No merge or deployment
is part of this prototype.
