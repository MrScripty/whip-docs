// scripts/ui/code-viewer.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log("code-viewer.js: DOMContentLoaded triggered.");
    const CODE_VIEWER_COMPONENT_PATH = 'components/code-viewer.html';
    
    const GITHUB_USER = 'MrScripty';
    const GITHUB_REPO = 'Studio-Whip';
    const GITHUB_PROJECT_SUBPATH = 'rust/src';

    const GITHUB_RAW_CONTENT_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/`;

    let panelContainer, panelFilename, panelCodeBlock, panelCloseBtn, codeViewerWrapperDiv, contentWrapper; // Added contentWrapper
    let isViewerVisible = false;
    let isPanelInitialized = false;

    let isDraggingPanel = false;
    let panelOffsetX, panelOffsetY;

    let currentFoldableRegions = [];
    let currentRawCodeText = ""; 

    // Keywords that can start a foldable block (functions, structs, impls, enums, traits, modules)
    // Regex will be like: /^\s*(pub(\(\w+\))?\s+)?(unsafe\s+)?(async\s+)?(fn|struct|impl|enum|trait|mod)\b/
    const FOLDABLE_KEYWORDS_REGEX = /^\s*(?:pub(?:\([^)]*\))?\s*)?(?:unsafe\s+)?(?:async\s+)?(fn|struct|impl|enum|trait|mod)\b/;


    async function initializeCodeViewer() {
        if (isPanelInitialized) return true;
        console.log("code-viewer.js: initializeCodeViewer attempting initialization.");
        try {
            codeViewerWrapperDiv = document.getElementById('code-viewer-dynamic-injection-point');
            if (!codeViewerWrapperDiv) {
                codeViewerWrapperDiv = document.createElement('div');
                codeViewerWrapperDiv.id = 'code-viewer-dynamic-injection-point';
                document.body.appendChild(codeViewerWrapperDiv);
            }

            const response = await fetch(CODE_VIEWER_COMPONENT_PATH);
            if (!response.ok) throw new Error(`Failed to load ${CODE_VIEWER_COMPONENT_PATH}: ${response.statusText}`);
            const viewerHtml = await response.text();
            codeViewerWrapperDiv.innerHTML = viewerHtml;

            panelContainer = document.getElementById('code-viewer-panel-container');
            panelFilename = document.getElementById('cv-filename');
            panelCodeBlock = document.getElementById('cv-code-block');
            panelCloseBtn = document.getElementById('cv-close-btn');
            contentWrapper = document.getElementById('cv-content-wrapper'); // Get the content wrapper

            if (!panelContainer || !panelFilename || !panelCodeBlock || !panelCloseBtn || !contentWrapper) {
                console.error("code-viewer.js: Critical elements missing after HTML injection!");
                isPanelInitialized = false;
                return false;
            }

            panelCloseBtn.addEventListener('click', hideCodeViewer);
            const header = panelContainer.querySelector('.cv-header');
            if (header) header.addEventListener('mousedown', onDragStart);
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
            return getGitHubDefaultBranch.cachedBranch;
        } catch (error) {
            console.warn("Error fetching default branch, falling back to 'main':", error);
            getGitHubDefaultBranch.cachedBranch = 'main';
            return 'main';
        }
    }
    getGitHubDefaultBranch.cachedBranch = null;

    function identifyFoldableRegions(codeText) {
        const lines = codeText.split(/\r\n|\r|\n/);
        const regions = [];
        // Stack stores: { keywordLine: number, keyword: string, level: number, actualBraceLine: number }
        const stack = []; 
        let potentialKeywordStart = null; // { keywordLine: number, keyword: string }

        let inMultiLineComment = false;
        let inSingleLineCommentThisLine = false;
        let inString = false;
        let stringChar = null;

        lines.forEach((lineContent, index) => {
            const lineNumber = index + 1;
            inSingleLineCommentThisLine = false;
            let trimmedLine = lineContent.trimStart(); // Only trim start for regex matching

            // Check for foldable keywords if not in a multi-line comment or string
            if (!inMultiLineComment && !inString) {
                const match = trimmedLine.match(FOLDABLE_KEYWORDS_REGEX);
                if (match) {
                    // Basic check: ensure the keyword is not inside a single-line comment on this line
                    const keywordIndexInOriginal = lineContent.indexOf(match[1]); // match[1] is the keyword (fn, struct, etc.)
                    let isRealKeyword = true;
                    if (keywordIndexInOriginal > -1) {
                        for (let k = 0; k < keywordIndexInOriginal; k++) {
                            if (lineContent[k] === '/' && lineContent[k+1] === '/') {
                                isRealKeyword = false;
                                break;
                            }
                        }
                    }
                    if (isRealKeyword) {
                        potentialKeywordStart = { keywordLine: lineNumber, keyword: match[1] };
                    }
                }
            }

            for (let i = 0; i < lineContent.length; i++) {
                const char = lineContent[i];
                const nextChar = lineContent[i+1];

                if (inMultiLineComment) {
                    if (char === '*' && nextChar === '/') { inMultiLineComment = false; i++; }
                    continue;
                }
                if (inSingleLineCommentThisLine) continue;
                if (inString) {
                    if (char === '\\' && nextChar) { i++; continue; }
                    if (char === stringChar) { inString = false; stringChar = null; }
                    continue;
                }

                if (char === '/' && nextChar === '/') { inSingleLineCommentThisLine = true; i++; continue; }
                if (char === '/' && nextChar === '*') { inMultiLineComment = true; i++; continue; }
                if (char === '"' || char === "'" || (char === 'r' && (nextChar === '"' || (nextChar === '#' && lineContent[i+2] === '"')))) { // Basic raw string check
                    inString = true;
                    stringChar = '"'; // Simplification for raw strings, actual terminator is more complex
                    if (char === "'") stringChar = "'";
                    if (char === 'r') i = lineContent.indexOf('"', i) -1; // Jump to quote start
                    continue;
                }

                if (char === '{') {
                    let type = 'generic_block'; // Default for non-keyword related braces
                    let startLineForRegion = lineNumber;
                    let keywordForRegion = null;

                    if (potentialKeywordStart) {
                        type = potentialKeywordStart.keyword; // fn, struct, etc.
                        startLineForRegion = potentialKeywordStart.keywordLine;
                        keywordForRegion = potentialKeywordStart.keyword;
                        potentialKeywordStart = null; // Consumed
                    }
                    stack.push({ 
                        keywordLine: startLineForRegion, 
                        keyword: keywordForRegion, 
                        level: stack.length, 
                        actualBraceLine: lineNumber 
                    });
                } else if (char === '}') {
                    if (stack.length > 0) {
                        const openBraceInfo = stack.pop();
                        // Only create a foldable region for our designated keywords
                        if (openBraceInfo.keyword && ['fn', 'struct', 'impl', 'enum', 'trait', 'mod'].includes(openBraceInfo.keyword)) {
                            // Ensure the block is not empty or trivial (e.g. {} on one line, or { \n })
                            if (lineNumber > openBraceInfo.actualBraceLine) { // Closing brace must be on a later line
                                regions.push({
                                    startLine: openBraceInfo.keywordLine, // Line of 'fn', 'struct', etc.
                                    endLine: lineNumber,                  // Line of '}'
                                    level: openBraceInfo.level,
                                    type: openBraceInfo.keyword,
                                    actualBraceLine: openBraceInfo.actualBraceLine, // Line of '{'
                                    isFolded: false
                                });
                            }
                        }
                    }
                }
            }
            // Heuristic: If a keyword was pending but line ended without '{', and it's not a typical multi-line signature ender
            if (potentialKeywordStart && potentialKeywordStart.keywordLine === lineNumber && !lineContent.includes('{')) {
                 if (!trimmedLine.endsWith('->') && !trimmedLine.endsWith(',') && !trimmedLine.endsWith('(') && !trimmedLine.endsWith('where') && !trimmedLine.endsWith(')') && !trimmedLine.endsWith('>')) {
                    potentialKeywordStart = null; // Reset if it seems like the { isn't coming soon for this keyword
                }
            }
        });
        regions.sort((a, b) => {
            if (a.startLine !== b.startLine) return a.startLine - b.startLine;
            return b.endLine - a.endLine;
        });
        return regions;
    }

    function toggleFoldRegion(regionIndex, foldToggleElement) {
        if (!currentFoldableRegions[regionIndex] || !contentWrapper || !panelCodeBlock) return;

        const region = currentFoldableRegions[regionIndex];
        
        // --- Try to preserve scroll position ---
        const oldScrollTop = contentWrapper.scrollTop;
        let lineElementForScroll = foldToggleElement.closest('.cv-line');
        const oldLineOffsetTop = lineElementForScroll ? lineElementForScroll.offsetTop - panelCodeBlock.offsetTop : 0;
        // ---

        region.isFolded = !region.isFolded;
        renderCodeWithFolds(currentRawCodeText, currentFoldableRegions);

        // --- Restore scroll position ---
        // Need to find the re-rendered line element. We can use its line number.
        // This assumes line numbers are unique and stable in the DOM structure.
        const newLineElement = Array.from(panelCodeBlock.querySelectorAll('.cv-line .cv-line-number'))
                                .find(numSpan => parseInt(numSpan.textContent) === region.startLine)
                                ?.closest('.cv-line');

        if (newLineElement) {
            const newLineOffsetTop = newLineElement.offsetTop - panelCodeBlock.offsetTop;
            const scrollDiff = newLineOffsetTop - oldLineOffsetTop;
            contentWrapper.scrollTop = oldScrollTop + scrollDiff;
        } else {
            // Fallback if element not found (shouldn't happen for startLine)
            // or if just unfolding, try to keep top visible
            if (!region.isFolded) contentWrapper.scrollTop = oldScrollTop;
        }
        // ---
    }

    function renderCodeWithFolds(codeText, foldableRegions) {
        if (!panelCodeBlock || !window.hljs) {
            if (panelCodeBlock) panelCodeBlock.textContent = codeText;
            return;
        }

        panelCodeBlock.innerHTML = '';
        panelCodeBlock.className = 'language-rust hljs';

        const highlighted = hljs.highlight(codeText, { language: 'rust', ignoreIllegals: true });
        const highlightedHtmlLines = highlighted.value.split('\n');

        let linesToSkipUntil = 0;

        highlightedHtmlLines.forEach((htmlLineContent, index) => {
            const lineNumber = index + 1;
            let lineIsVisible = true;

            if (linesToSkipUntil > lineNumber) {
                lineIsVisible = false;
            } else {
                linesToSkipUntil = 0; 
            }
            
            const startingFoldedRegionThisLine = foldableRegions.find(
                r => r.startLine === lineNumber && r.isFolded
            );

            if (startingFoldedRegionThisLine) {
                linesToSkipUntil = startingFoldedRegionThisLine.endLine;
            } else {
                for (const region of foldableRegions) {
                    if (region.isFolded && lineNumber > region.startLine && lineNumber < region.endLine) {
                        lineIsVisible = false;
                        break;
                    }
                }
            }

            if (!lineIsVisible) {
                return; 
            }

            const lineDiv = document.createElement('div');
            lineDiv.className = 'cv-line';
            // Store line number for easier lookup if needed later
            lineDiv.dataset.lineNumber = lineNumber.toString();


            const gutterSpan = document.createElement('span');
            gutterSpan.className = 'cv-gutter';

            const numberSpan = document.createElement('span');
            numberSpan.className = 'cv-line-number';
            numberSpan.textContent = lineNumber.toString();

            const regionStartingHere = foldableRegions.find(r => r.startLine === lineNumber);
            if (regionStartingHere) {
                const foldToggle = document.createElement('span');
                foldToggle.className = 'cv-fold-toggle';
                foldToggle.innerHTML = regionStartingHere.isFolded ? '►' : '▼';
                foldToggle.title = regionStartingHere.isFolded ? 'Expand' : 'Collapse';
                const regionIndex = foldableRegions.indexOf(regionStartingHere);
                // Pass the toggle element itself for scroll preservation
                foldToggle.addEventListener('click', (e) => toggleFoldRegion(regionIndex, e.currentTarget));
                gutterSpan.appendChild(foldToggle);
            } else {
                const togglePlaceholder = document.createElement('span');
                togglePlaceholder.className = 'cv-fold-toggle-placeholder';
                gutterSpan.appendChild(togglePlaceholder);
            }

            gutterSpan.appendChild(numberSpan);
            lineDiv.appendChild(gutterSpan);

            const codeSpan = document.createElement('span');
            codeSpan.className = 'cv-line-code';
            codeSpan.innerHTML = htmlLineContent || ' '; 

            if (startingFoldedRegionThisLine) { 
                const placeholder = document.createElement('span');
                placeholder.className = 'cv-fold-placeholder';
                let actualStartBraceLine = startingFoldedRegionThisLine.actualBraceLine || startingFoldedRegionThisLine.startLine;
                let linesFoldedCount = startingFoldedRegionThisLine.endLine - actualStartBraceLine -1;
                if (linesFoldedCount < 0) linesFoldedCount = 0; 

                placeholder.textContent = ` ... {${linesFoldedCount}} lines ... `;
                
                // If the startLine (e.g. `fn foo()`) does not contain the opening brace for the body,
                // the placeholder should appear on the line that *does* contain the opening brace.
                // However, our current structure adds the placeholder to the codeSpan of the region's startLine.
                // For simplicity, we'll keep it this way. A more complex DOM manipulation would be needed
                // to inject the placeholder onto a *different* line's codeSpan if startLine !== actualBraceLine.
                // This means for multi-line function signatures, the "..." might appear on the `fn` line.
                codeSpan.appendChild(placeholder);
            }
            
            lineDiv.appendChild(codeSpan);
            panelCodeBlock.appendChild(lineDiv);
        });
    }

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
        panelCodeBlock.className = 'language-rust hljs';
        
        const loadingLineDiv = document.createElement('div');
        loadingLineDiv.className = 'cv-line';
        const gutterLoading = document.createElement('span');
        gutterLoading.className = 'cv-gutter';
        const emptyTogglePlaceholder = document.createElement('span');
        emptyTogglePlaceholder.className = 'cv-fold-toggle-placeholder';
        const emptyNumberSpanLoading = document.createElement('span');
        emptyNumberSpanLoading.className = 'cv-line-number';
        emptyNumberSpanLoading.innerHTML = ' ';
        gutterLoading.appendChild(emptyTogglePlaceholder);
        gutterLoading.appendChild(emptyNumberSpanLoading);
        const loadingMsgSpan = document.createElement('span');
        loadingMsgSpan.className = 'cv-line-code'; 
        loadingMsgSpan.textContent = `Loading ${justFileName} from GitHub...`;
        loadingLineDiv.appendChild(gutterLoading);
        loadingLineDiv.appendChild(loadingMsgSpan);
        panelCodeBlock.appendChild(loadingLineDiv);

        try {
            const response = await fetch(fullCodeUrl);
            if (!response.ok) {
                let errorMsg = `HTTP error ${response.status} fetching from GitHub.`;
                if (response.status === 404) errorMsg += ` File not found at path '${fullPathInRepo}' in branch '${defaultBranch}'.`;
                else if (response.status === 403) errorMsg += ` GitHub API rate limit likely exceeded or private repository/file.`;
                throw new Error(errorMsg);
            }
            currentRawCodeText = await response.text();
            
            currentFoldableRegions = identifyFoldableRegions(currentRawCodeText);
            
            renderCodeWithFolds(currentRawCodeText, currentFoldableRegions);

        } catch (error) {
            console.error(`code-viewer.js: Failed to load or display code for ${justFileName} from GitHub:`, error);
            panelCodeBlock.innerHTML = ''; 
            const errorLineDiv = document.createElement('div');
            errorLineDiv.className = 'cv-line'; 
            const gutterError = document.createElement('span');
            gutterError.className = 'cv-gutter';
            const errorTogglePlaceholder = document.createElement('span');
            errorTogglePlaceholder.className = 'cv-fold-toggle-placeholder';
            const emptyNumberSpanError = document.createElement('span');
            emptyNumberSpanError.className = 'cv-line-number';
            emptyNumberSpanError.innerHTML = ' ';
            gutterError.appendChild(errorTogglePlaceholder);
            gutterError.appendChild(emptyNumberSpanError);
            const errorMsgSpan = document.createElement('span');
            errorMsgSpan.className = 'cv-line-code'; 
            errorMsgSpan.style.whiteSpace = 'pre-wrap'; 
            errorMsgSpan.textContent = `Error loading code for ${justFileName} from GitHub.\n${error.message}\n(URL: ${fullCodeUrl})`;
            errorLineDiv.appendChild(gutterError);
            errorLineDiv.appendChild(errorMsgSpan);
            panelCodeBlock.appendChild(errorLineDiv);
            panelCodeBlock.className = ''; 
            panelCodeBlock.classList.remove('hljs');
            currentFoldableRegions = [];
            currentRawCodeText = "";
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
        currentFoldableRegions = [];
        currentRawCodeText = "";
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