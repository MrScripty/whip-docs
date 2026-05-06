import { GRAPH_V0_KIND_ORDER, GRAPH_V0_LAYOUT_DEFAULTS, GRAPH_V0_LAYOUT_GEOMETRY } from './constants';
import type {
  GraphNodeKind,
  LayoutNodePosition,
  LayoutOptions,
  LayoutResult,
  RenderGraph,
  RenderGraphNode,
} from './types';

type LayoutContext = {
  readonly nodeById: ReadonlyMap<string, RenderGraphNode>;
  readonly childIdsByNodeId: ReadonlyMap<string, readonly string[]>;
  readonly depthByNodeId: ReadonlyMap<string, number>;
  readonly orderedNodeIds: readonly string[];
};

type ResolvedLayoutOptions = Required<LayoutOptions>;
type TreeSector = {
  readonly startAngle: number;
  readonly endAngle: number;
};

export function layoutRadialTree(
  graph: RenderGraph,
  options: LayoutOptions = {},
): LayoutResult {
  const context = buildLayoutContext(graph);
  const resolvedOptions = resolveLayoutOptions(options);
  const positions = new Map<string, LayoutNodePosition>();
  const subtreeWeightByNodeId = buildSubtreeWeightMap(context);
  const fullCircle = GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians;
  const rootSector = {
    startAngle: GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians,
    endAngle: GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians + fullCircle,
  };

  placeRadialNode(
    graph.rootNodeId,
    0,
    0,
    rootSector,
    context,
    subtreeWeightByNodeId,
    resolvedOptions,
    positions,
  );

  return { algorithm: 'radial-tree', positions };
}

export function layoutLayeredGrid(
  graph: RenderGraph,
  options: LayoutOptions = {},
): LayoutResult {
  const context = buildLayoutContext(graph);
  const resolvedOptions = resolveLayoutOptions(options);
  const positions = new Map<string, LayoutNodePosition>();
  const xByNodeId = buildLayeredTreeXMap(context);
  const xOrigin = xByNodeId.get(graph.rootNodeId) ?? 0;

  for (const nodeId of context.orderedNodeIds) {
    const node = getKnownNode(context.nodeById, nodeId);
    const depth = context.depthByNodeId.get(nodeId) ?? 0;
    const localOrder = localOrderForNode(context, nodeId);

    positions.set(nodeId, {
      nodeId,
      position: {
        x: ((xByNodeId.get(nodeId) ?? 0) - xOrigin) * resolvedOptions.siblingSpacing,
        y: negateOrZero(depth * resolvedOptions.layerSpacing),
        z: 0,
      },
      radius: radiusForNodeKind(node.kind, resolvedOptions),
      depth,
      order: localOrder,
    });
  }

  return { algorithm: 'layered-grid', positions };
}

function placeRadialNode(
  nodeId: string,
  depth: number,
  order: number,
  sector: TreeSector,
  context: LayoutContext,
  subtreeWeightByNodeId: ReadonlyMap<string, number>,
  options: ResolvedLayoutOptions,
  positions: Map<string, LayoutNodePosition>,
): void {
  const node = getKnownNode(context.nodeById, nodeId);
  const angle = (sector.startAngle + sector.endAngle) / 2;
  const ringRadius = depth * options.depthSpacing;

  positions.set(nodeId, {
    nodeId,
    position:
      depth === 0
        ? { x: 0, y: 0, z: 0 }
        : {
            x: Math.cos(angle) * ringRadius,
            y: negateOrZero(depth * options.layerSpacing),
            z: Math.sin(angle) * ringRadius,
          },
    radius: radiusForNodeKind(node.kind, options),
    depth,
    order,
  });

  const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
  const totalChildWeight = childIds.reduce(
    (total, childId) => total + (subtreeWeightByNodeId.get(childId) ?? 1),
    0,
  );
  let cursor = sector.startAngle;

  childIds.forEach((childId, childOrder) => {
    const childWeight = subtreeWeightByNodeId.get(childId) ?? 1;
    const childSpan =
      totalChildWeight > 0
        ? ((sector.endAngle - sector.startAngle) * childWeight) / totalChildWeight
        : 0;
    const childSector = {
      startAngle: cursor,
      endAngle: cursor + childSpan,
    };

    placeRadialNode(
      childId,
      depth + 1,
      childOrder,
      childSector,
      context,
      subtreeWeightByNodeId,
      options,
      positions,
    );
    cursor += childSpan;
  });
}

