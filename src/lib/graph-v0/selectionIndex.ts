import type { DirectoryGraphNeighborhood, RenderGraph, RenderGraphEdge, RenderGraphNode } from './types';

export type GraphSelectionIndex = {
  readonly nodeById: ReadonlyMap<string, RenderGraphNode>;
  readonly edgeById: ReadonlyMap<string, RenderGraphEdge>;
  readonly incidentEdgeIdsByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly adjacentNodeIdsByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly edgeIdsByNodePair: ReadonlyMap<string, readonly string[]>;
};

export type GraphSelectionState = {
  readonly highlightedNodeIds: ReadonlySet<string>;
  readonly highlightedEdgeIds: ReadonlySet<string>;
  readonly labeledNodeIds: ReadonlySet<string>;
};

export type GraphSelectionStateDiff = {
  readonly enteredHighlightedNodeIds: readonly string[];
  readonly exitedHighlightedNodeIds: readonly string[];
  readonly enteredHighlightedEdgeIds: readonly string[];
  readonly exitedHighlightedEdgeIds: readonly string[];
  readonly enteredLabeledNodeIds: readonly string[];
  readonly exitedLabeledNodeIds: readonly string[];
};

export function buildSelectionIndex(graph: RenderGraph): GraphSelectionIndex {
  const nodeById = new Map<string, RenderGraphNode>();
  const edgeById = new Map<string, RenderGraphEdge>();
  const incidentEdgeIdsByNodeId = new Map<string, string[]>();
  const adjacentNodeIdsByNodeId = new Map<string, Set<string>>();
  const edgeIdsByNodePair = new Map<string, string[]>();

  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    incidentEdgeIdsByNodeId.set(node.id, []);
    adjacentNodeIdsByNodeId.set(node.id, new Set());
  }

  for (const edge of graph.edges) {
    edgeById.set(edge.id, edge);
    appendMapValue(incidentEdgeIdsByNodeId, edge.fromNodeId, edge.id);
    appendMapValue(incidentEdgeIdsByNodeId, edge.toNodeId, edge.id);
    appendSetMapValue(adjacentNodeIdsByNodeId, edge.fromNodeId, edge.toNodeId);
    appendSetMapValue(adjacentNodeIdsByNodeId, edge.toNodeId, edge.fromNodeId);
    appendMapValue(edgeIdsByNodePair, edgePairKey(edge.fromNodeId, edge.toNodeId), edge.id);
  }

  return {
    nodeById,
    edgeById,
    incidentEdgeIdsByNodeId: sortedArrayMap(incidentEdgeIdsByNodeId),
    adjacentNodeIdsByNodeId: sortedSetMap(adjacentNodeIdsByNodeId),
    edgeIdsByNodePair: sortedArrayMap(edgeIdsByNodePair),
  };
}

export function selectionNeighborhood(
  index: GraphSelectionIndex,
  selectedNodeId: string | null | undefined,
): DirectoryGraphNeighborhood {
  if (!selectedNodeId || !index.nodeById.has(selectedNodeId)) {
    return emptySelectionNeighborhood();
  }

  const firstLevelNodeIds = index.adjacentNodeIdsByNodeId.get(selectedNodeId) ?? [];
  const firstLevelNodeIdSet = new Set(firstLevelNodeIds);
  const highlightedEdgeIds = index.incidentEdgeIdsByNodeId.get(selectedNodeId) ?? [];
  const secondLevelNodeIds = new Set<string>();

  for (const firstLevelNodeId of firstLevelNodeIds) {
    const adjacentNodeIds = index.adjacentNodeIdsByNodeId.get(firstLevelNodeId) ?? [];

    for (const adjacentNodeId of adjacentNodeIds) {
      if (adjacentNodeId !== selectedNodeId && !firstLevelNodeIdSet.has(adjacentNodeId)) {
        secondLevelNodeIds.add(adjacentNodeId);
      }
    }
  }

  const sortedSecondLevelNodeIds = Array.from(secondLevelNodeIds).sort();
  const highlightedNodeIds = [selectedNodeId, ...firstLevelNodeIds, ...sortedSecondLevelNodeIds];

  return {
    highlightedNodeIds,
    highlightedEdgeIds,
    labeledNodeIds: highlightedNodeIds,
    firstLevelNodeIds,
    secondLevelNodeIds: sortedSecondLevelNodeIds,
  };
}

export function selectionStateForNode(
  index: GraphSelectionIndex,
  selectedNodeId: string | null | undefined,
): GraphSelectionState {
  const neighborhood = selectionNeighborhood(index, selectedNodeId);

  return {
    highlightedNodeIds: new Set(neighborhood.highlightedNodeIds),
    highlightedEdgeIds: new Set(neighborhood.highlightedEdgeIds),
    labeledNodeIds: new Set(neighborhood.labeledNodeIds),
  };
}

export function emptySelectionState(): GraphSelectionState {
  return {
    highlightedNodeIds: new Set(),
    highlightedEdgeIds: new Set(),
    labeledNodeIds: new Set(),
  };
}

export function diffSelectionState(
  previous: GraphSelectionState,
  next: GraphSelectionState,
): GraphSelectionStateDiff {
  return {
    enteredHighlightedNodeIds: enteredIds(previous.highlightedNodeIds, next.highlightedNodeIds),
    exitedHighlightedNodeIds: exitedIds(previous.highlightedNodeIds, next.highlightedNodeIds),
    enteredHighlightedEdgeIds: enteredIds(previous.highlightedEdgeIds, next.highlightedEdgeIds),
    exitedHighlightedEdgeIds: exitedIds(previous.highlightedEdgeIds, next.highlightedEdgeIds),
    enteredLabeledNodeIds: enteredIds(previous.labeledNodeIds, next.labeledNodeIds),
    exitedLabeledNodeIds: exitedIds(previous.labeledNodeIds, next.labeledNodeIds),
  };
}

function emptySelectionNeighborhood(): DirectoryGraphNeighborhood {
  return {
    highlightedNodeIds: [],
    highlightedEdgeIds: [],
    labeledNodeIds: [],
    firstLevelNodeIds: [],
    secondLevelNodeIds: [],
  };
}

function appendMapValue(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing) {
    existing.push(value);
    return;
  }

  map.set(key, [value]);
}

function appendSetMapValue(map: Map<string, Set<string>>, key: string, value: string): void {
  const existing = map.get(key);

  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
}

function sortedArrayMap(map: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
  return new Map([...map.entries()].map(([key, values]) => [key, [...values].sort()]));
}

function sortedSetMap(map: Map<string, Set<string>>): ReadonlyMap<string, readonly string[]> {
  return new Map([...map.entries()].map(([key, values]) => [key, Array.from(values).sort()]));
}

function enteredIds(previous: ReadonlySet<string>, next: ReadonlySet<string>): readonly string[] {
  return Array.from(next)
    .filter((id) => !previous.has(id))
    .sort();
}

function exitedIds(previous: ReadonlySet<string>, next: ReadonlySet<string>): readonly string[] {
  return Array.from(previous)
    .filter((id) => !next.has(id))
    .sort();
}

function edgePairKey(firstNodeId: string, secondNodeId: string): string {
  return [firstNodeId, secondNodeId].sort().join('\0');
}
