document.addEventListener('DOMContentLoaded', function () {
    const graphContainerId = 'module-graph-area';
    const graphContainerElement = document.getElementById(graphContainerId);

    if (!graphContainerElement) { console.error(`Graph container #${graphContainerId} not found.`); return; }

    const graphDataPath = graphContainerElement.dataset.graphSrc;
    const ignoreFilesAttribute = graphContainerElement.dataset.ignoreFiles || "";
    const filesToIgnore = ignoreFilesAttribute.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (!graphDataPath) { console.error("`data-graph-src` attribute not found."); return; }

    // --- TUNABLE PARAMETERS & VISUALS ---
    const visualNodeWidth = 70; const visualNodeHeight = 18;
    const sCurveCurvinessFactor = 0.3;
    const clusterColumnWidth = 300; const clusterPadding = 30; const minClusterGap = 20;
    const clusterRepulsionStrength = 0.6; const clusterRepulsionIterations = 5;

    const intraClusterLinkStrength = 0.7; const interClusterLinkStrength = 0.04;
    const linkDistance = 90; const chargeStrength = -150;
    const nodeCollisionRadius = visualNodeWidth * 0.45; const nodeCollisionStrength = 0.9;
    const pullToClusterCentroidStrength = 0.2;

    // --- Colors and Styles ---
    const vibrantOutgoingLinkColor = "#28a745"; const vibrantIncomingLinkColor = "#dc3545";
    const vibrantBidirectionalLinkColor = "#6f42c1";
    const subtleOutgoingLinkColor = "#a4d4ae"; const subtleIncomingLinkColor = "#f4c2c7";
    const subtleBidirectionalLinkColor = "#d3c5e8";

    // Line widths
    const minLinkStrokeWidth = 0.25; const avgLinkStrokeWidth = 2; const maxLinkStrokeWidth = 4;
    const selectedLinkExtraWidth = 1.5;

    // Opacity for links
    const minLinkOpacity = 0.75;
    const avgLinkOpacity = 0.85; // Default average opacity
    const maxLinkOpacity = 1.0;  // Default max opacity (for most interactions)

    // For non-connected edges when a node is selected
    const fadedLinkSaturationFactor = 0.1;
    const maxOpacityForFadedNonConnected = 0.35; // Non-connected links won't exceed this opacity

    const defaultNodeFillColor = "#f0f0f0";
    const defaultNodeStrokeColor = "#333"; const nodeSelectedStrokeColor = "dodgerblue";
    const nodeSelectedStrokeWidth = 2; const clusterCircleStrokeColor = "#a0a0a0";
    const clusterCircleFillOpacity = 0.05;

    // Hue randomization for links
    const linkHueRandomizationPercent = 0.05; // e.g., 0.05 means +/- 5% of 360 degrees hue rotation

    let svg, innerG, simulation, linkPaths, nodeGroups, clusterCirclesGroup, currentZoomTransform;
    let fullLoadedGraphData = null; let currentNodes = []; let currentLinks = [];
    let clusterData = []; let linkWidthScale, linkOpacityScale;


    function getBaseLinkColor(linkData, selectedNodeId, isSelectedContext) {
        let baseColorString;

        if (isSelectedContext && selectedNodeId) {
            const sourceId = linkData.source.id;
            const targetId = linkData.target.id;

            if (linkData.bidirectional) {
                baseColorString = vibrantBidirectionalLinkColor;
            } else if (sourceId === selectedNodeId) {
                baseColorString = vibrantOutgoingLinkColor;
            } else if (targetId === selectedNodeId) {
                baseColorString = vibrantIncomingLinkColor;
            }
            // If isSelectedContext is true, one of the above conditions must be met,
            // as isSelectedContext is true iff the link is connected to selectedNodeId.
            // So, baseColorString should be assigned if isSelectedContext is true.
        }

        if (!baseColorString) { // Not in selected context, or (improbably) no specific vibrant color matched
            if (linkData.bidirectional) {
                baseColorString = subtleBidirectionalLinkColor;
            } else {
                baseColorString = subtleOutgoingLinkColor;
            }
        }

        // Apply hue randomization
        if (linkData.hueShiftFactor !== undefined) {
            let hslColor = d3.hsl(baseColorString);
            if (hslColor && typeof hslColor.h === 'number' && !isNaN(hslColor.h)) {
                hslColor.h = (hslColor.h + (linkData.hueShiftFactor * 360));
                hslColor.h = (hslColor.h % 360 + 360) % 360; // Ensure hue is within [0, 360)
                return hslColor.toString();
            }
        }
        return baseColorString; // Return original if no shift or parsing failed
    }

    function initializeOrUpdateGraph() {
        const containerWidth = graphContainerElement.clientWidth;
        const containerHeight = graphContainerElement.clientHeight;
        d3.select(graphContainerElement).select("svg").remove();
        svg = d3.select(graphContainerElement).append("svg").attr("width", containerWidth).attr("height", containerHeight);
        innerG = svg.append("g");
        const zoomBehavior = d3.zoom().scaleExtent([0.05, 5])
            .filter(event => (event.type === "wheel") || (event.type === "mousedown" && event.button === 0 && (event.target === svg.node() || event.target === innerG.node())))
            .on("zoom", event => { currentZoomTransform = event.transform; innerG.attr("transform", currentZoomTransform); });
        svg.call(zoomBehavior);

        d3.json(graphDataPath).then(function (loadedData) {
            fullLoadedGraphData = loadedData;
            let filteredNodesInput = fullLoadedGraphData.nodes.filter(n => !filesToIgnore.includes(n.label || n.id.split('/').pop()));
            const filteredNodeIds = new Set(filteredNodesInput.map(n => n.id));
            let rawFilteredEdges = fullLoadedGraphData.edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));
            const linksForSimulation = []; const processedEdgePairs = new Set();
            rawFilteredEdges.forEach(edge1 => {
                const pairKey1 = `${edge1.source}|${edge1.target}`; const pairKey2 = `${edge1.target}|${edge1.source}`;
                if (processedEdgePairs.has(pairKey1) || processedEdgePairs.has(pairKey2)) return;
                const interactions1 = edge1.interactions || []; let currentInteractionCount = interactions1.length;

                // Generate a random hue shift factor for this link
                const hueShift = (Math.random() * 2 - 1) * linkHueRandomizationPercent;

                let linkObject = {
                    source: edge1.source,
                    target: edge1.target,
                    bidirectional: false,
                    originalEdgeData1: edge1,
                    interactionCount: 0,
                    hueShiftFactor: hueShift // Store the random hue shift
                };
                const reverseEdge = rawFilteredEdges.find(edge2 => edge2.source === edge1.target && edge2.target === edge1.source);
                if (reverseEdge) {
                    const interactions2 = reverseEdge.interactions || []; currentInteractionCount += interactions2.length;
                    linkObject.bidirectional = true; linkObject.originalEdgeData2 = reverseEdge; processedEdgePairs.add(pairKey2);
                }
                linkObject.interactionCount = currentInteractionCount; linksForSimulation.push(linkObject);
                processedEdgePairs.add(pairKey1);
            });
            currentLinks = linksForSimulation;
            currentNodes = filteredNodesInput.map(n => ({
                ...n, clusterId: 0,
                x: containerWidth / 2 + (Math.random() - 0.5) * Math.min(containerWidth, containerHeight) * 0.1,
                y: containerHeight / 2 + (Math.random() - 0.5) * Math.min(containerWidth, containerHeight) * 0.1
            }));
            if (currentNodes.length === 0) { console.warn("No nodes to display after filtering."); return; }

            const interactionCounts = currentLinks.map(l => l.interactionCount).filter(c => typeof c === 'number' && c >= 0);
            let minInteractions = 0, avgInteractions = 1, maxDomainPointForScale = 1;
            if (interactionCounts.length > 0) {
                minInteractions = d3.min(interactionCounts); avgInteractions = d3.mean(interactionCounts);
                const maxActualInteractions = d3.max(interactionCounts);
                minInteractions = Math.max(0, minInteractions); avgInteractions = Math.max(1, avgInteractions);
                maxDomainPointForScale = Math.max(avgInteractions * 2, maxActualInteractions, avgInteractions + 1);
            } else { minInteractions = 0; avgInteractions = 1; maxDomainPointForScale = 2; }
            let domainPoints = [minInteractions, avgInteractions, maxDomainPointForScale];
            if (minInteractions === avgInteractions && avgInteractions === maxDomainPointForScale) {
                if (avgInteractions === 0) domainPoints = [0, 1, 2]; else domainPoints = [Math.max(0, avgInteractions -1), avgInteractions, avgInteractions + 1];
            } else if (minInteractions === avgInteractions) { domainPoints = [minInteractions, (minInteractions + maxDomainPointForScale)/2 , maxDomainPointForScale]; }
            else if (avgInteractions === maxDomainPointForScale) { domainPoints = [minInteractions, (minInteractions + avgInteractions)/2 , avgInteractions];}
            linkWidthScale = d3.scaleLinear().domain(domainPoints).range([minLinkStrokeWidth, avgLinkStrokeWidth, maxLinkStrokeWidth]).clamp(true);
            linkOpacityScale = d3.scaleLinear().domain(domainPoints).range([minLinkOpacity, avgLinkOpacity, maxLinkOpacity]).clamp(true);

            const nodeMap = new Map(currentNodes.map(n => [n.id, n]));
            currentNodes.forEach(n => { n.visitedInDepthCalc = false; n.inDegree = 0; });
            currentLinks.forEach(l => { if (!l.bidirectional) { const t = nodeMap.get(l.target); if(t) t.inDegree++; } });
            let maxClusterId = 0; function assignClusterByDepth(node, currentClusterId) { if (node.visitedInDepthCalc && node.clusterId >= currentClusterId) return; node.visitedInDepthCalc = true; node.clusterId = currentClusterId; maxClusterId = Math.max(maxClusterId, currentClusterId); currentLinks.forEach(link => { if (link.source === node.id && !link.bidirectional) { const targetNode = nodeMap.get(link.target); if (targetNode) assignClusterByDepth(targetNode, currentClusterId + 1); } }); }
            currentNodes.filter(n => n.inDegree === 0).forEach(r => assignClusterByDepth(r, 0)); currentNodes.filter(n => !n.visitedInDepthCalc).forEach(n => assignClusterByDepth(n, 0));
            clusterData = []; const initialXOffset = Math.max(100, (containerWidth - (maxClusterId * clusterColumnWidth)) / 2);
            for (let i = 0; i <= maxClusterId; i++) { const initialClusterX = initialXOffset + (i * clusterColumnWidth); clusterData.push({ id: i, nodesInCluster: currentNodes.filter(n => n.clusterId === i), calculatedCX: initialClusterX, calculatedCY: containerHeight / 2, calculatedR: visualNodeWidth + clusterPadding }); }
            currentNodes.forEach(n => { if (n.clusterId < 0 || n.clusterId > maxClusterId || !clusterData[n.clusterId]) n.clusterId = 0; });

            simulation = d3.forceSimulation(currentNodes)
                .force("link", d3.forceLink(currentLinks).id(d => d.id).distance(linkDistance).strength(link => (link.source.clusterId === link.target.clusterId) ? intraClusterLinkStrength : interClusterLinkStrength))
                .force("charge", d3.forceManyBody().strength(chargeStrength))
                .force("collision", d3.forceCollide().radius(nodeCollisionRadius).strength(nodeCollisionStrength))
                .force("clusterCentroidX", d3.forceX(d => { const c = clusterData[d.clusterId]; return c ? c.calculatedCX : containerWidth / 2; }).strength(pullToClusterCentroidStrength))
                .force("clusterCentroidY", d3.forceY(d => { const c = clusterData[d.clusterId]; return c ? c.calculatedCY : containerHeight / 2; }).strength(pullToClusterCentroidStrength))
                .force("clusterRepel", customClusterRepelForce());

            svg.select("defs").remove();

            clusterCirclesGroup = innerG.append("g").attr("class", "cluster-circles")
                .selectAll("circle").data(clusterData, d => d.id).join("circle")
                .style("fill", (d, i) => d3.schemeCategory10[i % 10]).style("fill-opacity", clusterCircleFillOpacity)
                .style("stroke", clusterCircleStrokeColor).style("stroke-width", 1.5)
                .style("pointer-events", "none"); // Make circles non-interactive for clicks/drags

            linkPaths = innerG.append("g").attr("class", "links")
                .selectAll("path.link-path").data(currentLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.bidirectional}`)
                .join("path").attr("class", "link-path")
                .style("stroke", d => getBaseLinkColor(d, null, false)) // Uses randomized hue
                .style("stroke-opacity", d => linkOpacityScale(d.interactionCount))
                .attr("stroke-width", d => linkWidthScale(d.interactionCount))
                .attr("fill", "none");

            nodeGroups = innerG.append("g").attr("class", "nodes")
                .selectAll("g.node-group").data(currentNodes, d => d.id).join("g")
                .attr("class", "node-group").attr("id", d => `node-${CSS.escape(d.id)}`)
                .call(nodeDragBehavior(simulation));
            nodeGroups.append("rect")
                .attr("width", visualNodeWidth).attr("height", visualNodeHeight)
                .attr("x", -visualNodeWidth / 2).attr("y", -visualNodeHeight / 2)
                .attr("rx", 2).attr("ry", 2)
                .style("fill", defaultNodeFillColor).style("stroke", defaultNodeStrokeColor).style("stroke-width", "1px");
            nodeGroups.append("text")
                .attr("text-anchor", "middle").attr("dy", "0.35em")
                .style("font-size", "8px").style("fill", "#000")
                .style("user-select", "none") // Prevent text selection
                .style("-webkit-user-select", "none") // For Safari
                .style("-moz-user-select", "none") // For Firefox
                .style("-ms-user-select", "none") // For IE/Edge
                .text(d => d.label || d.id);


            let selectedNodeId = null;
            nodeGroups.on("click", function(event, clickedNodeData) {
                event.stopPropagation();
                const previouslySelectedNodeId = selectedNodeId;
                selectedNodeId = (selectedNodeId === clickedNodeData.id) ? null : clickedNodeData.id;

                if (previouslySelectedNodeId) {
                    innerG.select(`#node-${CSS.escape(previouslySelectedNodeId)} rect`)
                        .style("stroke", defaultNodeStrokeColor).style("stroke-width", "1px");
                }

                linkPaths.each(function(linkData) {
                    const isConnectedToSelected = selectedNodeId && (linkData.source.id === selectedNodeId || linkData.target.id === selectedNodeId);
                    const baseWidth = linkWidthScale(linkData.interactionCount);
                    let finalColor;
                    let finalOpacity;
                    let finalWidth = baseWidth;

                    finalOpacity = linkOpacityScale(linkData.interactionCount);

                    if (isConnectedToSelected) {
                        finalColor = getBaseLinkColor(linkData, selectedNodeId, true); // Vibrant, with randomized hue
                        finalWidth = baseWidth + selectedLinkExtraWidth;
                        d3.select(this).raise();
                    } else {
                        const baseSubtleColorWithRandomHue = getBaseLinkColor(linkData, null, false); // Subtle, with randomized hue
                        let hslColor = d3.hsl(baseSubtleColorWithRandomHue);
                        if (hslColor && typeof hslColor.s === 'number') { // Check if saturation is valid
                           hslColor.s *= fadedLinkSaturationFactor; // Desaturate
                           finalColor = hslColor.toString();
                        } else {
                           finalColor = baseSubtleColorWithRandomHue; // Fallback if HSL conversion failed
                        }

                        if (selectedNodeId) {
                           finalOpacity = Math.min(finalOpacity, maxOpacityForFadedNonConnected);
                        }
                    }

                    d3.select(this)
                        .style("stroke", finalColor)
                        .style("stroke-opacity", finalOpacity)
                        .attr("stroke-width", finalWidth);
                });

                if (selectedNodeId) {
                    const selectedD3Node = innerG.select(`#node-${CSS.escape(selectedNodeId)}`);
                    selectedD3Node.select("rect").style("stroke", nodeSelectedStrokeColor).style("stroke-width", nodeSelectedStrokeWidth + "px");
                    selectedD3Node.raise();
                    if (window.handleGraphNodeSelection && fullLoadedGraphData) {
                        const nodeOriginalData = currentNodes.find(n => n.id === selectedNodeId);
                        window.handleGraphNodeSelection(nodeOriginalData, fullLoadedGraphData);
                    }
                } else {
                    linkPaths
                        .style("stroke", d => getBaseLinkColor(d, null, false)) // Reset to subtle, with randomized hue
                        .style("stroke-opacity", d => linkOpacityScale(d.interactionCount))
                        .attr("stroke-width", d => linkWidthScale(d.interactionCount));
                    if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                }
            });
            svg.on("click", () => {
                if (selectedNodeId) {
                    innerG.select(`#node-${CSS.escape(selectedNodeId)} rect`)
                        .style("stroke", defaultNodeStrokeColor).style("stroke-width", "1px");
                    linkPaths
                        .style("stroke", d => getBaseLinkColor(d, null, false)) // Reset to subtle, with randomized hue
                        .style("stroke-opacity", d => linkOpacityScale(d.interactionCount))
                        .attr("stroke-width", d => linkWidthScale(d.interactionCount));
                    selectedNodeId = null;
                    if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                }
            });

            simulation.on("tick", () => {
                clusterData.forEach(cData => {
                    const nodesInThisCluster = cData.nodesInCluster;
                    if (nodesInThisCluster.length === 0) { cData.calculatedCX = initialXOffset + (cData.id * clusterColumnWidth); cData.calculatedCY = containerHeight / 2; cData.calculatedR = visualNodeWidth * 0.5 + clusterPadding; return; }
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; nodesInThisCluster.forEach(n => { minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x); minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y); });
                    cData.calculatedCX = (minX + maxX) / 2; cData.calculatedCY = (minY + maxY) / 2;
                    let maxNodeDistFromCentroidSq = 0; nodesInThisCluster.forEach(n => { const distSq = (n.x - cData.calculatedCX)**2 + (n.y - cData.calculatedCY)**2; maxNodeDistFromCentroidSq = Math.max(maxNodeDistFromCentroidSq, distSq); });
                    const furthestNodeRadius = Math.sqrt(maxNodeDistFromCentroidSq); const nodeVisualDiagonal = Math.sqrt(visualNodeWidth**2 + visualNodeHeight**2) / 2;
                    cData.calculatedR = furthestNodeRadius + nodeVisualDiagonal + clusterPadding; cData.calculatedR = Math.max(cData.calculatedR, visualNodeWidth * 0.6 + clusterPadding);
                });
                clusterCirclesGroup.attr("cx", d => d.calculatedCX).attr("cy", d => d.calculatedCY).attr("r", d => d.calculatedR > 0 ? d.calculatedR : 0);
                linkPaths.attr("d", d => calculateSCurvePathWithDynamicAnchors(d, visualNodeWidth, visualNodeHeight));
                nodeGroups.attr("transform", d => `translate(${d.x}, ${d.y})`);
            });
            console.log("D3 graph with refined link opacity and randomized link hue initialized.");
        }).catch(error => { console.error("Error loading or processing graph data:", error); });
    }

    function customClusterRepelForce() {
        let allNodes; function force(alpha) { for (let iter = 0; iter < clusterRepulsionIterations; iter++) { for (let i = 0; i < clusterData.length; i++) { for (let j = i + 1; j < clusterData.length; j++) { const c1 = clusterData[i]; const c2 = clusterData[j]; if (c1.nodesInCluster.length === 0 || c2.nodesInCluster.length === 0 || c1.calculatedR <= 0 || c2.calculatedR <= 0) continue; const dx = c2.calculatedCX - c1.calculatedCX; const dy = c2.calculatedCY - c1.calculatedCY; let distance = Math.sqrt(dx * dx + dy * dy); const minDistance = c1.calculatedR + c2.calculatedR + minClusterGap; if (distance < minDistance && distance > 1e-6) { const overlap = minDistance - distance; const unitDx = dx / distance; const unitDy = dy / distance; const push = overlap * 0.5 * clusterRepulsionStrength * alpha; if (c1.nodesInCluster.length > 0) { c1.nodesInCluster.forEach(node => { node.x -= unitDx * push / Math.sqrt(c1.nodesInCluster.length); node.y -= unitDy * push / Math.sqrt(c1.nodesInCluster.length); }); } if (c2.nodesInCluster.length > 0) { c2.nodesInCluster.forEach(node => { node.x += unitDx * push / Math.sqrt(c2.nodesInCluster.length); node.y += unitDy * push / Math.sqrt(c2.nodesInCluster.length); }); } } } } } } force.initialize = function(nodesPassedByD3) { allNodes = nodesPassedByD3; }; return force;
    }
    function calculateSCurvePathWithDynamicAnchors(linkData, vNodeWidth, vNodeHeight) {
        const sourceNode = linkData.source; const targetNode = linkData.target;
        if (!sourceNode || !targetNode || typeof sourceNode.x !== 'number' || typeof targetNode.x !== 'number') return "";
        let sx, sy, tx, ty;
        if (linkData.bidirectional) { sx = sourceNode.x; sy = sourceNode.y; tx = targetNode.x; ty = targetNode.y; return `M${sx},${sy}L${tx},${ty}`; }
        const dxTotal = targetNode.x - sourceNode.x; const dyTotal = targetNode.y - sourceNode.y;
        if (Math.abs(dxTotal) > Math.abs(dyTotal) + vNodeWidth * 0.25) {
            if (targetNode.x > sourceNode.x) { sx = sourceNode.x + vNodeWidth / 2; sy = sourceNode.y; tx = targetNode.x - vNodeWidth / 2; ty = targetNode.y; }
            else { sx = sourceNode.x - vNodeWidth / 2; sy = sourceNode.y; tx = targetNode.x + vNodeWidth / 2; ty = targetNode.y; }
        } else {
            if (targetNode.y > sourceNode.y) { sx = sourceNode.x; sy = sourceNode.y + vNodeHeight / 2; tx = targetNode.x; ty = targetNode.y - vNodeHeight / 2; }
            else { sx = sourceNode.x; sy = sourceNode.y - vNodeHeight / 2; tx = targetNode.x; ty = targetNode.y + vNodeHeight / 2; }
        }
        const dx = tx - sx; const dy = ty - sy;
        if (sCurveCurvinessFactor < -0.9 || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return `M${sx},${sy}L${tx},${ty}`;
        let cp1x, cp1y, cp2x, cp2y;
        if (Math.abs(dx) >= Math.abs(dy) || Math.abs(dx) > 10) { let curve = dx * sCurveCurvinessFactor; cp1x = sx + curve; cp1y = sy; cp2x = tx - curve; cp2y = ty; }
        else if (Math.abs(dy) > 10) { let curve = dy * sCurveCurvinessFactor; cp1x = sx; cp1y = sy + curve; cp2x = tx; cp2y = ty - curve; }
        else { return `M${sx},${sy}L${tx},${ty}`; }
        return `M${sx},${sy}C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
    }
    function nodeDragBehavior(simulationInstance) {
        function dragstarted(event, d) { event.sourceEvent.stopPropagation(); if (!event.active) simulationInstance.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
        function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
        function dragended(event, d) { if (!event.active) simulationInstance.alphaTarget(0); d.fx = null; d.fy = null; }
        return d3.drag().filter(event => event.button === 0).on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }

    initializeOrUpdateGraph();
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { initializeOrUpdateGraph(); }, 250); });
});