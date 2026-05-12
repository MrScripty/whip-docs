import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoColorSpace,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  type Texture,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import {
  GRAPH_V0_CAMERA_DEFAULTS,
  GRAPH_V0_DEPTH_STYLE_DEFAULTS,
  GRAPH_V0_INTERACTION_DEFAULTS,
} from './constants';
import { directoryEdgeCurve, directoryEdgeElbowPoints, directoryEdgePathPoints } from './edgeGeometry';
import { layoutLayeredGrid, layoutRadialTree } from './layouts';
import { encodeSelectionId, selectFromIdMap } from './selection';
import { diffSelectionState, emptySelectionState } from './selectionIndex';
import type { GraphSelectionState } from './selectionIndex';
import type {
  DirectoryGraphSceneOptions,
  DirectoryGraphSceneSelection,
  DirectoryGraphSceneTheme,
  DirectoryGraphSceneControlMode,
  DirectoryGraphEdgeStyle,
  DirectoryGraphLeafEdgeStyle,
  GraphNodeKind,
  LayoutOptions,
  LayoutNodePosition,
  RenderGraph,
  RenderGraphNode,
} from './types';

type NodeMesh = Mesh<BufferGeometry, MeshLambertMaterial>;
type EdgeLine = Line<BufferGeometry, LineBasicMaterial>;
type SelectionMesh = Mesh<BufferGeometry, MeshBasicMaterial> | Group;

type NodeSceneEntry = {
  readonly mesh: NodeMesh;
  readonly kind: GraphNodeKind;
  readonly name: string;
  readonly depth: number;
  readonly position: LayoutNodePosition;
};

type EdgeSceneEntry = {
  readonly line: EdgeLine;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly depth: number;
};

type FocusedDirectoryView = {
  readonly directoryNodeId: string;
  readonly hiddenEdgeIds: readonly string[];
  readonly fileNodeIds: readonly string[];
};

type PointerDragState = {
  readonly pointerId: number;
  readonly mode: DirectoryGraphSceneControlMode;
  readonly origin: Vector2;
  readonly cameraPosition: Vector3;
  readonly cameraTarget: Vector3;
  moved: boolean;
};

type SelectionTarget = DirectoryGraphSceneSelection & {
  readonly selectionId: number;
};

type LayoutBounds = {
  readonly center: Vector3;
  readonly radius: number;
};

type CameraTransition = {
  readonly startedAtMs: number;
  readonly durationMs: number;
  readonly fromPosition: Vector3;
  readonly toPosition: Vector3;
  readonly fromTarget: Vector3;
  readonly toTarget: Vector3;
  readonly toFar: number;
};

