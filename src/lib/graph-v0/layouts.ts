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

export function layoutRadialTree(
  graph: RenderGraph,
  options: LayoutOptions = {},
): LayoutResult {
  const context = buildLayoutContext(graph);
  const resolvedOptions = resolveLayoutOptions(options);
  const positions = new Map<string, LayoutNodePosition>();
  const depthGroups = groupNodeIdsByDepth(context.orderedNodeIds, context.depthByNodeId);

  for (const [depth, nodeIds] of depthGroups.entries()) {
    const ringRadius = depth * resolvedOptions.depthSpacing;
    const angleStep =
      nodeIds.length > 0 ? GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians / nodeIds.length : 0;

    nodeIds.forEach((nodeId, order) => {
      const angle = GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians + angleStep * order;
      const node = getKnownNode(context.nodeById, nodeId);
      const position =
        depth === 0
          ? { x: 0, y: 0, z: 0 }
          : {
              x: Math.cos(angle) * ringRadius,
              y: -depth * resolvedOptions.layerSpacing,
              z: Math.sin(angle) * ringRadius,
            };

      positions.set(nodeId, {
        nodeId,
        position,
        radius: radiusForNodeKind(node.kind, resolvedOptions),
        depth,
        order,
      });
    });
  }

  return { algorithm: 'radial-tree', positions };
}

export function layoutLayeredGrid(
  graph: RenderGraph,
  options: LayoutOptions = {},
): LayoutResult {
  const context = buildLayoutContext(graph);
  const resolvedOptions = resolveLayoutOptions(options);
  const positions = new Map<string, LayoutNodePosition>();
  const depthGroups = groupNodeIdsByDepth(context.orderedNodeIds, context.depthByNodeId);

  for (const [depth, nodeIds] of depthGroups.entries()) {
    const columns = Math.max(1, resolvedOptions.gridColumns);
    const rowCount = Math.ceil(nodeIds.length / columns);
    const centeredColumnOffset =
      (Math.min(columns, nodeIds.length) - 1) * GRAPH_V0_LAYOUT_GEOMETRY.gridOriginFactor;
    const centeredRowOffset = (rowCount - 1) * GRAPH_V0_LAYOUT_GEOMETRY.gridOriginFactor;

    nodeIds.forEach((nodeId, order) => {
      const column = order % columns;
      const row = Math.floor(order / columns);
      const node = getKnownNode(context.nodeById, nodeId);

      positions.set(nodeId, {
        nodeId,
        position: {
          x: (column - centeredColumnOffset) * resolvedOptions.siblingSpacing,
          y: negateOrZero(depth * resolvedOptions.layerSpacing),
          z: (row - centeredRowOffset) * resolvedOptions.siblingSpacing,
        },
        radius: radiusForNodeKind(node.kind, resolvedOptions),
        depth,
        order,
      });
    });
  }

  return { algorithm: 'layered-grid', positions };
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

function resolveLayoutOptions(options: LayoutOptions): ResolvedLayoutOptions {
  return {
    ...GRAPH_V0_LAYOUT_DEFAULTS,
    ...options,
  };
}

function groupNodeIdsByDepth(
  orderedNodeIds: readonly string[],
  depthByNodeId: ReadonlyMap<string, number>,
): Map<number, string[]> {
  const groups = new Map<number, string[]>();

  for (const nodeId of orderedNodeIds) {
    const depth = depthByNodeId.get(nodeId);

    if (depth === undefined) {
      continue;
    }

    const group = groups.get(depth) ?? [];
    group.push(nodeId);
    groups.set(depth, group);
  }

  return groups;
}

function compareNodes(left: RenderGraphNode, right: RenderGraphNode): number {
  return (
    compareGraphNodeKind(left.kind, right.kind) ||
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path) ||
    left.id.localeCompare(right.id)
  );
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
