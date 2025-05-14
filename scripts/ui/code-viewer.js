// scripts/ui/code-viewer.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log("code-viewer.js: DOMContentLoaded triggered.");
    const CODE_VIEWER_COMPONENT_PATH = 'components/code-viewer.html';
    
    const GITHUB_USER = 'MrScripty';
    const GITHUB_REPO = 'Studio-Whip';
    const GITHUB_PROJECT_SUBPATH = 'rust/src'; // The path within the repo to the Rust 'src' directory

    const GITHUB_RAW_CONTENT_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/`;

    let panelContainer, panelFilename, panelCodeBlock, panelCloseBtn, codeViewerWrapperDiv;
    let isViewerVisible = false;
    let isPanelInitialized = false;

    let isDraggingPanel = false;
    let panelOffsetX, panelOffsetY;

    async function initializeCodeViewer() {
        if (isPanelInitialized) {
            // console.log("code-viewer.js: initializeCodeViewer - already initialized.");
            return true;
        }
        console.log("code-viewer.js: initializeCodeViewer attempting initialization.");

        try {
            codeViewerWrapperDiv = document.getElementById('code-viewer-dynamic-injection-point');
            if (!codeViewerWrapperDiv) {
                // console.log("code-viewer.js: Creating injection point div.");
                codeViewerWrapperDiv = document.createElement('div');
                codeViewerWrapperDiv.id = 'code-viewer-dynamic-injection-point';
                document.body.appendChild(codeViewerWrapperDiv);
            }

            // console.log(`code-viewer.js: Fetching panel HTML from ${CODE_VIEWER_COMPONENT_PATH}`);
            const response = await fetch(CODE_VIEWER_COMPONENT_PATH);
            if (!response.ok) {
                console.error(`code-viewer.js: Failed to load ${CODE_VIEWER_COMPONENT_PATH}. Status: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to load ${CODE_VIEWER_COMPONENT_PATH}: ${response.statusText}`);
            }
            const viewerHtml = await response.text();
            // console.log("code-viewer.js: Panel HTML fetched successfully.");
            
            codeViewerWrapperDiv.innerHTML = viewerHtml;

            panelContainer = document.getElementById('code-viewer-panel-container');
            panelFilename = document.getElementById('cv-filename');
            panelCodeBlock = document.getElementById('cv-code-block');
            panelCloseBtn = document.getElementById('cv-close-btn');

            if (!panelContainer || !panelFilename || !panelCodeBlock || !panelCloseBtn) {
                console.error("code-viewer.js: Critical elements missing after HTML injection!");
                isPanelInitialized = false;
                return false;
            }

            panelCloseBtn.addEventListener('click', hideCodeViewer);
            
            const header = panelContainer.querySelector('.cv-header');
            if (header) {
                header.addEventListener('mousedown', onDragStart);
            }
            isPanelInitialized = true;
            console.log("code-viewer.js: Panel initialized successfully.");
            return true;

        } catch (error) {
            console.error("code-viewer.js: Error during initializeCodeViewer:", error);
            isPanelInitialized = false;
            return false;
        }
    }

    function onDragStart(e) {
        if (e.button !== 0 || !panelContainer) return;
        isDraggingPanel = true;
        panelOffsetX = e.clientX - panelContainer.offsetLeft;
        panelOffsetY = e.clientY - panelContainer.offsetTop;
        panelContainer.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!isDraggingPanel || !panelContainer) return;
        let newLeft = e.clientX - panelOffsetX;
        let newTop = e.clientY - panelOffsetY;

        const maxLeft = window.innerWidth - panelContainer.offsetWidth;
        const maxTop = window.innerHeight - panelContainer.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        panelContainer.style.left = newLeft + 'px';
        panelContainer.style.top = newTop + 'px';
    }

    function onDragEnd() {
        if (!isDraggingPanel || !panelContainer) return;
        isDraggingPanel = false;
        panelContainer.style.cursor = 'move';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
    }

    async function getGitHubDefaultBranch() {
        if (getGitHubDefaultBranch.cachedBranch) {
            return getGitHubDefaultBranch.cachedBranch;
        }
        try {
            const repoApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}`;
            const response = await fetch(repoApiUrl);
            if (!response.ok) {
                console.warn(`Could not fetch repo details to get default branch (Status: ${response.status}). Falling back to 'main'.`);
                getGitHubDefaultBranch.cachedBranch = 'main';
                return 'main';
            }
            const repoData = await response.json();
            getGitHubDefaultBranch.cachedBranch = repoData.default_branch || 'main';
            console.log("code-viewer.js: Determined default GitHub branch:", getGitHubDefaultBranch.cachedBranch);
            return getGitHubDefaultBranch.cachedBranch;
        } catch (error) {
            console.warn("Error fetching default branch, falling back to 'main':", error);
            getGitHubDefaultBranch.cachedBranch = 'main';
            return 'main';
        }
    }
    getGitHubDefaultBranch.cachedBranch = null;


    async function displayCodeForNode(nodeData) {
        // console.log("code-viewer.js: displayCodeForNode called with nodeData:", nodeData);
        if (!isPanelInitialized || !panelContainer) {
            // console.warn("code-viewer.js: displayCodeForNode - Panel not ready. Attempting re-init.");
            const initialized = await initializeCodeViewer();
            if (!initialized || !panelContainer) {
                console.error("code-viewer.js: displayCodeForNode - Failed to initialize panel on demand.");
                return;
            }
        }
        if (!nodeData || !nodeData.id) {
            // console.warn("code-viewer.js: displayCodeForNode - No node data or ID. Hiding viewer.");
            hideCodeViewer();
            return;
        }

        const filePathFromNodeId = nodeData.id;
        const defaultBranch = await getGitHubDefaultBranch();
        const fullPathInRepo = `${GITHUB_PROJECT_SUBPATH}/${filePathFromNodeId}`;
        const fullCodeUrl = `${GITHUB_RAW_CONTENT_BASE_URL}${defaultBranch}/${fullPathInRepo}`;
        const justFileName = filePathFromNodeId.split('/').pop();

        // console.log(`code-viewer.js: Preparing to display code for ${justFileName} from GitHub: ${fullCodeUrl}`);
        panelFilename.textContent = justFileName;
        
        // --- METHOD 2 IMPLEMENTATION ---
        panelCodeBlock.innerHTML = ''; // Clear previous content (spans, text, etc.)
        // Set className for semantic purposes and if CSS targets it, though hljs.highlight won't use it for language detection here
        panelCodeBlock.className = 'language-rust'; 
        panelCodeBlock.textContent = `Loading ${justFileName} from GitHub...`; // Temporary loading message

        try {
            console.log(`code-viewer.js: Fetching code from GitHub: ${fullCodeUrl}`);
            const response = await fetch(fullCodeUrl);
            if (!response.ok) {
                let errorMsg = `HTTP error ${response.status} fetching from GitHub.`;
                if (response.status === 404) {
                    errorMsg += ` File not found at path '${fullPathInRepo}' in branch '${defaultBranch}'.`;
                } else if (response.status === 403) {
                    errorMsg += ` GitHub API rate limit likely exceeded or private repository/file.`;
                }
                console.error(`code-viewer.js: ${errorMsg} URL: ${fullCodeUrl}`);
                throw new Error(errorMsg);
            }
            const codeText = await response.text();
            console.log(`code-viewer.js: Code for ${justFileName} fetched successfully from GitHub.`);
            
            if (window.hljs) {
                // Use hljs.highlight to get the HTML string with highlighting
                const highlighted = hljs.highlight(codeText, { language: 'rust', ignoreIllegals: true });
                panelCodeBlock.innerHTML = highlighted.value; // Set the innerHTML to the highlighted code
                console.log(`code-viewer.js: Applied syntax highlighting to ${justFileName} using hljs.highlight.`);
            } else {
                panelCodeBlock.textContent = codeText; // Fallback to plain text if hljs not found
                console.warn("code-viewer.js: highlight.js (hljs) not found.");
            }
            // --- END METHOD 2 IMPLEMENTATION ---

        } catch (error) {
            console.error(`code-viewer.js: Failed to load or display code for ${justFileName} from GitHub:`, error);
            panelCodeBlock.innerHTML = ''; // Clear on error
            panelCodeBlock.textContent = `Error loading code for ${justFileName} from GitHub.\n${error.message}\n(URL: ${fullCodeUrl})`;
            panelCodeBlock.className = ''; // Remove language class on error
        }

        // console.log("code-viewer.js: Attempting to show panel. Current display:", panelContainer.style.display);
        panelContainer.style.display = 'flex';
        panelContainer.dataset.currentNodeId = nodeData.id;
        isViewerVisible = true;
        // console.log("code-viewer.js: Panel display set to 'flex'. isViewerVisible:", isViewerVisible, "Actual display:", panelContainer.style.display);
    }

    function hideCodeViewer() {
        if (panelContainer) {
            panelContainer.style.display = 'none';
        }
        isViewerVisible = false;
        // console.log("code-viewer.js: Code viewer hidden.");
    }

    document.addEventListener('keydown', async (event) => {
        if (!isPanelInitialized) {
            const success = await initializeCodeViewer();
            if (!success) {
                // console.warn("code-viewer.js: Keydown - Panel not initialized, event ignored.");
                return; 
            }
        }
        
        if (event.key === 'Escape' && isViewerVisible) {
            // console.log("code-viewer.js: Escape key pressed, hiding viewer.");
            hideCodeViewer();
        } else if ((event.key === '~' || event.key === '`')) {
            event.preventDefault(); 
            // console.log(`code-viewer.js: '${event.key}' key pressed.`);
            if (window.currentlySelectedGraphNodeData) {
                // console.log("code-viewer.js: Node selected, processing viewer toggle/update.");
                if (isViewerVisible && panelContainer && panelContainer.dataset.currentNodeId === window.currentlySelectedGraphNodeData.id) {
                    // console.log("code-viewer.js: Viewer visible and same node, toggling off.");
                    hideCodeViewer();
                } else {
                    // console.log("code-viewer.js: Viewer not visible or different node, displaying/updating.");
                    await displayCodeForNode(window.currentlySelectedGraphNodeData);
                }
            } else {
                // console.log("code-viewer.js: Key pressed, but no graph node selected.");
                if (isViewerVisible) {
                    // console.log("code-viewer.js: Hiding viewer as no node is selected.");
                    hideCodeViewer();
                }
            }
        }
    });

    initializeCodeViewer().catch(err => console.error("code-viewer.js: Initial code viewer initialization promise failed:", err));
});