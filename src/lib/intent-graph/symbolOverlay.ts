import type { GraphNodeDto, GraphEdgeDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { RenderGraph } from '../graph-v0/types';

export type SymbolOverlay = {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
  fileIdBySymbolId: ReadonlyMap<string, string>;
  /** Original analyzer file IDs map to existing render file IDs. No aggregate edges are synthesized. */
  fileIdByAnalysisId: ReadonlyMap<string, string>;
};

/** Supplement the file scene without changing its nodes, childIds, aggregate relations or layout. */
export function projectSymbolOverlay(files: RenderGraph, sourceRoot: string, analysis: GraphSnapshotDto | null, expanded: ReadonlySet<string>): SymbolOverlay {
  const empty = { nodes: [], edges: [], fileIdBySymbolId: new Map<string, string>(), fileIdByAnalysisId: new Map<string, string>() };
  if (!analysis || analysis.sourceRoot !== sourceRoot) return empty;
  const byPath = new Map<string, string[]>();
  for (const file of files.nodes.filter(n => n.kind === 'file')) byPath.set(file.path, [...(byPath.get(file.path) ?? []), file.id]);
  const fileIdByAnalysisId = new Map<string, string>();
  const fileIdBySymbolId = new Map<string, string>();
  for (const node of analysis.nodes) {
    const path = node.sourceRange?.path ?? (analysis.schemaVersion === 2 && node.kind === 'file' && node.id === `file:${node.label}` ? node.label : undefined);
    const matches = path ? byPath.get(path) : undefined;
    if (matches?.length !== 1) continue;
    if (node.kind === 'file') fileIdByAnalysisId.set(node.id, matches[0]);
    else if (!['workspace', 'crate'].includes(node.kind)) fileIdBySymbolId.set(node.id, matches[0]);
  }
  const nodes = analysis.nodes.filter(node => {
    const fileId = fileIdBySymbolId.get(node.id);
    return fileId !== undefined && expanded.has(fileId);
  });
  const visible = new Set(nodes.map(node => node.id));
  const endpointVisible = (id: string) => visible.has(id) || fileIdByAnalysisId.has(id);
  // Cross-file symbol relations appear only with their actual endpoints visible.
  // Collapsed cross-file meaning remains represented by authoritative file aggregates.
  const edges = analysis.edges.filter(edge => endpointVisible(edge.sourceId) && endpointVisible(edge.targetId) && (visible.has(edge.sourceId) || visible.has(edge.targetId)));
  return { nodes, edges, fileIdBySymbolId, fileIdByAnalysisId };
}
