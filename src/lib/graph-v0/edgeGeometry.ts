import { CubicBezierCurve3, Vector3 } from 'three';
import type { DirectoryGraphEdgeStyle, LayoutNodePosition } from './types';

export const EDGE_CURVE_SEGMENTS = 28;
export const FOCUSED_EDGE_BUNDLE_SAMPLES_PER_SEGMENT = 14;
const FOCUSED_EDGE_BUNDLE_BETA = 0.85;
const FOCUSED_EDGE_BUNDLE_MIN_POINT_DISTANCE = 0.001;

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

  const compactPath = compactControlPath(controlPath);

  if (compactPath.length < 2) {
    return compactPath.map((point) => point.clone());
  }

  const sourceAnchor = compactPath[0]?.clone() ?? new Vector3();
  const targetAnchor = compactPath[compactPath.length - 1]?.clone() ?? sourceAnchor.clone();
  const straightenedPath = compactPath.map((point, index) => {
    const straightPoint = sourceAnchor.clone().lerp(targetAnchor, index / Math.max(1, compactPath.length - 1));
    return straightPoint.lerp(point, FOCUSED_EDGE_BUNDLE_BETA);
  });

  return cubicBasisSplinePoints(straightenedPath, FOCUSED_EDGE_BUNDLE_SAMPLES_PER_SEGMENT);
}

function compactControlPath(controlPath: readonly Vector3[]): Vector3[] {
  const compactPath: Vector3[] = [];

  for (const point of controlPath) {
    const previousPoint = compactPath[compactPath.length - 1];

    if (previousPoint && previousPoint.distanceTo(point) < FOCUSED_EDGE_BUNDLE_MIN_POINT_DISTANCE) {
      continue;
    }

    compactPath.push(point.clone());
  }

  return compactPath;
}

function cubicBasisSplinePoints(controlPath: readonly Vector3[], samplesPerSegment: number): Vector3[] {
  if (controlPath.length < 2) {
    return controlPath.map((point) => point.clone());
  }

  const firstPoint = controlPath[0]?.clone() ?? new Vector3();
  const lastPoint = controlPath[controlPath.length - 1]?.clone() ?? firstPoint.clone();
  const points = [firstPoint];

  if (controlPath.length === 2) {
    appendLineSamples(points, firstPoint, lastPoint, samplesPerSegment);
    return points;
  }

  let previousPoint = firstPoint;
  appendLineSamples(points, previousPoint, weightedPoint(firstPoint, firstPoint, controlPath[1] ?? firstPoint, 0, 5, 1), samplesPerSegment);
  previousPoint = points[points.length - 1] ?? previousPoint;

  for (let index = 2; index < controlPath.length; index += 1) {
    const p0 = controlPath[index - 2] ?? firstPoint;
    const p1 = controlPath[index - 1] ?? firstPoint;
    const p2 = controlPath[index] ?? lastPoint;
    const control1 = weightedPoint(p0, p1, p2, 2, 1, 0);
    const control2 = weightedPoint(p0, p1, p2, 1, 2, 0);
    const nextPoint = weightedPoint(p0, p1, p2, 1, 4, 1);

    appendCubicBezierSamples(points, previousPoint, control1, control2, nextPoint, samplesPerSegment);
    previousPoint = nextPoint;
  }

  const penultimatePoint = controlPath[controlPath.length - 2] ?? firstPoint;
  appendLineSamples(points, previousPoint, weightedPoint(penultimatePoint, lastPoint, lastPoint, 1, 5, 0), samplesPerSegment);
  appendLineSamples(points, points[points.length - 1] ?? previousPoint, lastPoint, samplesPerSegment);

  return points;
}

function appendLineSamples(
  points: Vector3[],
  startPoint: Vector3,
  endPoint: Vector3,
  samplesPerSegment: number,
): void {
  for (let sampleIndex = 1; sampleIndex <= samplesPerSegment; sampleIndex += 1) {
    points.push(startPoint.clone().lerp(endPoint, sampleIndex / samplesPerSegment));
  }
}

function appendCubicBezierSamples(
  points: Vector3[],
  startPoint: Vector3,
  control1: Vector3,
  control2: Vector3,
  endPoint: Vector3,
  samplesPerSegment: number,
): void {
  for (let sampleIndex = 1; sampleIndex <= samplesPerSegment; sampleIndex += 1) {
    points.push(cubicBezierPoint(startPoint, control1, control2, endPoint, sampleIndex / samplesPerSegment));
  }
}

function cubicBezierPoint(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
  const oneMinusT = 1 - t;
  const b0 = oneMinusT * oneMinusT * oneMinusT;
  const b1 = 3 * oneMinusT * oneMinusT * t;
  const b2 = 3 * oneMinusT * t * t;
  const b3 = t * t * t;

  return new Vector3(
    p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3,
    p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3,
    p0.z * b0 + p1.z * b1 + p2.z * b2 + p3.z * b3,
  );
}

function weightedPoint(p0: Vector3, p1: Vector3, p2: Vector3, w0: number, w1: number, w2: number): Vector3 {
  const totalWeight = w0 + w1 + w2;

  return new Vector3(
    (p0.x * w0 + p1.x * w1 + p2.x * w2) / totalWeight,
    (p0.y * w0 + p1.y * w1 + p2.y * w2) / totalWeight,
    (p0.z * w0 + p1.z * w1 + p2.z * w2) / totalWeight,
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
