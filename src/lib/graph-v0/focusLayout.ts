import type { FocusedFileLayoutAlgorithmId, RenderGraphEdge } from './types';

export const FOCUSED_FILE_LAYOUT_ALGORITHMS: readonly FocusedFileLayoutAlgorithmId[] = [
  'grid',
  'flow-layered',
  'dag-layered',
  'force-directed',
  'circular',
];

export type FocusedFileOffset = {
  readonly x: number;
  readonly y: number;
};

export type FocusedFileLayoutOptions = {
  readonly spacing: number;
  readonly algorithm?: FocusedFileLayoutAlgorithmId;
};

type MutableFileOffset = {
  x: number;
  y: number;
};

type LocalRelationGraph = {
  readonly relationEdges: readonly RenderGraphEdge[];
  readonly directedEdges: readonly RenderGraphEdge[];
  readonly degreeByNodeId: ReadonlyMap<string, number>;
  readonly relationFlowByNodeId: ReadonlyMap<string, number>;
};

export function focusedFileOffsets(
  fileNodeIds: readonly string[],
  relationEdges: readonly RenderGraphEdge[],
  options: number | FocusedFileLayoutOptions,
): ReadonlyMap<string, FocusedFileOffset> {
  const { algorithm, spacing } = normalizeFocusedFileLayoutOptions(options);
  const localGraph = localRelationGraph(fileNodeIds, relationEdges);

  if (algorithm === 'grid') {
    return gridFileOffsets(fileNodeIds, spacing);
  }

  if (algorithm === 'circular') {
    return circularFileOffsets(orderedFileNodeIds(fileNodeIds, localGraph), spacing);
  }

  if (localGraph.relationEdges.length === 0) {
    return gridFileOffsets(fileNodeIds, spacing);
  }

  const orderedNodeIds = orderedFileNodeIds(fileNodeIds, localGraph);

  if (algorithm === 'dag-layered') {
    return dagLayeredFileOffsets(orderedNodeIds, localGraph, spacing);
  }

  if (algorithm === 'force-directed') {
    return forceDirectedFileOffsets(
      fileNodeIds,
      localGraph.relationEdges,
      radialFileOffsets(orderedNodeIds, spacing),
      spacing,
    );
  }

  return flowLayeredFileOffsets(orderedNodeIds, localGraph, spacing);
}

function normalizeFocusedFileLayoutOptions(
  options: number | FocusedFileLayoutOptions,
): Required<FocusedFileLayoutOptions> {
  if (typeof options === 'number') {
    return { algorithm: 'flow-layered', spacing: options };
  }

  return {
    algorithm: options.algorithm ?? 'flow-layered',
    spacing: options.spacing,
  };
}

function localRelationGraph(
  fileNodeIds: readonly string[],
  relationEdges: readonly RenderGraphEdge[],
): LocalRelationGraph {
  const fileNodeIdSet = new Set(fileNodeIds);
  const localRelationEdges = relationEdges.filter((edge) => (
    edge.kind !== 'contains' &&
    fileNodeIdSet.has(edge.fromNodeId) &&
    fileNodeIdSet.has(edge.toNodeId)
  ));
  const degreeByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, 0]));
  const relationFlowByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, 0]));
  const directedEdges: RenderGraphEdge[] = [];

  for (const edge of localRelationEdges) {
    degreeByNodeId.set(edge.fromNodeId, (degreeByNodeId.get(edge.fromNodeId) ?? 0) + 1);
    degreeByNodeId.set(edge.toNodeId, (degreeByNodeId.get(edge.toNodeId) ?? 0) + 1);

    const flowWeight = directedRelationWeight(edge);
    if (flowWeight > 0) {
      directedEdges.push(edge);
    }

    relationFlowByNodeId.set(edge.fromNodeId, (relationFlowByNodeId.get(edge.fromNodeId) ?? 0) + flowWeight);
    relationFlowByNodeId.set(edge.toNodeId, (relationFlowByNodeId.get(edge.toNodeId) ?? 0) - flowWeight);
  }

  return {
    degreeByNodeId,
    directedEdges,
    relationEdges: localRelationEdges,
    relationFlowByNodeId,
  };
}

