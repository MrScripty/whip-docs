import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoColorSpace,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type Material,
  type Object3D,
} from 'three';
import {
  GRAPH_V0_CAMERA_DEFAULTS,
  GRAPH_V0_INTERACTION_DEFAULTS,
  GRAPH_V0_SCENE_THEME,
} from './constants';
import { layoutLayeredGrid, layoutRadialTree } from './layouts';
import { encodeSelectionId, selectFromIdMap } from './selection';
import type {
  DirectoryGraphSceneOptions,
  DirectoryGraphSceneSelection,
  DirectoryGraphSceneTheme,
  GraphNodeKind,
  LayoutNodePosition,
  RenderGraph,
} from './types';

type NodeMesh = Mesh<BufferGeometry, MeshLambertMaterial>;

type PointerDragState = {
  readonly pointerId: number;
  readonly origin: Vector2;
  readonly cameraPosition: Vector3;
  moved: boolean;
};

type SelectionTarget = DirectoryGraphSceneSelection & {
  readonly selectionId: number;
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
  private readonly selectionScene = new Scene();
  private readonly selectionNodeGroup = new Group();
  private readonly selectionEdgeGroup = new Group();
  private readonly selectionTarget = new WebGLRenderTarget(1, 1);
  private readonly resizeObserver: ResizeObserver;
  private readonly theme: DirectoryGraphSceneTheme;
  private readonly selectionTargetById = new Map<number, SelectionTarget>();
  private selectionCallback: ((selection: DirectoryGraphSceneSelection) => void) | null = null;
  private renderWidth = 1;
  private renderHeight = 1;
  private animationFrame: number | null = null;
  private dragState: PointerDragState | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, theme = GRAPH_V0_SCENE_THEME) {
    this.theme = theme;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(new Color(theme.background), 1);
    this.selectionTarget.texture.colorSpace = NoColorSpace;
    this.selectionScene.background = new Color(0x000000);
    this.container.append(this.renderer.domElement);
    this.scene.add(this.edgeGroup, this.nodeGroup);
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
    this.resize();
    this.animationFrame = window.requestAnimationFrame(this.render);
  }

  updateGraph(graph: RenderGraph, options: DirectoryGraphSceneOptions): void {
    const layout =
      options.layoutAlgorithm === 'layered-grid'
        ? layoutLayeredGrid(graph)
        : layoutRadialTree(graph);
    const highlightedNodeIds = new Set(options.highlightedNodeIds ?? []);
    const selectedNodeId = options.selectedNodeId ?? null;
    const selectedEdgeId = options.selectedEdgeId ?? null;
    this.selectionCallback = options.onSelect ?? null;
    this.selectionTargetById.clear();

    this.clearGroup(this.edgeGroup);
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.selectionEdgeGroup);
    this.clearGroup(this.selectionNodeGroup);

    graph.edges.forEach((edge, edgeIndex) => {
      const source = layout.positions.get(edge.fromNodeId);
      const target = layout.positions.get(edge.toNodeId);

      if (!source || !target) {
        return;
      }

      const selected = edge.id === selectedEdgeId;
      this.edgeGroup.add(this.createEdge(source, target, selected));
      const selectionId = encodeSelectionId('edge', edgeIndex);
      this.selectionTargetById.set(selectionId, {
        kind: 'edge',
        id: edge.id,
        selectionId,
      });
      this.selectionEdgeGroup.add(this.createSelectionEdge(source, target, selectionId));
    });

    graph.nodes.forEach((node, nodeIndex) => {
      const position = layout.positions.get(node.id);

      if (!position) {
        return;
      }

      const selected = node.id === selectedNodeId;
      const highlighted = highlightedNodeIds.has(node.id);
      const mesh = this.createNode(node.kind, selected, highlighted);
      mesh.position.set(position.position.x, position.position.y, position.position.z);
      mesh.userData = { nodeId: node.id, nodePath: node.path };
      this.nodeGroup.add(mesh);
      const selectionId = encodeSelectionId('node', nodeIndex);
      this.selectionTargetById.set(selectionId, {
        kind: 'node',
        id: node.id,
        selectionId,
      });
      this.selectionNodeGroup.add(this.createSelectionNode(node.kind, position, selectionId));
    });
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
    this.clearGroup(this.edgeGroup);
    this.clearGroup(this.nodeGroup);
    this.clearGroup(this.selectionEdgeGroup);
    this.clearGroup(this.selectionNodeGroup);
    this.selectionTarget.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private addLighting(): void {
    const ambient = new AmbientLight(0xffffff, 0.72);
    const directional = new DirectionalLight(0xffffff, 0.76);
    directional.position.set(16, 30, 22);
    this.scene.add(ambient, directional);
  }

  private resetCamera(): void {
    this.camera.position.set(
      GRAPH_V0_CAMERA_DEFAULTS.positionX,
      GRAPH_V0_CAMERA_DEFAULTS.positionY,
      GRAPH_V0_CAMERA_DEFAULTS.positionZ,
    );
    this.camera.lookAt(0, 0, 0);
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

    this.renderer.render(this.scene, this.camera);
    this.animationFrame = window.requestAnimationFrame(this.render);
  };

  private createEdge(source: LayoutNodePosition, target: LayoutNodePosition, selected: boolean): Line {
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3(source.position.x, source.position.y, source.position.z),
      new Vector3(target.position.x, target.position.y, target.position.z),
    ]);
    const material = new LineBasicMaterial({
      color: selected ? this.theme.selected : this.theme.edge,
      transparent: true,
      opacity: selected ? 0.92 : 0.58,
    });

    return new Line(geometry, material);
  }

  private createSelectionEdge(
    source: LayoutNodePosition,
    target: LayoutNodePosition,
    selectionId: number,
  ): Mesh<BufferGeometry, MeshBasicMaterial> {
    const sourcePosition = new Vector3(source.position.x, source.position.y, source.position.z);
    const targetPosition = new Vector3(target.position.x, target.position.y, target.position.z);
    const direction = targetPosition.clone().sub(sourcePosition);
    const length = Math.max(0.001, direction.length());
    const geometry = new CylinderGeometry(0.22, 0.22, length, 8);
    const material = this.createSelectionMaterial(selectionId);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(sourcePosition.clone().add(targetPosition).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    return mesh;
  }

  private createNode(kind: GraphNodeKind, selected: boolean, highlighted: boolean): NodeMesh {
    const color = selected
      ? this.theme.selected
      : highlighted
        ? this.theme.highlighted
        : this.colorForNodeKind(kind);
    const material = new MeshLambertMaterial({ color });
    const geometry =
      kind === 'file'
        ? new BoxGeometry(1.15, 2.4, 0.42)
        : new SphereGeometry(kind === 'repo' ? 1.5 : 1.08, 24, 16);

    return new Mesh(geometry, material);
  }

  private createSelectionNode(
    kind: GraphNodeKind,
    position: LayoutNodePosition,
    selectionId: number,
  ): Mesh<BufferGeometry, MeshBasicMaterial> {
    const geometry =
      kind === 'file'
        ? new BoxGeometry(1.55, 2.85, 0.72)
        : new SphereGeometry(kind === 'repo' ? 1.8 : 1.36, 16, 12);
    const mesh = new Mesh(geometry, this.createSelectionMaterial(selectionId));
    mesh.position.set(position.position.x, position.position.y, position.position.z);
    return mesh;
  }

  private createSelectionMaterial(selectionId: number): MeshBasicMaterial {
    return new MeshBasicMaterial({
      color: selectionIdToColor(selectionId),
      toneMapped: false,
    });
  }

  private colorForNodeKind(kind: GraphNodeKind): number {
    if (kind === 'repo') {
      return this.theme.repo;
    }

    if (kind === 'directory') {
      return this.theme.directory;
    }

    return this.theme.file;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const direction = this.camera.position.clone().normalize();
    const nextDistance = clamp(
      this.camera.position.length() * (1 + event.deltaY * GRAPH_V0_INTERACTION_DEFAULTS.wheelZoomFactor),
      GRAPH_V0_INTERACTION_DEFAULTS.minCameraDistance,
      GRAPH_V0_INTERACTION_DEFAULTS.maxCameraDistance,
    );
    this.camera.position.copy(direction.multiplyScalar(nextDistance));
    this.camera.lookAt(0, 0, 0);
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.dragState = {
      pointerId: event.pointerId,
      origin: new Vector2(event.clientX, event.clientY),
      cameraPosition: this.camera.position.clone(),
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

    if (event.shiftKey) {
      this.camera.position.set(
        this.dragState.cameraPosition.x - deltaX * GRAPH_V0_INTERACTION_DEFAULTS.panFactor,
        this.dragState.cameraPosition.y + deltaY * GRAPH_V0_INTERACTION_DEFAULTS.panFactor,
        this.dragState.cameraPosition.z,
      );
    } else {
      const spherical = this.dragState.cameraPosition.clone();
      const radius = spherical.length();
      const azimuth = Math.atan2(spherical.x, spherical.z) - deltaX * GRAPH_V0_INTERACTION_DEFAULTS.rotateFactor;
      const elevation = clamp(
        Math.asin(spherical.y / radius) + deltaY * GRAPH_V0_INTERACTION_DEFAULTS.rotateFactor,
        -1.1,
        1.1,
      );
      this.camera.position.set(
        Math.sin(azimuth) * Math.cos(elevation) * radius,
        Math.sin(elevation) * radius,
        Math.cos(azimuth) * Math.cos(elevation) * radius,
      );
    }

    this.camera.lookAt(0, 0, 0);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.dragState?.pointerId === event.pointerId) {
      const wasClick = !this.dragState.moved;
      this.dragState = null;

      if (wasClick) {
        this.selectAtPointer(event);
      }
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

    if (!hit) {
      return;
    }

    const target = this.selectionTargetById.get(hit.selectionId);

    if (target) {
      this.selectionCallback({ kind: target.kind, id: target.id });
    }
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

  if (material && typeof material === 'object' && 'dispose' in material) {
    (material as Material).dispose();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function selectionIdToColor(selectionId: number): number {
  return selectionId & 0x00ff_ffff;
}

function selectionIdFromPixel(red: number, green: number, blue: number): number {
  return (red << 16) | (green << 8) | blue;
}
