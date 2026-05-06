export const GRAPH_V0_KIND_ORDER = {
  repo: 0,
  directory: 1,
  file: 2,
} as const;

export const GRAPH_V0_LAYOUT_DEFAULTS = {
  depthSpacing: 8,
  siblingSpacing: 4,
  layerSpacing: 7,
  gridColumns: 8,
  nodeRadius: 0.9,
  directoryRadius: 1.35,
  repoRadius: 1.8,
} as const;

export const GRAPH_V0_LAYOUT_GEOMETRY = {
  radialStartAngleRadians: -Math.PI / 2,
  fullCircleRadians: Math.PI * 2,
  gridOriginFactor: 0.5,
} as const;

export const GRAPH_V0_SELECTION_ID = {
  none: 0,
  kindShift: 24,
  indexMask: 0x00ff_ffff,
  nodeKind: 1,
  edgeKind: 2,
  maxIndex: 0x00ff_ffff,
} as const;

export const GRAPH_V0_SELECTION_DEFAULTS = {
  radius: 2,
  emptyDepth: Number.POSITIVE_INFINITY,
} as const;

export const GRAPH_V0_SELECTION_PRIORITY = {
  node: 0,
  edge: 1,
} as const;