function buildLayoutContext(graph: RenderGraph): LayoutContext {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rootNode = nodeById.get(graph.rootNodeId);

  if (!rootNode) {
    throw new Error(`Graph root node is missing: ${graph.rootNodeId}`);
  }

  const childIdsByNodeId = new Map<string, readonly string[]>();

  for (const node of graph.nodes) {
    const childIds = [...node.childIds]
      .filter((childId) => nodeById.has(childId))
      .sort((leftId, rightId) => compareNodes(getKnownNode(nodeById, leftId), getKnownNode(nodeById, rightId)));

    childIdsByNodeId.set(node.id, childIds);
  }

  const orderedNodeIds: string[] = [];
  const depthByNodeId = new Map<string, number>();
  const queue: Array<{ readonly nodeId: string; readonly depth: number }> = [
    { nodeId: rootNode.id, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || depthByNodeId.has(current.nodeId)) {
      continue;
    }

    orderedNodeIds.push(current.nodeId);
    depthByNodeId.set(current.nodeId, current.depth);

    for (const childId of childIdsByNodeId.get(current.nodeId) ?? []) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }

  return { nodeById, childIdsByNodeId, depthByNodeId, orderedNodeIds };
}

function buildSubtreeWeightMap(context: LayoutContext): ReadonlyMap<string, number> {
  const weightByNodeId = new Map<string, number>();

  function subtreeWeight(nodeId: string): number {
    const cached = weightByNodeId.get(nodeId);

    if (cached !== undefined) {
      return cached;
    }

    const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
    const weight =
      childIds.length === 0
        ? 1
        : childIds.reduce((total, childId) => total + subtreeWeight(childId), 0);

    weightByNodeId.set(nodeId, weight);
    return weight;
  }

  for (const nodeId of context.orderedNodeIds) {
    subtreeWeight(nodeId);
  }

  return weightByNodeId;
}

function buildLayeredTreeXMap(context: LayoutContext): ReadonlyMap<string, number> {
  const xByNodeId = new Map<string, number>();
  let leafCursor = 0;

  function assignX(nodeId: string): number {
    const cached = xByNodeId.get(nodeId);

    if (cached !== undefined) {
      return cached;
    }

    const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
    const x =
      childIds.length === 0
        ? leafCursor
        : average(childIds.map((childId) => assignX(childId)));

    if (childIds.length === 0) {
      leafCursor += 1;
    }

    xByNodeId.set(nodeId, x);
    return x;
  }

  assignX(context.orderedNodeIds[0]);
  return xByNodeId;
}

function resolveLayoutOptions(options: LayoutOptions): ResolvedLayoutOptions {
  return {
    ...GRAPH_V0_LAYOUT_DEFAULTS,
    ...options,
  };
}

function compareNodes(left: RenderGraphNode, right: RenderGraphNode): number {
  return (
    compareGraphNodeKind(left.kind, right.kind) ||
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path) ||
    left.id.localeCompare(right.id)
  );
}

function localOrderForNode(context: LayoutContext, nodeId: string): number {
  const node = getKnownNode(context.nodeById, nodeId);

  if (!node.parentId) {
    return 0;
  }

  return (context.childIdsByNodeId.get(node.parentId) ?? []).indexOf(nodeId);
}

function average(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

function compareGraphNodeKind(left: GraphNodeKind, right: GraphNodeKind): number {
  return GRAPH_V0_KIND_ORDER[left] - GRAPH_V0_KIND_ORDER[right];
}

function radiusForNodeKind(kind: GraphNodeKind, options: ResolvedLayoutOptions): number {
  if (kind === 'repo') {
    return options.repoRadius;
  }

  if (kind === 'directory') {
    return options.directoryRadius;
  }

  return options.nodeRadius;
}

function getKnownNode(
  nodeById: ReadonlyMap<string, RenderGraphNode>,
  nodeId: string,
): RenderGraphNode {
  const node = nodeById.get(nodeId);

  if (!node) {
    throw new Error(`Graph node is missing: ${nodeId}`);
  }

  return node;
}

function negateOrZero(value: number): number {
  return value === 0 ? 0 : -value;
}
