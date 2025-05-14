document.addEventListener('DOMContentLoaded', function () {
    const graphContainerId = 'module-graph-area';
    const graphContainerElement = document.getElementById(graphContainerId);

    if (!graphContainerElement) { console.error(`Graph container #${graphContainerId} not found.`); return; }

    const graphDataPath = graphContainerElement.dataset.graphSrc;
    const ignoreFilesAttribute = graphContainerElement.dataset.ignoreFiles || "";
    const filesToIgnore = ignoreFilesAttribute.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (!graphDataPath) { console.error("`data-graph-src` attribute not found."); return; }

    function sanitizeForDomId(idString) {
        if (typeof idString !== 'string') return '';
        let sanitized = idString.replace(/[^a-zA-Z0-9_]/g, '-');
        if (/^\d/.test(sanitized)) {
            sanitized = 'id-' + sanitized;
        }
        return sanitized;
    }

    // const baseNodeAspectRatio = 18 / 70; // No longer strictly needed for circles, but visualHeight is still primary
    const minNodePrimaryDimension = 50; // This will now be min diameter
    const maxNodePrimaryDimension = 200; // This will now be max diameter

    const sCurveCurvinessFactor = 0.3;
    const clusterColumnWidth = 350; 
    const clusterPadding = 40;      
    const minClusterGap = 30;       
    const clusterRepulsionStrength = 0.5; 
    const clusterRepulsionIterations = 3; 

    const intraClusterLinkStrength = 0.7; const interClusterLinkStrength = 0.04;
    const linkDistance = 90; const chargeStrength = -180; 
    const nodeCollisionStrength = 0.9;
    const pullToClusterInitialCentroidStrength = 0.15; 

    const vibrantOutgoingLinkColor = "#28a745"; const vibrantIncomingLinkColor = "#dc3545";
    const vibrantBidirectionalLinkColor = "#6f42c1";
    const subtleOutgoingLinkColor = "#a4d4ae"; const subtleIncomingLinkColor = "#f4c2c7";
    const subtleBidirectionalLinkColor = "#d3c5e8";

    const minLinkStrokeWidth = 0.25; const avgLinkStrokeWidth = 2; const maxLinkStrokeWidth = 4;
    const selectedLinkExtraWidth = 1.5;

    const minLinkOpacity = 0.75; const avgLinkOpacity = 0.85; const maxLinkOpacity = 1.0;
    const fadedLinkSaturationFactor = 0.1; const maxOpacityForFadedNonConnected = 0.35;

    const defaultNodeFillColor = "#f0f0f0";
    const defaultNodeStrokeColor = "#333"; 
    const nodeSelectedStrokeColor = "dodgerblue"; 
    const nodeSelectedStrokeWidth = 2.5;    
    const nodeSelectedFillColor = "#e6f7ff"; 

    const clusterCircleStrokeColor = "#b0b0b0"; 
    const clusterCircleFillOpacity = 0.03;   
    const clusterLabelColor = "#555";
    const clusterLabelFontSize = "10px";

    const selectedNodeClusterFillOpacity = 0.15;
    const selectedNodeClusterStrokeColor = "orange";
    const selectedNodeClusterStrokeWidth = 2.5;

    const connectedClusterBaseStrokeColor = "#66afe9"; 
    const connectedClusterBaseStrokeWidth = 2;
    const minConnectedClusterFillOpacity = clusterCircleFillOpacity + 0.02; 
    const maxConnectedClusterFillOpacity = 0.12; 

    const linkHueRandomizationPercent = 0.05;

    let svg, innerG, simulation, linkPaths, nodeGroups, clusterVisualsGroup, currentZoomTransform;
    let fullLoadedGraphData = null; let currentNodes = []; let currentLinks = [];
    let clusterData = []; 
    let linkWidthScale, linkOpacityScale, nodePrimaryDimensionScale; // nodePrimaryDimensionScale now scales diameter
    let graphInitialized = false;

    function getBaseLinkColor(linkData, selectedNodeId, isSelectedContext) {
        let baseColorString;
        if (isSelectedContext && selectedNodeId) {
            const sourceId = linkData.source.id; const targetId = linkData.target.id;
            if (linkData.bidirectional) { baseColorString = vibrantBidirectionalLinkColor; }
            else if (sourceId === selectedNodeId) { baseColorString = vibrantOutgoingLinkColor; }
            else if (targetId === selectedNodeId) { baseColorString = vibrantIncomingLinkColor; }
        }
        if (!baseColorString) {
            baseColorString = linkData.bidirectional ? subtleBidirectionalLinkColor : subtleOutgoingLinkColor;
        }
        if (linkData.hueShiftFactor !== undefined) {
            let hslColor = d3.hsl(baseColorString);
            if (hslColor && typeof hslColor.h === 'number' && !isNaN(hslColor.h)) {
                hslColor.h = (hslColor.h + (linkData.hueShiftFactor * 360)) % 360;
                hslColor.h = (hslColor.h + 360) % 360;
                return hslColor.toString();
            }
        }
        return baseColorString;
    }

    function initializeOrUpdateGraph() {
        if (!graphContainerElement) return;
        const containerWidth = graphContainerElement.clientWidth;
        const containerHeight = graphContainerElement.clientHeight;
        if (containerWidth === 0 || containerHeight === 0) { graphInitialized = false; return; }
        if (graphInitialized && svg && parseInt(svg.attr("width")) === containerWidth && parseInt(svg.attr("height")) === containerHeight) { return; }
        
        d3.select(graphContainerElement).select("svg").remove();
        svg = d3.select(graphContainerElement).append("svg").attr("width", containerWidth).attr("height", containerHeight);
        innerG = svg.append("g");
        const zoomBehavior = d3.zoom().scaleExtent([0.05, 5])
            .filter(event => (event.type === "wheel") || (event.type === "mousedown" && event.button === 0 && (event.target === svg.node() || event.target === innerG.node())))
            .on("zoom", event => { currentZoomTransform = event.transform; innerG.attr("transform", currentZoomTransform); });
        svg.call(zoomBehavior);
        if (currentZoomTransform) { svg.call(zoomBehavior.transform, currentZoomTransform); }

        const dataPromise = fullLoadedGraphData ? Promise.resolve(fullLoadedGraphData) : d3.json(graphDataPath);
        dataPromise.then(function (loadedData) {
            if (!fullLoadedGraphData) { fullLoadedGraphData = loadedData; }
            
            let filteredNodesInput = fullLoadedGraphData.nodes.filter(n => !filesToIgnore.includes(n.label || n.id.split('/').pop()));
            const filteredNodeIds = new Set(filteredNodesInput.map(n => n.id));
            let rawFilteredEdges = fullLoadedGraphData.edges.filter(e => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));
            
            const linksForSimulation = []; const processedEdgePairs = new Set();
            rawFilteredEdges.forEach(edge1 => {
                const pairKey1 = `${edge1.source}|${edge1.target}`; const pairKey2 = `${edge1.target}|${edge1.source}`;
                if (processedEdgePairs.has(pairKey1) || processedEdgePairs.has(pairKey2)) return;
                const interactions1 = edge1.interactions || []; let currentInteractionCount = interactions1.length;
                const hueShift = (Math.random() * 2 - 1) * linkHueRandomizationPercent;
                let linkObject = { source: edge1.source, target: edge1.target, bidirectional: false, originalEdgeData1: edge1, interactionCount: 0, hueShiftFactor: hueShift };
                const reverseEdge = rawFilteredEdges.find(edge2 => edge2.source === edge1.target && edge2.target === edge1.source);
                if (reverseEdge) {
                    const interactions2 = reverseEdge.interactions || []; currentInteractionCount += interactions2.length;
                    linkObject.bidirectional = true; linkObject.originalEdgeData2 = reverseEdge; processedEdgePairs.add(pairKey2);
                }
                linkObject.interactionCount = currentInteractionCount; linksForSimulation.push(linkObject);
                processedEdgePairs.add(pairKey1);
            });
            currentLinks = linksForSimulation;
            
            const forceResetPositions = !graphInitialized || (svg && (parseInt(svg.attr("width")) !== containerWidth || parseInt(svg.attr("height")) !== containerHeight));
            const lineCounts = filteredNodesInput.map(n => (typeof n.line_count === 'number' && n.line_count >= 0) ? n.line_count : 0);
            let minLines = 0, maxLines = 1; 
            if (lineCounts.length > 0) {
                const validLineCounts = lineCounts.filter(lc => typeof lc === 'number' && lc >=0);
                if (validLineCounts.length > 0) { minLines = d3.min(validLineCounts); maxLines = d3.max(validLineCounts); }
            }
            if (minLines === maxLines) {
                if (lineCounts.length > 0) { 
                    minLines = Math.max(0, minLines - Math.max(1, Math.floor(minLines * 0.1))); 
                    maxLines = maxLines + Math.max(1, Math.floor(maxLines * 0.1));       
                    if (minLines === maxLines && maxLines === 0) maxLines = 1; 
                    else if (minLines === maxLines) maxLines = minLines + 1; 
                } else { minLines = 0; maxLines = 100; }
            }
            // nodePrimaryDimensionScale now scales the diameter of the circle
            nodePrimaryDimensionScale = d3.scaleSqrt().domain([minLines, maxLines]).range([minNodePrimaryDimension, maxNodePrimaryDimension]).clamp(true);
            
            currentNodes = filteredNodesInput.map((n_new) => {
                const existing_node = !forceResetPositions ? currentNodes.find(n_old => n_old.id === n_new.id) : null;
                const lineCount = (typeof n_new.line_count === 'number' && n_new.line_count >= 0) ? n_new.line_count : 0;
                const diameter = nodePrimaryDimensionScale(lineCount);
                
                return { ...n_new, directory: n_new.id.substring(0, n_new.id.lastIndexOf('/')) || '[root]',
                    x: existing_node ? existing_node.x : containerWidth / 2 + (Math.random() - 0.5) * Math.min(containerWidth, containerHeight) * 0.1,
                    y: existing_node ? existing_node.y : containerHeight / 2 + (Math.random() - 0.5) * Math.min(containerWidth, containerHeight) * 0.1,
                    fx: existing_node ? existing_node.fx : null, fy: existing_node ? existing_node.fy : null,
                    radius: diameter / 2, // Store radius
                    // visualHeight and visualWidth might still be useful for other calculations or if you switch back
                    visualHeight: diameter, 
                    visualWidth: diameter, 
                };
            });
            if (currentNodes.length === 0) { graphInitialized = false; return; }

            const nodesByDirectory = d3.group(currentNodes, d => d.directory);
            const sortedDirectoryPaths = Array.from(nodesByDirectory.keys()).sort();
            const initialXOffset = Math.max(100, (containerWidth - (sortedDirectoryPaths.length * clusterColumnWidth)) / 2 + clusterColumnWidth / 2);
            clusterData = sortedDirectoryPaths.map((dirPath, index) => {
                const nodesInThisCluster = nodesByDirectory.get(dirPath) || [];
                nodesInThisCluster.forEach(node => node.clusterId = dirPath); 
                return { id: dirPath, nodesInCluster: nodesInThisCluster, initialCX: initialXOffset + (index * clusterColumnWidth), initialCY: containerHeight / 2, };
            });
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

            if (simulation) { simulation.stop(); }
            simulation = d3.forceSimulation(currentNodes)
                .force("link", d3.forceLink(currentLinks).id(d => d.id).distance(linkDistance)
                    .strength(link => (link.source.clusterId === link.target.clusterId) ? intraClusterLinkStrength : interClusterLinkStrength))
                .force("charge", d3.forceManyBody().strength(chargeStrength))
                .force("collision", d3.forceCollide().radius(d => d.radius + 3).strength(nodeCollisionStrength)) // Use d.radius for collision
                .force("clusterCentroidX", d3.forceX(d => { const c = clusterData.find(cd => cd.id === d.clusterId); return c ? c.initialCX : containerWidth / 2; }).strength(pullToClusterInitialCentroidStrength))
                .force("clusterCentroidY", d3.forceY(d => { const c = clusterData.find(cd => cd.id === d.clusterId); return c ? c.initialCY : containerHeight / 2; }).strength(pullToClusterInitialCentroidStrength))
                .force("clusterRepel", customClusterRepelForce(clusterData)); 

            svg.select("defs").remove(); 
            clusterVisualsGroup = innerG.append("g").attr("class", "cluster-visuals").selectAll("g.cluster-group").data(clusterData, d => d.id).join("g").attr("class", "cluster-group");
            clusterVisualsGroup.append("circle").attr("class", "cluster-circle").style("fill", (d, i) => d3.schemeCategory10[i % 10]).style("fill-opacity", clusterCircleFillOpacity).style("stroke", clusterCircleStrokeColor).style("stroke-width", 1.5).style("pointer-events", "none");
            clusterVisualsGroup.append("text").attr("class", "cluster-label").attr("text-anchor", "middle").style("font-size", clusterLabelFontSize).style("fill", clusterLabelColor).style("pointer-events", "none").text(d => d.id === '[root]' ? 'Project Root' : d.id);

            linkPaths = innerG.append("g").attr("class", "links").selectAll("path.link-path").data(currentLinks, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.bidirectional}`).join("path").attr("class", "link-path").style("stroke", d => getBaseLinkColor(d, null, false)).style("stroke-opacity", d => linkOpacityScale(d.interactionCount)).attr("stroke-width", d => linkWidthScale(d.interactionCount)).attr("fill", "none");
            
            nodeGroups = innerG.append("g").attr("class", "nodes")
                .selectAll("g.node-group").data(currentNodes, d => d.id).join("g")
                .attr("class", "node-group")
                .attr("id", d => `node-${sanitizeForDomId(d.id)}`) 
                .call(nodeDragBehavior(simulation));
            
            // --- CHANGE: Append circle instead of rect ---
            nodeGroups.append("circle")
                .attr("r", d => d.radius)
                .attr("cx", 0) // Center of the group
                .attr("cy", 0) // Center of the group
                .style("fill", defaultNodeFillColor).style("stroke", defaultNodeStrokeColor).style("stroke-width", "1px");
            
            nodeGroups.append("text")
                .attr("text-anchor", "middle").attr("dy", "0.35em") // dy might need adjustment if text looks off in circles
                .style("font-size", "10px") 
                .style("fill", "#000")
                .style("pointer-events", "none") // Allow clicks to pass through to the circle
                .style("user-select", "none").style("-webkit-user-select", "none")
                .style("-moz-user-select", "none").style("-ms-user-select", "none")
                .text(d => d.label || d.id);

            let selectedNodeId = null;
            nodeGroups.on("click", function(event, clickedNodeData) {
                event.stopPropagation();
                selectedNodeId = (selectedNodeId === clickedNodeData.id) ? null : clickedNodeData.id;

                // Reset visual state for all nodes (circles)
                nodeGroups.selectAll("circle") // Select circle now
                    .style("fill", defaultNodeFillColor)
                    .style("stroke", defaultNodeStrokeColor)
                    .style("stroke-width", "1px");

                innerG.selectAll(".cluster-circle").style("fill-opacity", clusterCircleFillOpacity).style("stroke", clusterCircleStrokeColor).style("stroke-width", 1.5);
                linkPaths.style("stroke", d => getBaseLinkColor(d, null, false)).style("stroke-opacity", d => linkOpacityScale(d.interactionCount)).attr("stroke-width", d => linkWidthScale(d.interactionCount));

                if (selectedNodeId) {
                    const selectedNodeObject = currentNodes.find(n => n.id === selectedNodeId);
                    if (!selectedNodeObject) return;

                    const circleSelector = `#node-${sanitizeForDomId(selectedNodeId)} circle`; // Selector for the circle
                    const circleSelection = innerG.select(circleSelector); 

                    if (circleSelection.node()) { 
                        circleSelection
                            .style("fill", nodeSelectedFillColor) 
                            .style("stroke", nodeSelectedStrokeColor) 
                            .style("stroke-width", nodeSelectedStrokeWidth + "px"); 
                        
                        const parentGroupSelector = `#node-${sanitizeForDomId(selectedNodeId)}`; 
                        const parentGroup = innerG.select(parentGroupSelector);
                        if (parentGroup.node()) {
                            parentGroup.raise();
                        }
                    }

                    const selectedNodeClusterId = selectedNodeObject.clusterId;
                    innerG.selectAll(".cluster-circle").filter(cd => cd.id === selectedNodeClusterId).style("fill-opacity", selectedNodeClusterFillOpacity).style("stroke", selectedNodeClusterStrokeColor).style("stroke-width", selectedNodeClusterStrokeWidth).raise();
                    const connectedClusterCounts = new Map();
                    let totalConnections = 0;
                    currentLinks.forEach(link => {
                        let otherNodeId = null;
                        if (link.source.id === selectedNodeId) otherNodeId = link.target.id;
                        else if (link.target.id === selectedNodeId) otherNodeId = link.source.id;
                        if (otherNodeId) {
                            totalConnections++;
                            const otherNode = currentNodes.find(n => n.id === otherNodeId);
                            if (otherNode) {
                                const otherNodeClusterId = otherNode.clusterId; 
                                if (otherNodeClusterId !== selectedNodeClusterId) {
                                    connectedClusterCounts.set(otherNodeClusterId, (connectedClusterCounts.get(otherNodeClusterId) || 0) + 1);
                                }
                            }
                        }
                    });
                    if (totalConnections > 0) {
                        const opacityScaleForConnectedClusters = d3.scaleLinear().domain([0, 1]).range([minConnectedClusterFillOpacity, maxConnectedClusterFillOpacity]);
                        connectedClusterCounts.forEach((count, clusterId) => {
                            const proportion = count / totalConnections;
                            const targetOpacity = opacityScaleForConnectedClusters(proportion);
                            innerG.selectAll(".cluster-circle").filter(cd => cd.id === clusterId).style("fill-opacity", targetOpacity).style("stroke", connectedClusterBaseStrokeColor).style("stroke-width", connectedClusterBaseStrokeWidth).raise();
                        });
                    }
                    linkPaths.each(function(linkData) {
                        const isConnectedToSelected = (linkData.source.id === selectedNodeId || linkData.target.id === selectedNodeId);
                        const baseWidth = linkWidthScale(linkData.interactionCount);
                        let finalColor, finalOpacity, finalWidth = baseWidth;
                        finalOpacity = linkOpacityScale(linkData.interactionCount);
                        if (isConnectedToSelected) {
                            finalColor = getBaseLinkColor(linkData, selectedNodeId, true);
                            finalWidth = baseWidth + selectedLinkExtraWidth;
                            d3.select(this).raise();
                        } else {
                            const baseSubtleColorWithRandomHue = getBaseLinkColor(linkData, null, false);
                            let hslColor = d3.hsl(baseSubtleColorWithRandomHue);
                            if (hslColor && typeof hslColor.s === 'number') { hslColor.s *= fadedLinkSaturationFactor; finalColor = hslColor.toString(); } 
                            else { finalColor = baseSubtleColorWithRandomHue; }
                            finalOpacity = Math.min(finalOpacity, maxOpacityForFadedNonConnected);
                        }
                        d3.select(this).style("stroke", finalColor).style("stroke-opacity", finalOpacity).attr("stroke-width", finalWidth);
                    });
                    if (window.handleGraphNodeSelection && fullLoadedGraphData) { window.handleGraphNodeSelection(selectedNodeObject, fullLoadedGraphData); }
                } else { 
                    if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                }
            });

            svg.on("click", () => { 
                if (selectedNodeId) {
                    innerG.select(`#node-${sanitizeForDomId(selectedNodeId)} circle`) // Select circle
                        .style("fill", defaultNodeFillColor)
                        .style("stroke", defaultNodeStrokeColor)
                        .style("stroke-width", "1px");
                    innerG.selectAll(".cluster-circle").style("fill-opacity", clusterCircleFillOpacity).style("stroke", clusterCircleStrokeColor).style("stroke-width", 1.5);
                    linkPaths.style("stroke", d => getBaseLinkColor(d, null, false)).style("stroke-opacity", d => linkOpacityScale(d.interactionCount)).attr("stroke-width", d => linkWidthScale(d.interactionCount));
                    selectedNodeId = null;
                    if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                }
            });

            simulation.on("tick", () => {
                clusterData.forEach(cData => {
                    const nodesInThisCluster = cData.nodesInCluster;
                    if (nodesInThisCluster.length === 0) {
                        cData.currentCX = cData.initialCX; cData.currentCY = cData.initialCY;
                        const minPossibleNodeDiameter = nodePrimaryDimensionScale.range()[0];
                        cData.currentR = minPossibleNodeDiameter / 2 + clusterPadding / 2; 
                        return;
                    }
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    nodesInThisCluster.forEach(n => { // Use radius for cluster boundary
                        minX = Math.min(minX, n.x - n.radius); 
                        maxX = Math.max(maxX, n.x + n.radius);
                        minY = Math.min(minY, n.y - n.radius);
                        maxY = Math.max(maxY, n.y + n.radius);
                    });
                    cData.currentCX = (minX + maxX) / 2; cData.currentCY = (minY + maxY) / 2;
                    const spanX = maxX - minX; const spanY = maxY - minY;
                    cData.currentR = Math.max(spanX, spanY) / 2 + clusterPadding;
                    
                    const avgNodeRadiusInCluster = d3.mean(nodesInThisCluster, n => n.radius) || (nodePrimaryDimensionScale.range()[0] / 2);
                    cData.currentR = Math.max(cData.currentR, avgNodeRadiusInCluster + clusterPadding); 
                });
                clusterVisualsGroup.select("circle.cluster-circle").attr("cx", d => d.currentCX).attr("cy", d => d.currentCY).attr("r", d => d.currentR > 0 ? d.currentR : 0);
                clusterVisualsGroup.select("text.cluster-label").attr("x", d => d.currentCX).attr("y", d => d.currentCY - d.currentR - 5); 
                linkPaths.attr("d", d => calculateSCurvePathWithDynamicAnchors(d)); 
                nodeGroups.attr("transform", d => `translate(${d.x}, ${d.y})`);
            });
            graphInitialized = true;
        }).catch(error => { console.error("Error loading or processing graph data:", error); graphInitialized = false; });
    }

    function customClusterRepelForce(clusterDataRef) { 
        function force(alpha) {
            for (let iter = 0; iter < clusterRepulsionIterations; iter++) {
                for (let i = 0; i < clusterDataRef.length; i++) {
                    for (let j = i + 1; j < clusterDataRef.length; j++) {
                        const c1 = clusterDataRef[i]; const c2 = clusterDataRef[j];
                        if (c1.nodesInCluster.length === 0 || c2.nodesInCluster.length === 0 || !c1.currentR || !c2.currentR) continue;
                        const dx = c2.currentCX - c1.currentCX; const dy = c2.currentCY - c1.currentCY;
                        let distance = Math.sqrt(dx * dx + dy * dy);
                        const minDistance = c1.currentR + c2.currentR + minClusterGap;
                        if (distance < minDistance && distance > 1e-6) { 
                            const overlap = minDistance - distance;
                            const unitDx = dx / distance; const unitDy = dy / distance;
                            const push = overlap * 0.5 * clusterRepulsionStrength * alpha;
                            const numNodesC1 = c1.nodesInCluster.length || 1;
                            c1.nodesInCluster.forEach(node => { node.x -= unitDx * push / Math.sqrt(numNodesC1); node.y -= unitDy * push / Math.sqrt(numNodesC1); });
                            const numNodesC2 = c2.nodesInCluster.length || 1;
                            c2.nodesInCluster.forEach(node => { node.x += unitDx * push / Math.sqrt(numNodesC2); node.y += unitDy * push / Math.sqrt(numNodesC2); });
                        }
                    }
                }
            }
        }
        force.initialize = function(nodesPassedByD3) { }; return force;
    }

    function calculateSCurvePathWithDynamicAnchors(linkData) {
        const sourceNode = linkData.source; const targetNode = linkData.target;
        // Ensure nodes and their positions/radii are defined
        if (!sourceNode || !targetNode || 
            typeof sourceNode.x !== 'number' || typeof sourceNode.y !== 'number' || typeof sourceNode.radius !== 'number' ||
            typeof targetNode.x !== 'number' || typeof targetNode.y !== 'number' || typeof targetNode.radius !== 'number') { 
            return ""; 
        }

        if (linkData.bidirectional) { 
            return `M${sourceNode.x},${sourceNode.y}L${targetNode.x},${targetNode.y}`; 
        }
        
        const dxTotal = targetNode.x - sourceNode.x; 
        const dyTotal = targetNode.y - sourceNode.y;
        const distTotal = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);

        let sx, sy, tx, ty;

        if (distTotal === 0) { // Nodes are at the same position, draw a tiny line or nothing
            return `M${sourceNode.x},${sourceNode.y}L${targetNode.x},${targetNode.y}`;
        }

        // Calculate anchor points on the circumference of the circles
        sx = sourceNode.x + (dxTotal / distTotal) * sourceNode.radius;
        sy = sourceNode.y + (dyTotal / distTotal) * sourceNode.radius;
        tx = targetNode.x - (dxTotal / distTotal) * targetNode.radius;
        ty = targetNode.y - (dyTotal / distTotal) * targetNode.radius;
        
        const dx = tx - sx; const dy = ty - sy;
        if (sCurveCurvinessFactor < -0.9 || (Math.abs(dx) < 1 && Math.abs(dy) < 1)) return `M${sx},${sy}L${tx},${ty}`;
        let cp1x, cp1y, cp2x, cp2y;
        // S-curve logic can remain similar, using the adjusted sx, sy, tx, ty
        if (Math.abs(dx) >= Math.abs(dy) || Math.abs(dx) > 10) { let curve = dx * sCurveCurvinessFactor; cp1x = sx + curve; cp1y = sy; cp2x = tx - curve; cp2y = ty; }
        else if (Math.abs(dy) > 10) { let curve = dy * sCurveCurvinessFactor; cp1x = sx; cp1y = sy + curve; cp2x = tx; cp2y = ty - curve; }
        else { return `M${sx},${sy}L${tx},${ty}`; }
        return `M${sx},${sy}C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
    }

    function nodeDragBehavior(simulationInstance) {
        function dragstarted(event, d) { if (!event.active) simulationInstance.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; event.sourceEvent.stopPropagation(); }
        function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
        function dragended(event, d) { if (!event.active) simulationInstance.alphaTarget(0); } 
        return d3.drag().filter(event => event.button === 0).on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }

    initializeOrUpdateGraph(); 
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { initializeOrUpdateGraph(); }, 250); });
    let visibilityChangeTimeout;
    document.addEventListener('visibilitychange', () => {
        clearTimeout(visibilityChangeTimeout);
        if (document.visibilityState === 'visible') {
            requestAnimationFrame(() => { visibilityChangeTimeout = setTimeout(() => { initializeOrUpdateGraph(); }, 10); });
        }
    });
});