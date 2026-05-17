import type { FileRelationDetail, RenderGraph, RenderGraphEdge } from './types';

export function visibleEdgeIdsForRelationDetails(
  graph: RenderGraph,
  details: ReadonlySet<FileRelationDetail> | readonly FileRelationDetail[],
): ReadonlySet<string> {
  const selectedDetails = details instanceof Set ? details : new Set(details);
  const visibleEdgeIds = new Set<string>();

  for (const edge of graph.edges) {
    if (isEdgeVisibleAtRelationDetails(edge, selectedDetails)) {
      visibleEdgeIds.add(edge.id);
    }
  }

  return visibleEdgeIds;
}

export function isEdgeVisibleAtRelationDetails(
  edge: RenderGraphEdge,
  details: ReadonlySet<FileRelationDetail>,
): boolean {
  for (const detail of detailsForEdge(edge)) {
    if (details.has(detail)) {
      return true;
    }
  }

  return false;
}

function detailsForEdge(edge: RenderGraphEdge): readonly FileRelationDetail[] {
  if (edge.visibleAtDetails) {
    return edge.visibleAtDetails;
  }

  if (edge.kind === 'contains') {
    return ['structure'];
  }

  return [];
}
