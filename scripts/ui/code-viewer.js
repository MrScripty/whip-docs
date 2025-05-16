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
            return true;
        }
        console.log("code-viewer.js: initializeCodeViewer attempting initialization.");

        try {
            codeViewerWrapperDiv = document.getElementById('code-viewer-dynamic-injection-point');
            if (!codeViewerWrapperDiv) {
                codeViewerWrapperDiv = document.createElement('div');
                codeViewerWrapperDiv.id = 'code-viewer-dynamic-injection-point';
                document.body.appendChild(codeViewerWrapperDiv);
            }

            const response = await fetch(CODE_VIEWER_COMPONENT_PATH);
            if (!response.ok) {
                console.error(`code-viewer.js: Failed to load ${CODE_VIEWER_COMPONENT_PATH}. Status: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to load ${CODE_VIEWER_COMPONENT_PATH}: ${response.statusText}`);
            }
            const viewerHtml = await response.text();
            
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
        if (!isPanelInitialized || !panelContainer) {
            const initialized = await initializeCodeViewer();
            if (!initialized || !panelContainer) {
                console.error("code-viewer.js: displayCodeForNode - Failed to initialize panel on demand.");
                return;
            }
        }
        if (!nodeData || !nodeData.id) {
            hideCodeViewer();
            return;
        }

        const filePathFromNodeId = nodeData.id;
        const defaultBranch = await getGitHubDefaultBranch();
        const fullPathInRepo = `${GITHUB_PROJECT_SUBPATH}/${filePathFromNodeId}`;
        const fullCodeUrl = `${GITHUB_RAW_CONTENT_BASE_URL}${defaultBranch}/${fullPathInRepo}`;
        const justFileName = filePathFromNodeId.split('/').pop();

        panelFilename.textContent = justFileName;
        
        panelCodeBlock.innerHTML = ''; 
        panelCodeBlock.className = 'language-rust hljs'; // Add hljs class for theme styling
        
        const loadingLineDiv = document.createElement('div');
        loadingLineDiv.className = 'cv-line';
        const emptyNumberSpanLoading = document.createElement('span');
        emptyNumberSpanLoading.className = 'cv-line-number';
        emptyNumberSpanLoading.innerHTML = ' ';
        const loadingMsgSpan = document.createElement('span');
        loadingMsgSpan.className = 'cv-line-code'; 
        loadingMsgSpan.textContent = `Loading ${justFileName} from GitHub...`;
        loadingLineDiv.appendChild(emptyNumberSpanLoading);
        loadingLineDiv.appendChild(loadingMsgSpan);
        panelCodeBlock.appendChild(loadingLineDiv);

        try {
            console.log(`code-viewer.js: Fetching code from GitHub: ${fullCodeUrl}`);
            const response = await fetch(fullCodeUrl);
            if (!response.ok) {
                let errorMsg = `HTTP error ${response.status} fetching from GitHub.`;
                if (response.status === 404) errorMsg += ` File not found at path '${fullPathInRepo}' in branch '${defaultBranch}'.`;
                else if (response.status === 403) errorMsg += ` GitHub API rate limit likely exceeded or private repository/file.`;
                console.error(`code-viewer.js: ${errorMsg} URL: ${fullCodeUrl}`);
                throw new Error(errorMsg);
            }
            const codeText = await response.text();
            console.log(`code-viewer.js: Code for ${justFileName} fetched successfully from GitHub.`);
            
            panelCodeBlock.innerHTML = ''; // Clear loading message

            if (window.hljs) {
                // First, get the highlighted HTML string for the entire code block
                const highlighted = hljs.highlight(codeText, { language: 'rust', ignoreIllegals: true });
                // Split the highlighted HTML by newlines. HLJS output uses '\n'.
                const highlightedHtmlLines = highlighted.value.split('\n');

                highlightedHtmlLines.forEach((htmlLineContent, index) => {
                    const lineDiv = document.createElement('div');
                    lineDiv.className = 'cv-line';

                    const numberSpan = document.createElement('span');
                    numberSpan.className = 'cv-line-number';
                    numberSpan.textContent = (index + 1).toString();

                    const codeSpan = document.createElement('span');
                    codeSpan.className = 'cv-line-code';
                    // htmlLineContent is already HTML, so set innerHTML
                    codeSpan.innerHTML = htmlLineContent || ' '; // Use ' ' for empty lines to maintain height

                    lineDiv.appendChild(numberSpan);
                    lineDiv.appendChild(codeSpan);
                    panelCodeBlock.appendChild(lineDiv);
                });
                console.log(`code-viewer.js: Applied syntax highlighting to ${justFileName}.`);
            } else { // Fallback if hljs is not available
                const plainTextLines = codeText.split(/\r\n|\r|\n/);
                plainTextLines.forEach((line, index) => {
                    const lineDiv = document.createElement('div');
                    lineDiv.className = 'cv-line';
                    const numberSpan = document.createElement('span');
                    numberSpan.className = 'cv-line-number';
                    numberSpan.textContent = (index + 1).toString();
                    const codeSpan = document.createElement('span');
                    codeSpan.className = 'cv-line-code';
                    codeSpan.textContent = line;
                    lineDiv.appendChild(numberSpan);
                    lineDiv.appendChild(codeSpan);
                    panelCodeBlock.appendChild(lineDiv);
                });
                console.warn("code-viewer.js: highlight.js (hljs) not found. Displaying plain text with line numbers.");
                panelCodeBlock.classList.remove('hljs'); // Remove hljs class if not used
            }

        } catch (error) {
            console.error(`code-viewer.js: Failed to load or display code for ${justFileName} from GitHub:`, error);
            panelCodeBlock.innerHTML = ''; 
            const errorLineDiv = document.createElement('div');
            errorLineDiv.className = 'cv-line'; 
            const emptyNumberSpanError = document.createElement('span');
            emptyNumberSpanError.className = 'cv-line-number';
            emptyNumberSpanError.innerHTML = ' ';
            const errorMsgSpan = document.createElement('span');
            errorMsgSpan.className = 'cv-line-code'; 
            errorMsgSpan.style.whiteSpace = 'pre-wrap'; 
            errorMsgSpan.textContent = `Error loading code for ${justFileName} from GitHub.\n${error.message}\n(URL: ${fullCodeUrl})`;
            errorLineDiv.appendChild(emptyNumberSpanError);
            errorLineDiv.appendChild(errorMsgSpan);
            panelCodeBlock.appendChild(errorLineDiv);
            panelCodeBlock.className = ''; 
            panelCodeBlock.classList.remove('hljs');
        }

        panelContainer.style.display = 'flex';
        panelContainer.dataset.currentNodeId = nodeData.id;
        isViewerVisible = true;
    }

    function hideCodeViewer() {
        if (panelContainer) {
            panelContainer.style.display = 'none';
        }
        isViewerVisible = false;
    }

    document.addEventListener('keydown', async (event) => {
        if (!isPanelInitialized) {
            const success = await initializeCodeViewer();
            if (!success) return; 
        }
        
        if (event.key === 'Escape' && isViewerVisible) {
            hideCodeViewer();
        } else if ((event.key === '~' || event.key === '`')) {
            event.preventDefault(); 
            if (window.currentlySelectedGraphNodeData) {
                if (isViewerVisible && panelContainer && panelContainer.dataset.currentNodeId === window.currentlySelectedGraphNodeData.id) {
                    hideCodeViewer();
                } else {
                    await displayCodeForNode(window.currentlySelectedGraphNodeData);
                }
            } else {
                if (isViewerVisible) {
                    hideCodeViewer();
                }
            }
        }
    });

    initializeCodeViewer().catch(err => console.error("code-viewer.js: Initial code viewer initialization promise failed:", err));
});