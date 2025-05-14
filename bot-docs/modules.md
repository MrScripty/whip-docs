# Whip Docs - Modules and Files

## Project Overview

Whip Docs is a static website designed to host documentation for the Studio Whip project. It features an interactive Vulkan API overview, a Rust module dependency graph with an associated interaction tree, a dynamic Git commit banner, and a pop-up source code viewer. It uses HTML, CSS, and JavaScript, leveraging `marked.js`, `highlight.js`, and `d3.js` for content rendering and visualization.

## Module Structure (File Structure)
├── index.html
├── rust-doc-tool/
│   ├── Cargo.toml
│   ├── output/
│   │   └── module_graph.json
│   └── src/
│       ├── analyzer.rs
│       ├── cli.rs
│       ├── config.rs
│       └── main.rs
├── scripts/
│   ├── graphs/
│   │   └── module_dependency_graph.js
│   ├── lists/
│   │   ├── graph_interaction_tree.js
│   │   └── tree.js
│   └── ui/
│       ├── code-viewer.js
│       ├── column-resizer.js
│       └── commit-banner.js
├── utilities/
│   ├── generate_md_files.py
│   ├── prompt_tool.sh
│   └── prompts/
│       └── generate_documentation.md
├── web-pages/
│   ├── components/
│   │   ├── code-viewer.css
│   │   ├── code-viewer.html
│   │   ├── commit-banner.css
│   │   └── commit-banner.html
│   ├── module-graph.html
│   ├── shared-styles.css
│   ├── vulkan-engine.html
│   └── vulkan-overview.html
├── whip-docs/
│   ├── descriptions/
│   │   └── [ComponentName].md (Example: Instance.md, etc.)
│   └── trees/
│       └── vulkan_2d_rendering.json

*(Note: `rust-doc-tool/` (except its `output/module_graph.json`), and `utilities/` are for development/generation purposes and not part of the deployed website itself.)*

## Modules (Files) and Their Functions

---

**Filename**: `index.html`

*   **Purpose**: The entry point of the website, immediately redirects the user to `web-pages/module-graph.html`.
*   **Key Features/Elements**: Uses an HTML `<meta http-equiv="refresh">` tag for redirection.
*   **Notes**: Provides seamless entry to the module graph page.

---

**Filename**: `rust-doc-tool/Cargo.toml`

*   **Purpose**: Defines the `rust-doc-tool` Rust project's metadata, dependencies (like `clap`, `serde`, `syn`), and build configuration.
*   **Key Features/Elements**: `[package]` section with name, version. `[dependencies]` section listing crates used by the tool.
*   **Notes**: Part of the development tool, not the deployed website. Essential for building `rust-doc-tool`.

---

**Filename**: `rust-doc-tool/src/analyzer.rs`

*   **Purpose**: Core analysis logic for the `rust-doc-tool`. Parses Rust source files to build a module dependency graph.
*   **Key Features/Elements/Functions**:
    *   `analyze_project(project_path)`: Main entry point to analyze a Rust project directory. Discovers files, parses them using `syn`, identifies imports (`use`) and module declarations (`mod`), and resolves dependencies (including through `mod.rs` files).
    *   `count_code_lines(content)`: Calculates non-comment lines of code.
    *   `Node`, `Edge`, `Interaction`, `InteractionKind`, `ModuleGraph`: Structs and enums defining the graph data structure.
    *   Uses `walkdir` for file traversal and `syn` for Rust code parsing.
*   **Notes**: The primary engine for generating the data in `module_graph.json`. Part of the development tool.

---

**Filename**: `rust-doc-tool/src/cli.rs`

*   **Purpose**: Defines the command-line interface for `rust-doc-tool` using the `clap` crate.
*   **Key Features/Elements/Functions**:
    *   `Cli` struct: Top-level command parser.
    *   `Commands` enum: Subcommands like `Config` and `Generate`.
    *   `ConfigArgs`, `ConfigCommands`: Structures for configuration-related subcommands (e.g., `show`, `set-path`).
*   **Notes**: Handles user interaction with the `rust-doc-tool`. Part of the development tool.

---

**Filename**: `rust-doc-tool/src/config.rs`

