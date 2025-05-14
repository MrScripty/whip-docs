# Whip Docs - Modules and Files

## Project Overview

Whip Docs is a static website designed to host documentation for the Studio Whip project. It features an interactive Vulkan API overview, a Rust module dependency graph, and a Git commit banner. It uses HTML, CSS, and JavaScript, leveraging `marked.js`, `highlight.js`, and `d3.js` for content rendering and visualization.

## Module Structure (File Structure)
├── index.html
├── scripts/
│   ├── graphs/
│   │   └── module_dependency_graph.js
│   ├── lists/
│   │   ├── graph_interaction_tree.js
│   │   └── tree.js
│   └── ui/
│       ├── column-resizer.js
│       └── commit-banner.js
├── web-pages/
│   ├── components/
│   │   ├── commit-banner.css
│   │   └── commit-banner.html
│   ├── shared-styles.css
│   ├── module-graph.html
│   ├── vulkan-engine.html
│   └── vulkan-overview.html
├── whip-docs/
│   ├── descriptions/
│   │   └── [ComponentName].md (Example: Instance.md, etc.)
│   └── trees/
│       └── vulkan_2d_rendering.json
├── rust-doc-tool/
│   ├── output/
│   │   └── module_graph.json
│   └── ... (other tool files)
└── utilities/
    └── prompts/
        └── generate_documentation.md (Meta-file, not part of the website runtime)

*(Note: `utilities/` and `rust-doc-tool/` (except its `output/module_graph.json`) are for development/generation purposes and not part of the deployed website itself.)*

## Modules (Files) and Their Functions

---

**Filename**: `index.html`

*   **Purpose**: The entry point of the website, immediately redirects the user to `web-pages/module-graph.html`.
*   **Key Features/Elements**: Uses an HTML `<meta http-equiv="refresh">` tag.
*   **Notes**: Provides seamless entry.

---

**Filename**: `scripts/lists/tree.js` (Formerly `script.js`)

*   **Purpose**: Core client-side logic for the interactive tree view and content display on `vulkan-overview.html`.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `ASH_BASE_URL`, `VULKAN_SPEC_BASE_URL`, `DOCS_BASE_PATH`, `TREE_FILE_NAME`.
    *   **Global Variables**: `componentInfoData`, `currentSelectedItemLi`, DOM element references.
    *   `loadAndRenderTree(treeFileName)`: Fetches JSON, builds tree DOM, attaches listeners.
    *   `buildTreeNode(nodeData)`: Recursively creates HTML `<li>` elements for tree nodes.
    *   `loadDescription(componentName)`: Fetches Markdown, parses with `marked.js`, highlights with `highlight.js`, injects into info panel.
    *   `updateStickyHeaders()`, `updateBranchIndicatorBar()`: Manage UI for tree scrolling.
    *   Event Handlers: For clicks, scroll, resize.
*   **Notes**: Tightly coupled with `vulkan-overview.html` and its data formats. Relies on `marked.js` and `highlight.js`.

---

**Filename**: `scripts/graphs/module_dependency_graph.js`

*   **Purpose**: Renders and manages interactions for the D3.js-based module dependency graph on `module-graph.html`.
*   **Key Features/Elements/Functions**:
    *   Fetches graph data from `rust-doc-tool/output/module_graph.json`.
    *   Uses D3.js to create SVG nodes and links.
    *   Implements force simulation for layout.
    *   Handles node selection, dragging, and zoom/pan.
    *   `initializeOrUpdateGraph()`: Main function to set up or refresh the graph.
    *   `calculateSCurvePathWithDynamicAnchors()`: Calculates link paths.
    *   Calls `window.handleGraphNodeSelection` on node click.
*   **Notes**: Relies on `d3.js`. Interacts with `graph_interaction_tree.js` via global callback.

---

**Filename**: `scripts/lists/graph_interaction_tree.js`

*   **Purpose**: Manages the tree view on `module-graph.html` that displays detailed interactions for a node selected in the module graph.
*   **Key Features/Elements/Functions**:
    *   `window.handleGraphNodeSelection(selectedGraphNode, fullGraphData)`: Callback triggered by `module_dependency_graph.js`. Filters `fullGraphData` based on `selectedGraphNode` to find related edges/interactions. Dynamically builds an HTML tree listing connected files and interaction details (e.g., "Uses: ItemX", "Provides: ItemY").
    *   Manages expansion/collapse of interaction details.
    *   `updateStickyHeaders()`, `updateBranchIndicatorBar()`: UI updates for this specific tree.
*   **Notes**: Works in conjunction with `module_dependency_graph.js`.

---

**Filename**: `scripts/ui/column-resizer.js`

*   **Purpose**: Provides reusable functionality for creating draggable vertical column dividers.
*   **Key Features/Elements/Functions**:
    *   `initColumnResizer(leftCol, divider, container, storageKey, isFlexBasis, callback)`: Initializes the resizing behavior.
    *   Handles mouse events for dragging.
    *   Persists column width/flex-basis to `localStorage`.
    *   Optionally calls a callback after resize.
*   **Notes**: Generic UI utility.

---

**Filename**: `scripts/ui/commit-banner.js`

