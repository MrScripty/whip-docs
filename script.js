const ASH_BASE_URL = "https://docs.rs/ash/latest/ash/";
const VULKAN_SPEC_BASE_URL = "https://registry.khronos.org/vulkan/specs/1.3-extensions/html/vkspec.html";
const DOCS_BASE_PATH = "../whip-docs";// Base path for docs folder
const TREE_FILE_NAME = "vulkan_2d_rendering.json"; // The tree file to load

let currentSelectedItemLi = null;
const barColors = ['#637C8A', '#88CDF5'];

let treeColumnRef, combinedStickyHeaderRef, stickyHeadersContainerRef, treeContentWrapperRef, branchBarRef, infoContentDivRef;
let pathLIsCoveredByStickyHeader = [];
let componentInfoData = {}; // Store componentInfo globally

// --- Highlighting and UI Functions (mostly unchanged) ---

function clearAllHighlights() {
    document.querySelectorAll('.tree-content-wrapper li').forEach(liEl => {
        liEl.classList.remove('selected-item-dark-li');
        liEl.classList.remove('parent-highlight-li');
    });
}

function applyParentHighlight(liElement) {
    liElement.classList.add('parent-highlight-li');
    const childUls = liElement.querySelectorAll(':scope > ul');
    childUls.forEach(ul => {
        const childrenLis = ul.querySelectorAll(':scope > li');
        childrenLis.forEach(childLi => {
            applyParentHighlight(childLi);
        });
    });
}

function updateBranchIndicatorBar() {
    if (!branchBarRef || !treeContentWrapperRef) {
        return;
    }
    const treeRootUl = treeContentWrapperRef.querySelector('ul');
    if (!treeRootUl) {
        return;
    }

    branchBarRef.innerHTML = '';

    const firstTopLevelLi = treeRootUl.querySelector(':scope > li');
    if (!firstTopLevelLi) {
        return;
    }

    const mainBranchesParentUl = firstTopLevelLi.querySelector(':scope > ul');

    if (!mainBranchesParentUl || mainBranchesParentUl.style.display === 'none') {
        const segment = document.createElement('div');
        segment.classList.add('bar-segment');
        segment.style.top = firstTopLevelLi.offsetTop + 'px';
        segment.style.height = firstTopLevelLi.offsetHeight + 'px';
        segment.style.backgroundColor = barColors[0];
        branchBarRef.appendChild(segment);
    } else {
        const mainBranchLis = Array.from(mainBranchesParentUl.children).filter(node => node.tagName === 'LI');
        mainBranchLis.forEach((li, index) => {
            const segment = document.createElement('div');
            segment.classList.add('bar-segment');
            segment.style.top = li.offsetTop + 'px';
            segment.style.height = li.offsetHeight + 'px';
            segment.style.backgroundColor = barColors[index % barColors.length];
            branchBarRef.appendChild(segment);
        });
    }
    // Ensure bar height matches potentially changed content height
    branchBarRef.style.height = treeContentWrapperRef.scrollHeight + 'px';
}


function findPathCoveredByStickyHeaderRecursive(currentUl, currentPathCandidate, combinedHeaderRectTop) {
    const lis = Array.from(currentUl.children).filter(node => node.tagName === 'LI');

    for (const li of lis) {
        const itemRow = li.querySelector(':scope > .tree-item-row');
        if (!itemRow) continue;

        const childUl = li.querySelector(':scope > ul');
        const isLiActuallyExpanded = childUl && childUl.style.display !== 'none';

        const itemRowRect = itemRow.getBoundingClientRect();
        const liRect = li.getBoundingClientRect();

        const isHeaderScrolledOff = itemRowRect.top < combinedHeaderRectTop - 1;
        const isContentStillVisible = liRect.bottom > combinedHeaderRectTop + 1;

        if (isHeaderScrolledOff && isContentStillVisible) {
            currentPathCandidate.push(li);
            pathLIsCoveredByStickyHeader = [...currentPathCandidate];

            if (isLiActuallyExpanded) {
                findPathCoveredByStickyHeaderRecursive(childUl, currentPathCandidate, combinedHeaderRectTop);
            }
            currentPathCandidate.pop();
        }
    }
}