*   **Purpose**: Manages configuration for `rust-doc-tool`, primarily the path to the Rust project to be analyzed.
*   **Key Features/Elements/Functions**:
    *   `Config` struct: Stores configuration data (e.g., `project_path`).
    *   `load_config()`, `save_config()`: Functions to read from and write to a JSON configuration file (`tool_config.json` in `user/` directory).
    *   `get_validated_project_path()`: Retrieves and validates the configured project path.
    *   `ensure_dir_exists()`: Utility to create directories if they don't exist (e.g. for config and output).
*   **Notes**: Persists tool settings. Part of the development tool.

---

**Filename**: `rust-doc-tool/src/main.rs`

*   **Purpose**: The main entry point for the `rust-doc-tool` command-line application.
*   **Key Features/Elements/Functions**:
    *   `main()`: Parses CLI arguments, sets up logging, and dispatches to command handlers.
    *   `handle_config_command()`: Handles configuration subcommands.
    *   `prompt_and_save_path()`: Interactively prompts user for project path if not set or invalid.
    *   `run_generation_logic()`: Coordinates the analysis by calling `analyzer::analyze_project` and saves the resulting graph to `output/module_graph.json`.
    *   `handle_generate_command_with_prompting()`: Manages the flow for the 'generate' command, including prompting for configuration if needed.
*   **Notes**: Orchestrates the `rust-doc-tool`'s operations. Part of the development tool.

---

**Filename**: `scripts/lists/tree.js` (Formerly `script.js`)

*   **Purpose**: Core client-side logic for the interactive tree view and content display on `vulkan-overview.html`.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `ASH_BASE_URL`, `VULKAN_SPEC_BASE_URL`, `DOCS_BASE_PATH`, `TREE_FILE_NAME`.
    *   **Global Variables**: `componentInfoData`, `currentSelectedItemLi`, DOM element references.
    *   `loadAndRenderTree(treeFileName)`: Fetches JSON (`vulkan_2d_rendering.json`), builds tree DOM, attaches listeners. Does not auto-select an item on load.
    *   `buildTreeNode(nodeData)`: Recursively creates HTML `<li>` elements for tree nodes.
    *   `loadDescription(componentName)`: Fetches Markdown (`whip-docs/descriptions/[ComponentName].md`), parses with `marked.js`, highlights with `highlight.js`, injects into info panel.
    *   `updateStickyHeaders()`, `updateBranchIndicatorBar()`: Manage UI for tree scrolling.
    *   Event Handlers: For clicks on tree items (to load description), toggles (to expand/collapse), scroll, and resize.
*   **Notes**: Tightly coupled with `vulkan-overview.html` and its data formats. Relies on `marked.js` and `highlight.js`.

---

**Filename**: `scripts/graphs/module_dependency_graph.js`

*   **Purpose**: Renders and manages interactions for the D3.js-based module dependency graph on `module-graph.html`.
*   **Key Features/Elements/Functions**:
    *   **Global Variable**: `window.currentlySelectedGraphNodeData` (stores data of the currently selected graph node for other scripts like `code-viewer.js`).
    *   `initializeOrUpdateGraph()`: Main function to fetch graph data (from `module_graph.json` via `data-graph-src` attribute), set up D3 simulation (forces for layout, collision, clustering), and render SVG nodes (files) and links (interactions).
    *   Node Click Handler: Updates visual state of selected node and related links/clusters. Sets `window.currentlySelectedGraphNodeData`. Calls `window.handleGraphNodeSelection` (defined in `graph_interaction_tree.js`) with selected node data and full graph data.
    *   SVG Click Handler: Deselects node if background is clicked.
    *   `calculateSCurvePathWithDynamicAnchors()`: Calculates paths for links.
    *   Clustering logic to group nodes by directory and apply repulsion between clusters.
    *   Node dragging, zoom/pan functionality.
    *   Dynamic scaling for node size (based on line count) and link width/opacity (based on interaction count).
    *   Handles `data-ignore-files` attribute to filter out specified files from the graph.
*   **Notes**: Relies on `d3.js`. Interacts with `graph_interaction_tree.js` via a global callback and with `code-viewer.js` via a global variable. Central to `module-graph.html`.

---

