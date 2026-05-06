import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
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
import type {
  DirectoryGraphSceneOptions,
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
  private readonly resizeObserver: ResizeObserver;
  private readonly theme: DirectoryGraphSceneTheme;
  private animationFrame: number | null = null;
  private dragState: PointerDragState | null = null;
  private disposed = false;

  constructor(private readonly container: HTMLElement, theme = GRAPH_V0_SCENE_THEME) {
    this.theme = theme;
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(new Color(theme.background), 1);
    this.container.append(this.renderer.domElement);
    this.scene.add(this.edgeGroup, this.nodeGroup);
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

    this.clearGroup(this.edgeGroup);
    this.clearGroup(this.nodeGroup);

    for (const edge of graph.edges) {
      const source = layout.positions.get(edge.fromNodeId);
      const target = layout.positions.get(edge.toNodeId);

      if (!source || !target) {
        continue;
      }

      this.edgeGroup.add(this.createEdge(source, target));
    }

    for (const node of graph.nodes) {
      const position = layout.positions.get(node.id);

      if (!position) {
        continue;
      }

      const selected = node.id === selectedNodeId;
      const highlighted = highlightedNodeIds.has(node.id);
      const mesh = this.createNode(node.kind, selected, highlighted);
      mesh.position.set(position.position.x, position.position.y, position.position.z);
      mesh.userData = { nodeId: node.id, nodePath: node.path };
      this.nodeGroup.add(mesh);
    }
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
    this.renderer.setSize(width, height, false);
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

  private createEdge(source: LayoutNodePosition, target: LayoutNodePosition): Line {
    const geometry = new BufferGeometry().setFromPoints([
      new Vector3(source.position.x, source.position.y, source.position.z),
      new Vector3(target.position.x, target.position.y, target.position.z),
    ]);
    const material = new LineBasicMaterial({
      color: this.theme.edge,
      transparent: true,
      opacity: 0.58,
    });

    return new Line(geometry, material);
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
    };
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.dragState || this.dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - this.dragState.origin.x;
    const deltaY = event.clientY - this.dragState.origin.y;

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
      this.dragState = null;
    }
  };

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
