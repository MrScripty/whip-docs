// scripts/ui/integrated-code-viewer.js
import { identifyFoldableRegions } from './code-folding-logic.js'; // IMPORT THE FUNCTION

document.addEventListener('DOMContentLoaded', async () => {
    // console.log("integrated-code-viewer.js: DOMContentLoaded triggered. V3");
    const INTEGRATED_VIEWER_COMPONENT_PATH = '/web-pages/components/integrated-code-viewer.html'; 
    
    const GITHUB_USER = 'MrScripty';
    const GITHUB_REPO = 'Studio-Whip';
    const GITHUB_PROJECT_SUBPATH = 'rust/src';
    const GITHUB_RAW_CONTENT_BASE_URL = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/`;

    let injectionPoint, panelContainer, panelFilename, panelCodeBlock, panelMinimizeBtn, contentWrapper;

    let isViewerVisible = false;
    let isPanelInitialized = false;

    let currentFoldableRegions = [];
    let currentRawCodeText = ""; 

    // FOLDABLE_KEYWORDS_REGEX is now in code-folding-logic.js and used internally by identifyFoldableRegions

    async function initializeIntegratedCodeViewer() {
        if (isPanelInitialized) return true;
        try {
            injectionPoint = document.getElementById('integrated-code-viewer-placeholder');
            if (!injectionPoint) {
                console.error("integrated-code-viewer.js: Injection point 'integrated-code-viewer-placeholder' NOT FOUND.");
                return false;
            }
            
            const pathForFetch = INTEGRATED_VIEWER_COMPONENT_PATH;
            const response = await fetch(pathForFetch); 
            if (!response.ok) {
                console.error(`integrated-code-viewer.js: Failed to load ${pathForFetch}. Status: ${response.status}, Text: ${response.statusText}.`);
                throw new Error(`Failed to load ${pathForFetch}: ${response.statusText}`);
            }
            const viewerHtml = await response.text();
            injectionPoint.innerHTML = viewerHtml;

            panelContainer = document.getElementById('icv-panel');
            panelFilename = document.getElementById('icv-filename');
            panelCodeBlock = document.getElementById('icv-code-block');
            panelMinimizeBtn = document.getElementById('icv-minimize-btn');
            contentWrapper = document.getElementById('icv-content-wrapper'); 

            if (!panelContainer || !panelFilename || !panelCodeBlock || !panelMinimizeBtn || !contentWrapper) {
                console.error("integrated-code-viewer.js: Critical elements missing after HTML injection! Initialization failed.");
                if (!panelContainer) console.error("Missing: panelContainer (icv-panel)");
                if (!panelFilename) console.error("Missing: panelFilename (icv-filename)");
                if (!panelCodeBlock) console.error("Missing: panelCodeBlock (icv-code-block)");
                if (!panelMinimizeBtn) console.error("Missing: panelMinimizeBtn (icv-minimize-btn)");
                if (!contentWrapper) console.error("Missing: contentWrapper (icv-content-wrapper)");
                return false;
            }

            panelMinimizeBtn.addEventListener('click', hideCodeViewer);
            isPanelInitialized = true;
            return true;
        } catch (error) {
            console.error("integrated-code-viewer.js: Error during initializeIntegratedCodeViewer:", error);
            isPanelInitialized = false; 
            return false;
        }
    }
    
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

    // identifyFoldableRegions is now imported

    function toggleFoldRegion(regionIndex, foldToggleElement) {
        if (!currentFoldableRegions[regionIndex] || !contentWrapper || !panelCodeBlock) return;
        const region = currentFoldableRegions[regionIndex];
        
        const oldScrollTop = contentWrapper.scrollTop;
        let lineElementForScroll = foldToggleElement.closest('.cv-line');
        const oldLineOffsetTop = lineElementForScroll ? lineElementForScroll.offsetTop - panelCodeBlock.offsetTop : 0;

        region.isFolded = !region.isFolded;
        renderCodeWithFolds(currentRawCodeText, currentFoldableRegions); // Re-render with new fold state
        
        // Attempt to restore scroll position relative to the toggled line
        const newFirstLineOfRegion = panelCodeBlock.querySelector(`.cv-line[data-line-number="${region.startLine}"]`) || 
                                     (region.type === 'consolidated_use_block' ? panelCodeBlock.querySelector('.cv-line[data-line-number="0"]') : null);

        if (newFirstLineOfRegion) {
            const newLineOffsetTop = newFirstLineOfRegion.offsetTop - panelCodeBlock.offsetTop;
            const scrollDiff = newLineOffsetTop - oldLineOffsetTop;
            contentWrapper.scrollTop = oldScrollTop + scrollDiff;
        } else if (!region.isFolded) { // If unfolding and the line isn't found (shouldn't happen), try to maintain scroll
             contentWrapper.scrollTop = oldScrollTop;
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
            
            const allContentLines = panelCodeBlock.querySelectorAll('.cv-line:not(.cv-padding-line)');
            const lastLineNumberElement = allContentLines.length > 0 ? allContentLines[allContentLines.length-1].querySelector('.cv-line-number') : null;
            
            let nextLineNumber;
            if (lastLineNumberElement && lastLineNumberElement.textContent.trim() !== "" && !isNaN(parseInt(lastLineNumberElement.textContent))) {
                nextLineNumber = parseInt(lastLineNumberElement.textContent) + 1;
            } else {
                 // If last line number is not valid (e.g. consolidated use block '0'), count rendered lines
                 nextLineNumber = allContentLines.length + 1; 
                 // Adjust if consolidated 'use' block (line 0) is present
                 if (panelCodeBlock.querySelector('.cv-line[data-line-number="0"]')) nextLineNumber--; 
            }

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
                codeSpan.innerHTML = '​'; // Zero-width space for height
                lineDiv.appendChild(codeSpan);
                panelCodeBlock.appendChild(lineDiv);
            }
        }
    }

    function isLineCommentOnly(htmlLineContent) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlLineContent;
        
        // Check if all direct children are spans with hljs-comment or text nodes with only whitespace
        for (const node of tempDiv.childNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) { // Element node
                if (node.tagName !== 'SPAN' || !node.classList.contains('hljs-comment')) {
                    return false; // Found a non-comment span or other element
                }
            } else if (node.nodeType === Node.TEXT_NODE) { // Text node
                if (node.textContent.trim() !== '') {
                    return false; // Found non-whitespace text
                }
            } else {
                // Other node types (like comments <!-- -->) could be ignored or handled
            }
        }
        // If the line is empty after stripping comments, or only had comments
        return tempDiv.textContent.trim() === '' || tempDiv.querySelectorAll('*:not(span.hljs-comment)').length === 0;
    }

    function getDeclarationType(lineNumber, foldableRegions) {
        const regionStartingHere = foldableRegions.find(r => r.startLine === lineNumber && r.type !== 'consolidated_use_block');
        if (regionStartingHere) {
            return regionStartingHere.type;
        }
        // Check if inside a region
        for (const region of foldableRegions) {
            if (region.type !== 'consolidated_use_block' && lineNumber > region.startLine && lineNumber <= region.endLine) {
                // This is a simplification; ideally, we'd find the *innermost* region.
                // However, for blank line separation, the outermost block type is often what matters.
                return region.type; 
            }
        }
        return 'other_code'; // Default if not in a specific known block
    }


    function renderCodeWithFolds(codeText, foldableRegions) {
        if (!panelCodeBlock || !window.hljs || !contentWrapper) {
            if (panelCodeBlock) panelCodeBlock.textContent = codeText;
            return;
        }
        panelCodeBlock.innerHTML = '';
        panelCodeBlock.className = 'language-rust hljs';
    
        const consolidatedUseRegion = foldableRegions.find(r => r.type === 'consolidated_use_block');
        const originalUseLinesToHideDetails = consolidatedUseRegion ? consolidatedUseRegion.originalLinesDetails : [];
    
        let lastMeaningfulLineType = null; 
        let lastRenderedLineWasActuallyBlank = true; // Start as true to prevent leading blank for first code line

        // Render consolidated 'use' block first if it exists
        if (consolidatedUseRegion) {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'cv-line';
            lineDiv.dataset.lineNumber = "0"; // Special line number for the consolidated block
    
            const gutterSpan = document.createElement('span');
            gutterSpan.className = 'cv-gutter';
    
            const foldToggle = document.createElement('span');
            foldToggle.className = 'cv-fold-toggle';
            foldToggle.innerHTML = consolidatedUseRegion.isFolded ? '►' : '▼';
            foldToggle.title = consolidatedUseRegion.isFolded ? 'Expand imports' : 'Collapse imports';
            const regionIndex = foldableRegions.indexOf(consolidatedUseRegion);
            foldToggle.addEventListener('click', (e) => toggleFoldRegion(regionIndex, e.currentTarget));
            gutterSpan.appendChild(foldToggle);
    
            const numberSpan = document.createElement('span');
            numberSpan.className = 'cv-line-number';
            numberSpan.innerHTML = '​'; // Zero-width space
            gutterSpan.appendChild(numberSpan);
            lineDiv.appendChild(gutterSpan);
    
            const codeSpan = document.createElement('span');
            codeSpan.className = 'cv-line-code';
            const useKeywordSpan = document.createElement('span');
            useKeywordSpan.className = 'hljs-keyword'; 
            useKeywordSpan.textContent = 'use';
            codeSpan.appendChild(useKeywordSpan);
    
            if (consolidatedUseRegion.isFolded) {
                const placeholder = document.createElement('span');
                placeholder.className = 'cv-fold-placeholder';
                placeholder.textContent = ` ... {${consolidatedUseRegion.count}} import statements ... `;
                codeSpan.appendChild(document.createTextNode(" ")); 
                codeSpan.appendChild(placeholder);
            }
            lineDiv.appendChild(codeSpan);
            panelCodeBlock.appendChild(lineDiv);
            lastMeaningfulLineType = 'use'; // Set type for spacing logic
            lastRenderedLineWasActuallyBlank = false;
    
            if (!consolidatedUseRegion.isFolded) {
                // Render original 'use' statements if expanded
                const allCodeLines = codeText.split(/\r\n|\r|\n/);
                consolidatedUseRegion.originalLinesDetails.forEach(useDetail => {
                    for (let ln = useDetail.startLine; ln <= useDetail.endLine; ln++) {
                        const originalLineIndex = ln - 1;
                        if (originalLineIndex < allCodeLines.length) {
                            const originalLineContent = allCodeLines[originalLineIndex];
                            // Skip if this line is purely a comment
                            if (isLineCommentOnly(hljs.highlight(originalLineContent, {language: 'rust', ignoreIllegals: true}).value)) {
                                continue;
                            }
                             // Skip if this line is blank
                            if (originalLineContent.trim() === '') {
                                if (!lastRenderedLineWasActuallyBlank) { // Render only one blank line
                                    const blankUseLineDiv = document.createElement('div');
                                    blankUseLineDiv.className = 'cv-line cv-blank-line';
                                    blankUseLineDiv.dataset.lineNumber = ln.toString();
                                    blankUseLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number">${ln}</span></span><span class="cv-line-code">​</span>`;
                                    panelCodeBlock.appendChild(blankUseLineDiv);
                                    lastRenderedLineWasActuallyBlank = true;
                                }
                                continue;
                            }

                            const useLineDiv = document.createElement('div');
                            useLineDiv.className = 'cv-line cv-original-use-line'; 
                            useLineDiv.dataset.lineNumber = ln.toString();
                            
                            const useGutterSpan = document.createElement('span');
                            useGutterSpan.className = 'cv-gutter';
                            const useTogglePlaceholder = document.createElement('span');
                            useTogglePlaceholder.className = 'cv-fold-toggle-placeholder'; 
                            useGutterSpan.appendChild(useTogglePlaceholder);
                            const useNumberSpan = document.createElement('span');
                            useNumberSpan.className = 'cv-line-number';
                            useNumberSpan.textContent = ln.toString();
                            useGutterSpan.appendChild(useNumberSpan);
                            useLineDiv.appendChild(useGutterSpan);
    
                            const useCodeSpan = document.createElement('span');
                            useCodeSpan.className = 'cv-line-code';
                            let tempHighlightedLine = hljs.highlight(originalLineContent, {language: 'rust', ignoreIllegals: true}).value;
                            useCodeSpan.innerHTML = tempHighlightedLine || '​';
                            useLineDiv.appendChild(useCodeSpan);
                            panelCodeBlock.appendChild(useLineDiv);
                            lastRenderedLineWasActuallyBlank = false;
                        }
                    }
                });
            }
        }
    
        // Render the rest of the code
        const highlighted = hljs.highlight(codeText, { language: 'rust', ignoreIllegals: true });
        const highlightedHtmlLines = highlighted.value.split('\n');
        let linesToSkipUntil = 0;
    
        highlightedHtmlLines.forEach((htmlLineContent, index) => {
            const lineNumber = index + 1;
    
            // Skip if it's an original 'use' line already handled (or meant to be hidden by consolidated block)
            let isOriginalUseLine = false;
            for (const useRange of originalUseLinesToHideDetails) {
                if (lineNumber >= useRange.startLine && lineNumber <= useRange.endLine) {
                    isOriginalUseLine = true;
                    break;
                }
            }
            if (isOriginalUseLine) return; 
    
            // --- Comment and Blank Line Filtering ---
            if (isLineCommentOnly(htmlLineContent)) {
                return; // Skip comment-only lines
            }

            const isCurrentLineBlank = htmlLineContent.trim() === '';
            const currentCodeLineType = isCurrentLineBlank ? null : getDeclarationType(lineNumber, foldableRegions);

            if (isCurrentLineBlank) {
                // Peek ahead to see the type of the next non-blank, non-comment line
                let nextMeaningfulLineType = null;
                for (let k = index + 1; k < highlightedHtmlLines.length; k++) {
                    const nextHtmlLine = highlightedHtmlLines[k];
                    if (isLineCommentOnly(nextHtmlLine) || nextHtmlLine.trim() === '') continue;
                    nextMeaningfulLineType = getDeclarationType(k + 1, foldableRegions);
                    break;
                }

                if (lastMeaningfulLineType && nextMeaningfulLineType && lastMeaningfulLineType === nextMeaningfulLineType) {
                    // Same type before and after this blank line, so skip it
                    return;
                }
                // If types are different, or at start/end of blocks, allow one blank line
                if (lastRenderedLineWasActuallyBlank) return; // Already rendered a blank, skip this one
                // Otherwise, this blank line will be rendered
            } else { // It's a code line
                if (lastMeaningfulLineType !== null && currentCodeLineType !== lastMeaningfulLineType && !lastRenderedLineWasActuallyBlank) {
                    // Different types, and no blank line was just rendered, so insert one
                    const blankLineDiv = document.createElement('div');
                    blankLineDiv.className = 'cv-line cv-blank-line cv-synthetic-blank';
                    // Synthetic blanks don't get a real line number from source
                    blankLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number">​</span></span><span class="cv-line-code">​</span>`;
                    panelCodeBlock.appendChild(blankLineDiv);
                }
            }
            // --- End Comment and Blank Line Filtering ---

            let lineIsVisible = true;
            if (linesToSkipUntil >= lineNumber) {
                 lineIsVisible = false;
            } else {
                 linesToSkipUntil = 0; // Reset skip counter
            }
            
            // Determine if this line starts a folded region (excluding consolidated_use_block)
            const startingFoldedRegionThisLine = foldableRegions.find(
                r => r.startLine === lineNumber && r.isFolded && r.type !== 'consolidated_use_block'
            );
    
            if (startingFoldedRegionThisLine) {
                linesToSkipUntil = startingFoldedRegionThisLine.endLine;
            } else {
                // Check if this line is part of an already determined folded region
                for (const region of foldableRegions) {
                    if (region.type !== 'consolidated_use_block' && region.isFolded && 
                        lineNumber > region.startLine && lineNumber <= region.endLine) {
                        lineIsVisible = false;
                        break;
                    }
                }
            }

            if (!lineIsVisible) {
                if (!isCurrentLineBlank) lastMeaningfulLineType = currentCodeLineType; // Still update type if code was folded
                return; 
            }
    
            // Render the line
            const lineDiv = document.createElement('div');
            lineDiv.className = 'cv-line';
            if (isCurrentLineBlank) lineDiv.classList.add('cv-blank-line');
            lineDiv.dataset.lineNumber = lineNumber.toString();
    
            const gutterSpan = document.createElement('span');
            gutterSpan.className = 'cv-gutter';
    
            const numberSpan = document.createElement('span');
            numberSpan.className = 'cv-line-number';
            numberSpan.textContent = isCurrentLineBlank ? '​' : lineNumber.toString(); // No number for blank lines
            
            const regionStartingHere = foldableRegions.find(r => r.startLine === lineNumber && r.type !== 'consolidated_use_block');
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
            codeSpan.innerHTML = htmlLineContent || '​'; // Use zero-width space for empty lines
            
            if (startingFoldedRegionThisLine) { 
                const placeholder = document.createElement('span');
                placeholder.className = 'cv-fold-placeholder';
                let linesFoldedCount = Math.max(0, startingFoldedRegionThisLine.endLine - (startingFoldedRegionThisLine.actualBraceLine || startingFoldedRegionThisLine.startLine) -1);
                placeholder.textContent = ` ... {${linesFoldedCount}} lines ... `;
                
                // Ensure space before placeholder if line ends with certain characters
                if (codeSpan.textContent.trim().endsWith('{') || codeSpan.textContent.trim().endsWith('(') || codeSpan.textContent.trim().endsWith('=')) {
                     codeSpan.innerHTML += " "; // Add space if not already there
                }
                codeSpan.appendChild(placeholder);
            }
            
            lineDiv.appendChild(codeSpan);
            panelCodeBlock.appendChild(lineDiv);

            if (isCurrentLineBlank) {
                lastRenderedLineWasActuallyBlank = true;
            } else {
                lastRenderedLineWasActuallyBlank = false;
                lastMeaningfulLineType = currentCodeLineType;
            }
        });
    
        addBottomPadding();
    }


    async function displayCodeForNode(nodeData) {
        if (!isPanelInitialized) {
            const initialized = await initializeIntegratedCodeViewer();
            if (!initialized) {
                console.error("integrated-code-viewer.js: displayCodeForNode - Failed to initialize panel on demand.");
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
        loadingLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number">​</span></span><span class="cv-line-code">Loading ${justFileName} from GitHub...</span>`;
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
            // Use the imported function
            currentFoldableRegions = identifyFoldableRegions(currentRawCodeText); 
            renderCodeWithFolds(currentRawCodeText, currentFoldableRegions);
        } catch (error) {
            console.error(`integrated-code-viewer.js: Failed to load/display code for ${justFileName}:`, error);
            panelCodeBlock.innerHTML = ''; 
            const errorLineDiv = document.createElement('div');
            errorLineDiv.className = 'cv-line';
            errorLineDiv.innerHTML = `<span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number">​</span></span><span class="cv-line-code" style="white-space: pre-wrap;">Error: ${error.message}\nURL: ${fullCodeUrl}</span>`;
            panelCodeBlock.appendChild(errorLineDiv);
            addBottomPadding(); 
            panelCodeBlock.className = ''; 
            currentFoldableRegions = []; currentRawCodeText = "";
        }

        if (!isViewerVisible) {
            panelContainer.classList.add('visible');
            isViewerVisible = true;
        }
        panelContainer.dataset.currentNodeId = nodeData.id;
    }

    function showCodeViewer() {
        if (!panelContainer) return;
        if (isViewerVisible) {
            // If already visible, and a different node is selected globally, update the content
            if (window.currentlySelectedGraphNodeData && panelContainer.dataset.currentNodeId !== window.currentlySelectedGraphNodeData.id) {
                 displayCodeForNode(window.currentlySelectedGraphNodeData);
            }
            return; // Already visible, do nothing more for show
        }
        
        panelContainer.classList.add('visible');
        isViewerVisible = true;

        // Load content if a node is selected, or show placeholder
        if (window.currentlySelectedGraphNodeData) {
            displayCodeForNode(window.currentlySelectedGraphNodeData);
        } else {
            panelFilename.textContent = "No file selected";
            panelCodeBlock.innerHTML = '<div class="cv-line"><span class="cv-gutter"><span class="cv-fold-toggle-placeholder"></span><span class="cv-line-number">​</span></span><span class="cv-line-code">Select a node in the graph and press ~ to view its code.</span></div>';
            addBottomPadding();
        }
    }

    function hideCodeViewer() {
        if (!panelContainer) return;
        if (!isViewerVisible) return; // Already hidden
        panelContainer.classList.remove('visible');
        isViewerVisible = false;
        // Optionally clear content or filename when hidden
        // panelFilename.textContent = "No file selected";
        // panelCodeBlock.innerHTML = '';
        // currentRawCodeText = "";
        // currentFoldableRegions = [];
    }

    document.addEventListener('keydown', async (event) => {
        if (!isPanelInitialized) {
            const success = await initializeIntegratedCodeViewer();
            if (!success) return; 
        }
        
        if (event.key === 'Escape' && isViewerVisible) {
            hideCodeViewer();
        } else if ((event.key === '~' || event.key === '`')) {
            event.preventDefault(); 
            if (isViewerVisible) {
                // If viewer is visible and current graph node matches what's shown, hide it.
                if (window.currentlySelectedGraphNodeData && panelContainer.dataset.currentNodeId === window.currentlySelectedGraphNodeData.id) {
                    hideCodeViewer();
                } 
                // If viewer is visible but a *different* node is selected in graph (or no node), update/show for current selection.
                else if (window.currentlySelectedGraphNodeData) {
                     displayCodeForNode(window.currentlySelectedGraphNodeData); // This will also ensure it's visible
                } 
                // If viewer is visible but no node selected in graph, hide it.
                else {
                    hideCodeViewer();
                }
            } else {
                // If viewer is hidden, show it (it will pick up current graph node or show placeholder)
                showCodeViewer(); 
            }
        }
    });
    
    // Initialize the viewer on DOMContentLoaded
    initializeIntegratedCodeViewer().catch(err => console.error("integrated-code-viewer.js: Initial setup promise failed:", err));
});