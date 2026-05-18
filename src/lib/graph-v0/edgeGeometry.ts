import { CubicBezierCurve3, Vector3 } from 'three';
import type { DirectoryGraphEdgeStyle, LayoutNodePosition } from './types';

export const EDGE_CURVE_SEGMENTS = 28;
export const FOCUSED_EDGE_BUNDLE_SEGMENTS = 36;
const FOCUSED_EDGE_BUNDLE_PULL = 0.62;

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
  const sourceControl = bundleControlPoint(sourceAnchor, targetAnchor, bundleCenter, FOCUSED_EDGE_BUNDLE_PULL);
  const targetControl = bundleControlPoint(targetAnchor, sourceAnchor, bundleCenter, FOCUSED_EDGE_BUNDLE_PULL);

  return new CubicBezierCurve3(
    sourceAnchor,
    sourceControl,
    targetControl,
    targetAnchor,
  ).getPoints(FOCUSED_EDGE_BUNDLE_SEGMENTS);
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

function bundleControlPoint(
  anchor: Vector3,
  oppositeAnchor: Vector3,
  bundleCenter: Vector3,
  bundlePull: number,
): Vector3 {
  return anchor
    .clone()
    .lerp(oppositeAnchor, 0.28)
    .lerp(bundleCenter, bundlePull);
}
