# Compact inspector verification

2026-10-11 UTC. UI-only follow-up to integration
`0efd5e8e7aab8c525f98839a9466685bcb98c731` for draft PR #2.

## Change

Remove “Capture the why”, “What should this symbol mean?” and the append-only
help paragraph. Replace the separate inspector/kind/title/path rows with a
15px symbol name, kind and parent-file link in one wrapping header. The link
retains the full path in its tooltip and accessible name. File selections retain
the full path as a tooltip and accessible description. Short form labels keep
original intent, interpretation and proposal controls named clearly.

Tighten inspector padding, metadata gaps, composer spacing, journal margins and
record line heights. Existing text/control sizes remain readable; intent-form selects
are at least 36px high and inspector text/disclosure controls at least 28px.
Binding status, exact byte ranges, completeness, coverage, diagnostics and retained
provenance remain present. No source analysis, graph geometry/camera, journal,
proposal or persistence logic changed.

Measured at 1680×1050 with `Boxed` selected, original mode and an empty journal:

| Element | Previous offset from inspector top | Current offset |
| --- | ---: | ---: |
| Symbol title | 53px | 15.5px |
| Intent textarea | 454px | 246px |
| Preserve original button | 556px | 338px |
| Journal heading | 733.9px | 440px |

## Passed

- ESLint, TypeScript, all **128 frontend tests**, production build. Existing
  large Three.js chunk warning remains.
- [Five focused inspector browser groups](inspector-browser-results.json): compact
  header/copy, full-path accessibility, Enter/Tab navigation and submission,
  unchanged original bytes and separate proposals, provenance/status visibility,
  1680/768/390/360px control reachability and overflow checks, qualified callable
  spelling, diagnostics, reload, stale original rejection and corrupt storage refusal.
- [Nine mixed browser regression groups](compact-browser-results.json): disclosures
  and drafts, filtered/collapsed batch scope, dialect/coverage states, responsive
  settings access, exact intent/persistence/privacy, corrupt storage preservation,
  explicit IPC-stub root/token/dialect association, and fifteen single plus ten
  batch disclosure cycles preserving original mesh IDs, routed geometry, visibility,
  camera and target. No browser page errors in either suite.
- Fresh [actual UI screenshots](../../docs/images/README.md) at all four widths,
  plus a direct rendered-inspector capture. [Source hashes and capture metadata](../../docs/images/compact-inspector-provenance.json)
  match the committed UI component, stylesheet and @5 fixture. Captures used the
  existing task sandbox permissions without escalation.
- Diff review confirms the Rust/parser/grammar code, fixture snapshots, intent
  backends, workspace loader, expansion behavior and graph/overlay implementations
  are unchanged from `0efd5e8`.

The broad script initially timed out because its filtered-collapse test assumed
`web/app.ts` would fit inside the 24-file expansion cap. The @5 fixture has more
eligible files. It now filters/collapses the explicitly expanded batch target,
which is guaranteed to be retained, and still asserts the same whole-repository
collapse behavior. The corrected suite passed; no product gate was weakened.

## Boundaries and reproduction

The earlier 135 Rust tests, Clippy and formatting result remains evidence for the
unchanged backend; it was not rerun for this inspector-only change. Browser tests
use genuine Chromium/WebGL with recorded public Rust-service output. The IPC stub
checks frontend contracts only. Native Tauri linking, actual IPC and desktop restart
acceptance remain unverified because GTK/GLib/WebKit prerequisites are unavailable.
Parser @5 stays at bounded syntax extraction; full language/Passeur semantic parity
is not claimed. No merge or deployment is included.

```sh
npm run check
npm run build
npm run dev
# In another shell, with installed Playwright and Chromium:
PLAYWRIGHT_MODULE=/path/to/playwright-core GRAPH_TEST_ORIGIN=http://127.0.0.1:1420 \
  EVIDENCE_DIR=/tmp/whip-inspector node verification/integration/inspector-browser-check.cjs
PLAYWRIGHT_MODULE=/path/to/playwright-core GRAPH_TEST_ORIGIN=http://127.0.0.1:1420 \
  EVIDENCE_DIR=/tmp/whip-inspector node verification/integration/browser-check.cjs
PLAYWRIGHT_MODULE=/path/to/playwright-core GRAPH_TEST_ORIGIN=http://127.0.0.1:1420 \
  EVIDENCE_DIR=/tmp/whip-inspector node verification/integration/capture-inspector.cjs
```
