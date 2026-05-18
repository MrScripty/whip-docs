import type { RenderGraphEdge } from './types';

export type FocusedFileOffset = {
  readonly x: number;
  readonly y: number;
};

export function focusedFileOffsets(
  fileNodeIds: readonly string[],
  relationEdges: readonly RenderGraphEdge[],
  spacing: number,
): ReadonlyMap<string, FocusedFileOffset> {
  const fileNodeIdSet = new Set(fileNodeIds);
  const localRelationEdges = relationEdges.filter((edge) => (
    edge.kind !== 'contains' &&
    fileNodeIdSet.has(edge.fromNodeId) &&
    fileNodeIdSet.has(edge.toNodeId)
  ));

  if (localRelationEdges.length === 0) {
    return gridFileOffsets(fileNodeIds, spacing);
  }

  const degreeByNodeId = new Map(fileNodeIds.map((fileNodeId) => [fileNodeId, 0]));
  for (const edge of localRelationEdges) {
    degreeByNodeId.set(edge.fromNodeId, (degreeByNodeId.get(edge.fromNodeId) ?? 0) + 1);
    degreeByNodeId.set(edge.toNodeId, (degreeByNodeId.get(edge.toNodeId) ?? 0) + 1);
  }

  const orderedFileNodeIds = [...fileNodeIds].sort((leftId, rightId) => {
    const degreeDelta = (degreeByNodeId.get(rightId) ?? 0) - (degreeByNodeId.get(leftId) ?? 0);
    return degreeDelta || leftId.localeCompare(rightId);
  });
  const positions = radialFileOffsets(orderedFileNodeIds, spacing);
  const maxRadius = Math.max(spacing, Math.sqrt(fileNodeIds.length) * spacing * 0.9);

  for (let iteration = 0; iteration < 90; iteration += 1) {
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

    for (const edge of localRelationEdges) {
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

      position.x = clamp(position.x + delta.x - position.x * 0.018, -maxRadius, maxRadius);
      position.y = clamp(position.y + delta.y - position.y * 0.018, -maxRadius, maxRadius);
    }
  }

  centerFileOffsets(positions);
  return positions;
}

function gridFileOffsets(fileNodeIds: readonly string[], spacing: number): Map<string, { x: number; y: number }> {
  const columns = Math.max(1, Math.ceil(Math.sqrt(fileNodeIds.length)));
  const rows = Math.max(1, Math.ceil(fileNodeIds.length / columns));
  const halfWidth = ((columns - 1) * spacing) / 2;
  const halfHeight = ((rows - 1) * spacing) / 2;
  const positions = new Map<string, { x: number; y: number }>();

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

function radialFileOffsets(fileNodeIds: readonly string[], spacing: number): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

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

function addFileLayoutDelta(
  deltas: Map<string, { x: number; y: number }>,
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

function centerFileOffsets(positions: Map<string, { x: number; y: number }>): void {
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
