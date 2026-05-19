import { CatmullRomCurve3, CubicBezierCurve3, Vector3 } from 'three';
import type { DirectoryGraphEdgeStyle, LayoutNodePosition } from './types';

export const EDGE_CURVE_SEGMENTS = 28;
export const FOCUSED_EDGE_BUNDLE_SEGMENTS = 36;
const FOCUSED_EDGE_BUNDLE_BETA = 0.85;
const FOCUSED_EDGE_BUNDLE_INNER_RADIUS_RATIO = 0.38;
const FOCUSED_EDGE_BUNDLE_MIDDLE_RADIUS_RATIO = 0.12;

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
  source: LayoutNodePosition,
  target: LayoutNodePosition,
  bundleCenter: Vector3,
): Vector3[] {
  const sourceAnchor = nodeCenter(source);
  const targetAnchor = nodeCenter(target);
  const bundlePath = bundledRadialControlPath(sourceAnchor, targetAnchor, bundleCenter);
  const straightenedPath = bundlePath.map((point, index) => {
    const straightPoint = sourceAnchor.clone().lerp(targetAnchor, index / Math.max(1, bundlePath.length - 1));
    return straightPoint.lerp(point, FOCUSED_EDGE_BUNDLE_BETA);
  });

  return new CatmullRomCurve3(straightenedPath, false, 'centripetal')
    .getPoints(FOCUSED_EDGE_BUNDLE_SEGMENTS);
}

function bundledRadialControlPath(
  sourceAnchor: Vector3,
  targetAnchor: Vector3,
  bundleCenter: Vector3,
): Vector3[] {
  const sourceRadius = Math.max(0.001, sourceAnchor.distanceTo(bundleCenter));
  const targetRadius = Math.max(0.001, targetAnchor.distanceTo(bundleCenter));
  const sourceDirection = sourceAnchor.clone().sub(bundleCenter).normalize();
  const targetDirection = targetAnchor.clone().sub(bundleCenter).normalize();
  const sourceInnerRadius = sourceRadius * FOCUSED_EDGE_BUNDLE_INNER_RADIUS_RATIO;
  const targetInnerRadius = targetRadius * FOCUSED_EDGE_BUNDLE_INNER_RADIUS_RATIO;
  const middleRadius = Math.min(sourceRadius, targetRadius) * FOCUSED_EDGE_BUNDLE_MIDDLE_RADIUS_RATIO;

  return [
    sourceAnchor,
    bundleCenter.clone().add(sourceDirection.clone().multiplyScalar(sourceInnerRadius)),
    bundleCenter.clone().add(sourceDirection.clone().multiplyScalar(middleRadius)),
    bundleCenter.clone(),
    bundleCenter.clone().add(targetDirection.clone().multiplyScalar(middleRadius)),
    bundleCenter.clone().add(targetDirection.clone().multiplyScalar(targetInnerRadius)),
    targetAnchor,
  ];
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

function nodeCenter(node: LayoutNodePosition): Vector3 {
  return new Vector3(node.position.x, node.position.y, node.position.z);
}
