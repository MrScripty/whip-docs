// /scripts/lists/graph_interaction_tree.js
document.addEventListener('DOMContentLoaded', function () {
    const treeContainerUl = document.querySelector('.left-column .tree-content-wrapper ul');
    const treeColumnRef = document.querySelector('.tree-column');
    const combinedStickyHeaderRef = document.querySelector('.combined-sticky-header');
    const stickyHeadersContainerRef = document.querySelector('.sticky-headers-container');
    const treeContentWrapperRef = document.querySelector('.tree-content-wrapper');
    const branchBarRef = document.querySelector('.branch-indicator-bar-area');
    const barColors = ['#637C8A', '#88CDF5', '#F7B801', '#F18701']; // Added more colors

    if (!treeContainerUl) {
        console.error("Tree container UL not found in .left-column .tree-content-wrapper");
        return;
    }
    if (!treeColumnRef || !combinedStickyHeaderRef || !stickyHeadersContainerRef || !treeContentWrapperRef || !branchBarRef) {
        console.warn("One or more UI elements for tree (sticky header, branch bar) not found. Some UI features might be disabled.");
    }

    let currentTopLevelTreeLIs = []; // To keep track of LIs for sticky/branch bar updates

    window.handleGraphNodeSelection = function(selectedGraphNode, fullGraphData) {
        treeContainerUl.innerHTML = ''; // Clear previous tree
        currentTopLevelTreeLIs = [];

        if (!selectedGraphNode || !fullGraphData || !fullGraphData.nodes || !fullGraphData.edges) {
            const placeholderLi = document.createElement('li');
            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');
            itemRow.style.cursor = 'default';
            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.textContent = "Select a node in the graph to see its interactions.";
            contentSpan.style.paddingLeft = "5px"; // Align with items that have toggles
            itemRow.appendChild(contentSpan);
            placeholderLi.appendChild(itemRow);
            treeContainerUl.appendChild(placeholderLi);
            updateBranchIndicatorBar();
            updateStickyHeaders();
            return;
        }

        const selectedNodeId = selectedGraphNode.id;
        const relatedEdges = fullGraphData.edges.filter(edge =>
            edge.source === selectedNodeId || edge.target === selectedNodeId
        );

        if (relatedEdges.length === 0) {
            const noInteractionsLi = document.createElement('li');
            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');
            itemRow.style.cursor = 'default';
            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.textContent = `Node "${selectedGraphNode.label}" has no recorded direct interactions in the graph.`;
            contentSpan.style.paddingLeft = "5px";
            itemRow.appendChild(contentSpan);
            noInteractionsLi.appendChild(itemRow);
            treeContainerUl.appendChild(noInteractionsLi);
            updateBranchIndicatorBar();
            updateStickyHeaders();
            return;
        }

        const interactionsByConnectedNode = {};

        relatedEdges.forEach(edge => {
            let connectedNodeId;
            let direction; // 'outgoing' (selected -> other) or 'incoming' (other -> selected)

            if (edge.source === selectedNodeId) {
                connectedNodeId = edge.target;
                direction = 'outgoing';
            } else {
                connectedNodeId = edge.source;
                direction = 'incoming';
            }

            const connectedNode = fullGraphData.nodes.find(n => n.id === connectedNodeId);
            const connectedNodeLabel = connectedNode ? connectedNode.label : connectedNodeId;

            if (!interactionsByConnectedNode[connectedNodeId]) {
                interactionsByConnectedNode[connectedNodeId] = {
                    label: connectedNodeLabel,
                    id: connectedNodeId,
                    interactions: []
                };
            }

            (edge.interactions || []).forEach(interaction => {
                interactionsByConnectedNode[connectedNodeId].interactions.push({
                    ...interaction,
                    direction: direction
                });
            });
        });

        // Sort connected nodes by label for consistent order
        const sortedConnectedNodes = Object.values(interactionsByConnectedNode).sort((a, b) => a.label.localeCompare(b.label));

        sortedConnectedNodes.forEach(data => {
            const connectedNodeLi = document.createElement('li');
            currentTopLevelTreeLIs.push(connectedNodeLi); // For sticky/branch bar

            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');

            const toggle = document.createElement('span');
            toggle.classList.add('tree-toggle');

            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.classList.add('essential-text'); // Style for module names

            // Determine primary direction for display (simplification)
            let primaryDirection = data.interactions.length > 0 ? data.interactions[0].direction : null;
            let displayLabel = "";
            if (primaryDirection === 'outgoing') {
                displayLabel = `${selectedGraphNode.label}  →  ${data.label}`;
            } else if (primaryDirection === 'incoming') {
                displayLabel = `${data.label}  →  ${selectedGraphNode.label}`;
            } else { // No interactions, or mixed (less likely with current JSON structure per edge)
                displayLabel = `${data.label} (interacts with ${selectedGraphNode.label})`;
            }
            contentSpan.textContent = displayLabel;
            contentSpan.title = displayLabel; // Tooltip for full name if truncated

            itemRow.appendChild(toggle);
            itemRow.appendChild(contentSpan);
            connectedNodeLi.appendChild(itemRow);

            if (data.interactions.length > 0) {
                const interactionsUl = document.createElement('ul');
                interactionsUl.style.display = 'none'; // Collapse by default

                // Sort interactions: kind then name
                data.interactions.sort((a, b) => {
                    const kindComp = a.kind.localeCompare(b.kind);
                    if (kindComp !== 0) return kindComp;
                    return a.name.localeCompare(b.name);
                }).forEach(interaction => {
                    const interactionLi = document.createElement('li');
                    const interactionItemRow = document.createElement('div');
                    interactionItemRow.classList.add('tree-item-row');
                    interactionItemRow.style.cursor = 'default'; // Interactions are not clickable

                    const interactionToggle = document.createElement('span');
                    interactionToggle.classList.add('tree-toggle');
                    interactionToggle.innerHTML = ' ';
                    interactionToggle.style.visibility = 'hidden';

                    const interactionContentSpan = document.createElement('span');
                    interactionContentSpan.classList.add('tree-item-content');
                    interactionContentSpan.classList.add('secondary-text');

                    let interactionText = "";
                    let interactionPrefix = "";
                    if (interaction.direction === 'outgoing') { // Selected node USES/DECLARES something FROM/IN target
                        interactionPrefix = interaction.kind === "import" ? "Uses: " : "Declares in target: ";
                    } else { // Selected node PROVIDES something TO target
                        interactionPrefix = interaction.kind === "import" ? "Provides: " : "Is declared by target: ";
                    }
                    interactionText = `${interactionPrefix}${interaction.name}`;
                    if (interaction.name === "___GLOB___") {
                         interactionText = interaction.direction === 'outgoing' ? `Uses all from ${data.label}` : `${data.label} uses all from selected`;
                    }


                    interactionContentSpan.textContent = interactionText;
                    interactionContentSpan.title = interactionText;

                    interactionItemRow.appendChild(interactionToggle);
                    interactionItemRow.appendChild(interactionContentSpan);
                    interactionLi.appendChild(interactionItemRow);
                    interactionsUl.appendChild(interactionLi);
                });
                connectedNodeLi.appendChild(interactionsUl);
                toggle.textContent = '[+]'; // Collapsed by default
                itemRow.addEventListener('click', (event) => { // Make the whole row clickable for toggle
                    event.stopPropagation();
                    const isCollapsed = interactionsUl.style.display === 'none';
                    interactionsUl.style.display = isCollapsed ? 'block' : 'none';
                    toggle.textContent = isCollapsed ? '[-]' : '[+]';
                    requestAnimationFrame(() => {
                        updateBranchIndicatorBar();
                        updateStickyHeaders();
                    });
                });
            } else {
                toggle.innerHTML = ' ';
                toggle.style.cursor = 'default';
                toggle.style.visibility = 'hidden';
                itemRow.style.cursor = 'default'; // Not expandable
            }
            treeContainerUl.appendChild(connectedNodeLi);
        });

        updateBranchIndicatorBar();
        updateStickyHeaders();
    };

    // --- Sticky Header and Branch Bar Logic (Adapted and Simplified) ---
    let pathLIsCoveredByStickyHeader = [];

    function updateBranchIndicatorBar() {
        if (!branchBarRef || !treeContentWrapperRef || currentTopLevelTreeLIs.length === 0) {
            if (branchBarRef) branchBarRef.innerHTML = '';
            return;
        }
        branchBarRef.innerHTML = '';
        currentTopLevelTreeLIs.forEach((li, index) => {
            const segment = document.createElement('div');
            segment.classList.add('bar-segment');
            segment.style.top = li.offsetTop + 'px';
            segment.style.height = li.offsetHeight + 'px';
            segment.style.backgroundColor = barColors[index % barColors.length];
            branchBarRef.appendChild(segment);
        });
        branchBarRef.style.height = treeContentWrapperRef.scrollHeight + 'px';
    }

    function findPathCovered(combinedHeaderRectTop) {
        pathLIsCoveredByStickyHeader = [];
        for (const li of currentTopLevelTreeLIs) {
            const itemRow = li.querySelector(':scope > .tree-item-row');
            if (!itemRow) continue;

            const childUl = li.querySelector(':scope > ul');
            const isLiActuallyExpanded = childUl && childUl.style.display !== 'none';
            const liRect = li.getBoundingClientRect();

            const isHeaderScrolledOff = itemRow.getBoundingClientRect().top < combinedHeaderRectTop - 1;
            const isContentStillVisible = liRect.bottom > combinedHeaderRectTop + 1;

            if (isHeaderScrolledOff && isContentStillVisible) {
                pathLIsCoveredByStickyHeader = [li]; // Only one level deep for sticky path

                // If expanded, check if the first child interaction is also under the header
                if (isLiActuallyExpanded) {
                    const firstInteractionLi = childUl.querySelector(':scope > li');
                    if (firstInteractionLi) {
                        const firstInteractionRow = firstInteractionLi.querySelector(':scope > .tree-item-row');
                        if (firstInteractionRow && firstInteractionRow.getBoundingClientRect().top < combinedHeaderRectTop -1) {
                            // pathLIsCoveredByStickyHeader.push(firstInteractionLi); // Uncomment for 2-level sticky
                        }
                    }
                }
                return; // Found the primary covered item
            }
        }
    }

    function updateStickyHeaders() {
        if (!treeColumnRef || !stickyHeadersContainerRef || !treeContentWrapperRef || !combinedStickyHeaderRef) {
            if(combinedStickyHeaderRef) combinedStickyHeaderRef.style.visibility = 'hidden';
            return;
        }

        const combinedHeaderRect = combinedStickyHeaderRef.getBoundingClientRect();
        stickyHeadersContainerRef.innerHTML = '';
        findPathCovered(combinedHeaderRect.top);

        let displayedPathLIs = [...pathLIsCoveredByStickyHeader]; // Max 1 or 2 items

        // Find next visible item if nothing is fully "covered" but something is at the edge
        if (displayedPathLIs.length === 0) {
            for (const li of currentTopLevelTreeLIs) {
                const itemRow = li.querySelector(':scope > .tree-item-row');
                if (itemRow) {
                    const itemRowRect = itemRow.getBoundingClientRect();
                    // Item is at the top edge and at least partially visible under where header would be
                    if (itemRowRect.top >= combinedHeaderRect.top - itemRow.offsetHeight && itemRowRect.top < combinedHeaderRect.bottom) {
                         displayedPathLIs.push(li);
                         // Potentially add first child if expanded and also at edge - for simplicity, skip for now
                        break;
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

            const stickyHeaderDiv = document.createElement('div');
            stickyHeaderDiv.classList.add('sticky-header-item');
            if (firstPathOriginalItemRow) stickyHeaderDiv.style.height = firstPathOriginalItemRow.offsetHeight + 'px';

            const stickyTogglePlaceholder = document.createElement('span');
            stickyTogglePlaceholder.className = 'tree-toggle';
            const originalToggle = displayedPathLIs[0].querySelector(':scope > .tree-item-row > .tree-toggle');
            stickyTogglePlaceholder.innerHTML = originalToggle ? originalToggle.innerHTML : ' ';
            // stickyTogglePlaceholder.style.visibility = 'hidden'; // Keep it visible for alignment if original is

            const pathContainer = document.createElement('span');
            pathContainer.classList.add('tree-item-content');

            displayedPathLIs.forEach((liForSegment, index) => {
                const contentSpan = liForSegment.querySelector(':scope > .tree-item-row > .tree-item-content');
                const text = contentSpan ? contentSpan.textContent.trim() : 'Unknown';

                const pathSegment = document.createElement('span');
                pathSegment.classList.add('path-segment');
                pathSegment.textContent = text;
                pathSegment.title = text;

                pathSegment.addEventListener('click', () => {
                    const itemRowToScroll = liForSegment.querySelector(':scope > .tree-item-row');
                    if (itemRowToScroll) {
                        itemRowToScroll.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
                pathContainer.appendChild(pathSegment);

                if (index < displayedPathLIs.length - 1) {
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
            // This simplified sticky header doesn't need complex indentation based on depth
            stickyHeaderDiv.style.paddingLeft = Math.max(0, indentForStickyText) + 'px';

            stickyHeaderDiv.appendChild(stickyTogglePlaceholder);
            stickyHeaderDiv.appendChild(pathContainer);
            stickyHeadersContainerRef.appendChild(stickyHeaderDiv);

        } else {
            combinedStickyHeaderRef.style.visibility = 'hidden';
            combinedStickyHeaderRef.style.height = '0px';
        }
    }

    // Initial call to set placeholder message
    window.handleGraphNodeSelection(null, null);

    let scrollAFRequest = null;
    if (treeColumnRef) {
        treeColumnRef.addEventListener('scroll', () => {
            if (scrollAFRequest === null) {
                scrollAFRequest = requestAnimationFrame(() => {
                    updateStickyHeaders();
                    scrollAFRequest = null;
                });
            }
        });
    }

    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            updateBranchIndicatorBar();
            updateStickyHeaders();
        });
    });
});