function orderedFileNodeIds(
  fileNodeIds: readonly string[],
  localGraph: LocalRelationGraph,
): string[] {
  return [...fileNodeIds].sort((leftId, rightId) => {
    const degreeDelta = (localGraph.degreeByNodeId.get(rightId) ?? 0) - (localGraph.degreeByNodeId.get(leftId) ?? 0);
    const flowDelta = (localGraph.relationFlowByNodeId.get(rightId) ?? 0) -
      (localGraph.relationFlowByNodeId.get(leftId) ?? 0);
    return degreeDelta || flowDelta || leftId.localeCompare(rightId);
  });
}

function gridFileOffsets(fileNodeIds: readonly string[], spacing: number): Map<string, MutableFileOffset> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(fileNodeIds.length)));
  const rows = Math.max(1, Math.ceil(fileNodeIds.length / columns));
  const halfWidth = ((columns - 1) * spacing) / 2;
  const halfHeight = ((rows - 1) * spacing) / 2;
  const positions = new Map<string, MutableFileOffset>();

  fileNodeIds.forEach((fileNodeId, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(fileNodeId, {
      x: column * spacing - halfWidth,
      y: halfHeight - row * spacing,
    });
  });

  return positions;
}

function flowLayeredFileOffsets(
  fileNodeIds: readonly string[],
  localGraph: LocalRelationGraph,
  spacing: number,
): Map<string, MutableFileOffset> {
  const positions = flowSeededFileOffsets(fileNodeIds, localGraph.relationFlowByNodeId, spacing);
  return forceDirectedFileOffsets(
    fileNodeIds,
    localGraph.relationEdges,
    positions,
    spacing,
    localGraph.relationFlowByNodeId,
  );
}

function dagLayeredFileOffsets(
  fileNodeIds: readonly string[],
  localGraph: LocalRelationGraph,
  spacing: number,
): Map<string, MutableFileOffset> {
  if (localGraph.directedEdges.length === 0) {
    return forceDirectedFileOffsets(
      fileNodeIds,
      localGraph.relationEdges,
      radialFileOffsets(fileNodeIds, spacing),
      spacing,
    );
  }

  const layerByNodeId = directedLayerByNodeId(fileNodeIds, localGraph);
  const layers = layersFromNodeIds(fileNodeIds, layerByNodeId, localGraph);
  reduceLayerCrossings(layers, localGraph.directedEdges, 8);

  const positions = new Map<string, MutableFileOffset>();
  const layerSpacing = spacing * 1.25;
  const columnSpacing = spacing * 1.15;
  const layerCount = layers.length;
  const topY = ((layerCount - 1) * layerSpacing) / 2;

  layers.forEach((layerNodeIds, layerIndex) => {
    const halfWidth = ((layerNodeIds.length - 1) * columnSpacing) / 2;
    const y = topY - layerIndex * layerSpacing;

    layerNodeIds.forEach((fileNodeId, index) => {
      positions.set(fileNodeId, {
        x: index * columnSpacing - halfWidth,
        y,
      });
    });
  });

  centerFileOffsets(positions);
  return positions;
}

function directedLayerByNodeId(
  fileNodeIds: readonly string[],
  localGraph: LocalRelationGraph,
): ReadonlyMap<string, number> {
  const topologicalLayers = topologicalLayerByNodeId(fileNodeIds, localGraph.directedEdges);

  if (topologicalLayers) {
    normalizeIsolatedNodeLayers(fileNodeIds, topologicalLayers, localGraph.degreeByNodeId);
    return topologicalLayers;
  }

  return flowRankLayerByNodeId(fileNodeIds, localGraph);
}

function topologicalLayerByNodeId(
  fileNodeIds: readonly string[],
  directedEdges: readonly RenderGraphEdge[],
): Map<string, number> | null {
  const incomingCountByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, 0]));
  const outgoingEdgesByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, [] as RenderGraphEdge[]]));
  const layerByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, 0]));

  for (const edge of directedEdges) {
    incomingCountByNodeId.set(edge.toNodeId, (incomingCountByNodeId.get(edge.toNodeId) ?? 0) + 1);
    outgoingEdgesByNodeId.get(edge.fromNodeId)?.push(edge);
  }

  const readyNodeIds = fileNodeIds
    .filter((fileNodeId) => (incomingCountByNodeId.get(fileNodeId) ?? 0) === 0)
    .sort((leftId, rightId) => leftId.localeCompare(rightId));
  const visitedNodeIds = new Set<string>();

  while (readyNodeIds.length > 0) {
    const fileNodeId = readyNodeIds.shift();

    if (!fileNodeId) {
      continue;
    }

    visitedNodeIds.add(fileNodeId);

    for (const edge of outgoingEdgesByNodeId.get(fileNodeId) ?? []) {
      layerByNodeId.set(edge.toNodeId, Math.max(
        layerByNodeId.get(edge.toNodeId) ?? 0,
        (layerByNodeId.get(fileNodeId) ?? 0) + 1,
      ));
      incomingCountByNodeId.set(edge.toNodeId, (incomingCountByNodeId.get(edge.toNodeId) ?? 0) - 1);

      if ((incomingCountByNodeId.get(edge.toNodeId) ?? 0) === 0) {
        readyNodeIds.push(edge.toNodeId);
        readyNodeIds.sort((leftId, rightId) => leftId.localeCompare(rightId));
      }
    }
  }

  return visitedNodeIds.size === fileNodeIds.length ? layerByNodeId : null;
}

