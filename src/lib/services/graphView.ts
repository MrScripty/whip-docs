import type { GraphNodeDto, GraphNodeKind } from '../../backends/TauriArchitectureBackend';

export type GraphNodeFilter = {
  query: string;
  kinds: GraphNodeKind[];
  limit: number;
};

export function filterGraphNodes(
  nodes: GraphNodeDto[],
  filter: GraphNodeFilter,
): GraphNodeDto[] {
  const query = filter.query.trim().toLowerCase();
  const allowedKinds = new Set(filter.kinds);

  return nodes
    .filter((node) => {
      const matchesKind = allowedKinds.size === 0 || allowedKinds.has(node.kind);
      const matchesQuery =
        query.length === 0 ||
        node.label.toLowerCase().includes(query) ||
        node.kind.toLowerCase().includes(query) ||
        node.sourceRange?.path.toLowerCase().includes(query);

      return matchesKind && matchesQuery;
    })
    .slice(0, filter.limit);
}

export function graphNodeKinds(nodes: GraphNodeDto[]): GraphNodeKind[] {
  return Array.from(new Set(nodes.map((node) => node.kind))).sort();
}
