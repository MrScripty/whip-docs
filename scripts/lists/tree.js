// All the code from your provided script.js goes here
const ASH_BASE_URL = "https://docs.rs/ash/latest/ash/";
const VULKAN_SPEC_BASE_URL = "https://registry.khronos.org/vulkan/specs/1.3-extensions/html/vkspec.html";
const DOCS_BASE_PATH = "../whip-docs"; // Base path for docs folder
const TREE_FILE_NAME = "vulkan_2d_rendering.json"; // The tree file to load

let currentSelectedItemLi = null;
const barColors = ['#637C8A', '#88CDF5'];

let treeColumnRef, combinedStickyHeaderRef, stickyHeadersContainerRef, treeContentWrapperRef, branchBarRef, infoContentDivRef;
let pathLIsCoveredByStickyHeader = [];
let componentInfoData = {}; // Store componentInfo globally

// --- Highlighting and UI Functions ---

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
            combinedStickyHeaderRef.style.height = 'auto';
        }
    } else {
        combinedStickyHeaderRef.style.visibility = 'hidden';
        combinedStickyHeaderRef.style.height = '0px';
        return;
    }

    const firstPathElementForStyle = displayedPathLIs[0];
    const originalItemRowForStyle = firstPathElementForStyle.querySelector(':scope > .tree-item-row');

    if (originalItemRowForStyle) {
        const stickyHeaderDiv = document.createElement('div');
        stickyHeaderDiv.classList.add('sticky-header-item');
        stickyHeaderDiv.style.height = originalItemRowForStyle.offsetHeight + 'px';

        const stickyTogglePlaceholder = document.createElement('span');
        stickyTogglePlaceholder.className = 'tree-toggle';
        stickyTogglePlaceholder.innerHTML = ' ';
        stickyTogglePlaceholder.style.visibility = 'hidden';

        const pathContainer = document.createElement('span');
        pathContainer.classList.add('tree-item-content');
        const lastPathItemContentForStyle = displayedPathLIs[displayedPathLIs.length-1].querySelector(':scope > .tree-item-row > .tree-item-content');
        if (lastPathItemContentForStyle) {
             pathContainer.className = lastPathItemContentForStyle.className;
        } else {
            const firstItemContentForStyle = firstPathElementForStyle.querySelector(':scope > .tree-item-row > .tree-item-content');
            if (firstItemContentForStyle) pathContainer.className = firstItemContentForStyle.className;
        }

        displayedPathLIs.forEach((liForSegment) => {
            const contentSpan = liForSegment.querySelector(':scope > .tree-item-row > .tree-item-content');
            const text = contentSpan ? contentSpan.textContent.trim() : 'Unknown';

            const pathSegment = document.createElement('span');
            pathSegment.classList.add('path-segment');
            pathSegment.textContent = text;
            pathSegment.title = text;

            pathSegment.addEventListener('click', () => {
                const targetLi = liForSegment;
                if (!targetLi) {
                    console.error(`Target LI not found for path segment: ${text}`);
                    return;
                }
                const itemRowToScroll = targetLi.querySelector(':scope > .tree-item-row');
                const itemContentToClick = targetLi.querySelector(':scope > .tree-item-row > .tree-item-content');

                if (itemRowToScroll) {
                    const columnRect = treeColumnRef.getBoundingClientRect();
                    const itemRect = itemRowToScroll.getBoundingClientRect();
                    const scrollOffset = itemRect.top - columnRect.top + treeColumnRef.scrollTop;

                    treeColumnRef.scrollTo({
                        top: scrollOffset,
                        behavior: 'smooth'
                    });

                    setTimeout(() => {
                        if (Math.abs(treeColumnRef.scrollTop - scrollOffset) > 15) {
                            itemRowToScroll.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                        updateStickyHeaders();

                        if (itemContentToClick) {
                            itemContentToClick.click();
                        }
                    }, 350);
                } else {
                    console.error(`Item row not found for target LI: ${text}`);
                }
            });

            pathContainer.appendChild(pathSegment);

            if (liForSegment !== displayedPathLIs[displayedPathLIs.length - 1]) {
                const separator = document.createElement('span');
                separator.classList.add('path-separator');
                separator.textContent = ' > ';
                pathContainer.appendChild(separator);
            }
        });

        let indentForStickyText = 0;
        const rootUlInWrapper = treeContentWrapperRef.querySelector(':scope > ul');
        if (rootUlInWrapper) {
            indentForStickyText += parseFloat(window.getComputedStyle(rootUlInWrapper).paddingLeft) || 0;
        }

        let el = firstPathElementForStyle.parentElement;
        while (el && el !== rootUlInWrapper && el !== treeContentWrapperRef) {
            if (el.tagName === 'UL' && el.parentElement && el.parentElement.tagName === 'LI') {
                indentForStickyText += parseFloat(window.getComputedStyle(el).paddingLeft) || 0;
            }
            el = el.parentElement;
        }

        const toggleElement = firstPathElementForStyle.querySelector(':scope > .tree-item-row > .tree-toggle');
        if (toggleElement) {
            indentForStickyText += toggleElement.offsetWidth + (parseFloat(window.getComputedStyle(toggleElement).marginRight) || 0);
        }

        let paddingLeftForStickyDiv = indentForStickyText;
        if (toggleElement) {
            paddingLeftForStickyDiv -= (toggleElement.offsetWidth + (parseFloat(window.getComputedStyle(toggleElement).marginRight) || 0));
        }

        stickyHeaderDiv.style.paddingLeft = Math.max(0, paddingLeftForStickyDiv) + 'px';
        stickyHeaderDiv.appendChild(stickyTogglePlaceholder);
        stickyHeaderDiv.appendChild(pathContainer);
        stickyHeadersContainerRef.appendChild(stickyHeaderDiv);
    }
}