function normalizeIsolatedNodeLayers(
  fileNodeIds: readonly string[],
  layerByNodeId: Map<string, number>,
  degreeByNodeId: ReadonlyMap<string, number>,
): void {
  const maxLayer = Math.max(...fileNodeIds.map((fileNodeId) => layerByNodeId.get(fileNodeId) ?? 0), 0);
  const middleLayer = Math.round(maxLayer / 2);

  for (const fileNodeId of fileNodeIds) {
    if ((degreeByNodeId.get(fileNodeId) ?? 0) === 0) {
      layerByNodeId.set(fileNodeId, middleLayer);
    }
  }
}

function flowRankLayerByNodeId(
  fileNodeIds: readonly string[],
  localGraph: LocalRelationGraph,
): ReadonlyMap<string, number> {
  const orderedNodeIds = [...fileNodeIds].sort((leftId, rightId) => {
    const flowDelta = (localGraph.relationFlowByNodeId.get(rightId) ?? 0) -
      (localGraph.relationFlowByNodeId.get(leftId) ?? 0);
    const degreeDelta = (localGraph.degreeByNodeId.get(rightId) ?? 0) - (localGraph.degreeByNodeId.get(leftId) ?? 0);
    return flowDelta || degreeDelta || leftId.localeCompare(rightId);
  });
  const maxLayer = Math.min(Math.max(orderedNodeIds.length - 1, 1), 5);
  const layerByNodeId = new Map<string, number>();

  orderedNodeIds.forEach((fileNodeId, index) => {
    const denominator = Math.max(1, orderedNodeIds.length - 1);
    layerByNodeId.set(fileNodeId, Math.round((index / denominator) * maxLayer));
  });

  return layerByNodeId;
}

function layersFromNodeIds(
  fileNodeIds: readonly string[],
  layerByNodeId: ReadonlyMap<string, number>,
  localGraph: LocalRelationGraph,
): string[][] {
  const maxLayer = Math.max(...fileNodeIds.map((fileNodeId) => layerByNodeId.get(fileNodeId) ?? 0), 0);
  const layers = Array.from({ length: maxLayer + 1 }, () => [] as string[]);

  for (const fileNodeId of fileNodeIds) {
    layers[layerByNodeId.get(fileNodeId) ?? 0]?.push(fileNodeId);
  }

  for (const layer of layers) {
    layer.sort((leftId, rightId) => {
      const flowDelta = (localGraph.relationFlowByNodeId.get(rightId) ?? 0) -
        (localGraph.relationFlowByNodeId.get(leftId) ?? 0);
      const degreeDelta = (localGraph.degreeByNodeId.get(rightId) ?? 0) - (localGraph.degreeByNodeId.get(leftId) ?? 0);
      return flowDelta || degreeDelta || leftId.localeCompare(rightId);
    });
  }

  return layers.filter((layer) => layer.length > 0);
}

function reduceLayerCrossings(
  layers: string[][],
  directedEdges: readonly RenderGraphEdge[],
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass += 1) {
    for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
      sortLayerByNeighborBarycenter(layers, layerIndex, directedEdges, 'incoming');
    }

    for (let layerIndex = layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
      sortLayerByNeighborBarycenter(layers, layerIndex, directedEdges, 'outgoing');
    }
  }
}

