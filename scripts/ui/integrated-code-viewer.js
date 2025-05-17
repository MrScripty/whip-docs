// scripts/ui/integrated-code-viewer.js
document.addEventListener('DOMContentLoaded', async () => {
    console.log("integrated-code-viewer.js: DOMContentLoaded triggered. V3"); // Version marker
    // --- MODIFIED PATH ---
    const INTEGRATED_VIEWER_COMPONENT_PATH = '/web-pages/components/integrated-code-viewer.html'; // Absolute path from server root
    
    // ... (GITHUB constants etc. remain the same) ...
    const GITHUB_USER = 'MrScripty';
    const GITHUB_REPO = 'Studio-Whip';
    const GITHUB_PROJECT_SUBPATH = 'rust/src';
    const GITHUB_RAW_CONTENT_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/`;

    let injectionPoint, panelContainer, panelFilename, panelCodeBlock, panelMinimizeBtn, contentWrapper;

    let isViewerVisible = false;
    let isPanelInitialized = false;

    let currentFoldableRegions = [];
    let currentRawCodeText = ""; 

    const FOLDABLE_KEYWORDS_REGEX = /^\s*(?:pub(?:\([^)]*\))?\s*)?(?:unsafe\s+)?(?:async\s+)?(fn|struct|impl|enum|trait|mod)\b/;


    async function initializeIntegratedCodeViewer() {
        if (isPanelInitialized) return true;
        console.log("integrated-code-viewer.js: Initializing. V3");
        try {
            injectionPoint = document.getElementById('integrated-code-viewer-placeholder');
            if (!injectionPoint) {
                console.error("integrated-code-viewer.js: Injection point 'integrated-code-viewer-placeholder' NOT FOUND. V3");
                return false;
            }
            console.log("integrated-code-viewer.js: Injection point found:", injectionPoint);

            // ---!!!--- ADDED VERY EXPLICIT LOGGING ---!!!---
            const pathForFetch = INTEGRATED_VIEWER_COMPONENT_PATH;
            console.log(`%cintegrated-code-viewer.js: ABOUT TO FETCH COMPONENT FROM: "${pathForFetch}" (V3)`, "color: yellow; font-weight: bold;");
            
            const currentDocumentURL = document.location.href;
            console.log(`integrated-code-viewer.js: Current document URL is: "${currentDocumentURL}" (V3)`);
            
            let resolvedFetchURL;
            try {
                resolvedFetchURL = new URL(pathForFetch, currentDocumentURL).href;
                 console.log(`%cintegrated-code-viewer.js: Resolved URL for fetch will be: "${resolvedFetchURL}" (V3)`, "color: lightblue;");
            } catch (e) {
                console.error("integrated-code-viewer.js: Could not construct URL object for path: " + pathForFetch, e);
                resolvedFetchURL = pathForFetch; // Fallback for logging
            }
            // ---!!!--- END OF EXPLICIT LOGGING ---!!!---


            const response = await fetch(pathForFetch); // Use the explicitly logged variable
            if (!response.ok) {
                console.error(`integrated-code-viewer.js: Failed to load ${pathForFetch}. Status: ${response.status}, Text: ${response.statusText}. Attempted URL: ${resolvedFetchURL} (V3)`);
                throw new Error(`Failed to load ${pathForFetch}: ${response.statusText}`);
            }
            const viewerHtml = await response.text();
            injectionPoint.innerHTML = viewerHtml;
            console.log("integrated-code-viewer.js: HTML injected. V3");

            panelContainer = document.getElementById('icv-panel');
            panelFilename = document.getElementById('icv-filename');
            panelCodeBlock = document.getElementById('icv-code-block');
            panelMinimizeBtn = document.getElementById('icv-minimize-btn');
            contentWrapper = document.getElementById('icv-content-wrapper'); 

            if (!panelContainer) console.error("integrated-code-viewer.js: panelContainer (icv-panel) NOT FOUND after injection! V3");
            // ... (other element checks remain the same)
            if (!panelFilename) console.error("integrated-code-viewer.js: panelFilename (icv-filename) NOT FOUND! V3");
            if (!panelCodeBlock) console.error("integrated-code-viewer.js: panelCodeBlock (icv-code-block) NOT FOUND! V3");
            if (!panelMinimizeBtn) console.error("integrated-code-viewer.js: panelMinimizeBtn (icv-minimize-btn) NOT FOUND! V3");
            if (!contentWrapper) console.error("integrated-code-viewer.js: contentWrapper (icv-content-wrapper) NOT FOUND! V3");


            if (!panelContainer || !panelFilename || !panelCodeBlock || !panelMinimizeBtn || !contentWrapper) {
                console.error("integrated-code-viewer.js: Critical elements missing after HTML injection! Initialization failed. V3");
                return false;
            }

            panelMinimizeBtn.addEventListener('click', hideCodeViewer);
            isPanelInitialized = true;
            console.log("integrated-code-viewer.js: Panel initialized successfully. V3");
            return true;
        } catch (error) {
            console.error("integrated-code-viewer.js: Error during initializeIntegratedCodeViewer (V3):", error);
            isPanelInitialized = false; 
            return false;
        }
    }

    // ... (rest of the script: getGitHubDefaultBranch, identifyFoldableRegions, toggleFoldRegion, addBottomPadding, renderCodeWithFolds, displayCodeForNode, showCodeViewer, hideCodeViewer, event listener for keydown, final initializeIntegratedCodeViewer call)
    // (This part is identical to the previous version)
    async function getGitHubDefaultBranch() {
        if (getGitHubDefaultBranch.cachedBranch) return getGitHubDefaultBranch.cachedBranch;
        try {
            const repoApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}`;
            const response = await fetch(repoApiUrl);
            if (!response.ok) {
                console.warn(`Could not fetch repo details (Status: ${response.status}). Falling back to 'main'.`);
                getGitHubDefaultBranch.cachedBranch = 'main'; return 'main';
            }
            const repoData = await response.json();
            getGitHubDefaultBranch.cachedBranch = repoData.default_branch || 'main';
            return getGitHubDefaultBranch.cachedBranch;
        } catch (error) {
            console.warn("Error fetching default branch, falling back to 'main':", error);
            getGitHubDefaultBranch.cachedBranch = 'main'; return 'main';
        }
    }
    getGitHubDefaultBranch.cachedBranch = null;

    function identifyFoldableRegions(codeText) {
        const lines = codeText.split(/\r\n|\r|\n/);
        const regions = [];
        const stack = []; 
        let potentialKeywordStart = null;
        let inMultiLineComment = false;
        let inSingleLineCommentThisLine = false;
        let inString = false;
        let stringChar = null;

        lines.forEach((lineContent, index) => {
            const lineNumber = index + 1;
            inSingleLineCommentThisLine = false;
            let trimmedLine = lineContent.trimStart(); 

            if (!inMultiLineComment && !inString) {
                const match = trimmedLine.match(FOLDABLE_KEYWORDS_REGEX);
                if (match) {
                    const keywordIndexInOriginal = lineContent.indexOf(match[1]); 
                    let isRealKeyword = true;
                    if (keywordIndexInOriginal > -1) {
                        for (let k = 0; k < keywordIndexInOriginal; k++) {
                            if (lineContent[k] === '/' && lineContent[k+1] === '/') {
                                isRealKeyword = false; break;
                            }
                        }
                    }
                    if (isRealKeyword) potentialKeywordStart = { keywordLine: lineNumber, keyword: match[1] };
                }
            }

            for (let i = 0; i < lineContent.length; i++) {
                const char = lineContent[i]; const nextChar = lineContent[i+1];
                if (inMultiLineComment) { if (char === '*' && nextChar === '/') { inMultiLineComment = false; i++; } continue; }
                if (inSingleLineCommentThisLine) continue;
                if (inString) { if (char === '\\' && nextChar) { i++; continue; } if (char === stringChar) { inString = false; stringChar = null; } continue; }
                if (char === '/' && nextChar === '/') { inSingleLineCommentThisLine = true; i++; continue; }
                if (char === '/' && nextChar === '*') { inMultiLineComment = true; i++; continue; }
                if (char === '"' || char === "'" || (char === 'r' && (nextChar === '"' || (nextChar === '#' && lineContent[i+2] === '"')))) { 
                    inString = true; stringChar = '"'; 
                    if (char === "'") stringChar = "'";
                    if (char === 'r' && lineContent.indexOf('"', i) !== -1) i = lineContent.indexOf('"', i) -1; 
                    continue;
                }
                if (char === '{') {
                    let type = 'generic_block'; let startLineForRegion = lineNumber; let keywordForRegion = null;
                    if (potentialKeywordStart) {
                        type = potentialKeywordStart.keyword; startLineForRegion = potentialKeywordStart.keywordLine;
                        keywordForRegion = potentialKeywordStart.keyword; potentialKeywordStart = null; 
                    }
                    stack.push({ keywordLine: startLineForRegion, keyword: keywordForRegion, level: stack.length, actualBraceLine: lineNumber });
                } else if (char === '}') {
                    if (stack.length > 0) {
                        const openBraceInfo = stack.pop();
                        if (openBraceInfo.keyword && ['fn', 'struct', 'impl', 'enum', 'trait', 'mod'].includes(openBraceInfo.keyword)) {
                            if (lineNumber > openBraceInfo.actualBraceLine) { 
                                regions.push({
                                    startLine: openBraceInfo.keywordLine, endLine: lineNumber, level: openBraceInfo.level,
                                    type: openBraceInfo.keyword, actualBraceLine: openBraceInfo.actualBraceLine, 
                                    isFolded: true 
                                });
                            }
                        }
                    }
                }
            }
            if (potentialKeywordStart && potentialKeywordStart.keywordLine === lineNumber && !lineContent.includes('{')) {
                 if (!trimmedLine.endsWith('->') && !trimmedLine.endsWith(',') && !trimmedLine.endsWith('(') && !trimmedLine.endsWith('where') && !trimmedLine.endsWith(')') && !trimmedLine.endsWith('>')) {
                    potentialKeywordStart = null; 
                }
            }
        });
        regions.sort((a, b) => (a.startLine !== b.startLine) ? a.startLine - b.startLine : b.endLine - a.endLine);
        return regions;
    }

    function toggleFoldRegion(regionIndex, foldToggleElement) {
        if (!currentFoldableRegions[regionIndex] || !contentWrapper || !panelCodeBlock) return;
        const region = currentFoldableRegions[regionIndex];
        const oldScrollTop = contentWrapper.scrollTop;
        let lineElementForScroll = foldToggleElement.closest('.cv-line');
        const oldLineOffsetTop = lineElementForScroll ? lineElementForScroll.offsetTop - panelCodeBlock.offsetTop : 0;
        region.isFolded = !region.isFolded;
        renderCodeWithFolds(currentRawCodeText, currentFoldableRegions);
        const newLineElement = Array.from(panelCodeBlock.querySelectorAll('.cv-line .cv-line-number')).find(numSpan => parseInt(numSpan.textContent) === region.startLine)?.closest('.cv-line');
        if (newLineElement) {
            const newLineOffsetTop = newLineElement.offsetTop - panelCodeBlock.offsetTop;
            const scrollDiff = newLineOffsetTop - oldLineOffsetTop;
            contentWrapper.scrollTop = oldScrollTop + scrollDiff;
        } else {
            if (!region.isFolded) contentWrapper.scrollTop = oldScrollTop;
        }
    }
    
    function addBottomPadding() {
        if (!panelCodeBlock || !contentWrapper) return;
        const existingPaddingLines = panelCodeBlock.querySelectorAll('.cv-padding-line');
        existingPaddingLines.forEach(line => line.remove());
        const contentWrapperHeight = contentWrapper.clientHeight;
        const panelCodeBlockHeight = panelCodeBlock.offsetHeight;
        if (panelCodeBlockHeight < contentWrapperHeight) {
            const firstLine = panelCodeBlock.querySelector('.cv-line:not(.cv-padding-line)');
            if (!firstLine) return;
            const singleLineHeight = firstLine.offsetHeight;
            if (singleLineHeight <= 0) return;
            const remainingHeight = contentWrapperHeight - panelCodeBlockHeight;
            let linesToAdd = Math.floor(remainingHeight / singleLineHeight);
            const lastLineNumberElement = Array.from(panelCodeBlock.querySelectorAll('.cv-line:not(.cv-padding-line) .cv-line-number')).pop();
            let nextLineNumber = lastLineNumberElement ? parseInt(lastLineNumberElement.textContent) + 1 : 1;
            for (let i = 0; i < linesToAdd; i++) {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'cv-line cv-padding-line';
                const gutterSpan = document.createElement('span');
                gutterSpan.className = 'cv-gutter';
                const togglePlaceholder = document.createElement('span');
                togglePlaceholder.className = 'cv-fold-toggle-placeholder';
                gutterSpan.appendChild(togglePlaceholder);
                const numberSpan = document.createElement('span');
                numberSpan.className = 'cv-line-number';
                numberSpan.textContent = (nextLineNumber + i).toString();
                numberSpan.style.opacity = "0.5";
                gutterSpan.appendChild(numberSpan);
                lineDiv.appendChild(gutterSpan);
                const codeSpan = document.createElement('span');
                codeSpan.className = 'cv-line-code';
                codeSpan.innerHTML = '​'; 
                lineDiv.appendChild(codeSpan);
                panelCodeBlock.appendChild(lineDiv);
            }
        }
    }

    function renderCodeWithFolds(codeText, foldableRegions) {
        if (!panelCodeBlock || !window.hljs || !contentWrapper) {
            if (panelCodeBlock) panelCodeBlock.textContent = codeText;
            console.warn("integrated-code-viewer.js: renderCodeWithFolds - panelCodeBlock, hljs, or contentWrapper missing. V3");
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
            if (linesToSkipUntil > lineNumber) lineIsVisible = false;
            else linesToSkipUntil = 0; 
            
            const startingFoldedRegionThisLine = foldableRegions.find(r => r.startLine === lineNumber && r.isFolded);
            if (startingFoldedRegionThisLine) linesToSkipUntil = startingFoldedRegionThisLine.endLine;
            else {
                for (const region of foldableRegions) {
                    if (region.isFolded && lineNumber > region.startLine && lineNumber < region.endLine) {
                        lineIsVisible = false; break;
                    }
                }
            }
            if (!lineIsVisible) return; 

            const lineDiv = document.createElement('div');
            lineDiv.className = 'cv-line';
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
            codeSpan.innerHTML = htmlLineContent || '​';
            if (startingFoldedRegionThisLine) { 
                const placeholder = document.createElement('span');
                placeholder.className = 'cv-fold-placeholder';
                let actualStartBraceLine = startingFoldedRegionThisLine.actualBraceLine || startingFoldedRegionThisLine.startLine;
                let linesFoldedCount = startingFoldedRegionThisLine.endLine - actualStartBraceLine -1;
                if (linesFoldedCount < 0) linesFoldedCount = 0; 
                placeholder.textContent = ` ... {${linesFoldedCount}} lines ... `;
                codeSpan.appendChild(placeholder);
            }
            lineDiv.appendChild(codeSpan);
            panelCodeBlock.appendChild(lineDiv);
        });
        addBottomPadding();
    }

    async function displayCodeForNode(nodeData) {
        console.log("integrated-code-viewer.js: displayCodeForNode called for (V3):", nodeData ? nodeData.id : "null");
        if (!isPanelInitialized) {
            console.log("integrated-code-viewer.js: Panel not initialized, attempting init... V3");
            const initialized = await initializeIntegratedCodeViewer();
            if (!initialized) {
                console.error("integrated-code-viewer.js: displayCodeForNode - Failed to initialize panel on demand. V3");
                return;
            }
        }
        if (!nodeData || !nodeData.id) {
            console.log("integrated-code-viewer.js: No node data or ID, hiding viewer. V3");
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
        loadingLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number"> </span></span><span class="cv-line-code">Loading ${justFileName} from GitHub...</span>`;
        panelCodeBlock.appendChild(loadingLineDiv);
        addBottomPadding(); 

        try {
            const response = await fetch(fullCodeUrl);
            if (!response.ok) {
                let errorMsg = `HTTP error ${response.status}.`;
                if (response.status === 404) errorMsg += ` File not found: '${fullPathInRepo}' (branch: '${defaultBranch}').`;
                else if (response.status === 403) errorMsg += ` GitHub API rate limit or private repo/file.`;
                throw new Error(errorMsg);
            }
            currentRawCodeText = await response.text();
            currentFoldableRegions = identifyFoldableRegions(currentRawCodeText);
            renderCodeWithFolds(currentRawCodeText, currentFoldableRegions);
        } catch (error) {
            console.error(`integrated-code-viewer.js: Failed to load/display code for ${justFileName} (V3):`, error);
            panelCodeBlock.innerHTML = ''; 
            const errorLineDiv = document.createElement('div');
            errorLineDiv.className = 'cv-line';
            errorLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number"> </span></span><span class="cv-line-code" style="white-space: pre-wrap;">Error: ${error.message}\nURL: ${fullCodeUrl}</span>`;
            panelCodeBlock.appendChild(errorLineDiv);
            addBottomPadding(); 
            panelCodeBlock.className = ''; 
            currentFoldableRegions = []; currentRawCodeText = "";
        }

        if (!isViewerVisible) {
            console.log("integrated-code-viewer.js: Viewer was hidden, now showing for (V3)", nodeData.id);
            panelContainer.classList.add('visible');
            isViewerVisible = true;
        }
        panelContainer.dataset.currentNodeId = nodeData.id;
    }

    function showCodeViewer() {
        if (!panelContainer) {
            console.warn("integrated-code-viewer.js: showCodeViewer - panelContainer is null. V3");
            return;
        }
        if (isViewerVisible) {
            console.log("integrated-code-viewer.js: showCodeViewer - already visible. V3");
            if (window.currentlySelectedGraphNodeData && panelContainer.dataset.currentNodeId !== window.currentlySelectedGraphNodeData.id) {
                 console.log("integrated-code-viewer.js: Node changed while viewer open, updating code. V3");
                 displayCodeForNode(window.currentlySelectedGraphNodeData);
            }
            return;
        }
        
        console.log("integrated-code-viewer.js: showCodeViewer - making panel visible. V3");
        panelContainer.classList.add('visible');
        isViewerVisible = true;

        if (window.currentlySelectedGraphNodeData) {
            console.log("integrated-code-viewer.js: Node selected, displaying its code. V3");
            displayCodeForNode(window.currentlySelectedGraphNodeData);
        } else {
            console.log("integrated-code-viewer.js: No node selected, showing placeholder message. V3");
            panelFilename.textContent = "No file selected";
            panelCodeBlock.innerHTML = '<div class="cv-line"><span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number"> </span></span><span class="cv-line-code">Select a node in the graph and press ~ to view its code.</span></div>';
            addBottomPadding();
        }
    }

    function hideCodeViewer() {
        if (!panelContainer) {
             console.warn("integrated-code-viewer.js: hideCodeViewer - panelContainer is null. V3");
            return;
        }
        if (!isViewerVisible) {
            console.log("integrated-code-viewer.js: hideCodeViewer - already hidden. V3");
            return;
        }
        console.log("integrated-code-viewer.js: hideCodeViewer - hiding panel. V3");
        panelContainer.classList.remove('visible');
        isViewerVisible = false;
    }

    document.addEventListener('keydown', async (event) => {
        if (!isPanelInitialized) {
            console.log("integrated-code-viewer.js: Keydown - panel not initialized, attempting init. V3");
            const success = await initializeIntegratedCodeViewer();
            if (!success) {
                console.warn("integrated-code-viewer.js: Keydown - panel init failed, aborting key event. V3");
                return; 
            }
        }
        
        if (event.key === 'Escape' && isViewerVisible) {
            console.log("integrated-code-viewer.js: Escape key pressed, hiding viewer. V3");
            hideCodeViewer();
        } else if ((event.key === '~' || event.key === '`')) {
            event.preventDefault(); 
            console.log("integrated-code-viewer.js: Tilde key pressed. V3");
            if (isViewerVisible) {
                if (window.currentlySelectedGraphNodeData && panelContainer.dataset.currentNodeId === window.currentlySelectedGraphNodeData.id) {
                    console.log("integrated-code-viewer.js: Viewer is visible for current node, hiding. V3");
                    hideCodeViewer();
                } else if (window.currentlySelectedGraphNodeData) {
                     console.log("integrated-code-viewer.js: Viewer is visible, but different node selected. Refreshing code for (V3):", window.currentlySelectedGraphNodeData.id);
                     displayCodeForNode(window.currentlySelectedGraphNodeData); 
                } else {
                    console.log("integrated-code-viewer.js: Viewer is visible, but no node selected. Hiding. V3");
                    hideCodeViewer();
                }
            } else {
                console.log("integrated-code-viewer.js: Viewer is hidden, showing. V3");
                showCodeViewer(); 
            }
        }
    });
    
    initializeIntegratedCodeViewer().catch(err => console.error("integrated-code-viewer.js: Initial setup promise failed (V3):", err));
});