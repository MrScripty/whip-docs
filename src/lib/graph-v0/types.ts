export type GraphNodeKind = 'repo' | 'directory' | 'file';

export type GraphEdgeKind = 'tree';

export type Vec3 = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type RenderGraphNode = {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly name: string;
  readonly path: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
};

export type RenderGraphEdge = {
  readonly id: string;
  readonly kind: GraphEdgeKind;
  readonly fromNodeId: string;
  readonly toNodeId: string;
};

export type RenderGraph = {
  readonly rootNodeId: string;
  readonly nodes: readonly RenderGraphNode[];
  readonly edges: readonly RenderGraphEdge[];
};

export type DirectoryGraphSceneTheme = {
  readonly background: number;
  readonly edge: number;
  readonly distantEdge: number;
  readonly repo: number;
  readonly directory: number;
  readonly file: number;
  readonly selected: number;
  readonly highlighted: number;
  readonly labelText: string;
  readonly labelBackground: string;
};

export type DirectoryGraphSceneOptions = {
  readonly layoutAlgorithm: LayoutAlgorithmId;
  readonly layoutOptions?: LayoutOptions;
  readonly selectedNodeId?: string | null;
  readonly selectedEdgeId?: string | null;
  readonly highlightedNodeIds?: readonly string[];
  readonly highlightedEdgeIds?: readonly string[];
  readonly labeledNodeIds?: readonly string[];
  readonly onSelect?: (selection: DirectoryGraphSceneSelection) => void;
};

export type DirectoryGraphSceneSelection = {
  readonly kind: SelectionEntityKind;
  readonly id: string;
};

export type DirectoryGraphSceneControlMode = 'select' | 'orbit' | 'pan';

export type DirectoryGraphNeighborhood = {
  readonly highlightedNodeIds: readonly string[];
  readonly highlightedEdgeIds: readonly string[];
  readonly labeledNodeIds: readonly string[];
  readonly firstLevelNodeIds: readonly string[];
  readonly secondLevelNodeIds: readonly string[];
};

export type LayoutAlgorithmId = 'radial-tree' | 'layered-grid';

export type LayoutOptions = Partial<{
  readonly depthSpacing: number;
  readonly siblingSpacing: number;
  readonly layerSpacing: number;
  readonly gridColumns: number;
  readonly nodeRadius: number;
  readonly directoryRadius: number;
  readonly repoRadius: number;
}>;

export type LayoutNodePosition = {
  readonly nodeId: string;
  readonly position: Vec3;
  readonly radius: number;
  readonly depth: number;
  readonly order: number;
};

export type LayoutResult = {
  readonly algorithm: LayoutAlgorithmId;
  readonly positions: ReadonlyMap<string, LayoutNodePosition>;
};

export type SelectionEntityKind = 'node' | 'edge';

export type DecodedSelectionId = {
  readonly kind: SelectionEntityKind;
  readonly index: number;
  readonly selectionId: number;
};

export type SelectionPoint = {
  readonly x: number;
  readonly y: number;
};

export type SelectionSampleBuffer = {
  readonly width: number;
  readonly height: number;
  readonly ids: ArrayLike<number>;
  readonly depths?: ArrayLike<number>;
};

export type SelectionOptions = Partial<{
  readonly radius: number;
}>;

export type SelectionHit = DecodedSelectionId & {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly distanceSquared: number;
};