*   **Purpose**: Dynamically loads and populates a banner with the latest Git commits from a GitHub repository.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `GITHUB_REPO_API_URL` (target repo), `NUM_COMMITS_TO_DISPLAY`.
    *   `DOMContentLoaded` listener:
        *   Fetches the HTML structure from `web-pages/components/commit-banner.html`.
        *   Injects this HTML into a placeholder div (`#dynamic-commit-banner-placeholder`) on the main page.
        *   Fetches commit data from the GitHub API.
        *   Populates the banner with commit messages, authors, dates, and links to GitHub.
    *   Handles API errors and rate limiting.
*   **Notes**: Designed to be included in pages that need the commit banner. Relies on `fetch` API.

---

**Filename**: `web-pages/shared-styles.css`

*   **Purpose**: Global CSS for layout, header, typography, scrollbars across the site.
*   **Key Features/Elements**: Styles for `body`, `.main-header`, `.main-content`, basic typography. Uses flexbox.
*   **Notes**: Included by main HTML pages.

---

**Filename**: `web-pages/components/commit-banner.html`

*   **Purpose**: Contains the HTML structure for the Git commit banner.
*   **Key Features/Elements**: A `div.commit-banner` containing a `ul#commit-list` where commit items are dynamically inserted by `scripts/ui/commit-banner.js`.
*   **Notes**: This is an HTML fragment, not a full page. It's loaded and injected by JavaScript.

---

**Filename**: `web-pages/components/commit-banner.css`

*   **Purpose**: Provides specific styling for the Git commit banner and its items.
*   **Key Features/Elements**: Styles for the banner container (`.commit-banner-placeholder`), the inner banner (`.commit-banner`), the commit list (`ul#commit-list`), and individual commit items (`.commit-item`), including their text elements (message, author, date, SHA).
*   **Notes**: Defines the horizontal layout and appearance of the commit banner.

---

**Filename**: `web-pages/module-graph.html`

*   **Purpose**: Displays an interactive module dependency graph and a tree view for selected node interactions.
*   **Key Features/Elements**:
    *   Includes `shared-styles.css` and `components/commit-banner.css`.
    *   Includes `d3.js` (CDN), `scripts/graphs/module_dependency_graph.js`, `scripts/lists/graph_interaction_tree.js`, `scripts/ui/column-resizer.js`, and `scripts/ui/commit-banner.js`.
    *   Defines a two-column layout (`.left-column` for interaction tree, `.right-column` for graph).
    *   Contains `#dynamic-commit-banner-placeholder` for the commit banner.
    *   Contains `#module-graph-area` (for D3 graph) and a `ul` in `.left-column .tree-content-wrapper` (for interaction tree).
*   **Notes**: Core page for visualizing Rust module dependencies.

---

**Filename**: `web-pages/vulkan-engine.html`

*   **Purpose**: Placeholder for future Vulkan engine documentation.
*   **Key Features/Elements**: Basic HTML structure, includes `shared-styles.css`.
*   **Notes**: Static content. Does not include `scripts/lists/tree.js` or the commit banner by default (can be added if needed).

---

**Filename**: `web-pages/vulkan-overview.html`

*   **Purpose**: Main interactive page for Vulkan component documentation tree.
*   **Key Features/Elements**:
    *   Includes `shared-styles.css` and `components/commit-banner.css`.
    *   Includes `marked.js`, `highlight.js` (CDNs), `scripts/lists/tree.js`, `scripts/ui/column-resizer.js`, and `scripts/ui/commit-banner.js`.
    *   Defines layout with `.tree-column` and `.info-column`.
    *   Contains `#dynamic-commit-banner-placeholder` for the commit banner.
    *   Placeholders for dynamic content: `.tree-content-wrapper ul` (tree), `#info-content` (Markdown).
*   **Notes**: Core page for Vulkan API documentation.

---

**Filename**: `whip-docs/trees/vulkan_2d_rendering.json`

*   **Purpose**: Data source for the Vulkan component tree on `vulkan-overview.html`.
*   **Key Features/Elements**: `tree` array (hierarchy), `componentInfo` object (metadata like external links).
*   **Notes**: Structure is vital for `scripts/lists/tree.js`.

---

**Filename**: `whip-docs/descriptions/[ComponentName].md` (File Group)

*   **Purpose**: Detailed Markdown documentation for components in `vulkan-overview.html`.
*   **Key Features/Elements**: Standard Markdown.
*   **Notes**: Dynamically fetched by `scripts/lists/tree.js`.

---

**Filename**: `rust-doc-tool/output/module_graph.json`

*   **Purpose**: Data source for the module dependency graph on `module-graph.html`.
*   **Key Features/Elements**: `nodes` array (files with metadata like `id`, `label`, `line_count`), `edges` array (interactions between files, with `source`, `target`, and `interactions` list).
*   **Notes**: Generated by the `rust-doc-tool`. Consumed by `scripts/graphs/module_dependency_graph.js`.

---

## External Dependencies

*   **marked.js** (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`): Markdown parsing.
*   **highlight.js** (`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js` & CSS theme): Syntax highlighting.
*   **d3.js** (`https://d3js.org/d3.v7.min.js`): SVG graph visualization and interaction.
*   **GitHub API** (`https://api.github.com/repos/MrScripty/Studio-Whip/commits`): Source for Git commit data for the banner.