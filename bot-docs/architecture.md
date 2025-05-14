# Whip Docs - Architecture Overview

## Purpose

This document provides a high-level overview of the "Whip Docs" website architecture. The primary goal of this website is to host developer-facing documentation for the "Studio Whip" project. Currently, its main focus is presenting an interactive overview of Vulkan API components relevant to a 2D rendering context, and a module dependency graph for Rust projects. The site is designed for static hosting and includes a dynamic banner displaying recent Git commits.

## Core Components

*   **HTML Pages (`web-pages/`)**:
    *   `vulkan-overview.html`: The main interactive page displaying the Vulkan component tree and associated documentation.
    *   `module-graph.html`: Displays an interactive module dependency graph for Rust code, with a tree view for selected node interactions.
    *   `vulkan-engine.html`: A placeholder page for future engine-specific documentation.
    *   `index.html` (Root): Immediately redirects users to `web-pages/module-graph.html`.
    *   `web-pages/components/commit-banner.html`: HTML fragment for the Git commit banner, loaded dynamically.
*   **JavaScript**:
    *   `scripts/lists/tree.js` (formerly `script.js`): Contains the core logic for the interactive tree view on `vulkan-overview.html`. It handles fetching data, building the tree, managing UI state (selection, expansion, sticky headers, branch bar), and loading/displaying Markdown content.
    *   `scripts/graphs/module_dependency_graph.js`: Logic for rendering and interacting with the D3.js based module graph on `module-graph.html`.
    *   `scripts/lists/graph_interaction_tree.js`: Logic for the tree view on `module-graph.html` that displays interactions for a selected graph node.
    *   `scripts/ui/column-resizer.js`: Reusable script for draggable column resizing.
    *   `scripts/ui/commit-banner.js`: Fetches Git commit data from the GitHub API, loads `commit-banner.html`, and populates the banner on relevant pages.
*   **CSS**:
    *   `web-pages/shared-styles.css`: Provides global layout, header styling, and base styles for content areas.
    *   Inline styles in `vulkan-overview.html` and `module-graph.html`: Define specific layouts and appearances for their respective views (tree, info panel, graph, etc.).
    *   `web-pages/components/commit-banner.css`: Styles for the Git commit banner.
*   **Data Sources**:
    *   JSON (`whip-docs/trees/*.json`, e.g., `vulkan_2d_rendering.json`): Defines the hierarchical structure of the documentation tree for `vulkan-overview.html` and provides metadata.
    *   JSON (`rust-doc-tool/output/module_graph.json`): Provides node and edge data for the module dependency graph on `module-graph.html`.
    *   Markdown (`whip-docs/descriptions/*.md`): Contains detailed documentation content for individual components on `vulkan-overview.html`, loaded dynamically.
    *   GitHub API: Source for Git commit data displayed in the commit banner.

## Data Flow

1.  **Initial Load**:
    *   A user accessing the root `index.html` is redirected to `web-pages/module-graph.html`.
    *   Pages like `vulkan-overview.html` or `module-graph.html` load their respective HTML, CSS, and JavaScript.
2.  **Commit Banner Initialization (on `vulkan-overview.html`, `module-graph.html`)**:
    *   `scripts/ui/commit-banner.js` fetches `web-pages/components/commit-banner.html` and injects its content into a placeholder div.
    *   It then fetches the latest commit data from the GitHub API for "MrScripty/Studio-Whip".
    *   The script populates the banner with commit details (message, author, date, link).
3.  **Tree Initialization (`vulkan-overview.html`)**:
    *   `scripts/lists/tree.js`'s `DOMContentLoaded` listener triggers `loadAndRenderTree()`.
    *   `loadAndRenderTree()` fetches the specified JSON tree file (e.g., `vulkan_2d_rendering.json`).
    *   The script parses the JSON data and dynamically builds the HTML list structure for the tree.
    *   Event listeners are attached for selection and expansion.
