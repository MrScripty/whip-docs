# Whip Docs - Architecture Overview

## Purpose

This document provides a high-level overview of the "Whip Docs" website architecture. The primary goal of this website is to host developer-facing documentation for the "Studio Whip" project. Currently, its main focus is presenting an interactive overview of Vulkan API components relevant to a 2D rendering context. The site is designed for static hosting.

## Core Components

*   **HTML Pages (`web-pages/`)**:
    *   `vulkan-overview.html`: The main interactive page displaying the Vulkan component tree and associated documentation.
    *   `vulkan-engine.html`: A placeholder page for future engine-specific documentation.
    *   `index.html` (Root): Immediately redirects users to `web-pages/vulkan-overview.html`.
*   **JavaScript (`script.js`)**: Contains the core logic for the interactive tree view on `vulkan-overview.html`. It handles fetching data, building the tree, managing UI state (selection, expansion, sticky headers, branch bar), and loading/displaying Markdown content.
*   **CSS (`web-pages/shared-styles.css`, Inline styles in `vulkan-overview.html`)**:
    *   `shared-styles.css`: Provides global layout, header styling, and base styles for content areas.
    *   Inline styles (`vulkan-overview.html`): Define the specific layout and appearance of the tree view, info panel, sticky headers, branch bar, and Markdown content display.
*   **Data Sources (`whip-docs/`)**:
    *   JSON (`trees/*.json`, e.g., `vulkan_2d_rendering.json`): Defines the hierarchical structure of the documentation tree and provides metadata (like external links) for each component.
    *   Markdown (`descriptions/*.md`): Contains the detailed documentation content for individual components, loaded dynamically when a tree item is selected.

## Data Flow

1.  **Initial Load**: A user accessing the root `index.html` is immediately redirected to `web-pages/vulkan-overview.html`.
2.  **Tree Initialization (`vulkan-overview.html`)**:
    *   The page loads, including `script.js`.
    *   `script.js`'s `DOMContentLoaded` listener triggers `loadAndRenderTree()`.
    *   `loadAndRenderTree()` fetches the specified JSON tree file (e.g., `vulkan_2d_rendering.json`).
    *   The script parses the JSON data (`tree` array and `componentInfo` object).
    *   It dynamically builds the HTML list structure representing the tree within the `.tree-content-wrapper ul` element.
    *   Event listeners are attached to tree items (for selection) and toggles (for expansion/collapse).
    *   The first item in the tree is automatically selected (clicked).
3.  **Item Selection**:
    *   When a user clicks a tree item (`.tree-item-content`):
        *   The script updates UI highlights (selected item, parent path).
        *   It calls `loadDescription()` with the component name.
        *   `loadDescription()` fetches the corresponding Markdown file (e.g., `whip-docs/descriptions/Instance.md`).
        *   The fetched Markdown is parsed into HTML using `marked.js`.
        *   Code blocks within the parsed HTML are syntax-highlighted using `highlight.js`.
        *   The resulting HTML is injected into the `#info-content` div.
        *   The script updates the info panel's tag and link bars based on metadata stored in `componentInfoData` (retrieved from the initial JSON load).
4.  **Tree Interaction**:
    *   Clicking a toggle (`.tree-toggle`) expands or collapses the corresponding subtree. UI elements like the branch indicator bar and sticky header are updated accordingly via `requestAnimationFrame` to handle layout changes.
    *   Scrolling the tree column (`.tree-column`) triggers `updateStickyHeaders()` to dynamically display the current path visible at the top of the scrollable area.

## Key Interactions

*   **DOM Manipulation**: `script.js` heavily manipulates the DOM to build the tree structure, update styles for highlighting, manage visibility of subtrees, inject Markdown content, and update sticky headers/branch bar.
*   **Data Fetching**: Uses the `fetch` API to asynchronously load JSON tree data and Markdown content files.
*   **Event Handling**: Listens for `DOMContentLoaded`, clicks on tree items and toggles, scroll events on the tree container, and window resize events to trigger appropriate updates.
*   **Library Usage**: Leverages `marked.js` for Markdown-to-HTML conversion and `highlight.js` for syntax highlighting in code blocks.

## Current Capabilities

*   **Redirection**: Root `index.html` redirects to the main overview page.
*   **Interactive Tree View**: Displays a hierarchical structure from JSON data, allowing expansion/collapse of nodes.
*   **Dynamic Content Loading**: Fetches and displays Markdown content associated with selected tree items.
*   **Markdown Rendering**: Converts Markdown to formatted HTML using `marked.js`.
*   **Syntax Highlighting**: Applies syntax highlighting to code blocks within the Markdown content using `highlight.js`.
*   **Component Metadata Display**: Shows tags (e.g., Required, Optional) and relevant external links (Ash API, Vulkan Spec) based on JSON metadata.
*   **UI Enhancements**:
    *   **Sticky Header**: Shows the path to the currently visible tree items when scrolling.
    *   **Branch Indicator Bar**: Visually indicates the main branches of the tree alongside the scrollable content.
    *   **Selection Highlighting**: Clearly indicates the selected item and its parent path in the tree.

## Future Extensions

*   Addition of new documentation sections (e.g., Vulkan Engine details).
*   Implementation of search functionality across components.
*   Support for different documentation structures or types.

## Dependencies

*   **External Libraries**:
    *   `marked.js` (CDN): Markdown parsing.
    *   `highlight.js` (CDN): Syntax highlighting.
*   **Internal Data**:
    *   JSON files (`whip-docs/trees/`): Define tree structure and component metadata.
    *   Markdown files (`whip-docs/descriptions/`): Provide component documentation content.

## Notes

*   The website is designed as a static site, suitable for deployment on platforms like GitHub Pages.
*   Key paths (like `DOCS_BASE_PATH`, `TREE_FILE_NAME`) are configured via constants in `script.js`, allowing some flexibility in file organization.