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
type RadialFootprint = {
  readonly nodeRadius: number;
  readonly radius: number;
};
type LayeredFootprint = {
  readonly width: number;
  readonly zSpan: number;
};
type LayeredGridRow = {
  readonly childIds: readonly string[];
  readonly width: number;
  readonly zSpan: number;
};

export function layoutRadialTree(
  graph: RenderGraph,
  options: LayoutOptions = {},
): LayoutResult {
  const context = buildLayoutContext(graph);
  const resolvedOptions = resolveLayoutOptions(options);
  const positions = new Map<string, LayoutNodePosition>();
  const footprintByNodeId = buildRadialFootprintMap(context, resolvedOptions);

  placeRadialNode(
    graph.rootNodeId,
    0,
    0,
    { x: 0, y: 0, z: 0 },
    GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians,
    context,
    resolvedOptions,
    footprintByNodeId,
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
  const footprintByNodeId = buildLayeredFootprintMap(context, resolvedOptions);

  placeLayeredNode(
    graph.rootNodeId,
    0,
    0,
    { x: 0, y: 0, z: 0 },
    context,
    resolvedOptions,
    footprintByNodeId,
    positions,
  );

  return { algorithm: 'layered-grid', positions };
}

function placeRadialNode(
  nodeId: string,
  depth: number,
  order: number,
  position: LayoutNodePosition['position'],
  outwardAngle: number,
  context: LayoutContext,
  options: ResolvedLayoutOptions,
  footprintByNodeId: ReadonlyMap<string, RadialFootprint>,
  positions: Map<string, LayoutNodePosition>,
): void {
  const node = getKnownNode(context.nodeById, nodeId);

  positions.set(nodeId, {
    nodeId,
    position,
    radius: radiusForNodeKind(node.kind, options),
    depth,
    order,
  });

  const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
  const childFootprints = childIds.map((childId) => getKnownRadialFootprint(footprintByNodeId, childId));
  const childRingRadius = radialRingRadiusForChildFootprints(childFootprints, options);

  childIds.forEach((childId, childOrder) => {
    const childAngle = childAngleForOrder(outwardAngle, childOrder, childIds.length, depth);
    const childPosition = {
      x: position.x + Math.cos(childAngle) * childRingRadius,
      y: negateOrZero((depth + 1) * options.layerSpacing),
      z: position.z + Math.sin(childAngle) * childRingRadius,
    };

    placeRadialNode(
      childId,
      depth + 1,
      childOrder,
      childPosition,
      childAngle,
      context,
      options,
      footprintByNodeId,
      positions,
    );
  });
}

function placeLayeredNode(
  nodeId: string,
  depth: number,
  order: number,
  position: LayoutNodePosition['position'],
  context: LayoutContext,
  options: ResolvedLayoutOptions,
  footprintByNodeId: ReadonlyMap<string, LayeredFootprint>,
  positions: Map<string, LayoutNodePosition>,
): void {
  const node = getKnownNode(context.nodeById, nodeId);

  positions.set(nodeId, {
    nodeId,
    position,
    radius: radiusForNodeKind(node.kind, options),
    depth,
    order,
  });

  const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
  const rows = layeredRowsForChildren(childIds, footprintByNodeId, options);
  const totalZSpan =
    rows.reduce((total, row) => total + row.zSpan, 0) +
    Math.max(0, rows.length - 1) * options.siblingSpacing;
  let rowStartZ = position.z - totalZSpan / 2;
  let childOrder = 0;

  for (const row of rows) {
    const rowCenterZ = rowStartZ + row.zSpan / 2;
    let childStartX = position.x - row.width / 2;

    for (const childId of row.childIds) {
      const childFootprint = getKnownFootprint(footprintByNodeId, childId);
      const childPosition = {
        x: childStartX + childFootprint.width / 2,
        y: negateOrZero((depth + 1) * options.layerSpacing),
        z: rowCenterZ,
      };

      placeLayeredNode(
        childId,
        depth + 1,
        childOrder,
        childPosition,
        context,
        options,
        footprintByNodeId,
        positions,
      );
      childStartX += childFootprint.width + options.siblingSpacing;
      childOrder += 1;
    }

    rowStartZ += row.zSpan + options.siblingSpacing;
  }
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

function buildRadialFootprintMap(
  context: LayoutContext,
  options: ResolvedLayoutOptions,
): ReadonlyMap<string, RadialFootprint> {
  const footprintByNodeId = new Map<string, RadialFootprint>();

  function footprint(nodeId: string): RadialFootprint {
    const cached = footprintByNodeId.get(nodeId);

    if (cached) {
      return cached;
    }

    const node = getKnownNode(context.nodeById, nodeId);
    const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
    const childFootprints = childIds.map((childId) => footprint(childId));
    const childRingRadius = radialRingRadiusForChildFootprints(childFootprints, options);
    const childRadius = Math.max(0, ...childFootprints.map((childFootprint) => childFootprint.radius));
    const nodeRadius = radiusForNodeKind(node.kind, options);
    const nodeFootprint = {
      nodeRadius,
      radius: Math.max(nodeRadius, childRingRadius + childRadius),
    };

    footprintByNodeId.set(nodeId, nodeFootprint);
    return nodeFootprint;
  }

  for (const nodeId of [...context.orderedNodeIds].reverse()) {
    footprint(nodeId);
  }

  return footprintByNodeId;
}

function buildLayeredFootprintMap(
  context: LayoutContext,
  options: ResolvedLayoutOptions,
): ReadonlyMap<string, LayeredFootprint> {
  const footprintByNodeId = new Map<string, LayeredFootprint>();

  function footprint(nodeId: string): LayeredFootprint {
    const cached = footprintByNodeId.get(nodeId);

    if (cached) {
      return cached;
    }

    const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
    const rows = layeredRowsForChildren(childIds, footprintByNodeId, options, footprint);
    const rowGapTotal = Math.max(0, rows.length - 1) * options.siblingSpacing;
    const childWidth = Math.max(0, ...rows.map((row) => row.width));
    const childZSpan = rows.reduce((total, row) => total + row.zSpan, 0) + rowGapTotal;
    const nodeFootprint = {
      width: Math.max(options.siblingSpacing, childWidth),
      zSpan: Math.max(options.siblingSpacing, childZSpan),
    };

    footprintByNodeId.set(nodeId, nodeFootprint);
    return nodeFootprint;
  }

  for (const nodeId of [...context.orderedNodeIds].reverse()) {
    footprint(nodeId);
  }

  return footprintByNodeId;
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

function childAngleForOrder(outwardAngle: number, order: number, childCount: number, depth: number): number {
  if (childCount <= 1) {
    return outwardAngle;
  }

  if (depth === 0) {
    return (
      outwardAngle +
      GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians +
      (GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians * order) / childCount
    );
  }

  const branchFanRadians = clampNumber(
    childCount * GRAPH_V0_LAYOUT_GEOMETRY.radialFanRadiansPerChild,
    GRAPH_V0_LAYOUT_GEOMETRY.radialMinFanRadians,
    GRAPH_V0_LAYOUT_GEOMETRY.radialMaxFanRadians,
  );
  const fanStep = childCount > 1 ? branchFanRadians / (childCount - 1) : 0;

  return outwardAngle - branchFanRadians / 2 + fanStep * order;
}

function radialRingRadiusForChildFootprints(
  childFootprints: readonly RadialFootprint[],
  options: ResolvedLayoutOptions,
): number {
  if (childFootprints.length === 0) {
    return 0;
  }

  if (childFootprints.length === 1) {
    return options.depthSpacing;
  }

  const largestAdjacentNodeSpan =
    Math.max(...childFootprints.map((footprint) => footprint.nodeRadius)) * 2 +
    options.siblingSpacing;
  const minRadiusForSiblingSpacing =
    largestAdjacentNodeSpan /
    (2 * Math.sin(Math.PI / childFootprints.length));

  return Math.max(options.depthSpacing, minRadiusForSiblingSpacing);
}

function gridColumnCount(childCount: number, options: ResolvedLayoutOptions): number {
  if (childCount <= 0) {
    return 1;
  }

  return Math.min(Math.max(1, options.gridColumns), Math.ceil(Math.sqrt(childCount)));
}

function layeredRowsForChildren(
  childIds: readonly string[],
  footprintByNodeId: ReadonlyMap<string, LayeredFootprint>,
  options: ResolvedLayoutOptions,
  ensureFootprint?: (nodeId: string) => LayeredFootprint,
): readonly LayeredGridRow[] {
  const columns = gridColumnCount(childIds.length, options);
  const rows: LayeredGridRow[] = [];

  for (let start = 0; start < childIds.length; start += columns) {
    const rowChildIds = childIds.slice(start, start + columns);
    const footprints = rowChildIds.map((childId) =>
      ensureFootprint ? ensureFootprint(childId) : getKnownFootprint(footprintByNodeId, childId),
    );
    const width =
      footprints.reduce((total, footprint) => total + footprint.width, 0) +
      Math.max(0, footprints.length - 1) * options.siblingSpacing;
    const zSpan = Math.max(options.siblingSpacing, ...footprints.map((footprint) => footprint.zSpan));

    rows.push({ childIds: rowChildIds, width, zSpan });
  }

  return rows;
}

function getKnownFootprint(
  footprintByNodeId: ReadonlyMap<string, LayeredFootprint>,
  nodeId: string,
): LayeredFootprint {
  const footprint = footprintByNodeId.get(nodeId);

  if (!footprint) {
    throw new Error(`Graph node layout footprint is missing: ${nodeId}`);
  }

  return footprint;
}

function getKnownRadialFootprint(
  footprintByNodeId: ReadonlyMap<string, RadialFootprint>,
  nodeId: string,
): RadialFootprint {
  const footprint = footprintByNodeId.get(nodeId);

  if (!footprint) {
    throw new Error(`Graph node radial layout footprint is missing: ${nodeId}`);
  }

  return footprint;
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
