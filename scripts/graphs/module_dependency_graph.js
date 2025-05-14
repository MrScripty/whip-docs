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
    const defaultNodeStrokeColor = "#333";
    const defaultNodeFillColor = "#f0f0f0";
    const sCurveCurvinessFactor = 1; // Controls S-curve "bulge" (0 for straight, ~0.5 for noticeable S)

    const outgoingLinkColor = "green";
    const incomingLinkColor = "red";
    const bidirectionalSelectedLinkColor = "purple";
    const defaultLinkColor = "#999";
    const nonConnectedLinkOpacity = 0.2;


    let svg, innerG, currentZoomTransform;
    let fullLoadedGraphData = null;
    let currentLayoutedNodes = [];
    let currentLayoutedEdges = [];

    // Initialize ELK layout engine
    const elk = new ELK({
        // Default layout options for ELK. Can be overridden per element.
        defaultLayoutOptions: {
            'elk.algorithm': 'layered', // Use the layered (Sugiyama-style) algorithm
            'elk.direction': 'RIGHT',   // Layout from Left to Right
            'elk.spacing.nodeNode': '40.0', // Vertical spacing between nodes in same layer
            'elk.layered.spacing.nodeNodeBetweenLayers': '70.0', // Horizontal spacing between layers
            'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', // Or 'BRANDES_KOEPF' or 'SIMPLE'
            'elk.layered.cycleBreaking.strategy': 'GREEDY',
            // 'elk.edgeRouting': 'ORTHOGONAL', // Try 'POLYLINE' or 'SPLINES' for smoother routes
            'elk.padding': '[top=20,left=20,bottom=20,right=20]', // Padding around the whole graph
            'elk.layered.spacing.edgeNode': '15.0', // Spacing between edge and node border
            'elk.layered.mergeEdges': 'true', // If multiple edges between same nodes, merge them visually (can simplify)
        }
    });

    function initializeOrUpdateGraph() {
        const containerWidth = graphContainerElement.clientWidth;
        const containerHeight = graphContainerElement.clientHeight;

        d3.select(graphContainerElement).select("svg").remove();

        svg = d3.select(graphContainerElement)
            .append("svg")
            .attr("width", containerWidth)
            .attr("height", containerHeight);

        innerG = svg.append("g");

        const zoom = d3.zoom()
            .scaleExtent([0.05, 4]) // Adjusted min scale for potentially larger ELK layouts
            .filter(event => {
                if (event.type === "wheel") return true;
                if (event.type === "mousedown" && event.button === 0) {
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
                // ... error handling ...
                return;
            }
            fullLoadedGraphData = loadedData;

            // --- Filtering (same as before) ---
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
            const processedLinksInput = [];
            const processedEdgePairs = new Set();
            for (const edge1 of rawFilteredEdges) {
                const pairKey1 = `${edge1.source}|${edge1.target}`;
                const pairKey2 = `${edge1.target}|${edge1.source}`;
                if (processedEdgePairs.has(pairKey1) || processedEdgePairs.has(pairKey2)) continue;
                const reverseEdge = rawFilteredEdges.find(edge2 => edge2.source === edge1.target && edge2.target === edge1.source);
                if (reverseEdge) {
                    processedLinksInput.push({ id: `edge-${edge1.source}-to-${edge1.target}-bi`, sources: [edge1.source], targets: [edge1.target], bidirectional: true, originalData: { ...edge1, reverseInteractions: reverseEdge.interactions } });
                    processedEdgePairs.add(pairKey1); processedEdgePairs.add(pairKey2);
                } else {
                    processedLinksInput.push({ id: `edge-${edge1.source}-to-${edge1.target}`, sources: [edge1.source], targets: [edge1.target], bidirectional: false, originalData: edge1 });
                    processedEdgePairs.add(pairKey1);
                }
            }

            const displayNodesInput = filteredNodes;

            if (displayNodesInput.length === 0) {
                // ... empty graph handling ...
                return;
            }

            // --- Prepare graph data for ELK ---
            const elkGraph = {
                id: "root",
                layoutOptions: { // Can override defaultLayoutOptions here if needed for the root
                    // 'elk.algorithm': 'mrtree', // Example: if you wanted a tree layout
                },
                children: displayNodesInput.map(node => ({
                    id: node.id,
                    width: nodeWidth,
                    height: nodeHeight,
                    // layoutOptions: { 'elk.portConstraints': 'FIXED_ORDER' }, // Example for port constraints
                    originalData: node // Keep original data
                })),
                edges: processedLinksInput.map(link => ({
                    id: link.id, // ELK needs edge IDs
                    sources: link.sources,   // ELK expects arrays for sources/targets
                    targets: link.targets,
                    bidirectional: link.bidirectional, // Custom property we'll use
                    originalData: link.originalData  // Keep original data
                }))
            };

            // --- Run ELK Layout ---
            elk.layout(elkGraph)
                .then(layoutedGraph => {
                    currentLayoutedNodes = layoutedGraph.children || [];
                    currentLayoutedEdges = layoutedGraph.edges || [];

                    // --- Render with D3 using ELK's layout ---
                    renderGraph(currentLayoutedNodes, currentLayoutedEdges, containerWidth, containerHeight, zoom);
                    console.log("ELK.js graph rendered.");
                })
                .catch(error => {
                    console.error("ELK layout error:", error);
                    graphContainerElement.innerHTML = `<p>Error during graph layout: ${error.message}</p>`;
                    if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
                });

        }).catch(function (error) { /* ... error handling ... */ });
    }

    function renderGraph(nodesData, edgesData, currentWidth, currentHeight, zoomBehavior) {
        // --- Arrowhead Definitions ---
        // (Make sure these are appended to the current svg, not a new one if re-rendering)
        const defs = svg.select("defs").node() ? svg.select("defs") : svg.append("defs");
        defs.selectAll("marker").remove(); // Clear old markers

        defs.append("marker")
            .attr("id", "arrowhead-elk").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
            .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
            .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", defaultLinkColor);
        // ... Add other arrowheads (outgoing, incoming, bidirectional, selected versions) ...
        defs.append("marker")
            .attr("id", "arrowhead-elk-outgoing").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
            .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
            .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", outgoingLinkColor);
        defs.append("marker")
            .attr("id", "arrowhead-elk-incoming").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
            .attr("orient", "auto-start-reverse").attr("markerWidth", 6).attr("markerHeight", 6)
            .append("svg:path").attr("d", "M0,-5L10,0L0,5").attr("fill", incomingLinkColor);
        defs.append("marker")
            .attr("id", "arrowhead-elk-bidirectional").attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
            .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
            .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", defaultLinkColor);
        defs.append("marker")
            .attr("id", "arrowhead-elk-bidirectional-selected").attr("viewBox", "-5 -5 10 10").attr("refX", 0).attr("refY", 0)
            .attr("orient", "auto").attr("markerWidth", 7).attr("markerHeight", 7)
            .append("circle").attr("cx", 0).attr("cy", 0).attr("r", 3.5).attr("fill", bidirectionalSelectedLinkColor);


        // --- Draw Links ---
        linkPaths = innerG.append("g").attr("class", "links")
            .selectAll("path").data(edgesData).join("path")
            .attr("class", "link")
            .style("stroke", defaultLinkColor)
            .style("stroke-opacity", 1)
            .attr("stroke-width", "1.5px")
            .attr("fill", "none")
            .attr("marker-end", d => d.bidirectional ? "url(#arrowhead-elk-bidirectional)" : "url(#arrowhead-elk)")
            .attr("d", d => calculateElkEdgePath(d, nodesData));

        // --- Draw Nodes ---
        nodeGroups = innerG.append("g").attr("class", "nodes")
            .selectAll("g.node-group").data(nodesData).join("g")
            .attr("class", "node-group")
            .attr("id", d => `node-${CSS.escape(d.id)}`) // For selection
            .attr("transform", d => `translate(${d.x || 0}, ${d.y || 0})`); // ELK provides x,y for top-left

        nodeGroups.append("rect")
            .attr("width", d => d.width || nodeWidth)
            .attr("height", d => d.height || nodeHeight)
            .attr("rx", 3).attr("ry", 3)
            .style("fill", defaultNodeFillColor).style("stroke", defaultNodeStrokeColor).style("stroke-width", "1.5px");

        nodeGroups.append("text")
            .attr("x", d => (d.width || nodeWidth) / 2)
            .attr("y", d => (d.height || nodeHeight) / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle").style("font-size", "10px").style("fill", "#000")
            .text(d => d.originalData.label || d.id);


        // --- Node Selection and Interaction ---
        let selectedNodeId = null;
        nodeGroups.on("click", function (event, clickedNodeData) {
            event.stopPropagation();
            const previouslySelectedNodeId = selectedNodeId;
            selectedNodeId = (selectedNodeId === clickedNodeData.id) ? null : clickedNodeData.id;

            // Reset previous
            if (previouslySelectedNodeId) {
                innerG.select(`#node-${CSS.escape(previouslySelectedNodeId)} rect`)
                    .style("stroke", defaultNodeStrokeColor).style("stroke-width", "1.5px");
            }
            // Reset all links
            linkPaths
                .style("stroke", defaultLinkColor).style("stroke-opacity", 1)
                .style("stroke-width", "1.5px")
                .attr("marker-end", d => d.bidirectional ? "url(#arrowhead-elk-bidirectional)" : "url(#arrowhead-elk)");

            if (selectedNodeId) {
                const selectedNodeD3 = innerG.select(`#node-${CSS.escape(selectedNodeId)}`);
                selectedNodeD3.select("rect")
                    .style("stroke", nodeSelectedStrokeColor).style("stroke-width", nodeSelectedStrokeWidth + "px");
                selectedNodeD3.raise();

                // Style connected edges
                linkPaths.each(function(edgeData) {
                    const isBidirectional = edgeData.bidirectional;
                    // ELK edges have sources/targets as arrays of IDs
                    const isOutgoing = edgeData.sources[0] === selectedNodeId;
                    const isIncoming = edgeData.targets[0] === selectedNodeId;

                    if (isOutgoing || isIncoming) {
                        d3.select(this).raise();
                        if (isBidirectional) {
                            d3.select(this).style("stroke", bidirectionalSelectedLinkColor)
                               .attr("marker-end", "url(#arrowhead-elk-bidirectional-selected)");
                        } else if (isOutgoing) {
                            d3.select(this).style("stroke", outgoingLinkColor)
                               .attr("marker-end", "url(#arrowhead-elk-outgoing)");
                        } else { // isIncoming
                            d3.select(this).style("stroke", incomingLinkColor)
                               .attr("marker-end", "url(#arrowhead-elk-incoming)");
                        }
                        d3.select(this).style("stroke-opacity", 1).style("stroke-width", "2.5px");
                    } else {
                        d3.select(this).style("stroke-opacity", nonConnectedLinkOpacity);
                    }
                });

                if (window.handleGraphNodeSelection && fullLoadedGraphData) {
                    const nodeOriginalData = nodesData.find(n => n.id === selectedNodeId)?.originalData;
                    window.handleGraphNodeSelection(nodeOriginalData, fullLoadedGraphData);
                }
            } else { // Deselected
                if (window.handleGraphNodeSelection) window.handleGraphNodeSelection(null, null);
            }
        });
        svg.on("click", () => { /* ... deselect logic ... */ });


        // --- Initial Zoom/Pan to fit graph ---
        // Calculate bounding box of the layouted graph
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        nodesData.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.width);
            maxY = Math.max(maxY, n.y + n.height);
        });
        if (nodesData.length > 0) {
            const graphActualWidth = maxX - minX;
            const graphActualHeight = maxY - minY;
            const padding = 50;

            const scaleX = (currentWidth - padding * 2) / graphActualWidth;
            const scaleY = (currentHeight - padding * 2) / graphActualHeight;
            const initialScale = Math.min(scaleX, scaleY, 1.5); // Cap max initial zoom

            const translateX = -minX * initialScale + (currentWidth - graphActualWidth * initialScale) / 2;
            const translateY = -minY * initialScale + (currentHeight - graphActualHeight * initialScale) / 2;

            currentZoomTransform = d3.zoomIdentity.translate(translateX, translateY).scale(initialScale);
            svg.call(zoomBehavior.transform, currentZoomTransform);
            innerG.attr("transform", currentZoomTransform);
        }
    }


    // --- ELK Edge Path Calculation Function ---
    function calculateElkEdgePath(edge, nodesData) {
        if (!edge.sections || edge.sections.length === 0) {
            // Fallback if no sections (shouldn't happen with ELK layered)
            const sourceNode = nodesData.find(n => n.id === edge.sources[0]);
            const targetNode = nodesData.find(n => n.id === edge.targets[0]);
            if (!sourceNode || !targetNode) return "";
            return `M${sourceNode.x + sourceNode.width / 2},${sourceNode.y + sourceNode.height / 2}L${targetNode.x + targetNode.width / 2},${targetNode.y + targetNode.height / 2}`;
        }

        let pathString = "";
        const sections = edge.sections;

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];
            let startPoint = { x: section.startX, y: section.startY };
            let endPoint = { x: section.endX, y: section.endY };

            // Adjust start/end points to connect to node sides for the first/last section
            const sourceNode = nodesData.find(n => n.id === edge.sources[0]);
            const targetNode = nodesData.find(n => n.id === edge.targets[0]);

            if (i === 0 && sourceNode) { // First segment
                startPoint.x = sourceNode.x + sourceNode.width; // Right side of source
                startPoint.y = sourceNode.y + sourceNode.height / 2;
            }
            if (i === sections.length - 1 && targetNode) { // Last segment
                endPoint.x = targetNode.x; // Left side of target
                endPoint.y = targetNode.y + targetNode.height / 2;
            }


            if (i === 0) {
                pathString += `M${startPoint.x},${startPoint.y}`;
            }

            const bendPoints = section.bendPoints || [];
            let currentPoint = startPoint;

            if (bendPoints.length === 0) { // Straight line or S-curve for this segment
                pathString += createPathSegment(currentPoint, endPoint, edge.bidirectional);
            } else {
                // S-curve to first bend point
                pathString += createPathSegment(currentPoint, bendPoints[0], edge.bidirectional);
                currentPoint = bendPoints[0];

                // Straight lines between bend points
                for (let j = 1; j < bendPoints.length; j++) {
                    pathString += `L${bendPoints[j].x},${bendPoints[j].y}`;
                    currentPoint = bendPoints[j];
                }
                // S-curve from last bend point to end point
                pathString += createPathSegment(currentPoint, endPoint, edge.bidirectional);
            }
        }
        return pathString;
    }

    function createPathSegment(p1, p2, isBidirectional) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        // For very short segments or if curviness is off, draw straight line
        if (Math.abs(dx) < 10 || sCurveCurvinessFactor <= 0) {
            return `L${p2.x},${p2.y}`;
        }

        // Adjust curvinessFactor based on dx for S-curve
        // Control points are offset horizontally.
        let curve = dx * sCurveCurvinessFactor;

        // If it's a bidirectional link, we might want a different curve style or straight
        // For now, treat them the same for S-curve calculation if not straight
        // if (isBidirectional) curve = dx * 0.1; // Flatter curve for bi

        const cp1x = p1.x + curve;
        const cp1y = p1.y; // Keep y same for horizontal S
        const cp2x = p2.x - curve;
        const cp2y = p2.y; // Keep y same

        return `C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }

    initializeOrUpdateGraph();
    // ... (resize listener remains the same) ...
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            console.log("Window resized, re-initializing graph.");
            initializeOrUpdateGraph();
        }, 250);
    });
});