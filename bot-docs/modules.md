# Whip Docs - Modules and Files

## Project Overview

Whip Docs is a static website designed to host documentation for the Studio Whip project. Currently, it focuses on providing an interactive, hierarchical view of Vulkan API components related to 2D rendering, loading detailed descriptions dynamically from Markdown files. It uses HTML, CSS, and JavaScript, leveraging `marked.js` and `highlight.js` for content rendering.

## Module Structure (File Structure)
├── index.html
├── script.js
├── web-pages/
│ ├── shared-styles.css
│ ├── vulkan-engine.html
│ └── vulkan-overview.html
├── whip-docs/
│ ├── descriptions/
│ │ └── [ComponentName].md (Example: Instance.md, etc.)
│ └── trees/
│ └── vulkan_2d_rendering.json
└── utilities/
└── prompts/
└── generate_documentation.md (Meta-file, not part of the website runtime)


*(Note: `utilities/` and its contents are for development/generation purposes and not part of the deployed website itself.)*

## Modules (Files) and Their Functions

---

**Filename**: `index.html`

*   **Purpose**: The entry point of the website, immediately redirects the user to the main content page.
*   **Key Features/Elements**: Uses an HTML `<meta http-equiv="refresh">` tag to redirect to `web-pages/vulkan-overview.html`. Includes a fallback link.
*   **Notes**: Provides a seamless entry to the primary documentation view.

---

**Filename**: `script.js`

*   **Purpose**: Contains all the client-side logic for the interactive tree view and content display on the `vulkan-overview.html` page.
*   **Key Features/Elements/Functions**:
    *   **Constants**: `ASH_BASE_URL`, `VULKAN_SPEC_BASE_URL`, `DOCS_BASE_PATH`, `TREE_FILE_NAME` (Configuration for links and data loading).
    *   **Global Variables**: `componentInfoData` (stores metadata), `currentSelectedItemLi` (tracks selection), DOM element references (e.g., `treeColumnRef`, `infoContentDivRef`).
    *   `loadAndRenderTree(treeFileName)`: Fetches JSON, builds the initial tree structure in the DOM, attaches event listeners, and triggers the selection of the first item.
    *   `buildTreeNode(nodeData)`: Recursively creates HTML `<li>` elements for each node in the tree data, including toggles and content spans with appropriate classes and event listeners.
    *   `loadDescription(componentName)`: Fetches the corresponding Markdown file, uses `marked.js` to parse it, `highlight.js` to highlight code, and injects the result into the info panel (`#info-content`).
    *   `updateStickyHeaders()`: Calculates and displays the path of the tree items currently scrolled under the sticky header area.
    *   `updateBranchIndicatorBar()`: Updates the visual indicator bar segments to reflect the position and height of the main tree branches.
    *   `clearAllHighlights()`, `applyParentHighlight()`: Manage CSS classes for visual highlighting of selected items and their ancestors.
    *   Event Handlers: Logic for handling clicks on tree items/toggles, scroll events, and window resize.
*   **Notes**: This script is tightly coupled with the structure of `vulkan-overview.html` and the format of the JSON/Markdown data files. It relies on `marked.js` and `highlight.js` being available globally.

---

**Filename**: `web-pages/shared-styles.css`

*   **Purpose**: Provides global CSS rules for consistent layout and styling across different pages of the website.
*   **Key Features/Elements**: Defines styles for `body`, the main header (`.main-header`, navigation), the main content area (`.main-content`), basic typography (e.g., `h1`), and global scrollbar appearance. Uses flexbox for primary layout.
*   **Notes**: Included by all main HTML pages (`vulkan-overview.html`, `vulkan-engine.html`).

---

**Filename**: `web-pages/vulkan-engine.html`

*   **Purpose**: A placeholder page intended to eventually contain documentation about the Vulkan engine structure.
*   **Key Features/Elements**: Includes the shared header and basic page structure. Contains placeholder text. Uses `shared-styles.css`.
*   **Notes**: Currently static content. Does not include `script.js`.

---

**Filename**: `web-pages/vulkan-overview.html`

*   **Purpose**: The main interactive page displaying the Vulkan component tree and the dynamically loaded documentation content.
*   **Key Features/Elements**:
    *   Includes `shared-styles.css` and page-specific inline `<style>` for the tree view layout.
    *   Includes external libraries (`marked.js`, `highlight.js`) via CDN.
    *   Includes `script.js` to power the interactive elements.
    *   Defines the main layout structure (`.overview-container`) with two columns: `.tree-column` and `.info-column`.
    *   Contains placeholders for dynamic content:
        *   `.tree-column`: Houses `.combined-sticky-header` (for sticky path) and `.tree-content-wrapper` (containing the `<ul>` where the tree is built and the `.branch-indicator-bar-area`).
        *   `.info-column`: Contains `.info-tags-bar`, `.info-links-bar`, and `#info-content` (where Markdown is rendered).
*   **Notes**: This is the core page of the current website functionality. Its structure is essential for `script.js` to function correctly.

---

**Filename**: `whip-docs/trees/vulkan_2d_rendering.json`

*   **Purpose**: Provides the data source for building the interactive tree structure on the `vulkan-overview.html` page.
*   **Key Features/Elements**:
    *   `tree`: An array of nested objects representing the hierarchy. Each object has `name` (string, displayed text), `tag` (string, e.g., "essential", "secondary"), and optionally `children` (array of node objects).
    *   `componentInfo`: An object mapping component names (strings matching `name` in the tree) to metadata objects. Metadata can include `ashPath` (for Ash API docs link) and `vulkanAnchor` or `vulkanPath` (for Vulkan Spec link).
*   **Notes**: The structure and content of this file directly determine the tree's appearance and the links available for each component. `script.js` expects this format.

---

**Filename**: `whip-docs/descriptions/[ComponentName].md` (File Group)

*   **Purpose**: Contains the actual documentation content for each component listed in the tree view.
*   **Key Features/Elements**: Standard Markdown format. Can include text, lists, code blocks, headings, etc. Code blocks are expected to be compatible with `highlight.js`.
*   **Notes**: Files are named to match the `name` property of components in the JSON tree file (e.g., `Instance.md` corresponds to the "Instance" node). `script.js` dynamically fetches these based on the selected component name.

---

## External Dependencies

*   **marked.js** (`https://cdn.jsdelivr.net/npm/marked/marked.min.js`)
    *   **Purpose**: Parses Markdown text into HTML.
    *   **Version**: Loaded via CDN, specific version may vary based on CDN's latest.
*   **highlight.js** (`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js`)
    *   **Purpose**: Provides syntax highlighting for code blocks within the rendered Markdown content.
    *   **Version**: 11.9.0 (as specified in the link).
*   **highlight.js CSS Theme** (`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css`)
    *   **Purpose**: Provides the visual styling (theme) for the highlighted code blocks.
    *   **Version**: 11.9.0 (matches the JS library).