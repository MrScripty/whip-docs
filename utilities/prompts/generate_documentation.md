You are an AI assistant helping me create developer-facing documentation for a website project. The goal is to produce `architecture.md` and `modules.md` files that provide a concise, high-level overview of the website's structure, components, data flow, and the purpose of its key files and scripts. This documentation is intended for other AI assistants or developers to quickly understand the project without needing to parse all the code in detail.

### Project Context:
The website is named "Whip Docs" Its primary purpose is to host documentation for the "Studio Whip" project. The website is built with HTML, CSS, and JavaScript, and uses external libraries like `marked.js` and `highlight.js`. It's designed for static hosting (e.g., GitHub Pages).

### Instructions

#### General Guidelines
-   **Purpose**: These files should offer a clear, compact summary of the website's structure and the roles of its constituent files/scripts, keeping the context small for efficient LLM use.
-   **Tone**: Technical, clear, and neutral. Avoid speculative or overly verbose language. Focus on factual descriptions of the provided files.
-   **Input**: The primary input will be a set of files representing the website (HTML, CSS, JavaScript, JSON data files, example Markdown content files).

#### For `architecture.md`
-   **Goal**: Offer a high-level overview of the website's design, its main pages/components, how data flows (especially for interactive sections), and key interactions between scripts and data.
-   **Structure**:
    *   **Purpose**: Summarize the website's overall goal and its current focus (e.g., documenting Studio Whip, starting with Vulkan components).
    *   **Core Components**: List major HTML pages, key JavaScript files, CSS files, and types of data sources (e.g., JSON for tree structures, Markdown for content). Briefly state their roles.
    *   **Data Flow**: Describe the typical user journey and how data is fetched, processed, and displayed, particularly for interactive elements like the tree view and dynamic content loading.
    *   **Key Interactions**: Highlight how JavaScript interacts with HTML elements, fetches/uses JSON data, and processes Markdown files.
    *   **Current Capabilities**: List the main features the website currently offers (e.g., redirection, interactive tree, Markdown rendering, external links).
    *   **Future Extensions**: Briefly list potential future additions to the website (e.g., new documentation sections, search functionality).
    *   **Dependencies**: Summarize external libraries (e.g., `marked.js`, `highlight.js` via CDN) and key internal data file types.
    *   **Notes**: Add any important clarifications (e.g., static hosting design, configurable paths in scripts).
-   **Update Rules**: Base this entirely on the provided website files. Keep it abstract—no full code snippets or very low-level DOM details.

#### For `modules.md`
-   **Goal**: Document the website's file structure and provide a functional overview of each key file or group of files.
-   **Structure**:
    *   **Project Overview**: Briefly summarize the website's purpose and its current state/focus based on the provided files.
    *   **Module Structure (File Structure)**: Show the directory tree of the provided files.
    *   **Modules (Files) and Their Functions**: For each significant file (or type of file, like `*.md` in a specific directory):
        *   **Filename**: e.g., `script.js`, `web-pages/vulkan-overview.html`, `whip-docs/trees/vulkan_2d_rendering.json`.
        *   **Purpose**: A one-sentence description of the file's role in the website.
        *   **Key Features/Elements/Functions (as applicable)**:
            *   For HTML: Note key structural sections or important `id`s/`class`es if they are central to JavaScript interaction or layout.
            *   For CSS: General purpose (e.g., "Provides shared styles," "Page-specific styles for tree view").
            *   For JavaScript: List key global variables/constants if they configure behavior. List important function signatures (e.g., `loadAndRenderTree(treeFileName)`) with a brief (1-2 line) description of their purpose. Do *not* include implementation details.
            *   For JSON/Data files: Describe their general structure and what data they provide.
            *   For Markdown files (as a group): Describe their role and naming conventions if apparent.
        *   **Notes**: Any important dependencies (e.g., "Relies on `marked.js`," "Specific to `vulkan-overview.html`").
    *   **External Dependencies**: List external libraries loaded (e.g., via CDN), their purpose, and versions if known.
-   **Update Rules**: Focus on the interface and purpose of each file/script. Avoid detailing the internal implementation of functions. Cross-reference if a script is specific to a particular HTML page.

#### Input Files:
(You will be provided with the following files: `index.html`, `script.js`, `web-pages/shared-styles.css`, `web-pages/vulkan-engine.html`, `web-pages/vulkan-overview.html`, `whip-docs/trees/vulkan_2d_rendering.json`, and an understanding that `whip-docs/descriptions/` contains multiple `.md` files.)

#### Output:
-   Provide the generated `architecture.md`.
-   Provide the generated `modules.md`.
- Ensure both are formatted as clean markdown.
- Do not abreviate the documentation unless it still conveys all the information of the un-abreviated version.
- Write the files inside a code block with four ` to ensure the entire files remain inside the code block. 