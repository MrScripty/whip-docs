const ASH_BASE_URL = "https://docs.rs/ash/latest/ash/";
const VULKAN_SPEC_BASE_URL = "https://registry.khronos.org/vulkan/specs/1.3-extensions/html/vkspec.html";

let currentSelectedItemLi = null;
const barColors = ['#637C8A', '#88CDF5'];

let treeColumnRef, combinedStickyHeaderRef, stickyHeadersContainerRef, treeContentWrapperRef, branchBarRef;
let pathLIsCoveredByStickyHeader = [];

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
                    treeContentWrapperRef.getBoundingClientRect(); 
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

function buildTreeNode(nodeData, componentInfo) {
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

    contentSpan.addEventListener('click', (event) => {
        event.stopPropagation();
        clearAllHighlights();
        applyParentHighlight(li);
        li.classList.add('selected-item-dark-li');
        currentSelectedItemLi = li;

        const component = nodeData.name;
        const componentData = componentInfo[component] || {};
        const info = componentData.description ? componentData : { description: `No information available for "${component}".` };

        const textArea = document.getElementById('info-text');
        if (textArea) {
            textArea.value = `${component}\n\n${info.description}`;
        }

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
            const childLi = buildTreeNode(child, componentInfo);
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

async function loadAndRenderTree() {
    try {
        const response = await fetch('vulkan_tree.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch vulkan_tree.json: ${response.statusText}`);
        }
        const data = await response.json();

        treeColumnRef = document.querySelector('.tree-column');
        combinedStickyHeaderRef = document.querySelector('.combined-sticky-header');
        stickyHeadersContainerRef = document.querySelector('.sticky-headers-container');
        treeContentWrapperRef = document.querySelector('.tree-content-wrapper');
        branchBarRef = document.querySelector('.branch-indicator-bar-area');

        if (!treeColumnRef || !combinedStickyHeaderRef || !stickyHeadersContainerRef || !treeContentWrapperRef || !branchBarRef) {
            console.error('One or more required DOM elements not found:', {
                treeColumn: !!treeColumnRef,
                combinedStickyHeader: !!combinedStickyHeaderRef,
                stickyHeadersContainer: !!stickyHeadersContainerRef,
                treeContentWrapper: !!treeContentWrapperRef,
                branchBar: !!branchBarRef
            });
            return;
        }

        const treeRootUl = treeContentWrapperRef.querySelector('ul');
        if (!treeRootUl) {
            console.error('Tree root UL not found.');
            return;
        }

        data.tree.forEach(node => {
            const li = buildTreeNode(node, data.componentInfo);
            treeRootUl.appendChild(li);
        });

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

        const firstContentSpan = treeRootUl.querySelector('.tree-item-content');
        if (firstContentSpan) {
            firstContentSpan.click();
        }
    } catch (error) {
        console.error('Error loading or rendering tree:', error);
    }
}

document.addEventListener('DOMContentLoaded', loadAndRenderTree);