function updateStickyHeaders() {
    if (!treeColumnRef || !stickyHeadersContainerRef || !treeContentWrapperRef || !combinedStickyHeaderRef) {
        return;
    }

    const combinedHeaderRect = combinedStickyHeaderRef.getBoundingClientRect();
    stickyHeadersContainerRef.innerHTML = '';

    pathLIsCoveredByStickyHeader = [];
    const rootUl = treeContentWrapperRef.querySelector(':scope > ul');
    if (rootUl) {
        findPathCoveredByStickyHeaderRecursive(rootUl, [], combinedHeaderRect.top);
    } else {
        return;
    }

    let displayedPathLIs = [...pathLIsCoveredByStickyHeader];

    let searchStartUlForNextItem;
    if (pathLIsCoveredByStickyHeader.length > 0) {
        const deepestCoveredLi = pathLIsCoveredByStickyHeader[pathLIsCoveredByStickyHeader.length - 1];
        searchStartUlForNextItem = deepestCoveredLi.querySelector(':scope > ul');
    } else {
        searchStartUlForNextItem = rootUl;
    }

    if (searchStartUlForNextItem && searchStartUlForNextItem.style.display !== 'none') {
        const childrenLis = Array.from(searchStartUlForNextItem.children).filter(node => node.tagName === 'LI');
        for (const childLi of childrenLis) {
            const itemRow = childLi.querySelector(':scope > .tree-item-row');
            if (itemRow) {
                const itemRowRect = itemRow.getBoundingClientRect();
                if (itemRowRect.top >= combinedHeaderRect.top - 4.0) {
                    displayedPathLIs.push(childLi);
                    break;
                }
            }
        }
    }

    if (displayedPathLIs.length === 0 && rootUl && rootUl.children.length > 0) {
         const firstRootLi = rootUl.children[0];
         if (firstRootLi && firstRootLi.tagName === 'LI') {
             const itemRow = firstRootLi.querySelector(':scope > .tree-item-row');
             if (itemRow) {
                const itemRowRect = itemRow.getBoundingClientRect();
                // Check if the first item is partially or fully visible under the sticky header area
                if (itemRowRect.bottom > combinedHeaderRect.top && itemRowRect.top < combinedHeaderRect.bottom + itemRow.offsetHeight) {
                    displayedPathLIs.push(firstRootLi);
                }
             }
         }
    }


    if (displayedPathLIs.length > 0) {
        combinedStickyHeaderRef.style.visibility = 'visible';
        const firstPathOriginalItemRow = displayedPathLIs[0].querySelector(':scope > .tree-item-row');
        if (firstPathOriginalItemRow) {
            combinedStickyHeaderRef.style.height = firstPathOriginalItemRow.offsetHeight + 'px';
        } else {
            combinedStickyHeaderRef.style.height = 'auto'; // Fallback
        }
    } else {
        combinedStickyHeaderRef.style.visibility = 'hidden';
        combinedStickyHeaderRef.style.height = '0px'; // Collapse when no path
        return; // Don't build header if nothing to display
    }

    // Proceed only if we have a path to display
    const firstPathElementForStyle = displayedPathLIs[0];
    const originalItemRowForStyle = firstPathElementForStyle.querySelector(':scope > .tree-item-row');

    if (originalItemRowForStyle) {
        const stickyHeaderDiv = document.createElement('div');
        stickyHeaderDiv.classList.add('sticky-header-item');
        stickyHeaderDiv.style.height = originalItemRowForStyle.offsetHeight + 'px';

        // Create a placeholder for the toggle to maintain alignment
        const stickyTogglePlaceholder = document.createElement('span');
        stickyTogglePlaceholder.className = 'tree-toggle';
        stickyTogglePlaceholder.innerHTML = ' '; // Non-breaking space
        stickyTogglePlaceholder.style.visibility = 'hidden'; // Keep space, but hide

        const pathContainer = document.createElement('span');
        pathContainer.classList.add('tree-item-content'); // Use base class for styling
        // Try to get class from the *last* item in the path for correct color
        const lastPathItemContentForStyle = displayedPathLIs[displayedPathLIs.length-1].querySelector(':scope > .tree-item-row > .tree-item-content');
        if (lastPathItemContentForStyle) {
             pathContainer.className = lastPathItemContentForStyle.className; // Copy all classes
        } else {
            // Fallback to first item if last has no content span (shouldn't happen)
            const firstItemContentForStyle = firstPathElementForStyle.querySelector(':scope > .tree-item-row > .tree-item-content');
            if (firstItemContentForStyle) pathContainer.className = firstItemContentForStyle.className;
        }


        displayedPathLIs.forEach((liForSegment) => {
            const contentSpan = liForSegment.querySelector(':scope > .tree-item-row > .tree-item-content');
            const text = contentSpan ? contentSpan.textContent.trim() : 'Unknown';

            const pathSegment = document.createElement('span');
            pathSegment.classList.add('path-segment');
            pathSegment.textContent = text;
            pathSegment.title = text; // Tooltip for long names

            pathSegment.addEventListener('click', () => {
                const targetLi = liForSegment; // Closure captures the correct li
                if (!targetLi) {
                    console.error(`Target LI not found for path segment: ${text}`);
                    return;
                }
                const itemRowToScroll = targetLi.querySelector(':scope > .tree-item-row');
                const itemContentToClick = targetLi.querySelector(':scope > .tree-item-row > .tree-item-content');

                if (itemRowToScroll) {
                    // Calculate scroll position relative to the tree column's viewport
                    const columnRect = treeColumnRef.getBoundingClientRect();
                    const itemRect = itemRowToScroll.getBoundingClientRect();
                    // Target scroll position: item's top relative to column's top + current scroll offset
                    const scrollOffset = itemRect.top - columnRect.top + treeColumnRef.scrollTop;

                    // Scroll the tree column
                    treeColumnRef.scrollTo({
                        top: scrollOffset,
                        behavior: 'smooth'
                    });

                    // Fallback/Verification: If smooth scroll didn't quite reach, use scrollIntoView after a delay
                    // Also trigger the click after scroll attempt
                    setTimeout(() => {
                        // Check if scroll is close enough, otherwise force it
                        if (Math.abs(treeColumnRef.scrollTop - scrollOffset) > 15) { // Tolerance
                            itemRowToScroll.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        updateStickyHeaders(); // Update headers after scroll potentially finishes

                        // Trigger the click on the actual item
                        if (itemContentToClick) {
                            itemContentToClick.click();
                        }
                    }, 350); // Adjust delay as needed for smooth scroll duration
                } else {
                    console.error(`Item row not found for target LI: ${text}`);
                }
            });

            pathContainer.appendChild(pathSegment);

            // Add separator if not the last item
            if (liForSegment !== displayedPathLIs[displayedPathLIs.length - 1]) {
                const separator = document.createElement('span');
                separator.classList.add('path-separator');
                separator.textContent = ' > ';
                pathContainer.appendChild(separator);
            }
        });

        // --- Calculate Indentation for Sticky Header Text ---
        let indentForStickyText = 0;
        const rootUlInWrapper = treeContentWrapperRef.querySelector(':scope > ul');
        if (rootUlInWrapper) {
             // Start with root UL padding
            indentForStickyText += parseFloat(window.getComputedStyle(rootUlInWrapper).paddingLeft) || 0;
        }

        // Walk up the DOM from the first path element's parent UL to the root UL inside the wrapper
        let el = firstPathElementForStyle.parentElement;
        while (el && el !== rootUlInWrapper && el !== treeContentWrapperRef) {
            if (el.tagName === 'UL' && el.parentElement && el.parentElement.tagName === 'LI') {
                // Add padding of intermediate ULs
                indentForStickyText += parseFloat(window.getComputedStyle(el).paddingLeft) || 0;
            }
            el = el.parentElement;
        }

        // Add width and margin of the original toggle element of the *first* path item
        const toggleElement = firstPathElementForStyle.querySelector(':scope > .tree-item-row > .tree-toggle');
        if (toggleElement) {
            indentForStickyText += toggleElement.offsetWidth + (parseFloat(window.getComputedStyle(toggleElement).marginRight) || 0);
        }

        // The paddingLeft for the sticky header div should be the calculated indent,
        // *minus* the space taken by the hidden placeholder toggle we added.
        let paddingLeftForStickyDiv = indentForStickyText;
        if (toggleElement) { // If the original item had a toggle
            paddingLeftForStickyDiv -= (toggleElement.offsetWidth + (parseFloat(window.getComputedStyle(toggleElement).marginRight) || 0));
        }

        // Apply the calculated padding to the sticky header div itself
        stickyHeaderDiv.style.paddingLeft = Math.max(0, paddingLeftForStickyDiv) + 'px'; // Ensure non-negative

        // Assemble the sticky header item
        stickyHeaderDiv.appendChild(stickyTogglePlaceholder); // Add hidden toggle first
        stickyHeaderDiv.appendChild(pathContainer);          // Then the path text
        stickyHeadersContainerRef.appendChild(stickyHeaderDiv); // Add to the DOM
    }
}


// --- Core Logic ---

// Function to load and display Markdown description
async function loadDescription(componentName) {
    if (!infoContentDivRef) return;

    const mdPath = `${DOCS_BASE_PATH}/descriptions/${componentName}.md`;
    infoContentDivRef.innerHTML = `<p>Loading description for "${componentName}"...</p>`; // Loading indicator

    try {
        const response = await fetch(mdPath);
        if (!response.ok) {
            throw new Error(`File not found or error loading: ${response.statusText} (${response.status})`);
        }
        const markdown = await response.text();

        // Configure marked to allow HTML and use highlight.js
        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-', // CSS class prefix for hljs
            gfm: true, // Enable GitHub Flavored Markdown
            breaks: true // Convert single line breaks to <br>
        });

        // Parse Markdown to HTML
        const htmlContent = marked.parse(markdown);
        infoContentDivRef.innerHTML = htmlContent;

        // Re-run highlight.js on the new content (important!)
        // Use highlightBlock for targeted highlighting if highlightAll is too broad
        infoContentDivRef.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });


    } catch (error) {
        console.error(`Error loading description for ${componentName}:`, error);
        infoContentDivRef.innerHTML = `<p style="color: red;">Could not load description for "${componentName}".<br>(${error.message})</p><p>Expected path: ${mdPath}</p>`;
    }
}

