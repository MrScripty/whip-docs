import type { RenderGraphEdge, RenderGraphNode } from './types';

export function shouldRenderSceneEdge(
  edge: RenderGraphEdge,
  nodeById: ReadonlyMap<string, RenderGraphNode>,
): boolean {
  if (edge.kind !== 'contains') {
    return true;
  }

  const sourceNode = nodeById.get(edge.fromNodeId);
  const targetNode = nodeById.get(edge.toNodeId);

  return sourceNode?.kind !== 'file' && targetNode?.kind !== 'file';
}
