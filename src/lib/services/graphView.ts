import type {
  GraphEdgeDto,
  GraphNodeDto,
  GraphNodeKind,
} from '../../backends/TauriArchitectureBackend';

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

export type GraphLayoutNode = GraphNodeDto & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphLayoutEdge = GraphEdgeDto & {
  path: string;
  labelX: number;
  labelY: number;
};

export type GraphLayout = {
  width: number;
  height: number;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
};

const NODE_WIDTH = 176;
const NODE_HEIGHT = 62;
const COLUMN_GAP = 96;
const ROW_GAP = 24;
const CANVAS_PADDING = 36;

const nodeKindRank: Record<GraphNodeKind, number> = {
  workspace: 0,
  crate: 1,
  module: 2,
  file: 2,
  struct: 3,
  enum: 3,
  trait: 3,
  impl: 4,
  function: 5,
  method: 5,
  tauri_command: 6,
};

export function buildGraphLayout(nodes: GraphNodeDto[], edges: GraphEdgeDto[]): GraphLayout {
  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = edges.filter(
    (edge) => visibleNodeIds.has(edge.sourceId) && visibleNodeIds.has(edge.targetId),
  );

  const degreeByNodeId = new Map<string, number>();
  for (const edge of visibleEdges) {
    degreeByNodeId.set(edge.sourceId, (degreeByNodeId.get(edge.sourceId) ?? 0) + 1);
    degreeByNodeId.set(edge.targetId, (degreeByNodeId.get(edge.targetId) ?? 0) + 1);
  }

  const layers = new Map<number, GraphNodeDto[]>();
  for (const node of nodes) {
    const rank = nodeKindRank[node.kind];
    const layer = layers.get(rank) ?? [];
    layer.push(node);
    layers.set(rank, layer);
  }

  const layoutNodes: GraphLayoutNode[] = [];
  const sortedRanks = Array.from(layers.keys()).sort((first, second) => first - second);

  for (const rank of sortedRanks) {
    const layer = layers.get(rank) ?? [];
    layer.sort((first, second) => {
      const degreeDelta = (degreeByNodeId.get(second.id) ?? 0) - (degreeByNodeId.get(first.id) ?? 0);
      if (degreeDelta !== 0) {
        return degreeDelta;
      }

      return first.label.localeCompare(second.label) || first.id.localeCompare(second.id);
    });

    layer.forEach((node, index) => {
      layoutNodes.push({
        ...node,
        x: CANVAS_PADDING + rank * (NODE_WIDTH + COLUMN_GAP),
        y: CANVAS_PADDING + index * (NODE_HEIGHT + ROW_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    });
  }

  const layoutNodeById = new Map(layoutNodes.map((node) => [node.id, node]));
  const layoutEdges = visibleEdges.map((edge) => {
    const source = layoutNodeById.get(edge.sourceId);
    const target = layoutNodeById.get(edge.targetId);

    if (!source || !target) {
      return {
        ...edge,
        path: '',
        labelX: 0,
        labelY: 0,
      };
    }

    const sourceX = source.x + source.width;
    const sourceY = source.y + source.height / 2;
    const targetX = target.x;
    const targetY = target.y + target.height / 2;
    const bend = Math.max(48, Math.abs(targetX - sourceX) / 2);

    return {
      ...edge,
      path: `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    };
  });

  const maxX = Math.max(...layoutNodes.map((node) => node.x + node.width), CANVAS_PADDING);
  const maxY = Math.max(...layoutNodes.map((node) => node.y + node.height), CANVAS_PADDING);

  return {
    width: maxX + CANVAS_PADDING,
    height: maxY + CANVAS_PADDING,
    nodes: layoutNodes,
    edges: layoutEdges,
  };
}

export function graphLabel(label: string, maxLength = 28): string {
  if (label.length <= maxLength) {
    return label;
  }

  if (maxLength <= 3) {
    return '.'.repeat(maxLength);
  }

  return `${label.slice(0, maxLength - 3)}...`;
}