4.  **Item Selection (`vulkan-overview.html`)**:
    *   When a user clicks a tree item, `scripts/lists/tree.js` updates UI highlights.
    *   It calls `loadDescription()` which fetches the corresponding Markdown file.
    *   Markdown is parsed (marked.js) and syntax-highlighted (highlight.js), then injected into the info panel.
    *   Metadata (tags, links) is displayed from the initial JSON.
5.  **Module Graph Initialization (`module-graph.html`)**:
    *   `scripts/graphs/module_dependency_graph.js` fetches `rust-doc-tool/output/module_graph.json`.
    *   It uses D3.js to render the graph of nodes (files) and edges (interactions).
6.  **Graph Node Selection (`module-graph.html`)**:
    *   Clicking a node in the graph triggers `scripts/lists/graph_interaction_tree.js`.
    *   This script filters the full graph data to find interactions related to the selected node.
    *   It then builds and displays a tree listing connected files and the nature of their interactions (imports, module declarations).
7.  **UI Interactions (General)**:
    *   Tree toggles expand/collapse subtrees.
    *   Scrolling in tree columns updates sticky headers.
    *   Column dividers can be dragged to resize panels.

## Key Interactions

*   **DOM Manipulation**: JavaScript heavily manipulates the DOM to build tree structures, render graphs, update styles, manage visibility, inject Markdown, and update UI elements like sticky headers and banners.
*   **Data Fetching**: Uses the `fetch` API to asynchronously load JSON data, Markdown content, HTML fragments (for the banner), and external API data (GitHub commits).
*   **Event Handling**: Listens for `DOMContentLoaded`, clicks, scroll events, and window resize events to trigger appropriate updates.
*   **Library Usage**:
    *   `marked.js`: Markdown-to-HTML conversion.
    *   `highlight.js`: Syntax highlighting.
    *   `d3.js`: SVG-based graph rendering and force simulation.

## Current Capabilities

*   **Redirection**: Root `index.html` redirects to the main module graph page.
*   **Interactive Tree View (Vulkan Overview)**: Displays hierarchical Vulkan components from JSON, allowing expansion/collapse and dynamic content loading.
*   **Interactive Module Graph (Module Graph)**: Displays a D3.js force-directed graph of Rust modules, showing dependencies and interaction types.
*   **Interaction Tree (Module Graph)**: Displays a tree of interactions for a selected node in the module graph.
*   **Dynamic Content Loading**: Fetches and displays Markdown for Vulkan components.
*   **Markdown Rendering & Syntax Highlighting**.
*   **Component Metadata Display (Vulkan Overview)**.
*   **Git Commit Banner**: Displays the latest commits from a specified GitHub repository.
*   **UI Enhancements**:
    *   **Sticky Headers**: Show the path to currently visible tree items when scrolling.
    *   **Branch Indicator Bar**: Visually indicates main tree branches.
    *   **Selection Highlighting**.
    *   **Resizable Columns**.

## Future Extensions

*   Addition of new documentation sections (e.g., Vulkan Engine details).
*   Implementation of search functionality.
*   Support for different documentation structures or types.

## Dependencies

*   **External Libraries (CDN)**:
    *   `marked.js`: Markdown parsing.
    *   `highlight.js`: Syntax highlighting.
    *   `d3.js`: Graph visualization.
*   **External APIs**:
    *   GitHub Commits API: For the commit banner.
*   **Internal Data**:
    *   JSON files (`whip-docs/trees/`, `rust-doc-tool/output/`): Define tree structures, graph data, and component metadata.
    *   Markdown files (`whip-docs/descriptions/`): Provide component documentation content.
    *   HTML fragments (`web-pages/components/`): Reusable UI components like the commit banner.

## Notes

*   The website is designed as a static site, suitable for deployment on platforms like GitHub Pages.
*   Key paths and configurations are generally managed via constants in their respective JavaScript files.