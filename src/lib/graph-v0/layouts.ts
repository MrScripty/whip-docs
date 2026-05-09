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
  readonly orderedNodeIds: readonly string[];
};

type ResolvedLayoutOptions = Required<LayoutOptions>;
type RadialFootprint = {
  readonly nodeRadius: number;
  readonly placementRadius: number;
};
type RadialChildPlacement = {
  readonly childId: string;
  readonly radius: number;
  readonly angle: number;
};
type IcospherePoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
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
  const footprint = getKnownRadialFootprint(footprintByNodeId, nodeId);

  positions.set(nodeId, {
    nodeId,
    position,
    radius: footprint.nodeRadius,
    depth,
    order,
  });

  const childIds = context.childIdsByNodeId.get(nodeId) ?? [];
  const fileChildIds = childIds.filter((childId) => getKnownNode(context.nodeById, childId).kind === 'file');
  const branchChildIds = childIds.filter((childId) => getKnownNode(context.nodeById, childId).kind !== 'file');
  const fileChildPositions = containedFileChildPositions(fileChildIds, footprint.nodeRadius, position, options);
  const branchChildFootprints = branchChildIds.map((childId) => getKnownRadialFootprint(footprintByNodeId, childId));
  const branchPlacements = radialChildPlacements(
    branchChildIds,
    branchChildFootprints,
    footprint.nodeRadius,
    outwardAngle,
    options,
  );

  fileChildPositions.forEach((fileChildPosition, childOrder) => {
    positions.set(fileChildPosition.childId, {
      nodeId: fileChildPosition.childId,
      position: fileChildPosition.position,
      radius: options.nodeRadius,
      depth: depth + 1,
      order: childOrder,
    });
  });

  branchPlacements.forEach((childPlacement, childOrder) => {
    const childPosition = {
      x: position.x + Math.cos(childPlacement.angle) * childPlacement.radius,
      y: negateOrZero((depth + 1) * options.layerSpacing),
      z: position.z + Math.sin(childPlacement.angle) * childPlacement.radius,
    };

    placeRadialNode(
      childPlacement.childId,
      depth + 1,
      fileChildPositions.length + childOrder,
      childPosition,
      childPlacement.angle,
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
  const visitedNodeIds = new Set<string>();
  const queue: Array<{ readonly nodeId: string; readonly depth: number }> = [
    { nodeId: rootNode.id, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current || visitedNodeIds.has(current.nodeId)) {
      continue;
    }

    orderedNodeIds.push(current.nodeId);
    visitedNodeIds.add(current.nodeId);

    for (const childId of childIdsByNodeId.get(current.nodeId) ?? []) {
      queue.push({ nodeId: childId, depth: current.depth + 1 });
    }
  }

  return { nodeById, childIdsByNodeId, orderedNodeIds };
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
    const childFootprints = childIds.map((childId) => [getKnownNode(context.nodeById, childId), footprint(childId)] as const);
    const fileChildFootprints = childFootprints
      .filter(([child]) => child.kind === 'file')
      .map(([, childFootprint]) => childFootprint);
    const branchChildFootprints = childFootprints
      .filter(([child]) => child.kind !== 'file')
      .map(([, childFootprint]) => childFootprint);
    const nodeRadius = radialNodeRadiusForContainedFiles(node.kind, fileChildFootprints.length, options);
    const nodeFootprint = {
      nodeRadius,
      placementRadius: Math.max(
        nodeRadius,
        radialPlacementRadiusForBranches(branchChildFootprints, nodeRadius, options),
      ),
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

function childAngleForOrder(outwardAngle: number, order: number, childCount: number): number {
  if (childCount <= 1) {
    return outwardAngle;
  }

  return (
    outwardAngle +
    GRAPH_V0_LAYOUT_GEOMETRY.radialStartAngleRadians +
    (GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians * order) / childCount
  );
}

function radialChildPlacements(
  childIds: readonly string[],
  childFootprints: readonly RadialFootprint[],
  parentRadius: number,
  outwardAngle: number,
  options: ResolvedLayoutOptions,
): readonly RadialChildPlacement[] {
  const placements: RadialChildPlacement[] = [];
  let previousRingOuterRadius = parentRadius;
  let start = 0;

  for (const ringSize of radialRingSizes(childIds.length)) {
    const ringChildIds = childIds.slice(start, start + ringSize);
    const ringChildRadii = childFootprints
      .slice(start, start + ringSize)
      .map((footprint) => footprint.placementRadius);
    const maxChildRadius = Math.max(0, ...ringChildRadii);
    const ringRadius = Math.max(
      radialRingRadiusForChildRadii(ringChildRadii, options),
      previousRingOuterRadius + maxChildRadius + options.siblingSpacing,
    );

    ringChildIds.forEach((childId, ringOrder) => {
      placements.push({
        childId,
        radius: ringRadius,
        angle: childAngleForOrder(outwardAngle, ringOrder, ringChildIds.length),
      });
    });

    previousRingOuterRadius = ringRadius + maxChildRadius;
    start += ringSize;
  }

  return placements;
}

function radialPlacementRadiusForBranches(
  childFootprints: readonly RadialFootprint[],
  parentRadius: number,
  options: ResolvedLayoutOptions,
): number {
  let previousRingOuterRadius = parentRadius;
  let start = 0;

  for (const ringSize of radialRingSizes(childFootprints.length)) {
    const ringChildRadii = childFootprints
      .slice(start, start + ringSize)
      .map((footprint) => footprint.nodeRadius);
    const maxChildRadius = Math.max(0, ...ringChildRadii);
    const ringRadius = Math.max(
      radialRingRadiusForChildRadii(ringChildRadii, options),
      previousRingOuterRadius + maxChildRadius + options.siblingSpacing,
    );

    previousRingOuterRadius = ringRadius + maxChildRadius;
    start += ringSize;
  }

  return previousRingOuterRadius;
}

function containedFileChildPositions(
  fileChildIds: readonly string[],
  parentRadius: number,
  parentPosition: LayoutNodePosition['position'],
  options: ResolvedLayoutOptions,
): ReadonlyArray<{ readonly childId: string; readonly position: LayoutNodePosition['position'] }> {
  if (fileChildIds.length === 0) {
    return [];
  }

  if (fileChildIds.length === 1) {
    return [{ childId: fileChildIds[0], position: parentPosition }];
  }

  const innerRadius = containedFileCenterRadius(parentRadius, options);
  const points = icospherePoints(fileChildIds.length);

  return fileChildIds.map((childId, index) => ({
    childId,
    position: {
      x: parentPosition.x + points[index].x * innerRadius,
      y: parentPosition.y + points[index].y * innerRadius,
      z: parentPosition.z + points[index].z * innerRadius,
    },
  }));
}

function radialNodeRadiusForContainedFiles(
  kind: GraphNodeKind,
  fileChildCount: number,
  options: ResolvedLayoutOptions,
): number {
  const baseRadius = radiusForNodeKind(kind, options);

  if (kind === 'file' || fileChildCount === 0) {
    return baseRadius;
  }

  return Math.max(baseRadius, containedFileContainerRadius(fileChildCount, options));
}

function containedFileContainerRadius(fileChildCount: number, options: ResolvedLayoutOptions): number {
  if (fileChildCount <= 1) {
    return options.nodeRadius * 2.2;
  }

  const points = icospherePoints(fileChildCount);
  const minChordDistance = minimumChordDistance(points);
  const minimumCenterDistance = options.nodeRadius * 2.8;
  const fileCenterRadius = minimumCenterDistance / minChordDistance;

  return fileCenterRadius + options.nodeRadius * 1.55;
}

function containedFileCenterRadius(parentRadius: number, options: ResolvedLayoutOptions): number {
  return Math.max(0, parentRadius - options.nodeRadius * 1.55);
}

function minimumChordDistance(points: readonly IcospherePoint[]): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (let leftIndex = 0; leftIndex < points.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
      const left = points[leftIndex];
      const right = points[rightIndex];
      const distance = Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
      minDistance = Math.min(minDistance, distance);
    }
  }

  return minDistance === Number.POSITIVE_INFINITY ? 1 : minDistance;
}

const ICOSPHERE_POINT_CACHE = new Map<number, readonly IcospherePoint[]>();

function icospherePoints(count: number): readonly IcospherePoint[] {
  const cached = ICOSPHERE_POINT_CACHE.get(count);

  if (cached) {
    return cached;
  }

  const vertices = sortedIcosphereVertices(icosphereSubdivisionLevelForCount(count));
  const points = farthestSampleVertices(vertices, count);
  ICOSPHERE_POINT_CACHE.set(count, points);
  return points;
}

function icosphereSubdivisionLevelForCount(count: number): number {
  let subdivisionLevel = 0;

  while (icosphereVertexCount(subdivisionLevel) < count) {
    subdivisionLevel += 1;
  }

  return subdivisionLevel;
}

function icosphereVertexCount(subdivisionLevel: number): number {
  return 10 * 4 ** subdivisionLevel + 2;
}

function sortedIcosphereVertices(subdivisionLevel: number): readonly IcospherePoint[] {
  const vertices = baseIcosahedronVertices();
  let faces = baseIcosahedronFaces();

  for (let level = 0; level < subdivisionLevel; level += 1) {
    const midpointCache = new Map<string, number>();
    const nextFaces: Array<readonly [number, number, number]> = [];

    for (const [first, second, third] of faces) {
      const firstSecond = midpointVertexIndex(first, second, vertices, midpointCache);
      const secondThird = midpointVertexIndex(second, third, vertices, midpointCache);
      const thirdFirst = midpointVertexIndex(third, first, vertices, midpointCache);

      nextFaces.push(
        [first, firstSecond, thirdFirst],
        [second, secondThird, firstSecond],
        [third, thirdFirst, secondThird],
        [firstSecond, secondThird, thirdFirst],
      );
    }

    faces = nextFaces;
  }

  return [...vertices].sort(compareIcospherePoints);
}

function baseIcosahedronVertices(): IcospherePoint[] {
  const goldenRatio = (1 + Math.sqrt(5)) / 2;
  const coordinates = [
    [-1, goldenRatio, 0],
    [1, goldenRatio, 0],
    [-1, -goldenRatio, 0],
    [1, -goldenRatio, 0],
    [0, -1, goldenRatio],
    [0, 1, goldenRatio],
    [0, -1, -goldenRatio],
    [0, 1, -goldenRatio],
    [goldenRatio, 0, -1],
    [goldenRatio, 0, 1],
    [-goldenRatio, 0, -1],
    [-goldenRatio, 0, 1],
  ];

  return coordinates.map(([x, y, z]) => normalizePoint({ x, y, z }));
}

function baseIcosahedronFaces(): Array<readonly [number, number, number]> {
  return [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
}

function midpointVertexIndex(
  firstIndex: number,
  secondIndex: number,
  vertices: IcospherePoint[],
  midpointCache: Map<string, number>,
): number {
  const key = [firstIndex, secondIndex].sort((left, right) => left - right).join(':');
  const cached = midpointCache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const first = vertices[firstIndex];
  const second = vertices[secondIndex];
  const midpoint = normalizePoint({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: (first.z + second.z) / 2,
  });
  const midpointIndex = vertices.length;
  vertices.push(midpoint);
  midpointCache.set(key, midpointIndex);
  return midpointIndex;
}

function farthestSampleVertices(
  vertices: readonly IcospherePoint[],
  count: number,
): readonly IcospherePoint[] {
  if (count >= vertices.length) {
    return vertices;
  }

  const selected = [vertices[0]];
  const selectedIndexes = new Set([0]);

  while (selected.length < count) {
    let bestIndex = -1;
    let bestDistance = -1;

    vertices.forEach((vertex, index) => {
      if (selectedIndexes.has(index)) {
        return;
      }

      const distance = selected.reduce(
        (minimumDistance, selectedVertex) =>
          Math.min(minimumDistance, squaredDistance(vertex, selectedVertex)),
        Number.POSITIVE_INFINITY,
      );

      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex < 0) {
      break;
    }

    selectedIndexes.add(bestIndex);
    selected.push(vertices[bestIndex]);
  }

  return selected;
}

function compareIcospherePoints(left: IcospherePoint, right: IcospherePoint): number {
  return (
    right.y - left.y ||
    Math.atan2(left.z, left.x) - Math.atan2(right.z, right.x) ||
    left.x - right.x ||
    left.z - right.z
  );
}

function squaredDistance(left: IcospherePoint, right: IcospherePoint): number {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2;
}

function normalizePoint(point: IcospherePoint): IcospherePoint {
  const length = Math.hypot(point.x, point.y, point.z);

  return {
    x: point.x / length,
    y: point.y / length,
    z: point.z / length,
  };
}

function radialRingSizes(childCount: number): readonly number[] {
  if (childCount <= 0) {
    return [];
  }

  if (childCount <= 12) {
    return [childCount];
  }

  const childrenPerRing = Math.ceil(Math.sqrt(childCount));
  const ringSizes: number[] = [];

  for (let remaining = childCount; remaining > 0; remaining -= childrenPerRing) {
    ringSizes.push(Math.min(childrenPerRing, remaining));
  }

  return ringSizes;
}

function radialRingRadiusForChildRadii(
  childRadii: readonly number[],
  options: ResolvedLayoutOptions,
): number {
  if (childRadii.length === 0) {
    return 0;
  }

  if (childRadii.length === 1) {
    return options.depthSpacing;
  }

  return Math.max(options.depthSpacing, minRadialRingRadiusForBranchSeparation(childRadii, options));
}

function minRadialRingRadiusForBranchSeparation(
  childRadii: readonly number[],
  options: ResolvedLayoutOptions,
): number {
  const angleStep = radialSiblingAngleStep(childRadii.length);
  let requiredRadius = 0;

  for (let leftIndex = 0; leftIndex < childRadii.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < childRadii.length; rightIndex += 1) {
      const separationSteps = rightIndex - leftIndex;
      const angleDelta = Math.min(separationSteps, childRadii.length - separationSteps) * angleStep;
      const branchSpan = childRadii[leftIndex] + childRadii[rightIndex] + options.siblingSpacing;

      requiredRadius = Math.max(requiredRadius, branchSpan / (2 * Math.sin(angleDelta / 2)));
    }
  }

  return requiredRadius;
}

function radialSiblingAngleStep(childCount: number): number {
  if (childCount <= 1) {
    return GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians;
  }

  return GRAPH_V0_LAYOUT_GEOMETRY.fullCircleRadians / childCount;
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