function sortLayerByNeighborBarycenter(
  layers: readonly string[][],
  layerIndex: number,
  directedEdges: readonly RenderGraphEdge[],
  direction: 'incoming' | 'outgoing',
): void {
  const layer = layers[layerIndex];

  if (!layer) {
    return;
  }

  const orderByNodeId = layerOrderByNodeId(layers);
  layer.sort((leftId, rightId) => {
    const leftBarycenter = neighborBarycenter(leftId, orderByNodeId, directedEdges, direction);
    const rightBarycenter = neighborBarycenter(rightId, orderByNodeId, directedEdges, direction);
    return leftBarycenter - rightBarycenter || leftId.localeCompare(rightId);
  });
}

function layerOrderByNodeId(layers: readonly string[][]): ReadonlyMap<string, number> {
  const orderByNodeId = new Map<string, number>();

  for (const layer of layers) {
    layer.forEach((fileNodeId, index) => {
      orderByNodeId.set(fileNodeId, index);
    });
  }

  return orderByNodeId;
}

function neighborBarycenter(
  fileNodeId: string,
  orderByNodeId: ReadonlyMap<string, number>,
  directedEdges: readonly RenderGraphEdge[],
  direction: 'incoming' | 'outgoing',
): number {
  let neighborOrderTotal = 0;
  let neighborCount = 0;

  for (const edge of directedEdges) {
    const neighborId = direction === 'incoming'
      ? edge.fromNodeId
      : edge.toNodeId;

    if ((direction === 'incoming' && edge.toNodeId !== fileNodeId) ||
      (direction === 'outgoing' && edge.fromNodeId !== fileNodeId)) {
      continue;
    }

    const neighborOrder = orderByNodeId.get(neighborId);

    if (neighborOrder === undefined) {
      continue;
    }

    neighborOrderTotal += neighborOrder;
    neighborCount += 1;
  }

  return neighborCount === 0 ? Number.MAX_SAFE_INTEGER : neighborOrderTotal / neighborCount;
}

function forceDirectedFileOffsets(
  fileNodeIds: readonly string[],
  relationEdges: readonly RenderGraphEdge[],
  initialPositions: Map<string, MutableFileOffset>,
  spacing: number,
  relationFlowByNodeId?: ReadonlyMap<string, number>,
): Map<string, MutableFileOffset> {
  const positions = cloneFileOffsets(initialPositions);
  const maxRadius = Math.max(spacing, Math.sqrt(fileNodeIds.length) * spacing * 0.9);
  const maxFlowMagnitude = relationFlowByNodeId
    ? Math.max(...fileNodeIds.map((fileNodeId) => Math.abs(relationFlowByNodeId.get(fileNodeId) ?? 0)), 0)
    : 0;
  const flowRadius = Math.max(spacing, maxRadius * 0.82);

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const deltas = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, { x: 0, y: 0 }]));

    for (let leftIndex = 0; leftIndex < fileNodeIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < fileNodeIds.length; rightIndex += 1) {
        const leftId = fileNodeIds[leftIndex];
        const rightId = fileNodeIds[rightIndex];

        if (!leftId || !rightId) {
          continue;
        }

        const left = positions.get(leftId);
        const right = positions.get(rightId);

        if (!left || !right) {
          continue;
        }

        const dx = right.x - left.x || 0.01;
        const dy = right.y - left.y || 0.01;
        const distance = Math.max(0.01, Math.hypot(dx, dy));
        const force = Math.min(0.16, (spacing * spacing) / (distance * distance) * 0.035);
        const offsetX = (dx / distance) * force;
        const offsetY = (dy / distance) * force;

        addFileLayoutDelta(deltas, leftId, -offsetX, -offsetY);
        addFileLayoutDelta(deltas, rightId, offsetX, offsetY);
      }
    }

    for (const edge of relationEdges) {
      const source = positions.get(edge.fromNodeId);
      const target = positions.get(edge.toNodeId);

      if (!source || !target) {
        continue;
      }

      const dx = target.x - source.x || 0.01;
      const dy = target.y - source.y || 0.01;
      const distance = Math.max(0.01, Math.hypot(dx, dy));
      const targetDistance = spacing * 1.15;
      const force = clamp((distance - targetDistance) * 0.018 * Math.sqrt(edge.weight ?? 1), -0.18, 0.18);
      const offsetX = (dx / distance) * force;
      const offsetY = (dy / distance) * force;

      addFileLayoutDelta(deltas, edge.fromNodeId, offsetX, offsetY);
      addFileLayoutDelta(deltas, edge.toNodeId, -offsetX, -offsetY);
    }

    for (const fileNodeId of fileNodeIds) {
      const position = positions.get(fileNodeId);
      const delta = deltas.get(fileNodeId);

      if (!position || !delta) {
        continue;
      }

      const flowTargetY = maxFlowMagnitude === 0
        ? 0
        : ((relationFlowByNodeId?.get(fileNodeId) ?? 0) / maxFlowMagnitude) * flowRadius;
      const flowPullY = maxFlowMagnitude === 0 ? 0 : (flowTargetY - position.y) * 0.04;

      position.x = clamp(position.x + delta.x - position.x * 0.018, -maxRadius, maxRadius);
      position.y = clamp(position.y + delta.y + flowPullY - position.y * 0.01, -maxRadius, maxRadius);
    }
  }

  centerFileOffsets(positions);
  return positions;
}