**Filename**: `scripts/lists/graph_interaction_tree.js`

*   **Purpose**: Manages the tree view on `module-graph.html` that displays detailed interactions for a node selected in the module graph.
*   **Key Features/Elements/Functions**:
    *   `window.handleGraphNodeSelection(selectedGraphNode, fullGraphData)`: Global callback function triggered by `module_dependency_graph.js`. If `selectedGraphNode` is provided, it filters `fullGraphData` to find related edges/interactions. Dynamically builds an HTML tree listing connected files, indicating direction of interaction (e.g., "Uses: ItemX" for outgoing, "Provides: ItemY" for incoming) and coloring items accordingly.
    *   Manages expansion/collapse of interaction details in its tree.
    *   `updateStickyHeaders()`, `updateBranchIndicatorBar()`: UI updates for this specific interaction tree.
*   **Notes**: Works in conjunction with `module_dependency_graph.js`. Populates the left-column tree on `module-graph.html`.

---

**Filename**: `scripts/ui/code-viewer.js`

*   **Purpose**: Manages a pop-up panel for displaying source code fetched from GitHub.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `GITHUB_USER`, `GITHUB_REPO`, `GITHUB_PROJECT_SUBPATH`, `CODE_VIEWER_COMPONENT_PATH`.
    *   `initializeCodeViewer()`: Dynamically fetches `web-pages/components/code-viewer.html` and injects it into the DOM. Sets up event listeners for the panel.
    *   `displayCodeForNode(nodeData)`: Triggered when `window.currentlySelectedGraphNodeData` (from `module_dependency_graph.js`) is set and a hotkey is pressed. Constructs GitHub raw content URL, fetches the file content, uses `highlight.js` for syntax highlighting, and displays it in the panel.
    *   `hideCodeViewer()`: Hides the panel.
    *   Event Handlers: Listens for '`~`' or '`` ` ``' key to toggle/update viewer, 'Escape' to hide. Handles dragging of the panel.
*   **Notes**: Relies on `highlight.js` and `window.currentlySelectedGraphNodeData`. UI component for `module-graph.html`.

---

**Filename**: `scripts/ui/column-resizer.js`

*   **Purpose**: Provides reusable functionality for creating draggable vertical column dividers.
*   **Key Features/Elements/Functions**:
    *   `initColumnResizer(leftCol, divider, container, storageKey, isFlexBasis, callback)`: Initializes the resizing behavior for a two-column layout.
    *   Handles mouse events (`mousedown`, `mousemove`, `mouseup`) for dragging the divider.
    *   Persists the resized column width or flex-basis to `localStorage` using `storageKey`.
    *   Optionally calls a `callback` function after resize (e.g., to trigger graph redraws).
*   **Notes**: Generic UI utility used on `vulkan-overview.html` and `module-graph.html`.

---

**Filename**: `scripts/ui/commit-banner.js`

*   **Purpose**: Dynamically loads and populates a banner with the latest Git commits from a GitHub repository.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `GITHUB_REPO_API_URL`, `NUM_COMMITS_TO_DISPLAY`, `bannerHtmlPath`.
    *   `DOMContentLoaded` listener:
        *   Fetches the HTML structure from `web-pages/components/commit-banner.html`.
        *   Injects this HTML into a placeholder div (`#dynamic-commit-banner-placeholder`).
        *   Fetches commit data from the GitHub API for `MrScripty/Studio-Whip`.
        *   Populates the banner with commit messages, dates, and links to GitHub. Commit items include tooltips with full SHA.
    *   Implements click-and-drag horizontal scrolling for the banner.
    *   Handles API errors and rate limiting display.
*   **Notes**: Designed to be included in pages that need the commit banner (e.g., `vulkan-overview.html`, `module-graph.html`). Relies on `fetch` API.

---

**Filename**: `utilities/generate_md_files.py`

*   **Purpose**: A Python script to automatically create placeholder Markdown files in `whip-docs/descriptions/` based on the `name` entries in a JSON tree file (like `vulkan_2d_rendering.json`).
*   **Key Features/Elements/Functions**:
    *   `create_description_files(tree_data, output_dir)`: Recursively traverses the JSON tree and creates `.md` files.
    *   Command-line arguments for specifying the tree file and output directory.
    *   Avoids overwriting existing files.
