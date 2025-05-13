// /scripts/lists/graph_interaction_tree.js
document.addEventListener('DOMContentLoaded', function () {
    const treeContainerUl = document.querySelector('.left-column .tree-content-wrapper ul');
    const treeColumnRef = document.querySelector('.tree-column');
    const combinedStickyHeaderRef = document.querySelector('.combined-sticky-header');
    const stickyHeadersContainerRef = document.querySelector('.sticky-headers-container');
    const treeContentWrapperRef = document.querySelector('.tree-content-wrapper');
    const branchBarRef = document.querySelector('.branch-indicator-bar-area');
    
    // Consistent colors with graph script
    const outgoingColor = "green";
    const incomingColor = "red";
    const bidirectionalColor = "purple";
    const defaultTextColor = "#374151"; // Default for text not specifically colored by direction

    const barColors = [outgoingColor, incomingColor, bidirectionalColor, '#637C8A'];


    if (!treeContainerUl) {
        console.error("Tree container UL not found in .left-column .tree-content-wrapper");
        return;
    }
    // ... (rest of the checks for UI elements)

    let currentTopLevelTreeLIs = [];

    window.handleGraphNodeSelection = function(selectedGraphNode, fullGraphData) {
        treeContainerUl.innerHTML = '';
        currentTopLevelTreeLIs = [];

        if (!selectedGraphNode || !fullGraphData || !fullGraphData.nodes || !fullGraphData.edges) {
            const placeholderLi = document.createElement('li');
            // ... (placeholder message logic remains the same)
            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');
            itemRow.style.cursor = 'default';
            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.textContent = "Select a node in the graph to see its interactions.";
            contentSpan.style.paddingLeft = "25px"; // Align with items that have toggles
            itemRow.appendChild(contentSpan);
            placeholderLi.appendChild(itemRow);
            treeContainerUl.appendChild(placeholderLi);
            updateBranchIndicatorBar();
            updateStickyHeaders();
            return;
        }

        const selectedNodeId = selectedGraphNode.id;
        
        // Find all edges involving the selected node
        const relatedEdgesFromGraph = fullGraphData.edges.filter(edge =>
            edge.source === selectedNodeId || edge.target === selectedNodeId
        );

        if (relatedEdgesFromGraph.length === 0) {
            // ... (no interactions message logic remains the same)
            const noInteractionsLi = document.createElement('li');
            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');
            itemRow.style.cursor = 'default';
            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.textContent = `Node "${selectedGraphNode.label}" has no recorded direct interactions.`;
            contentSpan.style.paddingLeft = "25px";
            itemRow.appendChild(contentSpan);
            noInteractionsLi.appendChild(itemRow);
            treeContainerUl.appendChild(noInteractionsLi);
            updateBranchIndicatorBar();
            updateStickyHeaders();
            return;
        }

        const connections = {}; // Key: connectedNodeId

        relatedEdgesFromGraph.forEach(edge => {
            let connectedNodeId;
            let interactionsForThisEdge = edge.interactions || [];
            let isOutgoingFromSelected = false;
            let isIncomingToSelected = false;

            if (edge.source === selectedNodeId) {
                connectedNodeId = edge.target;
                isOutgoingFromSelected = true;
            } else { // edge.target === selectedNodeId
                connectedNodeId = edge.source;
                isIncomingToSelected = true;
            }
            
            const connectedNodeDetails = fullGraphData.nodes.find(n => n.id === connectedNodeId);

            if (!connections[connectedNodeId]) {
                connections[connectedNodeId] = {
                    id: connectedNodeId,
                    label: connectedNodeDetails ? connectedNodeDetails.label : connectedNodeId,
                    interactions: [],
                    isOutgoing: false, // Overall relationship direction
                    isIncoming: false  // Overall relationship direction
                };
            }

            if (isOutgoingFromSelected) connections[connectedNodeId].isOutgoing = true;
            if (isIncomingToSelected) connections[connectedNodeId].isIncoming = true;

            interactionsForThisEdge.forEach(interaction => {
                connections[connectedNodeId].interactions.push({
                    ...interaction,
                    // Determine direction of this specific interaction relative to selected node
                    direction: isOutgoingFromSelected ? 'outgoing' : 'incoming'
                });
            });
        });
        
        const sortedConnectedNodes = Object.values(connections).sort((a, b) => a.label.localeCompare(b.label));

        sortedConnectedNodes.forEach(connData => {
            const connectedNodeLi = document.createElement('li');
            currentTopLevelTreeLIs.push(connectedNodeLi);

            const itemRow = document.createElement('div');
            itemRow.classList.add('tree-item-row');

            const toggle = document.createElement('span');
            toggle.classList.add('tree-toggle');

            const contentSpan = document.createElement('span');
            contentSpan.classList.add('tree-item-content');
            contentSpan.textContent = connData.label; // Just the label
            contentSpan.title = connData.label;

            // Determine overall color for the connected node
            if (connData.isOutgoing && connData.isIncoming) {
                contentSpan.style.color = bidirectionalColor;
            } else if (connData.isOutgoing) {
                contentSpan.style.color = outgoingColor;
            } else if (connData.isIncoming) {
                contentSpan.style.color = incomingColor;
            } else {
                contentSpan.style.color = defaultTextColor; // Should not happen if there are interactions
            }

            itemRow.appendChild(toggle);
            itemRow.appendChild(contentSpan);
            connectedNodeLi.appendChild(itemRow);

            if (connData.interactions.length > 0) {
                const interactionsUl = document.createElement('ul');
                interactionsUl.style.display = 'none';

                // Sort interactions: kind then name
                connData.interactions.sort((a, b) => {
                    const kindComp = a.kind.localeCompare(b.kind);
                    if (kindComp !== 0) return kindComp;
                    return a.name.localeCompare(b.name);
                }).forEach(interaction => {
                    const interactionLi = document.createElement('li');
                    const interactionItemRow = document.createElement('div');
                    interactionItemRow.classList.add('tree-item-row');
                    interactionItemRow.style.cursor = 'default';

                    const interactionToggle = document.createElement('span');
                    interactionToggle.classList.add('tree-toggle');
                    interactionToggle.innerHTML = ' ';
                    interactionToggle.style.visibility = 'hidden';

                    const interactionContentSpan = document.createElement('span');
                    interactionContentSpan.classList.add('tree-item-content');
                    // interactionContentSpan.classList.add('secondary-text'); // Remove generic class

                    let interactionText = "";
                    let interactionColor = defaultTextColor;

                    if (interaction.direction === 'outgoing') { // Selected node USES/DECLARES something FROM/IN target
                        interactionText = interaction.kind === "import" ? `Uses: ${interaction.name}` : `Declares in ${connData.label}: ${interaction.name}`;
                        interactionColor = outgoingColor;
                    } else { // Selected node PROVIDES something TO target (interaction.direction === 'incoming')
                        interactionText = interaction.kind === "import" ? `Provides: ${interaction.name}` : `${connData.label} declares: ${interaction.name}`;
                        interactionColor = incomingColor;
                    }
                    
                    if (interaction.name === "___GLOB___") {
                         interactionText = interaction.direction === 'outgoing' ? `Uses all from ${connData.label}` : `${connData.label} uses all from selected`;
                    }

                    interactionContentSpan.textContent = interactionText;
                    interactionContentSpan.title = interactionText;
                    interactionContentSpan.style.color = interactionColor; // Apply color to interaction text

                    interactionItemRow.appendChild(interactionToggle);
                    interactionItemRow.appendChild(interactionContentSpan);
                    interactionLi.appendChild(interactionItemRow);
                    interactionsUl.appendChild(interactionLi);
                });
                connectedNodeLi.appendChild(interactionsUl);
                toggle.textContent = '[+]';
                itemRow.addEventListener('click', (event) => {
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
                itemRow.style.cursor = 'default';
            }
            treeContainerUl.appendChild(connectedNodeLi);
        });

        updateBranchIndicatorBar();
        updateStickyHeaders();
    };

    // --- Sticky Header and Branch Bar Logic (remains largely the same) ---
    // ... (copy the existing updateBranchIndicatorBar, findPathCovered, updateStickyHeaders functions here) ...
    // ... (and the event listeners for scroll and resize) ...
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
            // Color branch bar based on the connected node's text color
            const contentSpan = li.querySelector(':scope > .tree-item-row > .tree-item-content');
            segment.style.backgroundColor = contentSpan ? contentSpan.style.color || barColors[index % barColors.length] : barColors[index % barColors.length];
            branchBarRef.appendChild(segment);
        });
        if (treeContentWrapperRef) { // Check if ref is valid
            branchBarRef.style.height = treeContentWrapperRef.scrollHeight + 'px';
        }
    }

    function findPathCovered(combinedHeaderRectTop) {
        pathLIsCoveredByStickyHeader = [];
        if (!currentTopLevelTreeLIs) return;

        for (const li of currentTopLevelTreeLIs) {
            const itemRow = li.querySelector(':scope > .tree-item-row');
            if (!itemRow) continue;

            const childUl = li.querySelector(':scope > ul');
            const isLiActuallyExpanded = childUl && childUl.style.display !== 'none';
            const liRect = li.getBoundingClientRect();

            const isHeaderScrolledOff = itemRow.getBoundingClientRect().top < combinedHeaderRectTop - 1;
            const isContentStillVisible = liRect.bottom > combinedHeaderRectTop + 1;

            if (isHeaderScrolledOff && isContentStillVisible) {
                pathLIsCoveredByStickyHeader = [li]; 
                // Simplified: only one level for sticky path for now
                return; 
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

        let displayedPathLIs = [...pathLIsCoveredByStickyHeader];

        if (displayedPathLIs.length === 0 && currentTopLevelTreeLIs && currentTopLevelTreeLIs.length > 0) {
            for (const li of currentTopLevelTreeLIs) {
                const itemRow = li.querySelector(':scope > .tree-item-row');
                if (itemRow) {
                    const itemRowRect = itemRow.getBoundingClientRect();
                    if (itemRowRect.top >= combinedHeaderRect.top - itemRow.offsetHeight && itemRowRect.top < combinedHeaderRect.bottom) {
                         displayedPathLIs.push(li);
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
                combinedStickyHeaderRef.style.height = 'auto';
            }

            const stickyHeaderDiv = document.createElement('div');
            stickyHeaderDiv.classList.add('sticky-header-item');
            if (firstPathOriginalItemRow) stickyHeaderDiv.style.height = firstPathOriginalItemRow.offsetHeight + 'px';

            const stickyTogglePlaceholder = document.createElement('span');
            stickyTogglePlaceholder.className = 'tree-toggle';
            const originalToggle = displayedPathLIs[0].querySelector(':scope > .tree-item-row > .tree-toggle');
            stickyTogglePlaceholder.innerHTML = originalToggle ? originalToggle.innerHTML : ' ';
            
            const pathContainer = document.createElement('span');
            pathContainer.classList.add('tree-item-content');

            displayedPathLIs.forEach((liForSegment, index) => {
                const contentSpan = liForSegment.querySelector(':scope > .tree-item-row > .tree-item-content');
                const text = contentSpan ? contentSpan.textContent.trim() : 'Unknown';
                const color = contentSpan ? contentSpan.style.color : defaultTextColor;

                const pathSegment = document.createElement('span');
                pathSegment.classList.add('path-segment');
                pathSegment.textContent = text;
                pathSegment.title = text;
                pathSegment.style.color = color; // Apply color to sticky header segment

                pathSegment.addEventListener('click', () => {
                    const itemRowToScroll = liForSegment.querySelector(':scope > .tree-item-row');
                    if (itemRowToScroll) {
                        itemRowToScroll.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                });
                pathContainer.appendChild(pathSegment);

                // No separators for single-level sticky header
            });
            
            let indentForStickyText = 0;
            const rootUlInWrapper = treeContentWrapperRef.querySelector(':scope > ul');
            if (rootUlInWrapper) {
                 indentForStickyText += parseFloat(window.getComputedStyle(rootUlInWrapper).paddingLeft) || 0;
            }
            stickyHeaderDiv.style.paddingLeft = Math.max(0, indentForStickyText) + 'px';

            stickyHeaderDiv.appendChild(stickyTogglePlaceholder);
            stickyHeaderDiv.appendChild(pathContainer);
            stickyHeadersContainerRef.appendChild(stickyHeaderDiv);

        } else {
            combinedStickyHeaderRef.style.visibility = 'hidden';
            combinedStickyHeaderRef.style.height = '0px';
        }
    }


    // Initial call
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