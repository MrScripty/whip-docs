export const GRAPH_V0_KIND_ORDER = {
  repo: 0,
  directory: 1,
  file: 2,
} as const;

export const GRAPH_V0_LAYOUT_DEFAULTS = {
  depthSpacing: 8,
  siblingSpacing: 7,
  layerSpacing: 23,
  rootLayerSpacing: 40,
  gridColumns: 8,
  nodeRadius: 0.9,
  directoryRadius: 1.35,
  repoRadius: 1.8,
} as const;

export const GRAPH_V0_LAYOUT_GEOMETRY = {
  radialStartAngleRadians: -Math.PI / 2,
  fullCircleRadians: Math.PI * 2,
} as const;

export const GRAPH_V0_SELECTION_ID = {
  none: 0,
  kindShift: 20,
  indexMask: 0x000f_ffff,
  nodeKind: 1,
  edgeKind: 2,
  maxIndex: 0x000f_ffff,
} as const;

export const GRAPH_V0_SELECTION_DEFAULTS = {
  radius: 5,
  emptyDepth: Number.POSITIVE_INFINITY,
} as const;

export const GRAPH_V0_SELECTION_PRIORITY = {
  node: 0,
  edge: 1,
} as const;

export const GRAPH_V0_CAMERA_DEFAULTS = {
  fieldOfView: 45,
  near: 0.1,
  far: 2000,
  framingPadding: 1.32,
  positionX: 0,
  positionY: 34,
  positionZ: 58,
} as const;

export const GRAPH_V0_INTERACTION_DEFAULTS = {
  minCameraDistance: 14,
  maxCameraDistance: 5000,
  cameraTransitionMs: 260,
  wheelZoomFactor: 0.0016,
  rotateFactor: 0.006,
  panFactor: 0.038,
} as const;

export const GRAPH_V0_DEPTH_STYLE_DEFAULTS = {
  fadeStartDepth: 2,
  fadeDepthSpan: 5,
  minOpacity: 0.18,
  maxLabelDepth: 2,
} as const;