*   **Notes**: Development utility to help scaffold documentation content. Not part of the deployed website.

---

**Filename**: `utilities/prompt_tool.sh`

*   **Purpose**: A shell script designed to aggregate content from various project files into a single temporary file, typically for copying into an LLM prompt.
*   **Key Features/Elements/Functions**:
    *   Dynamically determines project base directory.
    *   Offers options to include: all files (with exclusions), web files, `rust-doc-tool` files, AI documentation files, or a custom list.
    *   Uses `git ls-files` (if in a git repo) or `find` to list files, respecting `.gitignore`.
    *   Appends file content to a temporary file, adding language hints for code blocks.
    *   Attempts to copy the aggregated content to the system clipboard.
*   **Notes**: Development utility for preparing context for AI models. Not part of the deployed website.

---

**Filename**: `web-pages/components/code-viewer.css`

*   **Purpose**: Provides styling for the pop-up code viewer panel.
*   **Key Features/Elements**: Styles for `.code-viewer-panel` (fixed position, dimensions, background), `.cv-header` (draggable area, filename, close button), and `.cv-content-wrapper pre code` (for displaying highlighted code).
*   **Notes**: Used by `scripts/ui/code-viewer.js` and `web-pages/components/code-viewer.html`.

---

**Filename**: `web-pages/components/code-viewer.html`

*   **Purpose**: Contains the HTML structure for the code viewer panel.
*   **Key Features/Elements**: A root `div#code-viewer-panel-container.code-viewer-panel` with a header (`.cv-header` containing `#cv-filename` and `#cv-close-btn`) and a content area (`#cv-content-wrapper` containing `pre > code#cv-code-block`).
*   **Notes**: This is an HTML fragment, dynamically loaded and injected by `scripts/ui/code-viewer.js`.

---

**Filename**: `web-pages/components/commit-banner.css`

*   **Purpose**: Provides specific styling for the Git commit banner and its items.
*   **Key Features/Elements**: Styles for the banner placeholder (`.commit-banner-placeholder`), the inner banner (`.commit-banner`), the commit list (`ul#commit-list`), and individual commit items (`.commit-item`), including their text elements (message, date).
*   **Notes**: Defines the horizontal layout, appearance, and drag-to-scroll behavior of the commit banner.

---

**Filename**: `web-pages/components/commit-banner.html`

*   **Purpose**: Contains the HTML structure for the Git commit banner.
*   **Key Features/Elements**: A `div.commit-banner` containing a `ul#commit-list` where commit items are dynamically inserted by `scripts/ui/commit-banner.js`. Includes a "Loading commits..." placeholder.
*   **Notes**: This is an HTML fragment, not a full page. It's loaded and injected by JavaScript.

---

**Filename**: `web-pages/module-graph.html`

*   **Purpose**: Displays an interactive Rust module dependency graph and a tree view for selected node interactions. Also includes the code viewer functionality.
*   **Key Features/Elements**:
    *   Includes `shared-styles.css`, `components/commit-banner.css`, `components/code-viewer.css`, and `highlight.js` theme CSS.
    *   Includes `d3.js` (CDN), `highlight.js` (CDN).
    *   Scripts: `scripts/graphs/module_dependency_graph.js`, `scripts/lists/graph_interaction_tree.js`, `scripts/ui/column-resizer.js`, `scripts/ui/commit-banner.js`, `scripts/ui/code-viewer.js`.
    *   Defines a two-column layout (`.left-column` for interaction tree, `.right-column` for graph).
    *   Contains `#dynamic-commit-banner-placeholder` for the commit banner.
    *   Contains `#module-graph-area` (for D3 graph, with `data-graph-src` and `data-ignore-files` attributes) and a `ul` in `.left-column .tree-content-wrapper` (for interaction tree).
    *   Contains `#code-viewer-dynamic-injection-point` for the code viewer.
*   **Notes**: Core page for visualizing Rust module dependencies and their interactions. The default page users are redirected to.

---

**Filename**: `web-pages/shared-styles.css`

