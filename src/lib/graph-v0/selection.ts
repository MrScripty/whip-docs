import {
  GRAPH_V0_SELECTION_DEFAULTS,
  GRAPH_V0_SELECTION_ID,
  GRAPH_V0_SELECTION_PRIORITY,
} from './constants';
import type {
  DecodedSelectionId,
  SelectionEntityKind,
  SelectionHit,
  SelectionOptions,
  SelectionPoint,
  SelectionSampleBuffer,
} from './types';

type CandidateHit = SelectionHit & {
  readonly kindPriority: number;
};

export function encodeSelectionId(kind: SelectionEntityKind, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > GRAPH_V0_SELECTION_ID.maxIndex) {
    throw new Error(`Selection index is out of range: ${index}`);
  }

  const kindValue = kind === 'node' ? GRAPH_V0_SELECTION_ID.nodeKind : GRAPH_V0_SELECTION_ID.edgeKind;

  return (kindValue << GRAPH_V0_SELECTION_ID.kindShift) | index;
}

export function decodeSelectionId(selectionId: number): DecodedSelectionId | null {
  if (!Number.isInteger(selectionId) || selectionId === GRAPH_V0_SELECTION_ID.none) {
    return null;
  }

  const kindValue = selectionId >>> GRAPH_V0_SELECTION_ID.kindShift;
  const index = selectionId & GRAPH_V0_SELECTION_ID.indexMask;
  const kind = decodeKind(kindValue);

  if (!kind) {
    return null;
  }

  return { kind, index, selectionId };
}

export function selectFromIdMap(
  buffer: SelectionSampleBuffer,
  point: SelectionPoint,
  options: SelectionOptions = {},
): SelectionHit | null {
  const radius = options.radius ?? GRAPH_V0_SELECTION_DEFAULTS.radius;
  const clampedX = clampInteger(point.x, 0, buffer.width - 1);
  const clampedY = clampInteger(point.y, 0, buffer.height - 1);
  const radiusFloor = Math.max(0, Math.floor(radius));
  const minX = Math.max(0, clampedX - radiusFloor);
  const maxX = Math.min(buffer.width - 1, clampedX + radiusFloor);
  const minY = Math.max(0, clampedY - radiusFloor);
  const maxY = Math.min(buffer.height - 1, clampedY + radiusFloor);
  let bestCandidate: CandidateHit | null = null;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const distanceSquared = squaredDistance(point, { x, y });

      if (distanceSquared > radiusFloor * radiusFloor) {
        continue;
      }

      const sampleIndex = y * buffer.width + x;
      const decoded = decodeSelectionId(buffer.ids[sampleIndex]);

      if (!decoded) {
        continue;
      }

      const candidate: CandidateHit = {
        ...decoded,
        x,
        y,
        depth: readDepth(buffer, sampleIndex),
        distanceSquared,
        kindPriority: selectionKindPriority(decoded.kind),
      };

      if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
        bestCandidate = candidate;
      }
    }
  }

  if (!bestCandidate) {
    return null;
  }

  return {
    kind: bestCandidate.kind,
    index: bestCandidate.index,
    selectionId: bestCandidate.selectionId,
    x: bestCandidate.x,
    y: bestCandidate.y,
    depth: bestCandidate.depth,
    distanceSquared: bestCandidate.distanceSquared,
  };
}

function decodeKind(kindValue: number): SelectionEntityKind | null {
  if (kindValue === GRAPH_V0_SELECTION_ID.nodeKind) {
    return 'node';
  }

  if (kindValue === GRAPH_V0_SELECTION_ID.edgeKind) {
    return 'edge';
  }

  return null;
}

function selectionKindPriority(kind: SelectionEntityKind): number {
  return GRAPH_V0_SELECTION_PRIORITY[kind];
}

function compareCandidates(left: CandidateHit, right: CandidateHit): number {
  return (
    left.kindPriority - right.kindPriority ||
    compareNumber(left.depth, right.depth) ||
    compareNumber(left.distanceSquared, right.distanceSquared) ||
    compareNumber(left.selectionId, right.selectionId)
  );
}

function compareNumber(left: number, right: number): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function readDepth(buffer: SelectionSampleBuffer, sampleIndex: number): number {
  const depth = buffer.depths?.[sampleIndex] ?? GRAPH_V0_SELECTION_DEFAULTS.emptyDepth;

  return Number.isFinite(depth) ? depth : GRAPH_V0_SELECTION_DEFAULTS.emptyDepth;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function squaredDistance(left: SelectionPoint, right: SelectionPoint): number {
  const x = left.x - right.x;
  const y = left.y - right.y;

  return x * x + y * y;
}
