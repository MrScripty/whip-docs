// /scripts/graphs/module_dependency_graph.js
document.addEventListener('DOMContentLoaded', function () {
    // ... (keep existing code from the start of the file) ...
    const graphContainerId = 'module-graph-area';
    const graphContainerElement = document.getElementById(graphContainerId);

    if (!graphContainerElement) {
        console.error(`Graph container #${graphContainerId} not found.`);
        return;
    }

    const graphDataPath = graphContainerElement.dataset.graphSrc;
    const ignoreFilesAttribute = graphContainerElement.dataset.ignoreFiles || "";
    const filesToIgnore = ignoreFilesAttribute.split(',').map(s => s.trim()).filter(s => s.length > 0);

    if (!graphDataPath) {
        console.error("`data-graph-src` attribute not found on graph container.");
        graphContainerElement.innerHTML = "<p>Error: Graph data source not specified.</p>";
        return;
    }
    console.log("Graph data source:", graphDataPath);
    console.log("Files to ignore:", filesToIgnore);

    const nodeWidth = 150;
    const nodeHeight = 30;
    const linkStrokeColor = "#999"; // Default link color
    const linkStrokeOpacity = 0.6; // Default link opacity
    const linkStrokeWidth = 1.5;   // Default link width
    const nodeFillColor = "#f0f0f0";
    const nodeStrokeColor = "#333";
    const nodeSelectedStrokeColor = "dodgerblue";
    const nodeSelectedStrokeWidth = 3;
    const textColor = "#000";
    const fontSize = "10px";

    // Colors for selected links (consistent with tree.js if possible)
    const outgoingLinkColor = "green";
    const incomingLinkColor = "red";
    const bidirectionalSelectedLinkColor = "purple";

    // For non-selected edges when a node is selected
    const nonConnectedLinkOpacity = 0.15; // Lower opacity for non-connected
    const nonConnectedLinkWidth = 1.0;   // Thinner for non-connected

    let svg, g, simulation, linkPaths, nodeGroups;
    let currentWidth = graphContainerElement.clientWidth;
    let currentHeight = graphContainerElement.clientHeight;
    let fullLoadedGraphData = null;

    function initializeOrUpdateGraph() {
        currentWidth = graphContainerElement.clientWidth;
        currentHeight = graphContainerElement.clientHeight;

        d3.select(graphContainerElement).select("svg").remove();

        svg = d3.select(graphContainerElement)
            .append("svg")
            .attr("width", currentWidth)
            .attr("height", currentHeight)
            .attr("viewBox", [0, 0, currentWidth, currentHeight])
            .style("display", "block");

        g = svg.append("g");

        d3.json(graphDataPath).then(function (loadedData) {
            if (!loadedData || !loadedData.nodes || !loadedData.edges) {
                console.error("Invalid graph data format:", loadedData);
                graphContainerElement.innerHTML = "<p>Error: Invalid graph data loaded.</p>";
                return;
            }
            fullLoadedGraphData = loadedData;

            let originalNodes = fullLoadedGraphData.nodes;
            let originalEdges = fullLoadedGraphData.edges;

            let filteredNodes = originalNodes.filter(node => {
                const fileName = node.label || node.id.split('/').pop();
                return !filesToIgnore.includes(fileName);
            });
            const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

            let rawFilteredEdges = originalEdges.filter(edge =>
                filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
            );

            const processedLinks = [];
            const processedEdgePairs = new Set();

            for (const edge1 of rawFilteredEdges) {
                const pairKey1 = `${edge1.source}|${edge1.target}`;
                const pairKey2 = `${edge1.target}|${edge1.source}`;

                if (processedEdgePairs.has(pairKey1) || processedEdgePairs.has(pairKey2)) {
                    continue;
                }

                const reverseEdge = rawFilteredEdges.find(
                    edge2 => edge2.source === edge1.target && edge2.target === edge1.source
                );

                if (reverseEdge) {
                    processedLinks.push({
                        source: edge1.source,
                        target: edge1.target,
                        bidirectional: true,
                        interactions: edge1.interactions || [],
                        reverseInteractions: reverseEdge.interactions || []
                    });
                    processedEdgePairs.add(pairKey1);
                    processedEdgePairs.add(pairKey2);
                } else {
                    processedLinks.push({
                        source: edge1.source,
                        target: edge1.target,
                        bidirectional: false,
                        interactions: edge1.interactions || []
                    });
                    processedEdgePairs.add(pairKey1);
                }
            }

            const nodes = filteredNodes.map(d => ({ ...d }));
            const links = processedLinks;

            if (nodes.length === 0) {
                console.warn("No nodes remaining after filtering. Graph will be empty.");
                graphContainerElement.innerHTML = "<p>No data to display after filtering.</p>";
                 if (window.handleGraphNodeSelection) {
                    window.handleGraphNodeSelection(null, null);
                }
                return;
            }

            simulation = d3.forceSimulation(nodes)
                .force("link", d3.forceLink(links).id(d => d.id).distance(130).strength(0.5))
                .force("charge", d3.forceManyBody().strength(-400))
                .force("center", d3.forceCenter(currentWidth / 2, currentHeight / 2))
                .force("collision", d3.forceCollide().radius(nodeWidth / 2 + 20));

            // Arrowhead Definitions (no changes here)
            svg.append("defs").append("marker")
                .attr("id", "arrowhead").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
                .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", linkStrokeColor);
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-outgoing").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
                .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", outgoingLinkColor);
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-incoming").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
                .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", incomingLinkColor);
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-bidirectional").attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
                .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", linkStrokeColor);
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-bidirectional-selected").attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
                .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", bidirectionalSelectedLinkColor);


            linkPaths = g.append("g").attr("class", "links")
                .selectAll("path").data(links).join("path")
                .attr("class", "link")
                .style("stroke", linkStrokeColor)
                .style("stroke-opacity", linkStrokeOpacity)
                .attr("stroke-width", linkStrokeWidth)
                .attr("fill", "none")
                .attr("marker-end", d => d.bidirectional ? "url(#arrowhead-bidirectional)" : "url(#arrowhead)");

            nodeGroups = g.append("g").attr("class", "nodes")
                .selectAll("g.node-group").data(nodes).join("g")
                .attr("class", "node-group");
            nodeGroups.append("rect")
                .attr("width", nodeWidth).attr("height", nodeHeight)
                .attr("rx", 3).attr("ry", 3)
                .attr("fill", nodeFillColor).attr("stroke", nodeStrokeColor).attr("stroke-width", 1.5);
            nodeGroups.append("text")
                .attr("x", nodeWidth / 2).attr("y", nodeHeight / 2).attr("dy", "0.35em")
                .attr("text-anchor", "middle").style("font-size", fontSize).style("fill", textColor)
                .text(d => d.label || d.id);

            let selectedNodeElement = null;
            let selectedNodeData = null;

            nodeGroups.on("click", function (event, d_node) {
                // Reset previous selection visuals
                if (selectedNodeElement) {
                    d3.select(selectedNodeElement).select("rect")
                        .attr("stroke", nodeStrokeColor).attr("stroke-width", 1.5);
                    d3.select(selectedNodeElement).classed("selected", false);
                }
                // Reset all links to default appearance
                linkPaths
                    .style("stroke", linkStrokeColor)
                    .style("stroke-opacity", linkStrokeOpacity)
                    .attr("stroke-width", linkStrokeWidth)
                    .attr("marker-end", d_link => d_link.bidirectional ? "url(#arrowhead-bidirectional)" : "url(#arrowhead)");


                if (selectedNodeElement === this) { // Deselecting
                    selectedNodeElement = null;
                    selectedNodeData = null;
                    if (window.handleGraphNodeSelection) {
                        window.handleGraphNodeSelection(null, null);
                    }
                } else { // Selecting a new node
                    selectedNodeElement = this;
                    selectedNodeData = d_node;
                    d3.select(this).select("rect")
                        .attr("stroke", nodeSelectedStrokeColor).attr("stroke-width", nodeSelectedStrokeWidth);
                    d3.select(this).classed("selected", true);

                    if (window.handleGraphNodeSelection && fullLoadedGraphData) {
                        window.handleGraphNodeSelection(selectedNodeData, fullLoadedGraphData);
                    }

                    // Update link appearances based on selection
                    linkPaths.each(function(d_link) {
                        const isBidirectional = d_link.bidirectional;
                        const isOutgoing = d_link.source.id === selectedNodeData.id;
                        const isIncoming = d_link.target.id === selectedNodeData.id;
                        const isConnected = isOutgoing || isIncoming;

                        if (isConnected) {
                            d3.select(this).raise(); // Bring connected links to front
                            if (isBidirectional) { // This covers cases where selectedNode is source OR target of a bidirectional link
                                d3.select(this)
                                    .style("stroke", bidirectionalSelectedLinkColor)
                                    .style("stroke-opacity", 1)
                                    .attr("stroke-width", linkStrokeWidth + 1) // Extra pixel width
                                    .attr("marker-end", "url(#arrowhead-bidirectional-selected)");
                            } else if (isOutgoing) {
                                d3.select(this)
                                    .style("stroke", outgoingLinkColor)
                                    .style("stroke-opacity", 1)
                                    .attr("stroke-width", linkStrokeWidth + 1) // Extra pixel width
                                    .attr("marker-end", "url(#arrowhead-outgoing)");
                            } else if (isIncoming) {
                                d3.select(this)
                                    .style("stroke", incomingLinkColor)
                                    .style("stroke-opacity", 1)
                                    .attr("stroke-width", linkStrokeWidth + 1) // Extra pixel width
                                    .attr("marker-end", "url(#arrowhead-incoming)");
                            }
                        } else { // Not connected to the selected node
                            d3.select(this)
                                .style("stroke-opacity", nonConnectedLinkOpacity)
                                .attr("stroke-width", nonConnectedLinkWidth)
                                // Keep original marker, but it will be less visible due to opacity
                                .attr("marker-end", d_link.bidirectional ? "url(#arrowhead-bidirectional)" : "url(#arrowhead)");
                        }
                    });
                }
                event.stopPropagation();
            });

            svg.on("click", () => { // Click on SVG background to deselect
                if (selectedNodeElement) {
                     d3.select(selectedNodeElement).select("rect")
                        .attr("stroke", nodeStrokeColor).attr("stroke-width", 1.5);
                    d3.select(selectedNodeElement).classed("selected", false);
                    selectedNodeElement = null;
                    selectedNodeData = null;

                    // Reset all links to default appearance
                    linkPaths
                        .style("stroke", linkStrokeColor)
                        .style("stroke-opacity", linkStrokeOpacity)
                        .attr("stroke-width", linkStrokeWidth)
                        .attr("marker-end", d_link => d_link.bidirectional ? "url(#arrowhead-bidirectional)" : "url(#arrowhead)");

                    if (window.handleGraphNodeSelection) {
                        window.handleGraphNodeSelection(null, null);
                    }
                }
            });

            // ... (simulation.on("tick"), zoomBehavior, nodeDrag remain the same) ...
            simulation.on("tick", () => {
                linkPaths.attr("d", d => {
                    if (typeof d.source === "string" || typeof d.target === "string" ||
                        typeof d.source.x !== 'number' || typeof d.source.y !== 'number' ||
                        typeof d.target.x !== 'number' || typeof d.target.y !== 'number') {
                        return "";
                    }
                    const sx = d.source.x, sy = d.source.y;
                    let tx = d.target.x, ty = d.target.y;
                    const targetNodeHalfWidth = nodeWidth / 2, targetNodeHalfHeight = nodeHeight / 2;
                    const dx_orig = tx - sx, dy_orig = ty - sy;
                    if (Math.abs(dx_orig) < 0.1 && Math.abs(dy_orig) < 0.1) return "";
                    const angle = Math.atan2(dy_orig, dx_orig);
                    let endX, endY;
                    if (Math.abs(dx_orig) < 0.01) {
                        endX = tx; endY = ty + (dy_orig > 0 ? -targetNodeHalfHeight : targetNodeHalfHeight);
                    } else if (Math.abs(dy_orig) < 0.01) {
                        endY = ty; endX = tx + (dx_orig > 0 ? -targetNodeHalfWidth : targetNodeHalfWidth);
                    } else {
                        const tanAngle = Math.abs(dy_orig / dx_orig);
                        const tanNodeAspect = targetNodeHalfHeight / targetNodeHalfWidth;
                        if (tanAngle < tanNodeAspect) {
                            endX = tx + (dx_orig > 0 ? -targetNodeHalfWidth : targetNodeHalfWidth);
                            endY = sy + (endX - sx) * Math.tan(angle);
                        } else {
                            endY = ty + (dy_orig > 0 ? -targetNodeHalfHeight : targetNodeHalfHeight);
                            endX = sx + (endY - sy) / Math.tan(angle);
                        }
                    }
                    tx = endX; ty = endY;
                    const R_final = Math.sqrt(Math.pow(tx - sx, 2) + Math.pow(ty - sy, 2));
                    const dr_final = R_final * 1.5; // Curvature factor
                    if (R_final < 1) return ""; // Avoid issues with tiny links
                    return `M${sx},${sy}A${dr_final},${dr_final} 0 0,1 ${tx},${ty}`;
                });
                nodeGroups.attr("transform", d => {
                    const xPos = typeof d.x === 'number' ? d.x : currentWidth / 2;
                    const yPos = typeof d.y === 'number' ? d.y : currentHeight / 2;
                    return `translate(${xPos - nodeWidth / 2}, ${yPos - nodeHeight / 2})`;
                });
            });

            const zoomBehavior = d3.zoom().scaleExtent([0.1, 8])
                .filter(event => {
                    if (event.type === "wheel") return true; // Allow wheel zoom anywhere
                    // Allow pan (mousedown + drag) only if mousedown is on svg or g, not on a node
                    if (event.type === "mousedown" && event.button === 0) {
                        return event.target === svg.node() || event.target === g.node();
                    }
                    return false;
                })
                .on("zoom", (event) => {
                    g.attr("transform", event.transform);
                });

            svg.call(zoomBehavior)
               .on("dblclick.zoom", null); // Disable double click zoom

            // Drag behavior for nodes
            function nodeDrag(simulationInstance) {
                function dragstarted(event, d) {
                    event.sourceEvent.stopPropagation(); // Prevent triggering SVG click/pan
                    if (!event.active) simulationInstance.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                }
                function dragged(event, d) {
                    d.fx = event.x;
                    d.fy = event.y;
                }
                function dragended(event, d) {
                    if (!event.active) simulationInstance.alphaTarget(0);
                    // Keep fx, fy null if you want them to be free after drag
                    // d.fx = null;
                    // d.fy = null;
                    // If you want them to stay fixed after drag, comment out the above two lines
                }
                return d3.drag()
                    .filter(event => event.button === 0) // Only left mouse button
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended);
            }

            nodeGroups.call(nodeDrag(simulation));

            console.log("D3 graph initialized/updated.");

        }).catch(function (error) {
            console.error('Error loading or processing graph data:', error);
            graphContainerElement.innerHTML = `<p>Error loading module graph data: ${error.message}</p>`;
            if (window.handleGraphNodeSelection) {
                window.handleGraphNodeSelection(null, null);
            }
        });
    }

    initializeOrUpdateGraph();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Window resized, re-initializing graph.");
            initializeOrUpdateGraph();
        }, 250);
    });
});