// Function to build a single tree node LI element
function buildTreeNode(nodeData) { // Removed componentInfo param, use global
    const li = document.createElement('li');
    li.setAttribute('data-component', nodeData.name);
    li.classList.add(nodeData.tag); // Add tag class (essential, secondary, etc.)

    const itemRow = document.createElement('div');
    itemRow.classList.add('tree-item-row');

    const toggle = document.createElement('span');
    toggle.classList.add('tree-toggle');

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('tree-item-content');

    // Map tag to CSS class for text color and data attribute for badge lookup
    const tagMap = {
        essential: { text: 'essential-text', tag: 'tag-required' },
        secondary: { text: 'secondary-text', tag: 'tag-optional' },
        advanced: { text: 'advanced-text', tag: 'tag-advanced' },
        other: { text: 'other-text', tag: 'tag-other' }
    };

    const tagInfo = tagMap[nodeData.tag] || {};
    if (tagInfo.text) {
        contentSpan.classList.add(tagInfo.text);
    }
    if (tagInfo.tag) {
        // Store the badge class name in a data attribute for easy retrieval later
        contentSpan.dataset.tagClass = tagInfo.tag;
    }

    contentSpan.textContent = nodeData.name;
    itemRow.appendChild(toggle);
    itemRow.appendChild(contentSpan);
    li.appendChild(itemRow);

    // Click handler for the content span (selecting the item)
    contentSpan.addEventListener('click', async (event) => {
        event.stopPropagation(); // Prevent toggle click if clicking text

        // --- UI Highlighting ---
        clearAllHighlights();
        applyParentHighlight(li); // Highlight parents
        li.classList.add('selected-item-dark-li'); // Highlight selected item
        currentSelectedItemLi = li;

        // --- Load Description ---
        const componentName = nodeData.name;
        await loadDescription(componentName); // Load and render Markdown

        // --- Update Info Panel (Tags and Links) ---
        const componentData = componentInfoData[componentName] || {}; // Get metadata

        // Update Tags Bar
        const allTagBadges = document.querySelectorAll('.info-tags-bar .tag-badge');
        allTagBadges.forEach(badge => badge.style.display = 'none'); // Hide all first
        const tagClassToShow = contentSpan.dataset.tagClass; // Get tag class from data attribute
        if (tagClassToShow) {
            const activeTag = document.querySelector(`.info-tags-bar .${tagClassToShow}`);
            if (activeTag) {
                activeTag.style.display = 'inline-flex'; // Show the correct badge
            }
        }

        // Update Links Bar
        const ashLinkElement = document.getElementById('ash-link');
        if (componentData.ashPath && ashLinkElement) {
            ashLinkElement.href = ASH_BASE_URL + componentData.ashPath;
            ashLinkElement.style.display = 'inline-flex';
        } else if (ashLinkElement) {
            ashLinkElement.style.display = 'none';
        }

        const vulkanSpecLinkElement = document.getElementById('vulkan-spec-link');
        if (vulkanSpecLinkElement) {
            if (componentData.vulkanAnchor) {
                vulkanSpecLinkElement.href = VULKAN_SPEC_BASE_URL + componentData.vulkanAnchor;
                vulkanSpecLinkElement.style.display = 'inline-flex';
            } else if (componentData.vulkanPath) { // Handle full paths if present
                vulkanSpecLinkElement.href = componentData.vulkanPath;
                vulkanSpecLinkElement.style.display = 'inline-flex';
            } else {
                vulkanSpecLinkElement.style.display = 'none';
            }
        }
    });

    // Handle children recursively
    if (nodeData.children && nodeData.children.length > 0) {
        const ul = document.createElement('ul');
        ul.style.display = 'block'; // Default to expanded
        nodeData.children.forEach(child => {
            const childLi = buildTreeNode(child); // Recursive call
            ul.appendChild(childLi);
        });
        li.appendChild(ul);

        // Configure toggle button
        toggle.textContent = '[-]'; // Initial state: expanded
        toggle.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent selection click
            const isCollapsed = ul.style.display === 'none';
            ul.style.display = isCollapsed ? 'block' : 'none';
            toggle.textContent = isCollapsed ? '[-]' : '[+]';
            // Update layout-dependent elements after animation frame
            requestAnimationFrame(() => {
                updateBranchIndicatorBar();
                updateStickyHeaders();
            });
        });
    } else {
        // No children, make toggle invisible and non-interactive
        toggle.innerHTML = ' '; // Use space to maintain layout
        toggle.style.cursor = 'default';
        toggle.style.visibility = 'hidden'; // Hide but keep space
    }

    return li;
}