async function loadDescription(componentName) {
    if (!infoContentDivRef) return;

    const mdPath = `${DOCS_BASE_PATH}/descriptions/${componentName}.md`;
    infoContentDivRef.innerHTML = `<p>Loading description for "${componentName}"...</p>`;

    try {
        const response = await fetch(mdPath);
        if (!response.ok) {
            throw new Error(`File not found or error loading: ${response.statusText} (${response.status})`);
        }
        const markdown = await response.text();

        marked.setOptions({
            highlight: function(code, lang) {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            langPrefix: 'hljs language-',
            gfm: true,
            breaks: true
        });

        const htmlContent = marked.parse(markdown);
        infoContentDivRef.innerHTML = htmlContent;

        infoContentDivRef.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });

    } catch (error) {
        console.error(`Error loading description for ${componentName}:`, error);
        infoContentDivRef.innerHTML = `<p style="color: red;">Could not load description for "${componentName}".<br>(${error.message})</p><p>Expected path: ${mdPath}</p>`;
    }
}

function buildTreeNode(nodeData) {
    const li = document.createElement('li');
    li.setAttribute('data-component', nodeData.name);
    li.classList.add(nodeData.tag);

    const itemRow = document.createElement('div');
    itemRow.classList.add('tree-item-row');

    const toggle = document.createElement('span');
    toggle.classList.add('tree-toggle');

    const contentSpan = document.createElement('span');
    contentSpan.classList.add('tree-item-content');

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
        contentSpan.dataset.tagClass = tagInfo.tag;
    }

    contentSpan.textContent = nodeData.name;
    itemRow.appendChild(toggle);
    itemRow.appendChild(contentSpan);
    li.appendChild(itemRow);

    contentSpan.addEventListener('click', async (event) => {
        event.stopPropagation();

        clearAllHighlights();
        applyParentHighlight(li);
        li.classList.add('selected-item-dark-li');
        currentSelectedItemLi = li;

        const componentName = nodeData.name;
        await loadDescription(componentName);

        const componentData = componentInfoData[componentName] || {};

        const allTagBadges = document.querySelectorAll('.info-tags-bar .tag-badge');
        allTagBadges.forEach(badge => badge.style.display = 'none');
        const tagClassToShow = contentSpan.dataset.tagClass;
        if (tagClassToShow) {
            const activeTag = document.querySelector(`.info-tags-bar .${tagClassToShow}`);
            if (activeTag) {
                activeTag.style.display = 'inline-flex';
            }
        }

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
            } else if (componentData.vulkanPath) {
                vulkanSpecLinkElement.href = componentData.vulkanPath;
                vulkanSpecLinkElement.style.display = 'inline-flex';
            } else {
                vulkanSpecLinkElement.style.display = 'none';
            }
        }
    });

    if (nodeData.children && nodeData.children.length > 0) {
        const ul = document.createElement('ul');
        ul.style.display = 'block';
        nodeData.children.forEach(child => {
            const childLi = buildTreeNode(child);
            ul.appendChild(childLi);
        });
        li.appendChild(ul);

        toggle.textContent = '[-]';
        toggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isCollapsed = ul.style.display === 'none';
            ul.style.display = isCollapsed ? 'block' : 'none';
            toggle.textContent = isCollapsed ? '[-]' : '[+]';
            requestAnimationFrame(() => {
                updateBranchIndicatorBar();
                updateStickyHeaders();
            });
        });
    } else {
        toggle.innerHTML = ' ';
        toggle.style.cursor = 'default';
        toggle.style.visibility = 'hidden';
    }

    return li;
}

