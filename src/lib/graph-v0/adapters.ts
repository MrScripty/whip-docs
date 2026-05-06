import type { DirectoryGraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { RenderGraph } from './types';

export function directorySnapshotToRenderGraph(
  snapshot: DirectoryGraphSnapshotDto,
): RenderGraph {
  return {
    rootNodeId: snapshot.rootNodeId,
    nodes: snapshot.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.name,
      path: node.path,
      parentId: node.parentId ?? undefined,
      childIds: node.childIds,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    })),
  };
}