export class DirectoryGraphScene {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(
    GRAPH_V0_CAMERA_DEFAULTS.fieldOfView,
    1,
    GRAPH_V0_CAMERA_DEFAULTS.near,
    GRAPH_V0_CAMERA_DEFAULTS.far,
  );
  private readonly renderer = new WebGLRenderer({ antialias: true });
  private readonly nodeGroup = new Group();
  private readonly edgeGroup = new Group();
  private readonly labelGroup = new Group();
  private readonly selectionScene = new Scene();
  private readonly selectionNodeGroup = new Group();
  private readonly selectionEdgeGroup = new Group();
  private readonly selectionTarget = new WebGLRenderTarget(1, 1);
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new Raycaster();
  private readonly theme: DirectoryGraphSceneTheme;
  private readonly selectionTargetById = new Map<number, SelectionTarget>();
  private readonly graphNodesById = new Map<string, RenderGraphNode>();
  private readonly nodeEntries = new Map<string, NodeSceneEntry>();
  private readonly edgeEntries = new Map<string, EdgeSceneEntry>();
  private readonly selectionNodeMeshesByNodeId = new Map<string, SelectionMesh>();
  private readonly selectionEdgeMeshesByEdgeId = new Map<string, SelectionMesh>();
  private readonly labelEntries = new Map<string, Sprite>();
  private readonly baseLabeledNodeIds = new Set<string>();
  private readonly preferredChildDirectoryByParentId = new Map<string, string>();
  private selectionCallback: ((selection: DirectoryGraphSceneSelection) => void) | null = null;
  private activeSelectionState: GraphSelectionState = emptySelectionState();
  private activeSelectedNodeId: string | null = null;
  private activeSelectedEdgeId: string | null = null;
  private activeNodeDistanceById: ReadonlyMap<string, number> | null = null;
  private cameraTarget = new Vector3(0, 0, 0);
  private currentGraph: RenderGraph | null = null;
  private currentLayoutAlgorithm: string | null = null;
  private currentLayoutOptionsKey: string | null = null;
  private currentEdgeStyle: DirectoryGraphEdgeStyle | null = null;
  private currentRootEdgeStyle: DirectoryGraphEdgeStyle | null = null;
  private currentLeafDirectoryEdgeStyle: DirectoryGraphLeafEdgeStyle | null = null;
  private currentLayoutBounds: LayoutBounds | null = null;
  private focusedDirectoryView: FocusedDirectoryView | null = null;
  private cameraTransition: CameraTransition | null = null;
  private renderWidth = 1;
  private renderHeight = 1;
  private animationFrame: number | null = null;
  private dragState: PointerDragState | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, theme?: DirectoryGraphSceneTheme) {
    this.theme = theme ?? directoryGraphSceneThemeFromCss(container);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(new Color(this.theme.background), 1);
    this.selectionTarget.texture.colorSpace = NoColorSpace;
    this.selectionScene.background = new Color(cssColorHex(this.container, '--scene-selection-background'));
    this.container.append(this.renderer.domElement);
    this.scene.add(this.edgeGroup, this.nodeGroup, this.labelGroup);
    this.selectionScene.add(this.selectionEdgeGroup, this.selectionNodeGroup);
    this.addLighting();
    this.resetCamera();
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(this.container);
    this.renderer.domElement.addEventListener('wheel', this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('keydown', this.handleKeyDown);
    this.resize();
    this.animationFrame = window.requestAnimationFrame(this.render);
  }

  updateGraph(graph: RenderGraph, options: DirectoryGraphSceneOptions): void {
    this.selectionCallback = options.onSelect ?? null;
    const layoutOptionsKey = stableLayoutOptionsKey(options.layoutOptions);
    const edgeStyle = options.edgeStyle ?? 'straight';
    const rootEdgeStyle = options.rootEdgeStyle ?? edgeStyle;
    const leafDirectoryEdgeStyle = options.leafDirectoryEdgeStyle ?? 'global';
    if (
      this.currentGraph !== graph ||
      this.currentLayoutAlgorithm !== options.layoutAlgorithm ||
      this.currentLayoutOptionsKey !== layoutOptionsKey ||
      this.currentEdgeStyle !== edgeStyle ||
      this.currentRootEdgeStyle !== rootEdgeStyle ||
      this.currentLeafDirectoryEdgeStyle !== leafDirectoryEdgeStyle
    ) {
      this.rebuildGraph(
        graph,
        options.layoutAlgorithm,
        options.layoutOptions ?? {},
        edgeStyle,
        rootEdgeStyle,
        leafDirectoryEdgeStyle,
        options.selectedNodeId ?? graph.rootNodeId,
      );
      this.currentLayoutOptionsKey = layoutOptionsKey;
      this.currentEdgeStyle = edgeStyle;
      this.currentRootEdgeStyle = rootEdgeStyle;
      this.currentLeafDirectoryEdgeStyle = leafDirectoryEdgeStyle;
    }

    this.applySceneState(options);
  }

  private rebuildGraph(
    graph: RenderGraph,
    layoutAlgorithm: string,
    layoutOptions: LayoutOptions,
    edgeStyle: DirectoryGraphEdgeStyle,
    rootEdgeStyle: DirectoryGraphEdgeStyle,
    leafDirectoryEdgeStyle: DirectoryGraphLeafEdgeStyle,
    focusNodeId: string | null,
  ): void {
    const layout =
      layoutAlgorithm === 'layered-grid'
        ? layoutLayeredGrid(graph, layoutOptions)
        : layoutRadialTree(graph, layoutOptions);
    this.currentGraph = graph;
    this.currentLayoutAlgorithm = layoutAlgorithm;
    this.currentLayoutBounds = layoutBounds(layout.positions);
    this.selectionTargetById.clear();
    this.graphNodesById.clear();
    this.nodeEntries.clear();
    this.edgeEntries.clear();
    this.selectionNodeMeshesByNodeId.clear();
    this.selectionEdgeMeshesByEdgeId.clear();
    this.labelEntries.clear();
    this.baseLabeledNodeIds.clear();
    this.activeSelectionState = emptySelectionState();
    this.activeSelectedNodeId = null;
    this.activeSelectedEdgeId = null;
    this.activeNodeDistanceById = null;
    this.focusedDirectoryView = null;
    this.preferredChildDirectoryByParentId.clear();

    for (const node of graph.nodes) {
      this.graphNodesById.set(node.id, node);
    }

    this.clearGroup(this.edgeGroup);
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.labelGroup);
    this.clearGroup(this.selectionEdgeGroup);
    this.clearGroup(this.selectionNodeGroup);

    graph.edges.forEach((edge, edgeIndex) => {
      const source = layout.positions.get(edge.fromNodeId);
      const target = layout.positions.get(edge.toNodeId);

      if (!source || !target) {
        return;
      }

      const effectiveEdgeStyle = this.edgeStyleForEdge(
        edge.fromNodeId,
        edge.toNodeId,
        edgeStyle,
        rootEdgeStyle,
        leafDirectoryEdgeStyle,
      );
      const line = this.createEdge(source, target, effectiveEdgeStyle);
      this.edgeGroup.add(line);
      this.edgeEntries.set(edge.id, {
        line,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        depth: Math.max(source.depth, target.depth),
      });
      const selectionId = encodeSelectionId('edge', edgeIndex);
      this.selectionTargetById.set(selectionId, {
        kind: 'edge',
        id: edge.id,
        selectionId,
      });
      const selectionMesh = this.createSelectionEdge(source, target, effectiveEdgeStyle, selectionId);
      this.selectionEdgeMeshesByEdgeId.set(edge.id, selectionMesh);
      this.selectionEdgeGroup.add(selectionMesh);
    });

    graph.nodes.forEach((node, nodeIndex) => {
      const position = layout.positions.get(node.id);

      if (!position) {
        return;
      }

      const mesh = this.createNode(node.kind, position);
      mesh.position.set(position.position.x, position.position.y, position.position.z);
      mesh.userData = { nodeId: node.id, nodePath: node.path };
      this.nodeGroup.add(mesh);
      this.nodeEntries.set(node.id, {
        mesh,
        kind: node.kind,
        name: node.name,
        depth: position.depth,
        position,
      });
      if (shouldBaseLabelNode(node.kind, position.depth)) {
        this.baseLabeledNodeIds.add(node.id);
      }
      const selectionId = encodeSelectionId('node', nodeIndex);
      this.selectionTargetById.set(selectionId, {
        kind: 'node',
        id: node.id,
        selectionId,
      });
      const selectionMesh = this.createSelectionNode(node.kind, position, selectionId);
      this.selectionNodeMeshesByNodeId.set(node.id, selectionMesh);
      this.selectionNodeGroup.add(selectionMesh);
    });

    this.frameNode(focusNodeId ?? graph.rootNodeId);
  }

  private applySceneState(options: DirectoryGraphSceneOptions): void {
    const selectedNodeId = options.selectedNodeId ?? null;
    const selectedEdgeId = options.selectedEdgeId ?? null;
    const nextNodeDistanceById = options.nodeDistanceById ?? null;
    const nodeDistanceChanged = this.activeNodeDistanceById !== nextNodeDistanceById;
    const nextSelectionState = this.selectionStateForOptions(options);
    const selectionDiff = diffSelectionState(this.activeSelectionState, nextSelectionState);
    const changedNodeIds = new Set([
      ...selectionDiff.enteredHighlightedNodeIds,
      ...selectionDiff.exitedHighlightedNodeIds,
    ]);
    const changedEdgeIds = new Set([
      ...selectionDiff.enteredHighlightedEdgeIds,
      ...selectionDiff.exitedHighlightedEdgeIds,
    ]);
    const changedLabelIds = new Set([
      ...selectionDiff.enteredLabeledNodeIds,
      ...selectionDiff.exitedLabeledNodeIds,
    ]);

    addNullableId(changedNodeIds, this.activeSelectedNodeId);
    addNullableId(changedNodeIds, selectedNodeId);
    addNullableId(changedEdgeIds, this.activeSelectedEdgeId);
    addNullableId(changedEdgeIds, selectedEdgeId);
    addNullableId(changedLabelIds, this.activeSelectedNodeId);
    addNullableId(changedLabelIds, selectedNodeId);

    if (nodeDistanceChanged) {
      addMapKeys(changedNodeIds, this.nodeEntries);
      addMapKeys(changedEdgeIds, this.edgeEntries);
      addMapKeys(changedLabelIds, this.labelEntries);
      addSetValues(changedLabelIds, nextSelectionState.labeledNodeIds);
    }

    for (const nodeId of changedNodeIds) {
      const entry = this.nodeEntries.get(nodeId);

      if (entry) {
        this.styleNode(
          entry.mesh,
          entry.kind,
          entry.depth,
          nextNodeDistanceById?.get(nodeId) ?? null,
          nodeId === selectedNodeId,
          nextSelectionState.highlightedNodeIds.has(nodeId),
        );
      }
    }

    for (const edgeId of changedEdgeIds) {
      const entry = this.edgeEntries.get(edgeId);

      if (entry) {
        this.styleEdge(
          entry.line,
          entry.depth,
          graphDistanceForEdge(entry, nextNodeDistanceById),
          edgeId === selectedEdgeId,
          nextSelectionState.highlightedEdgeIds.has(edgeId),
        );
      }
    }

    for (const nodeId of changedLabelIds) {
      if (nextSelectionState.labeledNodeIds.has(nodeId)) {
        this.replaceLabel(nodeId, nodeId === selectedNodeId, nextNodeDistanceById?.get(nodeId) ?? null);
      } else {
        this.removeLabel(nodeId);
      }
    }

    this.activeSelectionState = nextSelectionState;
    this.activeSelectedNodeId = selectedNodeId;
    this.activeSelectedEdgeId = selectedEdgeId;
    this.activeNodeDistanceById = nextNodeDistanceById;
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('wheel', this.handleWheel);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('keydown', this.handleKeyDown);
    this.clearGroup(this.edgeGroup);
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.labelGroup);
    this.clearGroup(this.selectionEdgeGroup);
    this.clearGroup(this.selectionNodeGroup);
    this.nodeEntries.clear();
    this.edgeEntries.clear();
    this.graphNodesById.clear();
    this.selectionNodeMeshesByNodeId.clear();
    this.selectionEdgeMeshesByEdgeId.clear();
    this.labelEntries.clear();
    this.baseLabeledNodeIds.clear();
    this.selectionTargetById.clear();
    this.selectionTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private addLighting(): void {
    const lightColor = cssColorHex(this.container, '--scene-light');
    const ambient = new AmbientLight(lightColor, 0.72);
    const directional = new DirectionalLight(lightColor, 0.76);
    directional.position.set(16, 30, 22);
    this.scene.add(ambient, directional);
  }

  private resetCamera(): void {
    this.cameraTransition = null;
    this.cameraTarget.set(0, 0, 0);
    this.camera.position.set(
      GRAPH_V0_CAMERA_DEFAULTS.positionX,
      GRAPH_V0_CAMERA_DEFAULTS.positionY,
      GRAPH_V0_CAMERA_DEFAULTS.positionZ,
    );
    this.camera.lookAt(this.cameraTarget);
  }

  private frameBounds(bounds: LayoutBounds | null): void {
    if (!bounds) {
      this.resetCamera();
      return;
    }

    const cameraDirection = new Vector3(
      GRAPH_V0_CAMERA_DEFAULTS.positionX,
      GRAPH_V0_CAMERA_DEFAULTS.positionY,
      GRAPH_V0_CAMERA_DEFAULTS.positionZ,
    ).normalize();

    this.frameBoundsFromCameraOffset(bounds, cameraDirection);
  }

  private frameBoundsFromCameraOffset(bounds: LayoutBounds, cameraOffsetDirection: Vector3): void {
    const distance = this.cameraDistanceForBounds(bounds);
    const cameraDirection = cameraOffsetDirection.clone().normalize();
    const targetPosition = bounds.center.clone().add(cameraDirection.multiplyScalar(distance));
    const targetFar = this.cameraFarForBounds(bounds, distance);

    this.animateCameraTo(bounds.center, targetPosition, targetFar);
  }

  private animateCameraTo(target: Vector3, position: Vector3, far: number): void {
    this.cameraTransition = {
      startedAtMs: performance.now(),
      durationMs: GRAPH_V0_INTERACTION_DEFAULTS.cameraTransitionMs,
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: this.cameraTarget.clone(),
      toTarget: target.clone(),
      toFar: far,
    };
    this.camera.far = Math.max(this.camera.far, far);
    this.camera.updateProjectionMatrix();
  }

  private updateCameraTransition(nowMs: number): void {
    const transition = this.cameraTransition;

    if (!transition) {
      return;
    }

    const progress = clamp((nowMs - transition.startedAtMs) / transition.durationMs, 0, 1);
    const easedProgress = easeOutCubic(progress);

    this.cameraTarget.copy(transition.fromTarget).lerp(transition.toTarget, easedProgress);
    this.camera.position.copy(transition.fromPosition).lerp(transition.toPosition, easedProgress);

    if (progress >= 1) {
      this.cameraTransition = null;
      this.cameraTarget.copy(transition.toTarget);
      this.camera.position.copy(transition.toPosition);
      this.camera.far = transition.toFar;
      this.camera.updateProjectionMatrix();
    }

    this.camera.lookAt(this.cameraTarget);
  }

  private cameraDistanceForBounds(bounds: LayoutBounds): number {
    const verticalFieldOfView = (this.camera.fov * Math.PI) / 180;
    const horizontalFieldOfView = 2 * Math.atan(Math.tan(verticalFieldOfView / 2) * this.camera.aspect);
    const verticalDistance = bounds.radius / Math.tan(verticalFieldOfView / 2);
    const horizontalDistance = bounds.radius / Math.tan(horizontalFieldOfView / 2);

    return clamp(
      Math.max(verticalDistance, horizontalDistance) * GRAPH_V0_CAMERA_DEFAULTS.framingPadding,
      GRAPH_V0_INTERACTION_DEFAULTS.minCameraDistance,
      GRAPH_V0_INTERACTION_DEFAULTS.maxCameraDistance,
    );
  }

  private frameNode(nodeId: string): void {
    const bounds = this.focusBoundsForNode(nodeId);
    this.frameBounds(bounds ?? this.currentLayoutBounds);
  }

  private focusBoundsForNode(nodeId: string): LayoutBounds | null {
    const entry = this.nodeEntries.get(nodeId);

    if (!entry) {
      return null;
    }

    const focusNodeIds = new Set([nodeId]);
    const graphNode = this.graphNodeById(nodeId);

    if (graphNode?.parentId) {
      focusNodeIds.add(graphNode.parentId);
    }

    for (const childId of graphNode?.childIds ?? []) {
      focusNodeIds.add(childId);
    }

    return layoutBoundsForEntries(
      Array.from(focusNodeIds)
        .map((focusNodeId) => this.nodeEntries.get(focusNodeId)?.position)
        .filter((position): position is LayoutNodePosition => position !== undefined),
    );
  }

  private navigationBoundsForNode(nodeId: string, previousNodeId: string): LayoutBounds | null {
    const navigationNodeIds = new Set([nodeId, previousNodeId]);
    const node = this.graphNodeById(nodeId);
    const previousNode = this.graphNodeById(previousNodeId);
    const parentNode = this.graphNodeById(node?.parentId ?? previousNode?.parentId ?? '');

    if (node?.parentId) {
      navigationNodeIds.add(node.parentId);
    }

    if (previousNode?.parentId) {
      navigationNodeIds.add(previousNode.parentId);
    }

    if (parentNode) {
      navigationNodeIds.add(parentNode.id);
      for (const childId of parentNode.childIds) {
        const child = this.graphNodeById(childId);
        if (child?.kind === 'directory') {
          navigationNodeIds.add(childId);
        }
      }
    }

    for (const childId of node?.childIds ?? []) {
      const child = this.graphNodeById(childId);
      if (child?.kind === 'directory') {
        navigationNodeIds.add(childId);
      }
    }

    return layoutBoundsForEntries(
      Array.from(navigationNodeIds)
        .map((navigationNodeId) => this.nodeEntries.get(navigationNodeId)?.position)
        .filter((position): position is LayoutNodePosition => position !== undefined),
    );
  }

  private toggleFocusedDirectoryView(): void {
    if (this.focusedDirectoryView) {
      const directoryNodeId = this.focusedDirectoryView.directoryNodeId;
      this.exitFocusedDirectoryView();
      this.frameNode(directoryNodeId);
      return;
    }

    const directoryNodeId = this.focusDirectoryNodeId();

    if (directoryNodeId) {
      this.enterFocusedDirectoryView(directoryNodeId);
    }
  }

  private enterFocusedDirectoryView(directoryNodeId: string): void {
    const directoryNode = this.graphNodeById(directoryNodeId);
    const directoryEntry = this.nodeEntries.get(directoryNodeId);

    if (!directoryNode || directoryNode.kind === 'file' || !directoryEntry) {
      return;
    }

    const fileNodeIds = directoryNode.childIds.filter((childId) => {
      const childNode = this.graphNodeById(childId);
      return childNode?.kind === 'file' && this.nodeEntries.has(childId);
    });

    if (fileNodeIds.length === 0) {
      return;
    }

    this.exitFocusedDirectoryView();

    const fileNodeIdSet = new Set(fileNodeIds);
    const hiddenEdgeIds = Array.from(this.edgeEntries.entries())
      .filter(([, edge]) => edgeConnectsNodeSet(edge, directoryNodeId, fileNodeIdSet))
      .map(([edgeId]) => edgeId);

    directoryEntry.mesh.visible = false;
    const directorySelectionMesh = this.selectionNodeMeshesByNodeId.get(directoryNodeId);
    if (directorySelectionMesh) {
      directorySelectionMesh.visible = false;
    }
    const directoryLabel = this.labelEntries.get(directoryNodeId);
    if (directoryLabel) {
      directoryLabel.visible = false;
    }

    for (const edgeId of hiddenEdgeIds) {
      const edgeEntry = this.edgeEntries.get(edgeId);
      const selectionEdge = this.selectionEdgeMeshesByEdgeId.get(edgeId);
      if (edgeEntry) {
        edgeEntry.line.visible = false;
      }
      if (selectionEdge) {
        selectionEdge.visible = false;
      }
    }

    const forward = new Vector3();
    this.camera.getWorldDirection(forward);
    forward.normalize();
    const right = new Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new Vector3().crossVectors(right, forward).normalize();
    const center = vectorFromPosition(directoryEntry.position);
    const spacing = Math.max(3.4, GRAPH_V0_INTERACTION_DEFAULTS.minCameraDistance * 0.18);
    const columns = Math.max(1, Math.ceil(Math.sqrt(fileNodeIds.length)));
    const rows = Math.max(1, Math.ceil(fileNodeIds.length / columns));
    const halfWidth = ((columns - 1) * spacing) / 2;
    const halfHeight = ((rows - 1) * spacing) / 2;

    fileNodeIds.forEach((fileNodeId, index) => {
      const fileEntry = this.nodeEntries.get(fileNodeId);

      if (!fileEntry) {
        return;
      }

      const column = index % columns;
      const row = Math.floor(index / columns);
      const offset = right
        .clone()
        .multiplyScalar(column * spacing - halfWidth)
        .add(up.clone().multiplyScalar(halfHeight - row * spacing));
      const filePosition = center.clone().add(offset);

      fileEntry.mesh.position.copy(filePosition);
      fileEntry.mesh.quaternion.copy(this.camera.quaternion);

      const selectionMesh = this.selectionNodeMeshesByNodeId.get(fileNodeId);
      if (selectionMesh) {
        selectionMesh.position.copy(filePosition);
        selectionMesh.quaternion.copy(this.camera.quaternion);
      }

      this.syncLabelPosition(fileNodeId);
    });

    const radius = Math.max(4, Math.hypot(halfWidth, halfHeight) + spacing);
    this.focusedDirectoryView = {
      directoryNodeId,
      hiddenEdgeIds,
      fileNodeIds,
    };
    this.frameBoundsFromCameraOffset(
      { center, radius },
      forward.multiplyScalar(-1),
    );
  }

  private exitFocusedDirectoryView(): void {
    const focusedView = this.focusedDirectoryView;

    if (!focusedView) {
      return;
    }

    const directoryEntry = this.nodeEntries.get(focusedView.directoryNodeId);
    if (directoryEntry) {
      directoryEntry.mesh.visible = true;
      this.syncNodeSelectionMeshPosition(focusedView.directoryNodeId);
      const directorySelectionMesh = this.selectionNodeMeshesByNodeId.get(focusedView.directoryNodeId);
      if (directorySelectionMesh) {
        directorySelectionMesh.visible = true;
      }
      const directoryLabel = this.labelEntries.get(focusedView.directoryNodeId);
      if (directoryLabel) {
        directoryLabel.visible = true;
      }
      this.syncLabelPosition(focusedView.directoryNodeId);
    }

    for (const edgeId of focusedView.hiddenEdgeIds) {
      const edgeEntry = this.edgeEntries.get(edgeId);
      const selectionEdge = this.selectionEdgeMeshesByEdgeId.get(edgeId);
      if (edgeEntry) {
        edgeEntry.line.visible = true;
      }
      if (selectionEdge) {
        selectionEdge.visible = true;
      }
    }

    for (const fileNodeId of focusedView.fileNodeIds) {
      const fileEntry = this.nodeEntries.get(fileNodeId);

      if (!fileEntry) {
        continue;
      }

      fileEntry.mesh.position.copy(vectorFromPosition(fileEntry.position));
      fileEntry.mesh.quaternion.identity();
      this.syncNodeSelectionMeshPosition(fileNodeId);
      this.syncLabelPosition(fileNodeId);
    }

    this.focusedDirectoryView = null;
  }

  private syncNodeSelectionMeshPosition(nodeId: string): void {
    const entry = this.nodeEntries.get(nodeId);
    const selectionMesh = this.selectionNodeMeshesByNodeId.get(nodeId);

    if (!entry || !selectionMesh) {
      return;
    }

    selectionMesh.position.copy(entry.mesh.position);
    selectionMesh.quaternion.copy(entry.mesh.quaternion);
  }

  private syncLabelPosition(nodeId: string): void {
    const entry = this.nodeEntries.get(nodeId);
    const label = this.labelEntries.get(nodeId);

    if (!entry || !label) {
      return;
    }

    const up = new Vector3(0, entry.position.radius + 1.25, 0).applyQuaternion(entry.mesh.quaternion);
    label.position.copy(entry.mesh.position.clone().add(up));
  }

  private focusDirectoryNodeId(): string | null {
    const activeNode = this.activeSelectedNodeId ? this.graphNodeById(this.activeSelectedNodeId) : null;

    if (activeNode?.kind === 'directory' || activeNode?.kind === 'repo') {
      return activeNode.id;
    }

    if (activeNode?.parentId) {
      const parentNode = this.graphNodeById(activeNode.parentId);
      return parentNode && parentNode.kind !== 'file' ? parentNode.id : null;
    }

    return this.currentGraph?.rootNodeId ?? null;
  }

  private navigateDirectorySelection(key: KeyboardEvent['key']): void {
    const currentDirectory = this.focusDirectoryNodeId();

    if (!currentDirectory) {
      return;
    }

    const nextNodeId = (() => {
      if (key === 'ArrowUp') {
        this.recordPreferredChildDirectory(currentDirectory);
        return this.parentDirectoryId(currentDirectory);
      }

      if (key === 'ArrowDown') {
        return this.preferredChildDirectoryId(currentDirectory) ?? this.firstChildDirectoryId(currentDirectory);
      }

      if (key === 'ArrowLeft') {
        return this.siblingDirectoryId(currentDirectory, -1);
      }

      if (key === 'ArrowRight') {
        return this.siblingDirectoryId(currentDirectory, 1);
      }

      return null;
    })();

    if (nextNodeId) {
      this.recordPreferredChildDirectory(nextNodeId);
      this.selectGraphNode(nextNodeId, this.navigationBoundsForNode(nextNodeId, currentDirectory));
    }
  }

  private recordPreferredChildDirectory(nodeId: string): void {
    const node = this.graphNodeById(nodeId);

    if (node?.kind !== 'directory' || !node.parentId) {
      return;
    }

    this.preferredChildDirectoryByParentId.set(node.parentId, node.id);
  }

  private preferredChildDirectoryId(nodeId: string): string | null {
    const node = this.graphNodeById(nodeId);
    const preferredChildId = this.preferredChildDirectoryByParentId.get(nodeId);

    if (!node || !preferredChildId) {
      return null;
    }

    const preferredChild = preferredChildId ? this.graphNodeById(preferredChildId) : null;

    if (
      preferredChild?.kind === 'directory' &&
      preferredChild.parentId === nodeId &&
      node.childIds.includes(preferredChildId)
    ) {
      return preferredChildId;
    }

    this.preferredChildDirectoryByParentId.delete(nodeId);
    return null;
  }

  private parentDirectoryId(nodeId: string): string | null {
    const node = this.graphNodeById(nodeId);

    if (!node?.parentId) {
      return null;
    }

    const parent = this.graphNodeById(node.parentId);
    return parent && parent.kind !== 'file' ? parent.id : null;
  }

  private firstChildDirectoryId(nodeId: string): string | null {
    const node = this.graphNodeById(nodeId);

    if (!node) {
      return null;
    }

    return node.childIds.find((childId) => {
      const child = this.graphNodeById(childId);
      return child?.kind === 'directory';
    }) ?? null;
  }

  private siblingDirectoryId(nodeId: string, direction: -1 | 1): string | null {
    const node = this.graphNodeById(nodeId);

    if (!node?.parentId) {
      return null;
    }

    const parent = this.graphNodeById(node.parentId);
    const siblingIds = parent?.childIds.filter((childId) => {
      const child = this.graphNodeById(childId);
      return child?.kind === 'directory';
    }) ?? [];
    const currentIndex = siblingIds.indexOf(nodeId);

    if (currentIndex === -1 || siblingIds.length < 2) {
      return null;
    }

    return siblingIds[(currentIndex + direction + siblingIds.length) % siblingIds.length] ?? null;
  }

  private selectGraphNode(nodeId: string, bounds: LayoutBounds | null = null): void {
    if (!this.selectionCallback) {
      return;
    }

    this.exitFocusedDirectoryView();
    this.selectionCallback({ kind: 'node', id: nodeId });
    this.frameBounds(bounds ?? this.focusBoundsForNode(nodeId) ?? this.currentLayoutBounds);
  }

  private graphNodeById(nodeId: string): RenderGraphNode | null {
    return this.graphNodesById.get(nodeId) ?? null;
  }

  private cameraFarForBounds(focusBounds: LayoutBounds, focusDistance: number): number {
    if (!this.currentLayoutBounds) {
      return Math.max(GRAPH_V0_CAMERA_DEFAULTS.far, focusDistance + focusBounds.radius * 3);
    }

    const fullGraphDistance =
      this.camera.position.distanceTo(this.currentLayoutBounds.center) + this.currentLayoutBounds.radius * 2;

    return Math.max(GRAPH_V0_CAMERA_DEFAULTS.far, focusDistance + focusBounds.radius * 3, fullGraphDistance);
  }

  private resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const pixelRatio = this.renderer.getPixelRatio();
    this.renderWidth = Math.max(1, Math.floor(width * pixelRatio));
    this.renderHeight = Math.max(1, Math.floor(height * pixelRatio));
    this.renderer.setSize(width, height, false);
    this.selectionTarget.setSize(this.renderWidth, this.renderHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly render = (): void => {
    if (this.disposed) {
      return;
    }

    this.updateCameraTransition(performance.now());
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.render);
  };

  private createEdge(
    source: LayoutNodePosition,
    target: LayoutNodePosition,
    edgeStyle: DirectoryGraphEdgeStyle,
  ): EdgeLine {
    const geometry = new BufferGeometry().setFromPoints(directoryEdgePathPoints(source, target, edgeStyle));
    const material = new LineBasicMaterial({
      color: this.theme.edge,
      transparent: true,
      opacity: opacityForDepth(Math.max(source.depth, target.depth)) * 0.58,
    });

    return new Line(geometry, material);
  }

  private edgeStyleForEdge(
    fromNodeId: string,
    toNodeId: string,
    preferredEdgeStyle: DirectoryGraphEdgeStyle,
    preferredRootEdgeStyle: DirectoryGraphEdgeStyle,
    preferredLeafDirectoryEdgeStyle: DirectoryGraphLeafEdgeStyle,
  ): DirectoryGraphEdgeStyle {
    if (this.isOnlySubdirectoryEdge(fromNodeId, toNodeId)) {
      return 'straight';
    }

    if (
      preferredLeafDirectoryEdgeStyle !== 'global' &&
      this.isDirectoryWithoutSubdirectories(toNodeId)
    ) {
      return preferredLeafDirectoryEdgeStyle;
    }

    if (fromNodeId === this.currentGraph?.rootNodeId) {
      return preferredRootEdgeStyle;
    }

    return preferredEdgeStyle;
  }

  private isOnlySubdirectoryEdge(fromNodeId: string, toNodeId: string): boolean {
    const sourceNode = this.graphNodesById.get(fromNodeId);
    const targetNode = this.graphNodesById.get(toNodeId);

    if (!sourceNode || !targetNode || sourceNode.kind === 'file' || targetNode.kind === 'file') {
      return false;
    }

    const subdirectoryChildIds = sourceNode.childIds.filter((childId) => {
      const childNode = this.graphNodesById.get(childId);
      return childNode && childNode.kind !== 'file';
    });

    return subdirectoryChildIds.length === 1 && subdirectoryChildIds[0] === toNodeId;
  }

  private isDirectoryWithoutSubdirectories(nodeId: string): boolean {
    const node = this.graphNodesById.get(nodeId);

    if (!node || node.kind === 'file') {
      return false;
    }

    return !node.childIds.some((childId) => {
      const childNode = this.graphNodesById.get(childId);
      return childNode && childNode.kind !== 'file';
    });
  }

  private styleEdge(
    line: EdgeLine,
    depth: number,
    graphDistance: number | null,
    selected: boolean,
    highlighted: boolean,
  ): void {
    const opacity = selected || highlighted ? 0.95 : styleOpacity(depth, graphDistance) * 0.58;
    const color = selected
      ? this.theme.selected
      : highlighted
        ? this.theme.highlighted
        : new Color(this.theme.edge)
            .lerp(new Color(this.theme.distantEdge), styleFadeBlend(depth, graphDistance))
            .getHex();

    line.material.color.setHex(color);
    line.material.opacity = opacity;
  }

  private createSelectionEdge(
    source: LayoutNodePosition,
    target: LayoutNodePosition,
    edgeStyle: DirectoryGraphEdgeStyle,
    selectionId: number,
  ): SelectionMesh {
    if (edgeStyle === 'elbow') {
      const group = new Group();
      const [sourcePosition, cornerPosition, targetPosition] = directoryEdgeElbowPoints(source, target);
      group.add(
        this.createSelectionEdgeSegment(sourcePosition, cornerPosition, selectionId),
        this.createSelectionEdgeSegment(cornerPosition, targetPosition, selectionId),
      );
      group.userData = { selectionId };
      return group;
    }

    if (edgeStyle !== 'straight') {
      const geometry = new TubeGeometry(directoryEdgeCurve(source, target, edgeStyle), 28, 0.22, 8, false);
      const mesh = new Mesh(geometry, this.createSelectionMaterial(selectionId));
      mesh.userData = { selectionId };
      return mesh;
    }

    const [sourcePosition, targetPosition] = directoryEdgePathPoints(source, target, 'straight');
    return this.createSelectionEdgeSegment(sourcePosition, targetPosition, selectionId);
  }

  private createSelectionEdgeSegment(
    sourcePosition: Vector3,
    targetPosition: Vector3,
    selectionId: number,
  ): Mesh<BufferGeometry, MeshBasicMaterial> {
    const direction = targetPosition.clone().sub(sourcePosition);
    const length = Math.max(0.001, direction.length());
    const geometry = new CylinderGeometry(0.22, 0.22, length, 8);
    const material = this.createSelectionMaterial(selectionId);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(sourcePosition.clone().add(targetPosition).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    mesh.userData = { selectionId };
    return mesh;
  }

  private createNode(
    kind: GraphNodeKind,
    position: LayoutNodePosition,
  ): NodeMesh {
    const isContainerNode = kind !== 'file';
    const material = new MeshLambertMaterial({
      color: this.colorForNodeKind(kind, position.depth, null),
      opacity: baseNodeOpacity(kind, position.depth, null),
      depthWrite: !isContainerNode,
      side: isContainerNode ? DoubleSide : undefined,
      transparent: true,
    });
    const geometry =
      kind === 'file'
        ? new BoxGeometry(1.15, 2.4, 0.42)
        : new SphereGeometry(1, 32, 20);
    const mesh = new Mesh(geometry, material);

    if (isContainerNode) {
      mesh.scale.setScalar(position.radius);
    }

    return mesh;
  }

  private styleNode(
    mesh: NodeMesh,
    kind: GraphNodeKind,
    depth: number,
    graphDistance: number | null,
    selected: boolean,
    highlighted: boolean,
  ): void {
    const color = selected
      ? this.theme.selected
      : highlighted
        ? this.theme.highlighted
        : this.colorForNodeKind(kind, depth, graphDistance);

    mesh.material.color.setHex(color);
    mesh.material.opacity = selected || highlighted
      ? activeNodeOpacity(kind)
      : baseNodeOpacity(kind, depth, graphDistance);
  }

  private createSelectionNode(
    kind: GraphNodeKind,
    position: LayoutNodePosition,
    selectionId: number,
  ): Mesh<BufferGeometry, MeshBasicMaterial> {
    const geometry =
      kind === 'file'
        ? new BoxGeometry(1.55, 2.85, 0.72)
        : new SphereGeometry(1, 16, 12);
    const mesh = new Mesh(geometry, this.createSelectionMaterial(selectionId));
    mesh.position.set(position.position.x, position.position.y, position.position.z);
    if (kind !== 'file') {
      mesh.scale.setScalar(position.radius);
    }
    mesh.userData = { selectionId };
    return mesh;
  }

  private createSelectionMaterial(selectionId: number): MeshBasicMaterial {
    return new MeshBasicMaterial({
      color: selectionIdToColor(selectionId),
      toneMapped: false,
    });
  }

  private createLabel(
    label: string,
    position: LayoutNodePosition,
    selected: boolean,
    graphDistance: number | null,
  ): Sprite {
    const texture = labelTexture(label, this.theme);
    const material = new SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: selected ? 1 : Math.max(0.42, styleOpacity(position.depth, graphDistance)),
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new Sprite(material);
    sprite.position.set(
      position.position.x,
      position.position.y + position.radius + 1.25,
      position.position.z,
    );
    sprite.scale.set(7.4, 1.85, 1);
    return sprite;
  }

  private replaceLabel(nodeId: string, selected: boolean, graphDistance: number | null): void {
    const entry = this.nodeEntries.get(nodeId);

    if (!entry) {
      this.removeLabel(nodeId);
      return;
    }

    this.removeLabel(nodeId);
    const label = this.createLabel(entry.name, entry.position, selected, graphDistance);
    this.labelEntries.set(nodeId, label);
    this.labelGroup.add(label);
    this.syncLabelPosition(nodeId);
  }

  private removeLabel(nodeId: string): void {
    const label = this.labelEntries.get(nodeId);

    if (!label) {
      return;
    }

    this.labelGroup.remove(label);
    disposeObject(label);
    this.labelEntries.delete(nodeId);
  }

  private selectionStateForOptions(options: DirectoryGraphSceneOptions): GraphSelectionState {
    const highlightedNodeIds = new Set(options.highlightedNodeIds ?? []);
    const highlightedEdgeIds = new Set(options.highlightedEdgeIds ?? []);
    const labeledNodeIds = new Set([
      ...this.baseLabeledNodeIds,
      ...highlightedNodeIds,
      ...(options.labeledNodeIds ?? []),
    ]);
    const selectedNodeId = options.selectedNodeId ?? null;
    const selectedEdgeId = options.selectedEdgeId ?? null;

    if (selectedNodeId) {
      highlightedNodeIds.add(selectedNodeId);
      labeledNodeIds.add(selectedNodeId);
    }

    if (selectedEdgeId) {
      highlightedEdgeIds.add(selectedEdgeId);
    }

    return {
      highlightedNodeIds,
      highlightedEdgeIds,
      labeledNodeIds,
    };
  }

  private colorForNodeKind(kind: GraphNodeKind, depth: number, graphDistance: number | null): number {
    const distanceBlend = styleFadeBlend(depth, graphDistance);
    const baseColor = (() => {
      if (kind === 'repo') {
        return this.theme.repo;
      }

      if (kind === 'directory') {
        return this.theme.directory;
      }

      return this.theme.file;
    })();

    return new Color(baseColor).lerp(new Color(this.theme.distantEdge), distanceBlend).getHex();
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.cameraTransition = null;
    const offset = this.camera.position.clone().sub(this.cameraTarget);
    const direction = offset.clone().normalize();
    const nextDistance = clamp(
      offset.length() * (1 + event.deltaY * GRAPH_V0_INTERACTION_DEFAULTS.wheelZoomFactor),
      GRAPH_V0_INTERACTION_DEFAULTS.minCameraDistance,
      GRAPH_V0_INTERACTION_DEFAULTS.maxCameraDistance,
    );
    this.camera.position.copy(this.cameraTarget.clone().add(direction.multiplyScalar(nextDistance)));
    this.camera.lookAt(this.cameraTarget);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.cameraTransition = null;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.dragState = {
      pointerId: event.pointerId,
      mode: controlModeForPointer(event),
      origin: new Vector2(event.clientX, event.clientY),
      cameraPosition: this.camera.position.clone(),
      cameraTarget: this.cameraTarget.clone(),
      moved: false,
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.dragState.origin.x;
    const deltaY = event.clientY - this.dragState.origin.y;
    this.dragState.moved ||= Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3;

    if (this.dragState.mode === 'pan') {
      const panOffset = panOffsetForCamera(
        this.camera,
        deltaX,
        deltaY,
        GRAPH_V0_INTERACTION_DEFAULTS.panFactor,
      );
      this.cameraTarget.copy(this.dragState.cameraTarget.clone().add(panOffset));
      this.camera.position.copy(this.dragState.cameraPosition.clone().add(panOffset));
    } else {
      const offset = this.dragState.cameraPosition.clone().sub(this.dragState.cameraTarget);
      const radius = offset.length();
      const azimuth = Math.atan2(offset.x, offset.z) - deltaX * GRAPH_V0_INTERACTION_DEFAULTS.rotateFactor;
      const elevation = clamp(
        Math.asin(offset.y / radius) + deltaY * GRAPH_V0_INTERACTION_DEFAULTS.rotateFactor,
        -1.1,
        1.1,
      );
      const nextOffset = new Vector3(
        Math.sin(azimuth) * Math.cos(elevation) * radius,
        Math.sin(elevation) * radius,
        Math.cos(azimuth) * Math.cos(elevation) * radius,
      );
      this.cameraTarget.copy(this.dragState.cameraTarget);
      this.camera.position.copy(this.cameraTarget.clone().add(nextOffset));
    }

    this.camera.lookAt(this.cameraTarget);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.dragState?.pointerId === event.pointerId) {
      const wasClick = !this.dragState.moved;
      const wasSelectClick = this.dragState.mode === 'select';
      this.dragState = null;

      if (wasClick && wasSelectClick) {
        this.selectAtPointer(event);
      }
    }
  };

  private readonly handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (isEditableShortcutTarget(event.target)) {
      return;
    }

    if (event.key === '.') {
      const focusNodeId = this.activeSelectedNodeId ?? this.currentGraph?.rootNodeId ?? null;

      if (!focusNodeId) {
        return;
      }

      event.preventDefault();
      this.frameNode(focusNodeId);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.toggleFocusedDirectoryView();
      return;
    }

    if (isDirectoryNavigationKey(event.key)) {
      event.preventDefault();
      this.navigateDirectorySelection(event.key);
    }
  };

  private selectAtPointer(event: PointerEvent): void {
    if (!this.selectionCallback) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    const pixelRatio = this.renderer.getPixelRatio();
    const x = Math.floor((event.clientX - rect.left) * pixelRatio);
    const y = Math.floor((rect.bottom - event.clientY) * pixelRatio);
    const hit = this.readSelectionHit(x, y);
    const target = hit
      ? this.selectionTargetById.get(hit.selectionId)
      : this.raycastSelection(event);

    if (target) {
      this.selectionCallback({ kind: target.kind, id: target.id });
    }
  }

  private raycastSelection(event: PointerEvent): SelectionTarget | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);

    const nodeHit = this.raycaster
      .intersectObjects(this.selectionNodeGroup.children, true)
      .find((hit) => visibleSelectionIdForObject(hit.object) !== null);
    const edgeHit = this.raycaster
      .intersectObjects(this.selectionEdgeGroup.children, true)
      .find((hit) => visibleSelectionIdForObject(hit.object) !== null);
    const object = nodeHit?.object ?? edgeHit?.object;
    const selectionId = visibleSelectionIdForObject(object);

    return selectionId === null ? null : (this.selectionTargetById.get(selectionId) ?? null);
  }

  private readSelectionHit(x: number, y: number): ReturnType<typeof selectFromIdMap> {
    const radius = 5;
    const diameter = radius * 2 + 1;
    const minX = clampInteger(x - radius, 0, this.renderWidth - 1);
    const minY = clampInteger(y - radius, 0, this.renderHeight - 1);
    const width = Math.min(diameter, this.renderWidth - minX);
    const height = Math.min(diameter, this.renderHeight - minY);
    const pixels = new Uint8Array(width * height * 4);
    const ids = new Uint32Array(width * height);

    this.renderer.setRenderTarget(this.selectionTarget);
    this.renderer.render(this.selectionScene, this.camera);
    this.renderer.readRenderTargetPixels(this.selectionTarget, minX, minY, width, height, pixels);
    this.renderer.setRenderTarget(null);

    for (let index = 0; index < ids.length; index += 1) {
      const pixelIndex = index * 4;
      ids[index] = selectionIdFromPixel(
        pixels[pixelIndex],
        pixels[pixelIndex + 1],
        pixels[pixelIndex + 2],
      );
    }

    return selectFromIdMap(
      { width, height, ids },
      {
        x: x - minX,
        y: y - minY,
      },
      { radius },
    );
  }

  private clearGroup(group: Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObject(child);
    }
  }
}

