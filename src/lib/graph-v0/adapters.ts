import type {
  DirectoryGraphSnapshotDto,
  FileRelationEdgeKind,
  FileRelationGraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend';
import type { FileRelationDetail, RenderGraph } from './types';

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
      kind: 'contains',
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
    })),
  };
}

export function fileRelationSnapshotToRenderGraph(
  snapshot: FileRelationGraphSnapshotDto,
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
      language: node.language ?? undefined,
    })),
    edges: snapshot.edges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      weight: edge.weight,
      direction: edge.direction,
      confidence: edge.confidence,
      provenance: edge.provenance,
      evidenceCount: edge.evidenceCount,
      visibleAtDetails: relationDetailsForEdgeKind(edge.kind),
    })),
  };
}

function relationDetailsForEdgeKind(kind: FileRelationEdgeKind): readonly FileRelationDetail[] {
  switch (kind) {
    case 'contains':
      return ['structure'];
    case 'imports':
      return ['imports'];
    case 'calls':
      return ['calls'];
    case 'references_type':
    case 'passes_data':
    case 'reads_data':
    case 'writes_data':
    case 'borrows_data':
    case 'mutably_borrows_data':
    case 'copies_data':
      return ['data'];
    case 'tests':
      return ['tests'];
    case 'configures':
      return ['configuration'];
    case 'implements_contract':
      return ['contracts'];
  }
}