function flowSeededFileOffsets(
  fileNodeIds: readonly string[],
  relationFlowByNodeId: ReadonlyMap<string, number>,
  spacing: number,
): Map<string, MutableFileOffset> {
  const positions = radialFileOffsets(fileNodeIds, spacing);
  const maxFlowMagnitude = Math.max(
    ...fileNodeIds.map((fileNodeId) => Math.abs(relationFlowByNodeId.get(fileNodeId) ?? 0)),
    0,
  );

  if (maxFlowMagnitude === 0) {
    return positions;
  }

  const layerRadius = Math.max(spacing, Math.sqrt(fileNodeIds.length) * spacing * 0.72);

  for (const [fileNodeId, position] of positions.entries()) {
    const relationFlow = relationFlowByNodeId.get(fileNodeId) ?? 0;
    position.y = (relationFlow / maxFlowMagnitude) * layerRadius;
  }

  return positions;
}

function radialFileOffsets(fileNodeIds: readonly string[], spacing: number): Map<string, MutableFileOffset> {
  const positions = new Map<string, MutableFileOffset>();

  fileNodeIds.forEach((fileNodeId, index) => {
    if (index === 0) {
      positions.set(fileNodeId, { x: 0, y: 0 });
      return;
    }

    const ring = Math.ceil((Math.sqrt(index) - 0.5) / 1.45);
    const ringStart = Math.max(1, Math.floor((ring * 1.45 + 0.5) ** 2));
    const ringEnd = Math.floor(((ring + 1) * 1.45 + 0.5) ** 2);
    const ringCapacity = Math.max(1, ringEnd - ringStart);
    const angle = ((index - ringStart) / ringCapacity) * Math.PI * 2 - Math.PI / 2;
    const radius = ring * spacing;

    positions.set(fileNodeId, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  return positions;
}

function circularFileOffsets(fileNodeIds: readonly string[], spacing: number): Map<string, MutableFileOffset> {
  const positions = new Map<string, MutableFileOffset>();

  if (fileNodeIds.length === 0) {
    return positions;
  }

  if (fileNodeIds.length === 1) {
    const fileNodeId = fileNodeIds[0];
    if (fileNodeId) {
      positions.set(fileNodeId, { x: 0, y: 0 });
    }
    return positions;
  }

  const radius = Math.max(spacing, (fileNodeIds.length * spacing) / (Math.PI * 2));

  fileNodeIds.forEach((fileNodeId, index) => {
    const angle = (index / fileNodeIds.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(fileNodeId, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });

  centerFileOffsets(positions);
  return positions;
}

function directedRelationWeight(edge: RenderGraphEdge): number {
  if (edge.direction === 'undirected') {
    return 0;
  }

  return Math.max(0, edge.weight ?? 1);
}

function cloneFileOffsets(positions: ReadonlyMap<string, MutableFileOffset>): Map<string, MutableFileOffset> {
  return new Map(Array.from(positions.entries()).map(([fileNodeId, position]) => [
    fileNodeId,
    { x: position.x, y: position.y },
  ]));
}

function addFileLayoutDelta(
  deltas: Map<string, MutableFileOffset>,
  fileNodeId: string,
  x: number,
  y: number,
): void {
  const delta = deltas.get(fileNodeId);

  if (!delta) {
    return;
  }

  delta.x += x;
  delta.y += y;
}

function centerFileOffsets(positions: Map<string, MutableFileOffset>): void {
  if (positions.size === 0) {
    return;
  }

  let centerX = 0;
  let centerY = 0;

  for (const position of positions.values()) {
    centerX += position.x;
    centerY += position.y;
  }

  centerX /= positions.size;
  centerY /= positions.size;

  for (const position of positions.values()) {
    position.x -= centerX;
    position.y -= centerY;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