*   **Purpose**: Global CSS for layout (flexbox-based), header, typography, scrollbars across the site.
*   **Key Features/Elements**: Styles for `body`, `.main-header` (title, nav), `.main-content`, basic typography, and global scrollbar styling.
*   **Notes**: Included by main HTML pages (`vulkan-overview.html`, `module-graph.html`, `vulkan-engine.html`).

---

**Filename**: `web-pages/vulkan-engine.html`

*   **Purpose**: Placeholder for future Vulkan engine documentation.
*   **Key Features/Elements**: Basic HTML structure, includes `shared-styles.css`. Links to other main pages in the header.
*   **Notes**: Static content. Does not include the commit banner by default, but includes placeholder for it.

---

**Filename**: `web-pages/vulkan-overview.html`

*   **Purpose**: Main interactive page for Vulkan component documentation tree.
*   **Key Features/Elements**:
    *   Includes `shared-styles.css`, `components/commit-banner.css`, and `highlight.js` theme CSS.
    *   Includes `marked.js`, `highlight.js` (CDNs).
    *   Scripts: `scripts/lists/tree.js`, `scripts/ui/column-resizer.js`, `scripts/ui/commit-banner.js`.
    *   Defines layout with `.tree-column` and `.info-column`, separated by a draggable `.column-divider`.
    *   Contains `#dynamic-commit-banner-placeholder` for the commit banner.
    *   Placeholders for dynamic content: `.tree-content-wrapper ul` (for Vulkan components tree), `#info-content` (for Markdown descriptions), `.info-tags-bar` and `.info-links-bar` (for metadata).
*   **Notes**: Core page for Vulkan API documentation. Initial state shows "Select an item..." in the info panel.

---

**Filename**: `whip-docs/descriptions/[ComponentName].md` (File Group)

*   **Purpose**: Detailed Markdown documentation for individual components displayed on `vulkan-overview.html`.
*   **Key Features/Elements**: Standard Markdown, expected to be parsed by `marked.js` and `highlight.js`.
*   **Notes**: Dynamically fetched by `scripts/lists/tree.js` based on the selected component name. Filenames match component names (e.g., `Instance.md`).

---

**Filename**: `whip-docs/trees/vulkan_2d_rendering.json`

*   **Purpose**: Data source for the Vulkan component tree on `vulkan-overview.html`.
*   **Key Features/Elements**: Contains a `tree` array defining the hierarchical structure of Vulkan components (nodes with `name`, `tag`, and optional `children`). Also includes a `componentInfo` object mapping component names to metadata like `ashPath` (for docs.rs links) and `vulkanAnchor` or `vulkanPath` (for Vulkan specification links).
*   **Notes**: Structure is vital for `scripts/lists/tree.js` to build the tree and display relevant links.

---

**Filename**: `rust-doc-tool/output/module_graph.json`

*   **Purpose**: Data source for the module dependency graph on `module-graph.html`.
*   **Key Features/Elements**:
    *   `nodes` array: Each object represents a Rust file/module with properties like `id` (path relative to `src`), `label` (filename), and `line_count`.
    *   `edges` array: Each object represents a directed relationship between two nodes (`source` and `target` file IDs) and includes an `interactions` array detailing the types of interactions (e.g., `kind: "import"`, `name: "ItemX"` or `kind: "moduleDecl"`, `name: "module_name"`).
*   **Notes**: Generated by the `rust-doc-tool`. Consumed by `scripts/graphs/module_dependency_graph.js`.

---

## External Dependencies

*   **marked.js** (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`): Markdown parsing.
*   **highlight.js** (`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` & theme CSS e.g., `atom-one-dark.min.css`): Syntax highlighting.
*   **d3.js** (`https://d3js.org/d3.v7.min.js`): SVG graph visualization and interaction for the module dependency graph.
*   **GitHub API**:
    *   Commits API (`https://api.github.com/repos/MrScripty/Studio-Whip/commits`): Source for Git commit data for the banner.
    *   Repository API (`https://api.github.com/repos/MrScripty/Studio-Whip`): Used once by `code-viewer.js` to determine the default branch.
*   **GitHub Raw Content URLs** (e.g., `https://raw.githubusercontent.com/MrScripty/Studio-Whip/[branch]/rust/src/[file_path]`): Source for fetching Rust file content for the code viewer.