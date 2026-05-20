import { CubicBezierCurve3, Vector3 } from 'three';
import type { DirectoryGraphEdgeStyle, LayoutNodePosition } from './types';

export const EDGE_CURVE_SEGMENTS = 28;
export const FOCUSED_EDGE_BUNDLE_SEGMENTS = 36;
const FOCUSED_EDGE_BUNDLE_BETA = 0.85;

export function directoryEdgePathPoints(
  source: LayoutNodePosition,
  target: LayoutNodePosition,
  edgeStyle: DirectoryGraphEdgeStyle,
): Vector3[] {
  if (edgeStyle === 'straight') {
    return [nodeBottom(source), nodeTop(target)];
  }

  if (edgeStyle === 'elbow') {
    return directoryEdgeElbowPoints(source, target);
  }

  return directoryEdgeCurve(source, target, edgeStyle).getPoints(EDGE_CURVE_SEGMENTS);
}

export function directoryEdgeElbowPoints(
  source: LayoutNodePosition,
  target: LayoutNodePosition,
): [Vector3, Vector3, Vector3] {
  const sourceAnchor = nodeBottom(source);
  const targetAnchor = nodeTop(target);

  return [
    sourceAnchor,
    new Vector3(targetAnchor.x, sourceAnchor.y, targetAnchor.z),
    targetAnchor,
  ];
}

export function directoryEdgeCurve(
  source: LayoutNodePosition,
  target: LayoutNodePosition,
  edgeStyle: Exclude<DirectoryGraphEdgeStyle, 'straight' | 'elbow'> = 'bezier',
): CubicBezierCurve3 {
  const sourceAnchor = nodeBottom(source);
  const targetAnchor = nodeTop(target);
  const handleLength = edgeHandleLength(sourceAnchor, targetAnchor);

  if (edgeStyle === 'c-curve') {
    return new CubicBezierCurve3(
      sourceAnchor,
      sourceAnchor.clone().add(horizontalHandle(sourceAnchor, targetAnchor)),
      targetAnchor.clone().add(new Vector3(0, handleLength, 0)),
      targetAnchor,
    );
  }

  return new CubicBezierCurve3(
    sourceAnchor,
    sourceAnchor.clone().add(new Vector3(0, -handleLength, 0)),
    targetAnchor.clone().add(new Vector3(0, handleLength, 0)),
    targetAnchor,
  );
}

export function focusedCircularBundleEdgePathPoints(
  controlPath: readonly Vector3[],
): Vector3[] {
  if (controlPath.length < 2) {
    return controlPath.map((point) => point.clone());
  }

  const sourceAnchor = controlPath[0]?.clone() ?? new Vector3();
  const targetAnchor = controlPath[controlPath.length - 1]?.clone() ?? sourceAnchor.clone();
  const straightenedPath = controlPath.map((point, index) => {
    const straightPoint = sourceAnchor.clone().lerp(targetAnchor, index / Math.max(1, controlPath.length - 1));
    return straightPoint.lerp(point, FOCUSED_EDGE_BUNDLE_BETA);
  });

  return cubicBasisSplinePoints(straightenedPath, FOCUSED_EDGE_BUNDLE_SEGMENTS);
}

function cubicBasisSplinePoints(controlPath: readonly Vector3[], segmentCount: number): Vector3[] {
  if (controlPath.length < 2) {
    return controlPath.map((point) => point.clone());
  }

  const firstPoint = controlPath[0]?.clone() ?? new Vector3();
  const lastPoint = controlPath[controlPath.length - 1]?.clone() ?? firstPoint.clone();
  const paddedPath = [
    firstPoint.clone(),
    firstPoint.clone(),
    ...controlPath.map((point) => point.clone()),
    lastPoint.clone(),
    lastPoint.clone(),
  ];
  const splineSegmentCount = Math.max(1, paddedPath.length - 3);
  const samplesPerSegment = Math.max(2, Math.ceil(segmentCount / splineSegmentCount));
  const points: Vector3[] = [];

  for (let segmentIndex = 0; segmentIndex < splineSegmentCount; segmentIndex += 1) {
    const p0 = paddedPath[segmentIndex] ?? firstPoint;
    const p1 = paddedPath[segmentIndex + 1] ?? firstPoint;
    const p2 = paddedPath[segmentIndex + 2] ?? lastPoint;
    const p3 = paddedPath[segmentIndex + 3] ?? lastPoint;
    const startSample = segmentIndex === 0 ? 0 : 1;

    for (let sampleIndex = startSample; sampleIndex <= samplesPerSegment; sampleIndex += 1) {
      points.push(cubicBasisPoint(p0, p1, p2, p3, sampleIndex / samplesPerSegment));
    }
  }

  points[0] = firstPoint;
  points[points.length - 1] = lastPoint;

  return points;
}

function cubicBasisPoint(
  p0: Vector3,
  p1: Vector3,
  p2: Vector3,
  p3: Vector3,
  t: number,
): Vector3 {
  const oneMinusT = 1 - t;
  const b0 = (oneMinusT * oneMinusT * oneMinusT) / 6;
  const b1 = (3 * t * t * t - 6 * t * t + 4) / 6;
  const b2 = (-3 * t * t * t + 3 * t * t + 3 * t + 1) / 6;
  const b3 = (t * t * t) / 6;

  return new Vector3(
    p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3,
    p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3,
    p0.z * b0 + p1.z * b1 + p2.z * b2 + p3.z * b3,
  );
}

function edgeHandleLength(sourceAnchor: Vector3, targetAnchor: Vector3): number {
  const horizontalDistance = Math.hypot(sourceAnchor.x - targetAnchor.x, sourceAnchor.z - targetAnchor.z);
  const verticalDistance = Math.abs(sourceAnchor.y - targetAnchor.y);

  return Math.max(2.5, Math.min(18, horizontalDistance * 0.34 + verticalDistance * 0.28));
}

function horizontalHandle(sourceAnchor: Vector3, targetAnchor: Vector3): Vector3 {
  const horizontalDelta = new Vector3(targetAnchor.x - sourceAnchor.x, 0, targetAnchor.z - sourceAnchor.z);
  const horizontalDistance = horizontalDelta.length();
  const direction = horizontalDistance > 0 ? horizontalDelta.normalize() : new Vector3(1, 0, 0);
  const handleLength = Math.max(2.5, Math.min(24, horizontalDistance * 0.55));

  return direction.multiplyScalar(handleLength);
}

function nodeBottom(node: LayoutNodePosition): Vector3 {
  return new Vector3(node.position.x, node.position.y - node.radius, node.position.z);
}

function nodeTop(node: LayoutNodePosition): Vector3 {
  return new Vector3(node.position.x, node.position.y + node.radius, node.position.z);
}