// Main function to load the tree structure and render it
// Main function to load the tree structure and render it
async function loadAndRenderTree(treeFileName) {
    console.log("loadAndRenderTree called with:", treeFileName); // Debug log
    try {
        const treeFilePath = `${DOCS_BASE_PATH}/trees/${treeFileName}`;
        console.log("Attempting to fetch tree from:", treeFilePath); // Debug log

        const response = await fetch(treeFilePath);
        console.log("Fetch response status:", response.status); // Debug log

        if (!response.ok) {
            throw new Error(`Failed to fetch tree file "${treeFileName}": ${response.statusText} (${response.status})`);
        }
        const data = await response.json();
        componentInfoData = data.componentInfo || {};

        // --- Get DOM References ---
        treeColumnRef = document.querySelector('.tree-column');
        combinedStickyHeaderRef = document.querySelector('.combined-sticky-header');
        stickyHeadersContainerRef = document.querySelector('.sticky-headers-container');
        treeContentWrapperRef = document.querySelector('.tree-content-wrapper');
        branchBarRef = document.querySelector('.branch-indicator-bar-area');
        infoContentDivRef = document.getElementById('info-content');

        // --- *** ADDED: Explicit DOM Element Checks *** ---
        if (!treeColumnRef) {
            console.error("Critical Error: Could not find '.tree-column' element.");
            return; // Stop if essential layout element is missing
        }
        if (!combinedStickyHeaderRef) console.warn("Warning: Could not find '.combined-sticky-header'. Sticky header may not work.");
        if (!stickyHeadersContainerRef) console.warn("Warning: Could not find '.sticky-headers-container'. Sticky header may not work.");
        if (!treeContentWrapperRef) {
            console.error("Critical Error: Could not find '.tree-content-wrapper' element.");
            return; // Stop if tree container is missing
        }
        if (!branchBarRef) console.warn("Warning: Could not find '.branch-indicator-bar-area'. Branch bar will not work.");
        if (!infoContentDivRef) {
             console.error("Critical Error: Could not find '#info-content' element.");
             // Don't necessarily stop, but log the error
        }
        // --- *** End Checks *** ---


        // --- Find the UL *specifically* ---
        const treeRootUl = treeContentWrapperRef.querySelector('ul'); // Find UL *inside* the wrapper

        // --- *** ADDED: Check for the UL *** ---
        if (!treeRootUl) {
            console.error('Critical Error: Tree root UL element not found inside .tree-content-wrapper.');
            if (infoContentDivRef) infoContentDivRef.innerHTML = "<p style='color: red;'>Error: Tree container (UL) missing.</p>";
            return; // Stop execution if the target UL isn't there
        }
        // --- *** End Check *** ---

        console.log("Target UL found. Clearing and building tree..."); // Debug log
        treeRootUl.innerHTML = ''; // Clear existing tree if any

        // --- Build Tree ---
        if (!data.tree || !Array.isArray(data.tree)) {
             throw new Error("Invalid tree data format: 'tree' array not found in JSON.");
        }
        data.tree.forEach(node => {
            console.log("Building node:", node.name); // Debug log
            const li = buildTreeNode(node);
            treeRootUl.appendChild(li);
        });
        console.log("Tree building complete."); // Debug log

        // --- Initial UI Updates ---
        updateBranchIndicatorBar();
        updateStickyHeaders();

        // --- Event Listeners ---
        // Ensure listeners are added only once if this function could be called multiple times
        // (Currently called once on DOMContentLoaded, so it's okay)
        let scrollAFRequest = null;
        treeColumnRef.addEventListener('scroll', () => {
            if (scrollAFRequest === null) {
                scrollAFRequest = requestAnimationFrame(() => {
                    updateStickyHeaders();
                    scrollAFRequest = null;
                });
            }
        });

        window.addEventListener('resize', () => {
            requestAnimationFrame(() => {
                updateBranchIndicatorBar();
                updateStickyHeaders();
            });
        });

        // --- Select First Item ---
        const firstContentSpan = treeRootUl.querySelector('.tree-item-content');
        if (firstContentSpan) {
            console.log("Clicking first item:", firstContentSpan.textContent); // Debug log
            firstContentSpan.click();
        } else {
             console.warn("Tree loaded, but no items found to select.");
            if (infoContentDivRef) infoContentDivRef.innerHTML = "<p>Tree loaded, but no items found.</p>";
        }

    } catch (error) {
        console.error('Error during loadAndRenderTree:', error);
        const infoDiv = document.getElementById('info-content');
        if (infoDiv) {
            infoDiv.innerHTML = `<p style="color: red;">Failed to load or render tree:<br>${error.message}</p><p>Check console for details.</p>`;
        }
    }
}

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");
    loadAndRenderTree(TREE_FILE_NAME);
});