function disposeObject(object: Object3D): void {
  if ('geometry' in object && object.geometry instanceof BufferGeometry) {
    object.geometry.dispose();
  }

  if ('material' in object) {
    disposeMaterial(object.material);
  }
}

function disposeMaterial(material: unknown): void {
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }

  if (material && typeof material === 'object' && 'map' in material) {
    disposeTexture(material.map);
  }

  if (material && typeof material === 'object' && 'dispose' in material) {
    (material as Material).dispose();
  }
}

function disposeTexture(texture: unknown): void {
  if (texture && typeof texture === 'object' && 'dispose' in texture) {
    (texture as Texture).dispose();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function controlModeForPointer(event: PointerEvent): DirectoryGraphSceneControlMode {
  if (event.button === 1 || event.button === 2 || event.shiftKey || event.altKey) {
    return 'pan';
  }

  return 'select';
}

function panOffsetForCamera(
  camera: PerspectiveCamera,
  deltaX: number,
  deltaY: number,
  panFactor: number,
): Vector3 {
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const right = new Vector3().crossVectors(forward, camera.up).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();

  return right
    .multiplyScalar(-deltaX * panFactor)
    .add(up.multiplyScalar(deltaY * panFactor));
}

function selectionIdToColor(selectionId: number): number {
  return selectionId & 0x00ff_ffff;
}

function selectionIdFromPixel(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}

function shouldBaseLabelNode(kind: GraphNodeKind, depth: number): boolean {
  return kind === 'repo' || (kind === 'directory' && depth <= GRAPH_V0_DEPTH_STYLE_DEFAULTS.maxLabelDepth);
}

function addNullableId(ids: Set<string>, id: string | null): void {
  if (id) {
    ids.add(id);
  }
}

function addMapKeys(ids: Set<string>, map: ReadonlyMap<string, unknown>): void {
  for (const id of map.keys()) {
    ids.add(id);
  }
}

function addSetValues(ids: Set<string>, values: ReadonlySet<string>): void {
  for (const id of values) {
    ids.add(id);
  }
}

function graphDistanceForEdge(
  edge: EdgeSceneEntry,
  nodeDistanceById: ReadonlyMap<string, number> | null,
): number | null {
  if (!nodeDistanceById) {
    return null;
  }

  const sourceDistance = nodeDistanceById.get(edge.fromNodeId);
  const targetDistance = nodeDistanceById.get(edge.toNodeId);

  if (sourceDistance === undefined && targetDistance === undefined) {
    return null;
  }

  return Math.max(sourceDistance ?? targetDistance ?? 0, targetDistance ?? sourceDistance ?? 0);
}

function edgeConnectsNodeSet(edge: EdgeSceneEntry, nodeId: string, connectedNodeIds: ReadonlySet<string>): boolean {
  return (
    (edge.fromNodeId === nodeId && connectedNodeIds.has(edge.toNodeId)) ||
    (edge.toNodeId === nodeId && connectedNodeIds.has(edge.fromNodeId))
  );
}

function vectorFromPosition(position: LayoutNodePosition): Vector3 {
  return new Vector3(position.position.x, position.position.y, position.position.z);
}

function isDirectoryNavigationKey(key: string): key is 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';
}

function visibleSelectionIdForObject(object: Object3D | undefined): number | null {
  let current: Object3D | null | undefined = object;

  while (current) {
    if (!current.visible) {
      return null;
    }

    const selectionId = current.userData.selectionId;

    if (typeof selectionId === 'number') {
      return selectionId;
    }

    current = current.parent;
  }

  return null;
}

function opacityForDepth(depth: number): number {
  const distance =
    (depth - GRAPH_V0_DEPTH_STYLE_DEFAULTS.fadeStartDepth) /
    GRAPH_V0_DEPTH_STYLE_DEFAULTS.fadeDepthSpan;
  const fade = clamp(distance, 0, 1);
  return (
    GRAPH_V0_DEPTH_STYLE_DEFAULTS.minOpacity +
    (1 - fade) * (1 - GRAPH_V0_DEPTH_STYLE_DEFAULTS.minOpacity)
  );
}

function opacityForGraphDistance(distance: number): number {
  const fade = clamp(
    (distance - 1) / GRAPH_V0_DEPTH_STYLE_DEFAULTS.fadeDepthSpan,
    0,
    1,
  );
  return (
    GRAPH_V0_DEPTH_STYLE_DEFAULTS.minOpacity +
    (1 - fade) * (1 - GRAPH_V0_DEPTH_STYLE_DEFAULTS.minOpacity)
  );
}

function styleOpacity(depth: number, graphDistance: number | null): number {
  return graphDistance === null ? opacityForDepth(depth) : opacityForGraphDistance(graphDistance);
}

function baseNodeOpacity(kind: GraphNodeKind, depth: number, graphDistance: number | null): number {
  const opacity = styleOpacity(depth, graphDistance);

  if (kind === 'file') {
    return opacity;
  }

  return Math.max(0.08, opacity * 0.2);
}

function activeNodeOpacity(kind: GraphNodeKind): number {
  return kind === 'file' ? 1 : 0.38;
}

function directoryGraphSceneThemeFromCss(element: HTMLElement): DirectoryGraphSceneTheme {
  return {
    background: cssColorHex(element, '--scene-background'),
    edge: cssColorHex(element, '--scene-edge'),
    distantEdge: cssColorHex(element, '--scene-distant-edge'),
    repo: cssColorHex(element, '--node-repo'),
    directory: cssColorHex(element, '--node-directory'),
    file: cssColorHex(element, '--node-file'),
    selected: cssColorHex(element, '--scene-selected'),
    highlighted: cssColorHex(element, '--scene-highlighted'),
    labelText: cssCustomProperty(element, '--color-text'),
    labelBackground: cssCustomProperty(element, '--scene-label-background'),
  };
}

function cssColorHex(element: HTMLElement, propertyName: string): number {
  return new Color(cssCustomProperty(element, propertyName)).getHex();
}

function cssCustomProperty(element: HTMLElement, propertyName: string): string {
  const elementValue = getComputedStyle(element).getPropertyValue(propertyName).trim();

  if (elementValue) {
    return elementValue;
  }

  return getComputedStyle(element.ownerDocument.documentElement).getPropertyValue(propertyName).trim();
}

function styleFadeBlend(depth: number, graphDistance: number | null): number {
  return 1 - styleOpacity(depth, graphDistance);
}

function stableLayoutOptionsKey(options: LayoutOptions | undefined): string {
  if (!options) {
    return '';
  }

  return Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
}

function layoutBounds(positions: ReadonlyMap<string, LayoutNodePosition>): LayoutBounds | null {
  return layoutBoundsForEntries(positions.values());
}

function layoutBoundsForEntries(positions: Iterable<LayoutNodePosition>): LayoutBounds | null {
  const positionList = Array.from(positions);

  if (positionList.length === 0) {
    return null;
  }

  const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (const position of positionList) {
    min.x = Math.min(min.x, position.position.x - position.radius);
    min.y = Math.min(min.y, position.position.y - position.radius);
    min.z = Math.min(min.z, position.position.z - position.radius);
    max.x = Math.max(max.x, position.position.x + position.radius);
    max.y = Math.max(max.y, position.position.y + position.radius);
    max.z = Math.max(max.z, position.position.z + position.radius);
  }

  const center = min.clone().add(max).multiplyScalar(0.5);
  const radius = Math.max(1, max.clone().sub(center).length());

  return { center, radius };
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function labelTexture(label: string, theme: DirectoryGraphSceneTheme): CanvasTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('2D canvas context is required for graph labels');
  }

  const text = truncateLabel(label);
  const width = 512;
  const height = 128;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = theme.labelBackground;
  roundRect(context, 18, 28, width - 36, 68, 16);
  context.fill();
  context.fillStyle = theme.labelText;
  context.font = '600 38px Inter, ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + 1, width - 64);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = NoColorSpace;
  return texture;
}

function truncateLabel(label: string): string {
  const maxLength = 22;
  return label.length <= maxLength ? label : `${label.slice(0, maxLength - 1)}...`;
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}
