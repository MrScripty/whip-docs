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

export type GraphViewMode = 'architecture' | 'symbols';

export type GraphProjection = {
  nodes: GraphNodeDto[];
  edges: GraphEdgeDto[];
};

export type GraphLayoutNode = GraphNodeDto & {
  x: number;
  y: number;
  radius: number;
  width: number;
  height: number;
  clusterId: string;
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
const NODE_HEIGHT = 44;
const CANVAS_PADDING = 120;
const MIN_CANVAS_WIDTH = 1300;
const MIN_CANVAS_HEIGHT = 760;
const FORCE_ITERATIONS = 220;

export function projectGraph(
  nodes: GraphNodeDto[],
  edges: GraphEdgeDto[],
  mode: GraphViewMode,
): GraphProjection {
  if (mode === 'symbols') {
    return { nodes, edges };
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const fileNodes = nodes.filter((node) => node.kind === 'file');
  const fileNodeByPath = new Map(
    fileNodes
      .map((node) => [node.sourceRange?.path ?? node.label, node] as const)
      .filter(([path]) => path.length > 0),
  );
  const projectedEdges = new Map<string, GraphEdgeDto>();

  for (const edge of edges) {
    const source = nodesById.get(edge.sourceId);
    const target = nodesById.get(edge.targetId);
    const sourceFile = source ? fileNodeFor(source, fileNodeByPath) : null;
    const targetFile = target ? fileNodeFor(target, fileNodeByPath) : null;

    if (!sourceFile || !targetFile || sourceFile.id === targetFile.id) {
      continue;
    }

    const id = `${edge.kind}:${sourceFile.id}:${targetFile.id}`;
    projectedEdges.set(id, {
      ...edge,
      id,
      sourceId: sourceFile.id,
      targetId: targetFile.id,
    });
  }

  return {
    nodes: fileNodes,
    edges: Array.from(projectedEdges.values()),
  };
}

function fileNodeFor(
  node: GraphNodeDto,
  fileNodeByPath: Map<string, GraphNodeDto>,
): GraphNodeDto | null {
  if (node.kind === 'file') {
    return node;
  }

  if (!node.sourceRange) {
    return null;
  }

  return fileNodeByPath.get(node.sourceRange.path) ?? null;
}

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

  const clusters = clusterNodes(nodes);
  const layoutNodes = seedLayoutNodes(nodes, clusters, degreeByNodeId);
  runForceLayout(layoutNodes, visibleEdges, clusters);
  normalizeLayout(layoutNodes);

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

    const { sourceX, sourceY, targetX, targetY } = edgeAnchors(source, target);
    const bend = Math.max(36, distance(source.x, source.y, target.x, target.y) * 0.22);

    return {
      ...edge,
      path: `M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`,
      labelX: (sourceX + targetX) / 2,
      labelY: (sourceY + targetY) / 2,
    };
  });

  const maxX = Math.max(...layoutNodes.map((node) => node.x + node.radius), MIN_CANVAS_WIDTH);
  const maxY = Math.max(...layoutNodes.map((node) => node.y + node.radius), MIN_CANVAS_HEIGHT);

  return {
    width: maxX + CANVAS_PADDING,
    height: maxY + CANVAS_PADDING,
    nodes: layoutNodes,
    edges: layoutEdges,
  };
}

type Cluster = {
  id: string;
  x: number;
  y: number;
};

function clusterNodes(nodes: GraphNodeDto[]): Map<string, Cluster> {
  const clusterIds = Array.from(new Set(nodes.map(clusterIdForNode))).sort();
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(clusterIds.length)));
  const clusters = new Map<string, Cluster>();

  clusterIds.forEach((id, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    clusters.set(id, {
      id,
      x: CANVAS_PADDING + column * 360,
      y: CANVAS_PADDING + row * 300,
    });
  });

  return clusters;
}

function seedLayoutNodes(
  nodes: GraphNodeDto[],
  clusters: Map<string, Cluster>,
  degreeByNodeId: Map<string, number>,
): GraphLayoutNode[] {
  const clusterCounts = new Map<string, number>();

  return nodes
    .slice()
    .sort((first, second) => {
      const firstCluster = clusterIdForNode(first);
      const secondCluster = clusterIdForNode(second);
      return (
        firstCluster.localeCompare(secondCluster) ||
        ((degreeByNodeId.get(second.id) ?? 0) - (degreeByNodeId.get(first.id) ?? 0)) ||
        first.label.localeCompare(second.label) ||
        first.id.localeCompare(second.id)
      );
    })
    .map((node) => {
      const clusterId = clusterIdForNode(node);
      const cluster = clusters.get(clusterId) ?? { id: clusterId, x: CANVAS_PADDING, y: CANVAS_PADDING };
      const index = clusterCounts.get(clusterId) ?? 0;
      clusterCounts.set(clusterId, index + 1);
      const angle = index * 2.399963229728653;
      const distanceFromCenter = 32 + Math.sqrt(index) * 38;
      const degree = degreeByNodeId.get(node.id) ?? 0;
      const radius = Math.min(50, nodeBaseRadius(node.kind) + Math.sqrt(degree) * 3);

      return {
        ...node,
        x: cluster.x + Math.cos(angle) * distanceFromCenter,
        y: cluster.y + Math.sin(angle) * distanceFromCenter,
        radius,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        clusterId,
      };
    });
}

