document.addEventListener('DOMContentLoaded', function () {
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
    const nodeSelectedStrokeColor = "dodgerblue";
    const nodeSelectedStrokeWidth = 3;
    const defaultNodeStrokeColor = "#333"; // For dagre-d3
    const defaultNodeFillColor = "#f0f0f0"; // For dagre-d3
    const sCurveCurviness = 0.5; // 0 for less curve, 1 for more (approx)

    // Colors for selected links (consistent with tree.js if possible)
    const outgoingLinkColor = "green";
    const incomingLinkColor = "red";
    const bidirectionalSelectedLinkColor = "purple";
    const defaultLinkColor = "#999";
    const nonConnectedLinkOpacity = 0.2;


    let svg, innerG, currentZoomTransform;
    let fullLoadedGraphData = null; // To store the complete unfiltered data for the tree
    let dagreGraph; // To store the dagre graph object

    function initializeOrUpdateGraph() {
        const containerWidth = graphContainerElement.clientWidth;
        const containerHeight = graphContainerElement.clientHeight;

        d3.select(graphContainerElement).select("svg").remove(); // Clear previous SVG

        svg = d3.select(graphContainerElement)
            .append("svg")
            .attr("width", containerWidth)
            .attr("height", containerHeight);

        innerG = svg.append("g"); // Group for zoomable/pannable content

        // Set up zoom
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .filter(event => {
                if (event.type === "wheel") return true;
                if (event.type === "mousedown" && event.button === 0) { // Left click pan
                    return event.target === svg.node() || event.target === innerG.node();
                }
                return false;
            })
            .on("zoom", (event) => {
                currentZoomTransform = event.transform;
                innerG.attr("transform", currentZoomTransform);
            });
        svg.call(zoom);


        d3.json(graphDataPath).then(function (loadedData) {
            if (!loadedData || !loadedData.nodes || !loadedData.edges) {
                console.error("Invalid graph data format:", loadedData);
                graphContainerElement.innerHTML = "<p>Error: Invalid graph data loaded.</p>";
                return;
            }
            fullLoadedGraphData = loadedData; // Store for tree interaction

            // --- Filtering ---
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
            // Process for bidirectional (same as before)
            const processedLinks = [];
            const processedEdgePairs = new Set();
            for (const edge1 of rawFilteredEdges) {
                const pairKey1 = `${edge1.source}|${edge1.target}`;
                const pairKey2 = `${edge1.target}|${edge1.source}`;
                if (processedEdgePairs.has(pairKey1) || processedEdgePairs.has(pairKey2)) continue;
                const reverseEdge = rawFilteredEdges.find(edge2 => edge2.source === edge1.target && edge2.target === edge1.source);
                if (reverseEdge) {
                    processedLinks.push({ source: edge1.source, target: edge1.target, bidirectional: true, interactions: edge1.interactions || [], reverseInteractions: reverseEdge.interactions || [] });
                    processedEdgePairs.add(pairKey1); processedEdgePairs.add(pairKey2);
                } else {
                    processedLinks.push({ source: edge1.source, target: edge1.target, bidirectional: false, interactions: edge1.interactions || [] });
                    processedEdgePairs.add(pairKey1);
                }
            }

            const displayNodes = filteredNodes;
            const displayLinks = processedLinks;

            if (displayNodes.length === 0) {
                console.warn("No nodes remaining after filtering.");
                graphContainerElement.innerHTML = "<p>No data to display after filtering.</p>";
                if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                return;
            }

            // --- Create a new Dagre graph ---
            dagreGraph = new dagre.graphlib.Graph({ compound: true }); // compound for potential future groups
            dagreGraph.setGraph({
                rankdir: "LR", // Left to Right layout
                nodesep: 10,   // pixels
                ranksep: 100,   // pixels
                marginx: 0,
                marginy: 0
            });
            dagreGraph.setDefaultEdgeLabel(() => ({})); // Default empty label for edges

            // Add nodes to Dagre graph
            displayNodes.forEach(node => {
                dagreGraph.setNode(node.id, {
                    label: node.label || node.id,
                    width: nodeWidth,
                    height: nodeHeight,
                    // Store original data for access later
                    originalData: node
                });
            });

            // Add edges to Dagre graph
            displayLinks.forEach(link => {
                dagreGraph.setEdge(link.source, link.target, {
                    // Dagre-D3 uses 'label' for edge text, we don't have one here
                    // We can store original link data if needed
                    bidirectional: link.bidirectional,
                    originalData: link
                });
            });

            // Run the layout
            dagre.layout(dagreGraph);

            // --- Render with D3 using Dagre's layout ---
            // Create the renderer
            const render = new dagreD3.render();

            // Run the renderer. This is what draws the graph.
            render(innerG, dagreGraph);


            // --- Customizations after dagre-d3 render ---
            // Style nodes (rectangles and text)
            innerG.selectAll("g.node")
                .each(function(nodeId) {
                    const nodeData = dagreGraph.node(nodeId).originalData;
                    d3.select(this).select("rect")
                        .style("fill", defaultNodeFillColor)
                        .style("stroke", defaultNodeStrokeColor);
                    // dagre-d3 creates text inside a 'tspan' within a 'text' element
                    d3.select(this).select("text > tspan")
                        .style("font-size", "10px")
                        .style("fill", "#000");
                });

            // Style edges (paths) and define custom S-curve path
            innerG.selectAll("g.edgePath path.path") // dagre-d3 creates paths with class 'path'
                .each(function(edgeObj) { // edgeObj is {v: sourceId, w: targetId}
                    const edgeData = dagreGraph.edge(edgeObj.v, edgeObj.w);
                    d3.select(this)
                        .style("stroke", defaultLinkColor)
                        .style("stroke-width", "1.5px")
                        .style("fill", "none")
                        .attr("marker-end", edgeData.bidirectional ? "url(#arrowhead-bidirectional-dagre)" : "url(#arrowhead-dagre)")
                        .attr("d", function() {
                            // Get points from dagre's layout for this edge
                            const points = edgeData.points;
                            if (!points || points.length < 2) return "";

                            const sourceNode = dagreGraph.node(edgeObj.v);
                            const targetNode = dagreGraph.node(edgeObj.w);

                            let sx = points[0].x;
                            let sy = points[0].y;
                            let tx = points[points.length - 1].x;
                            let ty = points[points.length - 1].y;

                            // Adjust start/end points to be on the node sides
                            // Dagre points are usually center of node or edge of label box
                            if (!edgeData.bidirectional) {
                                sx = sourceNode.x + sourceNode.width / 2; // Right side of source
                                sy = sourceNode.y; // Middle of source (y is center for dagre nodes)
                                tx = targetNode.x - targetNode.width / 2; // Left side of target
                                ty = targetNode.y; // Middle of target
                            } else {
                                // For bidirectional, keep dagre's points or simplify
                                // This part might need more refinement for perfect S-curves
                                sx = sourceNode.x;
                                sy = sourceNode.y + sourceNode.height / 2;
                                tx = targetNode.x;
                                ty = targetNode.y - targetNode.height / 2;
                            }


                            const dx = tx - sx;
                            // const dy = ty - sy; // Not used in this S-curve version

                            if (sCurveCurviness <= -1 || Math.abs(dx) < 10) { // Straight line if too close or curviness is -1
                                return `M${sx},${sy}L${tx},${ty}`;
                            }
                            let curvinessFactor = dx * (0.1 + Math.max(0, sCurveCurviness) * 0.4);
                            const cp1x = sx + curvinessFactor;
                            const cp1y = sy;
                            const cp2x = tx - curvinessFactor;
                            const cp2y = ty;
                            return `M${sx},${sy}C${cp1x},${cp1y} ${cp2x},${cp2y} ${tx},${ty}`;
                        });
                });


            // --- Arrowhead definitions for Dagre ---
            // Dagre-D3 might position arrowheads differently, so adjust refX/Y if needed
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-dagre")
                .attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0) // refX might need to be smaller
                .attr("orient", "auto").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", defaultLinkColor);

            svg.append("defs").append("marker")
                .attr("id", "arrowhead-bidirectional-dagre")
                .attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
                .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", defaultLinkColor);
            // Add selected arrowheads
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-dagre-outgoing").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", outgoingLinkColor);
            svg.append("defs").append("marker")
                .attr("id", "arrowhead-dagre-incoming").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 6).attr("markerHeight", 6)
                .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", incomingLinkColor);
             svg.append("defs").append("marker")
                .attr("id", "arrowhead-bidirectional-dagre-selected").attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
                .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
                .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", bidirectionalSelectedLinkColor);


            // --- Node Selection and Interaction ---
            let selectedNodeId = null;
            innerG.selectAll("g.node")
                .on("click", function (event, nodeId) {
                    event.stopPropagation();
                    const previouslySelectedNodeId = selectedNodeId;
                    selectedNodeId = (selectedNodeId === nodeId) ? null : nodeId;

                    // Reset previous
                    if (previouslySelectedNodeId) {
                        innerG.select(`g.node[id='${CSS.escape(previouslySelectedNodeId)}'] rect`) // Use CSS.escape for IDs with special chars
                            .style("stroke", defaultNodeStrokeColor)
                            .style("stroke-width", "1.5px");
                    }
                    // Reset all links
                    innerG.selectAll("g.edgePath path.path")
                        .style("stroke", defaultLinkColor)
                        .style("stroke-opacity", 1) // Reset opacity
                        .style("stroke-width", "1.5px")
                        .attr("marker-end", function() {
                            const edgeData = dagreGraph.edge(d3.select(this.parentNode).datum());
                            return edgeData.bidirectional ? "url(#arrowhead-bidirectional-dagre)" : "url(#arrowhead-dagre)";
                        });


                    if (selectedNodeId) {
                        const selectedNodeD3 = innerG.select(`g.node[id='${CSS.escape(selectedNodeId)}']`);
                        selectedNodeD3.select("rect")
                            .style("stroke", nodeSelectedStrokeColor)
                            .style("stroke-width", nodeSelectedStrokeWidth + "px");
                        selectedNodeD3.raise(); // Bring selected node to front

                        // Style connected edges
                        innerG.selectAll("g.edgePath path.path")
                            .each(function() {
                                const edgeD3Data = d3.select(this.parentNode).datum(); // {v: sourceId, w: targetId}
                                const edgeLayoutData = dagreGraph.edge(edgeD3Data.v, edgeD3Data.w);
                                const isBidirectional = edgeLayoutData.bidirectional;
                                const isOutgoing = edgeD3Data.v === selectedNodeId;
                                const isIncoming = edgeD3Data.w === selectedNodeId;

                                if (isOutgoing || isIncoming) {
                                    d3.select(this).raise();
                                    if (isBidirectional) {
                                        d3.select(this).style("stroke", bidirectionalSelectedLinkColor)
                                           .attr("marker-end", "url(#arrowhead-bidirectional-dagre-selected)");
                                    } else if (isOutgoing) {
                                        d3.select(this).style("stroke", outgoingLinkColor)
                                           .attr("marker-end", "url(#arrowhead-dagre-outgoing)");
                                    } else { // isIncoming
                                        d3.select(this).style("stroke", incomingLinkColor)
                                           .attr("marker-end", "url(#arrowhead-dagre-incoming)");
                                    }
                                    d3.select(this).style("stroke-opacity", 1).style("stroke-width", "2.5px");
                                } else {
                                    d3.select(this).style("stroke-opacity", nonConnectedLinkOpacity);
                                }
                            });

                        if (window.handleGraphNodeSelection && fullLoadedGraphData) {
                            const nodeOriginalData = dagreGraph.node(selectedNodeId).originalData;
                            window.handleGraphNodeSelection(nodeOriginalData, fullLoadedGraphData);
                        }
                    } else { // Deselected
                        if (window.handleGraphNodeSelection) {
                            window.handleGraphNodeSelection(null, null);
                        }
                    }
                });

            svg.on("click", () => { // Click on SVG background to deselect
                if (selectedNodeId) {
                    innerG.select(`g.node[id='${CSS.escape(selectedNodeId)}'] rect`)
                        .style("stroke", defaultNodeStrokeColor)
                        .style("stroke-width", "1.5px");
                    innerG.selectAll("g.edgePath path.path")
                        .style("stroke", defaultLinkColor)
                        .style("stroke-opacity", 1)
                        .style("stroke-width", "1.5px")
                        .attr("marker-end", function() {
                            const edgeData = dagreGraph.edge(d3.select(this.parentNode).datum());
                            return edgeData.bidirectional ? "url(#arrowhead-bidirectional-dagre)" : "url(#arrowhead-dagre)";
                        });
                    selectedNodeId = null;
                    if (window.handleGraphNodeSelection) {
                        window.handleGraphNodeSelection(null, null);
                    }
                }
            });


            // Center the graph initially
            const graphInitialWidth = dagreGraph.graph().width;
            const graphInitialHeight = dagreGraph.graph().height;
            const initialScale = Math.min(containerWidth / (graphInitialWidth + 50), containerHeight / (graphInitialHeight + 50), 1); // Add padding
            const initialTranslateX = (containerWidth - graphInitialWidth * initialScale) / 2;
            const initialTranslateY = (containerHeight - graphInitialHeight * initialScale) / 2;

            currentZoomTransform = d3.zoomIdentity.translate(initialTranslateX, initialTranslateY).scale(initialScale);
            svg.call(zoom.transform, currentZoomTransform);
            innerG.attr("transform", currentZoomTransform); // Apply initial transform

            console.log("Dagre-D3 graph rendered.");

        }).catch(function (error) {
            console.error('Error loading or processing graph data:', error);
            graphContainerElement.innerHTML = `<p>Error loading module graph data: ${error.message}</p>`;
            if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
        });
    }

    initializeOrUpdateGraph();

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Window resized, re-initializing graph.");
            initializeOrUpdateGraph(); // Re-layout and re-render
        }, 250);
    });
});