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
    const linkStrokeColor = "#999";
    const linkStrokeOpacity = 0.6;
    const linkStrokeWidth = 1.5;
    const nodeFillColor = "#f0f0f0";
    const nodeStrokeColor = "#333";
    const nodeSelectedStrokeColor = "dodgerblue";
    const nodeSelectedStrokeWidth = 3;
    const textColor = "#000";
    const fontSize = "10px";

    const width = graphContainerElement.clientWidth;
    const height = graphContainerElement.clientHeight;

    const svg = d3.select(graphContainerElement)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .attr("viewBox", [0, 0, width, height])
        .style("display", "block");

    const g = svg.append("g");

    d3.json(graphDataPath).then(function (graphData) {
        if (!graphData || !graphData.nodes || !graphData.edges) {
            console.error("Invalid graph data format:", graphData);
            graphContainerElement.innerHTML = "<p>Error: Invalid graph data loaded.</p>";
            return;
        }

        let originalNodes = graphData.nodes;
        let originalEdges = graphData.edges;

        let filteredNodes = originalNodes.filter(node => {
            const fileName = node.label || node.id.split('/').pop();
            return !filesToIgnore.includes(fileName);
        });
        const filteredNodeIds = new Set(filteredNodes.map(n => n.id));

        let filteredEdges = originalEdges.filter(edge =>
            filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
        );

        const nodes = filteredNodes.map(d => ({ ...d }));
        const links = filteredEdges.map(d => ({ ...d }));

        console.log(`Original nodes: ${originalNodes.length}, Filtered nodes: ${nodes.length}`);
        console.log(`Original edges: ${originalEdges.length}, Filtered edges: ${links.length}`);

        if (nodes.length === 0) {
            console.warn("No nodes remaining after filtering. Graph will be empty.");
            graphContainerElement.innerHTML = "<p>No data to display after filtering.</p>";
            return;
        }

        console.log("Nodes for simulation:", JSON.stringify(nodes.map(n => n.id)));
        console.log("Links for simulation:", JSON.stringify(links.map(l => ({source: l.source, target: l.target}))));

        links.forEach(link => {
            const sourceNode = nodes.find(n => n.id === link.source);
            const targetNode = nodes.find(n => n.id === link.target);
            if (!sourceNode) {
                console.error(`Link source ID '${link.source}' not found in filtered nodes for link:`, JSON.stringify(link));
            }
            if (!targetNode) {
                console.error(`Link target ID '${link.target}' not found in filtered nodes for link:`, JSON.stringify(link));
            }
        });

        const simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(120).strength(0.4))
            .force("charge", d3.forceManyBody().strength(-350))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(nodeWidth / 2 + 20)); // Increased collision radius slightly

        // Arrowhead Marker Definitions
        svg.append("defs").append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10) // Tip of arrow at the end of the line
            .attr("refY", 0)
            .attr("orient", "auto-start-reverse")
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .append("svg:path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", linkStrokeColor)
            .style("stroke", "none");

        svg.append("defs").append("marker")
            .attr("id", "arrowhead-selected")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 10) // Tip of arrow at the end of the line
            .attr("refY", 0)
            .attr("orient", "auto-start-reverse")
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .append("svg:path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", nodeSelectedStrokeColor)
            .style("stroke", "none");

        const linkPaths = g.append("g")
            .attr("class", "links")
            .selectAll("path")
            .data(links)
            .join("path")
            .attr("class", "link")
            .style("stroke", linkStrokeColor)
            .style("stroke-opacity", linkStrokeOpacity)
            .attr("stroke-width", linkStrokeWidth)
            .attr("fill", "none")
            .attr("marker-end", "url(#arrowhead)");

        const nodeGroups = g.append("g")
            .attr("class", "nodes")
            .selectAll("g.node-group")
            .data(nodes)
            .join("g")
            .attr("class", "node-group");

        nodeGroups.append("rect")
            .attr("width", nodeWidth)
            .attr("height", nodeHeight)
            .attr("rx", 3)
            .attr("ry", 3)
            .attr("fill", nodeFillColor)
            .attr("stroke", nodeStrokeColor)
            .attr("stroke-width", 1.5);

        nodeGroups.append("text")
            .attr("x", nodeWidth / 2)
            .attr("y", nodeHeight / 2)
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .style("font-size", fontSize)
            .style("fill", textColor)
            .text(d => d.label || d.id);

        let selectedNodeElement = null;
        let selectedNodeData = null;

        nodeGroups.on("click", function (event, d_node) {
            if (selectedNodeElement) {
                d3.select(selectedNodeElement).select("rect")
                    .attr("stroke", nodeStrokeColor)
                    .attr("stroke-width", 1.5);
                d3.select(selectedNodeElement).classed("selected", false);
            }

            linkPaths
                .style("stroke", linkStrokeColor)
                .style("stroke-opacity", linkStrokeOpacity)
                .attr("stroke-width", linkStrokeWidth)
                .attr("marker-end", "url(#arrowhead)");

            if (selectedNodeElement === this) {
                selectedNodeElement = null;
                selectedNodeData = null;
            } else {
                selectedNodeElement = this;
                selectedNodeData = d_node;

                d3.select(this).select("rect")
                    .attr("stroke", nodeSelectedStrokeColor)
                    .attr("stroke-width", nodeSelectedStrokeWidth);
                d3.select(this).classed("selected", true);

                linkPaths
                    .filter(d_link => d_link.source.id === selectedNodeData.id || d_link.target.id === selectedNodeData.id)
                    .style("stroke", nodeSelectedStrokeColor)
                    .style("stroke-opacity", 1)
                    .attr("stroke-width", linkStrokeWidth + 0.5)
                    .attr("marker-end", "url(#arrowhead-selected)")
                    .raise();
            }
            event.stopPropagation();
        });

        svg.on("click", () => {
            if (selectedNodeElement) {
                 d3.select(selectedNodeElement).select("rect")
                    .attr("stroke", nodeStrokeColor)
                    .attr("stroke-width", 1.5);
                d3.select(selectedNodeElement).classed("selected", false);
                selectedNodeElement = null;
                selectedNodeData = null;

                linkPaths
                    .style("stroke", linkStrokeColor)
                    .style("stroke-opacity", linkStrokeOpacity)
                    .attr("stroke-width", linkStrokeWidth)
                    .attr("marker-end", "url(#arrowhead)");
            }
        });

        simulation.on("tick", () => {
            linkPaths.attr("d", d => {
                if (typeof d.source === "string" || typeof d.target === "string" || 
                    typeof d.source.x !== 'number' || typeof d.source.y !== 'number' ||
                    typeof d.target.x !== 'number' || typeof d.target.y !== 'number') {
                    // console.warn("Link source/target are not fully initialized yet:", d);
                    return ""; 
                }

                const sx = d.source.x;
                const sy = d.source.y;
                let tx = d.target.x;
                let ty = d.target.y;

                const targetNodeHalfWidth = nodeWidth / 2;
                const targetNodeHalfHeight = nodeHeight / 2;

                const dx_orig = tx - sx;
                const dy_orig = ty - sy;

                if (Math.abs(dx_orig) < 0.1 && Math.abs(dy_orig) < 0.1) return ""; // Avoid issues with same-point nodes

                const angle = Math.atan2(dy_orig, dx_orig);

                const tanAngle = Math.abs(dy_orig / dx_orig);
                const tanNodeAspect = targetNodeHalfHeight / targetNodeHalfWidth;

                let endX, endY;

                if (Math.abs(dx_orig) < 0.01) { // Almost vertical line
                    endX = tx;
                    endY = ty + (dy_orig > 0 ? -targetNodeHalfHeight : targetNodeHalfHeight);
                } else if (Math.abs(dy_orig) < 0.01) { // Almost horizontal line
                    endY = ty;
                    endX = tx + (dx_orig > 0 ? -targetNodeHalfWidth : targetNodeHalfWidth);
                } else if (tanAngle < tanNodeAspect) { // Intersects left or right edge
                    endX = tx + (dx_orig > 0 ? -targetNodeHalfWidth : targetNodeHalfWidth);
                    endY = sy + (endX - sx) * Math.tan(angle); // Recalculate based on new endX
                } else { // Intersects top or bottom edge
                    endY = ty + (dy_orig > 0 ? -targetNodeHalfHeight : targetNodeHalfHeight);
                    endX = sx + (endY - sy) / Math.tan(angle); // Recalculate based on new endY
                }
                
                tx = endX;
                ty = endY;

                const R_final = Math.sqrt(Math.pow(tx - sx, 2) + Math.pow(ty - sy, 2));
                const dr_final = R_final * 1.5; 
                
                if (R_final < 1) return ""; 

                return `M${sx},${sy}A${dr_final},${dr_final} 0 0,1 ${tx},${ty}`;
            });

            nodeGroups.attr("transform", d => {
                const xPos = typeof d.x === 'number' ? d.x : width / 2;
                const yPos = typeof d.y === 'number' ? d.y : height / 2;
                return `translate(${xPos - nodeWidth / 2}, ${yPos - nodeHeight / 2})`;
            });
        });

        const zoomBehavior = d3.zoom()
            .scaleExtent([0.1, 8])
            .filter(event => {
                if (event.type === "wheel") return true;
                if (event.type === "mousedown" && event.button === 0) {
                    return event.target === svg.node() || event.target === g.node();
                }
                return false;
            })
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });

        svg.call(zoomBehavior)
           .on("dblclick.zoom", null);

        function nodeDrag(simulationInstance) {
            function dragstarted(event, d) {
                event.sourceEvent.stopPropagation();
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
                d.fx = null;
                d.fy = null;
            }
            return d3.drag()
                .filter(event => event.button === 0)
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }

        nodeGroups.call(nodeDrag(simulation));

        console.log("D3 graph initialized.");

    }).catch(function (error) {
        console.error('Error loading or processing graph data:', error);
        graphContainerElement.innerHTML = `<p>Error loading module graph data: ${error.message}</p>`;
    });
});