function runForceLayout(
  nodes: GraphLayoutNode[],
  edges: GraphEdgeDto[],
  clusters: Map<string, Cluster>,
): void {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const velocities = new Map(nodes.map((node) => [node.id, { x: 0, y: 0 }]));

  for (let iteration = 0; iteration < FORCE_ITERATIONS; iteration += 1) {
    const alpha = 1 - iteration / FORCE_ITERATIONS;

    for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
        applyRepulsion(nodes[firstIndex], nodes[secondIndex], velocities, alpha);
      }
    }

    for (const edge of edges) {
      const source = nodeById.get(edge.sourceId);
      const target = nodeById.get(edge.targetId);
      if (source && target) {
        applyLinkForce(source, target, velocities, alpha);
      }
    }

    for (const node of nodes) {
      const cluster = clusters.get(node.clusterId);
      const velocity = velocities.get(node.id);
      if (!cluster || !velocity) {
        continue;
      }

      velocity.x += (cluster.x - node.x) * 0.015 * alpha;
      velocity.y += (cluster.y - node.y) * 0.015 * alpha;
      node.x += velocity.x;
      node.y += velocity.y;
      velocity.x *= 0.72;
      velocity.y *= 0.72;
    }
  }
}

function applyRepulsion(
  first: GraphLayoutNode,
  second: GraphLayoutNode,
  velocities: Map<string, { x: number; y: number }>,
  alpha: number,
): void {
  let dx = second.x - first.x;
  let dy = second.y - first.y;
  let squaredDistance = dx * dx + dy * dy;

  if (squaredDistance < 0.01) {
    dx = seededOffset(first.id, second.id);
    dy = seededOffset(second.id, first.id);
    squaredDistance = dx * dx + dy * dy;
  }

  const dist = Math.sqrt(squaredDistance);
  const minDistance = first.radius + second.radius + 18;
  const repulsion = Math.min(5.5, 1800 / squaredDistance) * alpha;
  const collision = dist < minDistance ? (minDistance - dist) * 0.12 * alpha : 0;
  const force = repulsion + collision;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  const firstVelocity = velocities.get(first.id);
  const secondVelocity = velocities.get(second.id);
  if (!firstVelocity || !secondVelocity) {
    return;
  }

  firstVelocity.x -= fx;
  firstVelocity.y -= fy;
  secondVelocity.x += fx;
  secondVelocity.y += fy;
}

function applyLinkForce(
  source: GraphLayoutNode,
  target: GraphLayoutNode,
  velocities: Map<string, { x: number; y: number }>,
  alpha: number,
): void {
  const sourceVelocity = velocities.get(source.id);
  const targetVelocity = velocities.get(target.id);
  if (!sourceVelocity || !targetVelocity) {
    return;
  }

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const targetDistance = source.clusterId === target.clusterId ? 150 : 230;
  const force = (dist - targetDistance) * 0.025 * alpha;
  const fx = (dx / dist) * force;
  const fy = (dy / dist) * force;

  sourceVelocity.x += fx;
  sourceVelocity.y += fy;
  targetVelocity.x -= fx;
  targetVelocity.y -= fy;
}

function normalizeLayout(nodes: GraphLayoutNode[]): void {
  const minX = Math.min(...nodes.map((node) => node.x - node.radius), CANVAS_PADDING);
  const minY = Math.min(...nodes.map((node) => node.y - node.radius), CANVAS_PADDING);

  for (const node of nodes) {
    node.x += CANVAS_PADDING - minX;
    node.y += CANVAS_PADDING - minY;
  }
}

function edgeAnchors(source: GraphLayoutNode, target: GraphLayoutNode) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));

  return {
    sourceX: source.x + (dx / dist) * source.radius,
    sourceY: source.y + (dy / dist) * source.radius,
    targetX: target.x - (dx / dist) * target.radius,
    targetY: target.y - (dy / dist) * target.radius,
  };
}

function clusterIdForNode(node: GraphNodeDto): string {
  const path = node.sourceRange?.path ?? node.label;
  const slashIndex = path.lastIndexOf('/');

  if (slashIndex <= 0) {
    return '[root]';
  }

  return path.slice(0, slashIndex);
}

function nodeBaseRadius(kind: GraphNodeKind): number {
  switch (kind) {
    case 'workspace':
    case 'crate':
      return 42;
    case 'file':
      return 34;
    case 'module':
      return 30;
    case 'tauri_command':
      return 32;
    default:
      return 26;
  }
}

function seededOffset(first: string, second: string): number {
  return ((hashString(`${first}:${second}`) % 200) - 100) / 100;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function distance(sourceX: number, sourceY: number, targetX: number, targetY: number): number {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  return Math.sqrt(dx * dx + dy * dy);
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
