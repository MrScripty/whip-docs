import type { DirectoryGraphNeighborhood, RenderGraph } from './types';

export function graphNeighborhood(
  graph: RenderGraph,
  selectedNodeId: string | null | undefined,
): DirectoryGraphNeighborhood {
  if (!selectedNodeId) {
    return emptyGraphNeighborhood();
  }

  const firstLevelNodeIds = new Set<string>();
  const secondLevelNodeIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();

  for (const edge of graph.edges) {
    const neighborId = adjacentNodeId(edge.fromNodeId, edge.toNodeId, selectedNodeId);

    if (neighborId) {
      highlightedEdgeIds.add(edge.id);
      firstLevelNodeIds.add(neighborId);
    }
  }

  for (const firstLevelNodeId of firstLevelNodeIds) {
    for (const edge of graph.edges) {
      const neighborId = adjacentNodeId(edge.fromNodeId, edge.toNodeId, firstLevelNodeId);

      if (neighborId && neighborId !== selectedNodeId && !firstLevelNodeIds.has(neighborId)) {
        secondLevelNodeIds.add(neighborId);
      }
    }
  }

  return {
    highlightedNodeIds: [
      selectedNodeId,
      ...Array.from(firstLevelNodeIds).sort(),
      ...Array.from(secondLevelNodeIds).sort(),
    ],
    highlightedEdgeIds: Array.from(highlightedEdgeIds).sort(),
    labeledNodeIds: [
      selectedNodeId,
      ...Array.from(firstLevelNodeIds).sort(),
      ...Array.from(secondLevelNodeIds).sort(),
    ],
    firstLevelNodeIds: Array.from(firstLevelNodeIds).sort(),
    secondLevelNodeIds: Array.from(secondLevelNodeIds).sort(),
  };
}

export function emptyGraphNeighborhood(): DirectoryGraphNeighborhood {
  return {
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    labeledNodeIds: [],
    firstLevelNodeIds: [],
    secondLevelNodeIds: [],
  };
}

function adjacentNodeId(fromNodeId: string, toNodeId: string, selectedNodeId: string): string | null {
  if (fromNodeId === selectedNodeId) {
    return toNodeId;
  }

  if (toNodeId === selectedNodeId) {
    return fromNodeId;
  }

  return null;
}
