# Current multilingual fixture screenshots

Actual Chromium captures of code commit
`85c9cea426e7fc9abe55c0f4e7ba706cdea572c2` on the integration branch, with
extractor `whip-docs-syntax@3`. These replay real Rust service output from the
23-file synthetic public fixture (21 source files captured). Native Tauri IPC
is not running or validated. No private source or model inference is involved.

![Compact file overview](mixed-fixture-file-overview.png)

Compact file overview: original file/directory geometry and routing, top toolbar,
small disclosure, concise inspector, and an honest Fixture Preview indicator.

![Expanded multilingual symbols](mixed-fixture-file-expanded.png)

Expanded Python symbols share the same scene/camera and parent file. Exact byte
ranges, original intent and separate proposals are available in the inspector.
Normal disclosure toggles one file; Ctrl-click / Ctrl+Enter / Ctrl+Space applies the
new state to eligible repository files, bounded to 24 files and 4,096 symbols.

The browser checks also exercise 768px, 390px and 360px layouts and settings
reachability. These two published images are the desktop overview and expansion.
See [integration verification](../../verification/integration/README.md).

# Historical Rust fixture screenshots

Actual Chromium captures of the interface at
`83aaff1dd6f4acae11a292d2bb8221adeca1e75e`, replaying recorded Rust backend data
from the public synthetic fixture. Native Tauri IPC is not running or validated
by these screenshots. No private source is shown.

![File overview](browser-fixture-file-overview.png)

File overview: the original repository, directory and file geometry inside the
new intent workspace theme.

![Expanded file symbols](browser-fixture-file-expanded.png)

Expanded file: optional typed symbols share the existing scene and camera,
anchored to their parent file while the original file graph remains present.