async function loadAndRenderTree(treeFileName) {
    console.log("loadAndRenderTree called with:", treeFileName);
    try {
        const treeFilePath = `${DOCS_BASE_PATH}/trees/${treeFileName}`;
        console.log("Attempting to fetch tree from:", treeFilePath);

        const response = await fetch(treeFilePath);
        console.log("Fetch response status:", response.status);

        if (!response.ok) {
            throw new Error(`Failed to fetch tree file "${treeFileName}": ${response.statusText} (${response.status})`);
        }
        const data = await response.json();
        componentInfoData = data.componentInfo || {};

        treeColumnRef = document.querySelector('.tree-column');
        combinedStickyHeaderRef = document.querySelector('.combined-sticky-header');
        stickyHeadersContainerRef = document.querySelector('.sticky-headers-container');
        treeContentWrapperRef = document.querySelector('.tree-content-wrapper');
        branchBarRef = document.querySelector('.branch-indicator-bar-area');
        infoContentDivRef = document.getElementById('info-content');

        if (!treeColumnRef) {
            console.error("Critical Error: Could not find '.tree-column' element.");
            return;
        }
        if (!combinedStickyHeaderRef) console.warn("Warning: Could not find '.combined-sticky-header'. Sticky header may not work.");
        if (!stickyHeadersContainerRef) console.warn("Warning: Could not find '.sticky-headers-container'. Sticky header may not work.");
        if (!treeContentWrapperRef) {
            console.error("Critical Error: Could not find '.tree-content-wrapper' element.");
            return;
        }
        if (!branchBarRef) console.warn("Warning: Could not find '.branch-indicator-bar-area'. Branch bar will not work.");
        if (!infoContentDivRef) {
             console.error("Critical Error: Could not find '#info-content' element.");
        }

        const treeRootUl = treeContentWrapperRef.querySelector('ul');

        if (!treeRootUl) {
            console.error('Critical Error: Tree root UL element not found inside .tree-content-wrapper.');
            if (infoContentDivRef) infoContentDivRef.innerHTML = "<p style='color: red;'>Error: Tree container (UL) missing.</p>";
            return;
        }

        console.log("Target UL found. Clearing and building tree...");
        treeRootUl.innerHTML = '';

        if (!data.tree || !Array.isArray(data.tree)) {
             throw new Error("Invalid tree data format: 'tree' array not found in JSON.");
        }
        data.tree.forEach(node => {
            console.log("Building node:", node.name);
            const li = buildTreeNode(node);
            treeRootUl.appendChild(li);
        });
        console.log("Tree building complete.");

        updateBranchIndicatorBar();
        updateStickyHeaders();

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

        // --- MODIFICATION START ---
        // Do not automatically select the first item.
        // Instead, set a default state for the info panel.
        if (infoContentDivRef) {
            // Check if there are any items in the tree
            const firstContentSpanCheck = treeRootUl.querySelector('.tree-item-content');
            if (firstContentSpanCheck) {
                // Tree has items, but we are not selecting one by default
                infoContentDivRef.innerHTML = "<p>Select an item from the tree to see its details.</p>";
                console.log("Tree loaded. No item selected by default. Select an item to see details.");
            } else {
                // Tree is empty or has no selectable items
                infoContentDivRef.innerHTML = "<p>Tree loaded, but no items found.</p>";
                console.warn("Tree loaded, but no items found to select.");
            }

            // Ensure tags and links are in their default (hidden) state
            // This assumes their default HTML/CSS state might be visible or undefined.
            const allTagBadges = document.querySelectorAll('.info-tags-bar .tag-badge');
            allTagBadges.forEach(badge => badge.style.display = 'none');

            const ashLinkElement = document.getElementById('ash-link');
            if (ashLinkElement) ashLinkElement.style.display = 'none';

            const vulkanSpecLinkElement = document.getElementById('vulkan-spec-link');
            if (vulkanSpecLinkElement) vulkanSpecLinkElement.style.display = 'none';
        }
        // --- MODIFICATION END ---

    } catch (error) {
        console.error('Error during loadAndRenderTree:', error);
        const infoDiv = document.getElementById('info-content');
        if (infoDiv) {
            infoDiv.innerHTML = `<p style="color: red;">Failed to load or render tree:<br>${error.message}</p><p>Check console for details.</p>`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");
    loadAndRenderTree(TREE_FILE_NAME);
});