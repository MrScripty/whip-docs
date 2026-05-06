import type { DirectoryGraphNeighborhood, RenderGraph } from './types';
import { buildSelectionIndex, selectionNeighborhood } from './selectionIndex';

export function graphNeighborhood(
  graph: RenderGraph,
  selectedNodeId: string | null | undefined,
): DirectoryGraphNeighborhood {
  return selectionNeighborhood(buildSelectionIndex(graph), selectedNodeId);
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
