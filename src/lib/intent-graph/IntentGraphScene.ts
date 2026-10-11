import {
  AmbientLight, BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, DodecahedronGeometry, GridHelper, Group, Line, LineBasicMaterial,
  LineDashedMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, QuadraticBezierCurve3, Raycaster, Scene, SphereGeometry,
  TorusGeometry, Vector2, Vector3, WebGLRenderer,
  type Material,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  GraphEdgeDto, GraphNodeDto, GraphNodeKind, GraphSnapshotDto,
} from '../../backends/TauriArchitectureBackend.ts';
import { projectIntentGraph, type IntentGraphProjection } from './projection.ts';

export const INTENT_NODE_COLORS: Record<GraphNodeKind, string> = {
  workspace: '#8395ab', crate: '#8395ab', file: '#8fa8d5', module: '#7dd3b0',
  struct: '#72aff4', enum: '#b7a0ef', trait: '#efbc73', impl: '#c38fe4',
  function: '#66d5c2', method: '#7ddbcf', tauri_command: '#f09192',
  class: '#72aff4', interface: '#efbc73', type_alias: '#b7a0ef', binding: '#a4c4da',
  field: '#c1b090', variant: '#b7a0ef', parameter: '#9bbdb5', component: '#f09192', snippet: '#7dd3b0',
};

type NodeEntry = {
  node: GraphNodeDto;
  mesh: Mesh<BufferGeometry, MeshStandardMaterial>;
  label: HTMLButtonElement;
};
type EdgeEntry = {
  edge: GraphEdgeDto;
  line: Line<BufferGeometry, LineBasicMaterial | LineDashedMaterial>;
  arrow: Mesh<ConeGeometry, MeshBasicMaterial>;
  label: HTMLDivElement;
  midpoint: Vector3;
};

/** Standalone Three.js view. It owns only scene resources and transient view state. */
export class IntentGraphScene {
  private readonly container: HTMLElement;
  private readonly onSelect: (nodeId: string) => void;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(44, 1, 0.1, 3000);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly graphGroup = new Group();
  private readonly overlay: HTMLDivElement;
  private readonly nodeEntries = new Map<string, NodeEntry>();
  private readonly edgeEntries: EdgeEntry[] = [];
  private readonly raycaster = new Raycaster();
  private readonly resizeObserver: ResizeObserver;
  private readonly originalPosition: string;
  private snapshot: GraphSnapshotDto | null = null;
  private expansionKey = '';
  private projection: IntentGraphProjection | null = null;
  private selectedNodeId: string | null = null;
  private pointerStart: { x: number; y: number } | null = null;
  private frameId = 0;
  private disposed = false;
  private width = 1;
  private height = 1;

  constructor(container: HTMLElement, onSelect: (nodeId: string) => void) {
    this.container = container;
    this.onSelect = onSelect;
    this.originalPosition = container.style.position;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x0c1421, 1);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('aria-label', 'Interactive symbol graph. Drag to orbit, scroll to zoom, right drag to pan. Press R to fit or period to focus selection.');
    container.appendChild(this.renderer.domElement);

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;';
    container.appendChild(this.overlay);
    this.scene.add(this.graphGroup, new AmbientLight(0xe1edff, 2));
    const light = new DirectionalLight(0xffffff, 3);
    light.position.set(12, 20, 40);
    this.scene.add(light);
    const fill = new DirectionalLight(0x91a5f9, 1.2);
    fill.position.set(-20, -10, 10);
    this.scene.add(fill);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.085;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 1600;
    this.controls.enablePan = true;
    this.camera.position.set(0, 0, 65);
    this.controls.update();

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.handlePointerCancel);
    this.renderer.domElement.addEventListener('keydown', this.handleKeyDown);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    this.resize();
    this.animate();
  }

  update(
    snapshot: GraphSnapshotDto,
    expandedFileIds: ReadonlySet<string>,
    selectedNodeId: string | null,
  ): void {
    if (this.disposed) return;
    const expansionKey = JSON.stringify([...expandedFileIds].sort());
    if (snapshot !== this.snapshot || expansionKey !== this.expansionKey) {
      this.snapshot = snapshot;
      this.expansionKey = expansionKey;
      this.projection = projectIntentGraph(snapshot, expandedFileIds);
      this.rebuild(this.projection, expandedFileIds);
      this.fit();
    }
    this.selectedNodeId = selectedNodeId;
    this.restyle();
    this.updateLabels();
  }

  /** Restore a readable overview after orbiting, panning, or zooming. */
  fit(): void {
    const positions = this.projection ? [...this.projection.positions.values()] : [];
    if (positions.length === 0) return;
    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);
    const zs = positions.map((p) => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const center = new Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    const halfHeight = Math.max(9, (maxY - minY) / 2 + 5);
    const halfWidth = Math.max(10, (maxX - minX) / 2 + 7);
    const distance = Math.max(halfHeight, halfWidth / this.camera.aspect)
      / Math.tan(this.camera.fov * Math.PI / 360) + (maxZ - minZ) / 2;
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(new Vector3(0, 0, distance));
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.handlePointerCancel);
    this.renderer.domElement.removeEventListener('keydown', this.handleKeyDown);
    this.clearGraph();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.overlay.remove();
    this.container.style.position = this.originalPosition;
  }

  private rebuild(graph: IntentGraphProjection, expandedFileIds: ReadonlySet<string>): void {
    this.clearGraph();
    for (const node of graph.nodes) {
      const position = graph.positions.get(node.id);
      if (!position) continue;
      const material = new MeshStandardMaterial({
        color: INTENT_NODE_COLORS[node.kind], roughness: 0.38, metalness: 0.22,
        emissive: INTENT_NODE_COLORS[node.kind], emissiveIntensity: 0.08,
      });
      const mesh = new Mesh(nodeGeometry(node.kind), material);
      mesh.position.set(position.x, position.y, position.z);
      mesh.rotation.set(node.kind === 'file' ? 0.03 : 0.2, node.kind === 'file' ? -0.14 : 0.3, 0);
      mesh.userData.nodeId = node.id;
      this.graphGroup.add(mesh);

      const label = document.createElement('button');
      label.type = 'button';
      label.setAttribute('aria-label', `${node.kind.replaceAll('_', ' ')} ${node.label}`);
      label.title = `${node.label}\n${node.kind.replaceAll('_', ' ')}${node.sourceRange ? ` · ${node.sourceRange.path}` : ''}`;
      label.style.cssText = [
        'position:absolute;left:0;top:0;pointer-events:auto;cursor:pointer;',
        'border:1px solid transparent;border-radius:5px;padding:4px 7px;',
        'background:rgba(12,20,33,.87);white-space:nowrap;max-width:210px;',
        'font:11px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;',
        'box-shadow:0 3px 14px rgba(0,0,0,.15);text-align:center;',
      ].join('');
      const name = document.createElement('span');
      name.textContent = node.label;
      name.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;';
      const kind = document.createElement('span');
      kind.textContent = node.kind === 'file'
        ? (expandedFileIds.has(node.id) ? 'FILE · EXPANDED' : 'FILE')
        : node.kind.replaceAll('_', ' ').toUpperCase();
      kind.style.cssText = 'display:block;font:8px/1.7 ui-sans-serif,system-ui,sans-serif;letter-spacing:1px;opacity:.65;';
      label.append(name, kind);
      label.addEventListener('click', () => this.onSelect(node.id));
      this.overlay.appendChild(label);
      this.nodeEntries.set(node.id, { node, mesh, label });
    }
    for (const edge of graph.edges) {
      const source = this.nodeEntries.get(edge.sourceId)?.mesh.position;
      const target = this.nodeEntries.get(edge.targetId)?.mesh.position;
      if (!source || !target) continue;
      const curve = edgeCurve(source, target, edge.id);
      const geometry = new BufferGeometry().setFromPoints(curve.getPoints(36));
      const structural = isStructural(edge);
      const color = edge.confidence === 'exact' ? (structural ? 0x536b88 : 0x7dadae) : 0xb79c6c;
      const material = edge.confidence === 'exact'
        ? new LineBasicMaterial({ color, transparent: true, opacity: 0.38 })
        : new LineDashedMaterial({ color, transparent: true, opacity: 0.48, dashSize: 0.28, gapSize: 0.22 });
      const line = new Line(geometry, material);
      line.computeLineDistances();
      const arrow = new Mesh(
        new ConeGeometry(0.095, 0.32, 6),
        new MeshBasicMaterial({ color, transparent: true, opacity: 0.55 }),
      );
      arrow.position.copy(curve.getPoint(0.74));
      arrow.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), curve.getTangent(0.74).normalize());
      this.graphGroup.add(line, arrow);
      const label = document.createElement('div');
      label.textContent = edge.kind.replaceAll('_', ' ');
      label.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;padding:2px 4px;border-radius:3px;background:rgba(12,20,33,.87);color:#b9c8dc;font:9px/1.2 ui-monospace,monospace;';
      label.title = `${edge.kind} · ${edge.confidence} · ${edge.provenance}`;
      this.overlay.appendChild(label);
      this.edgeEntries.push({ edge, line, arrow, label, midpoint: curve.getPoint(0.5) });
    }
    const extent = Math.max(70, ...[...graph.positions.values()].map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)) * 3));
    const grid = new GridHelper(extent, 35, 0x1c2d43, 0x152337);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -5;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of gridMaterials) { material.transparent = true; material.opacity = 0.32; }
    this.graphGroup.add(grid);
  }

  private restyle(): void {
    const adjacent = new Set<string>();
    if (this.selectedNodeId) {
      for (const { edge } of this.edgeEntries) {
        if (edge.sourceId === this.selectedNodeId) adjacent.add(edge.targetId);
        if (edge.targetId === this.selectedNodeId) adjacent.add(edge.sourceId);
      }
    }
    for (const [id, entry] of this.nodeEntries) {
      const selected = id === this.selectedNodeId;
      const dimmed = this.selectedNodeId !== null && !selected && !adjacent.has(id);
      entry.mesh.scale.setScalar(selected ? 1.23 : 1);
      entry.mesh.material.emissiveIntensity = selected ? 0.6 : dimmed ? 0.01 : 0.12;
      entry.mesh.material.color.copy(new Color(INTENT_NODE_COLORS[entry.node.kind])).multiplyScalar(dimmed ? 0.6 : 1);
      entry.label.style.color = selected ? '#f4f7ff' : dimmed ? '#8795aa' : INTENT_NODE_COLORS[entry.node.kind];
      entry.label.style.borderColor = selected ? INTENT_NODE_COLORS[entry.node.kind] : 'transparent';
      entry.label.style.background = selected ? 'rgba(30,45,66,.97)' : 'rgba(12,20,33,.87)';
      entry.label.style.zIndex = selected ? '4' : entry.node.kind === 'file' ? '3' : '2';
      entry.label.setAttribute('aria-pressed', String(selected));
    }
    for (const entry of this.edgeEntries) {
      const connected = entry.edge.sourceId === this.selectedNodeId || entry.edge.targetId === this.selectedNodeId;
      entry.line.material.opacity = connected ? 0.86 : this.selectedNodeId ? 0.12 : isStructural(entry.edge) ? 0.28 : 0.48;
      entry.arrow.material.opacity = connected ? 0.9 : this.selectedNodeId ? 0.16 : 0.5;
      entry.label.dataset.connected = String(connected);
      entry.label.style.color = entry.edge.confidence === 'exact' ? '#acc8d7' : '#d4b781';
    }
  }

  private clearGraph(): void {
    this.graphGroup.traverse((object) => {
      const disposable = object as { geometry?: BufferGeometry; material?: Material | Material[] };
      disposable.geometry?.dispose();
      if (disposable.material) {
        const materials = Array.isArray(disposable.material) ? disposable.material : [disposable.material];
        for (const material of materials) material.dispose();
      }
    });
    this.graphGroup.clear();
    this.nodeEntries.clear();
    this.edgeEntries.length = 0;
    this.overlay.replaceChildren();
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    this.width = Math.max(1, this.container.clientWidth);
    this.height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.updateLabels();
  };

  private readonly animate = (): void => {
    if (this.disposed) return;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
    this.frameId = requestAnimationFrame(this.animate);
  };

  private updateLabels(): void {
    this.camera.updateMatrixWorld();
    for (const { mesh, label, node } of this.nodeEntries.values()) {
      const point = mesh.position.clone().project(this.camera);
      const visible = point.z >= -1 && point.z <= 1 && Math.abs(point.x) < 1.14 && Math.abs(point.y) < 1.14;
      label.hidden = !visible;
      if (visible) {
        const x = (point.x * 0.5 + 0.5) * this.width;
        const y = (-point.y * 0.5 + 0.5) * this.height + (node.kind === 'file' ? 25 : 14);
        label.style.transform = `translate(${x}px,${y}px) translateX(-50%)`;
      }
    }
    for (const { label, midpoint } of this.edgeEntries) {
      const point = midpoint.clone().project(this.camera);
      label.hidden = label.dataset.connected !== 'true' || point.z < -1 || point.z > 1;
      if (!label.hidden) {
        label.style.transform = `translate(${(point.x * 0.5 + 0.5) * this.width}px,${(-point.y * 0.5 + 0.5) * this.height}px) translate(-50%,-50%)`;
      }
    }
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button === 0) this.pointerStart = { x: event.clientX, y: event.clientY };
  };
  private readonly handlePointerCancel = (): void => { this.pointerStart = null; };
  private readonly handlePointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    const pointer = new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.intersectObjects([...this.nodeEntries.values()].map((entry) => entry.mesh))[0];
    if (hit) this.onSelect(hit.object.userData.nodeId as string);
  };
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() === 'r') { event.preventDefault(); this.fit(); }
    if (event.key === '.' && this.selectedNodeId) {
      const selected = this.nodeEntries.get(this.selectedNodeId);
      if (!selected) return;
      event.preventDefault();
      const offset = this.camera.position.clone().sub(this.controls.target);
      this.controls.target.copy(selected.mesh.position);
      this.camera.position.copy(selected.mesh.position).add(offset);
      this.controls.update();
    }
  };
}

function nodeGeometry(kind: GraphNodeKind): BufferGeometry {
  switch (kind) {
    case 'file': return new BoxGeometry(1.45, 1.85, 0.36);
    case 'module': return new CylinderGeometry(0.57, 0.57, 0.48, 6);
    case 'struct': return new BoxGeometry(0.95, 0.95, 0.95);
    case 'enum': return new OctahedronGeometry(0.7);
    case 'trait': return new TorusGeometry(0.49, 0.15, 10, 28);
    case 'impl': return new DodecahedronGeometry(0.62);
    case 'tauri_command': return new ConeGeometry(0.63, 1.15, 4);
    case 'method': return new SphereGeometry(0.38, 20, 14);
    default: return new SphereGeometry(0.49, 20, 14);
  }
}

function isStructural(edge: GraphEdgeDto): boolean {
  return edge.kind === 'contains' || edge.kind === 'defines' || edge.kind === 'defines_method';
}

function edgeCurve(source: Vector3, target: Vector3, id: string): QuadraticBezierCurve3 {
  if (source.distanceToSquared(target) < 0.01) {
    return new QuadraticBezierCurve3(source.clone(), source.clone().add(new Vector3(2, 3, 2)), target.clone());
  }
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const midpoint = source.clone().add(target).multiplyScalar(0.5);
  const direction = target.clone().sub(source);
  const perpendicular = new Vector3(-direction.y, direction.x, 0).normalize();
  midpoint.addScaledVector(perpendicular, (hash % 2 ? 1 : -1) * Math.min(1.4, direction.length() * 0.12));
  midpoint.z += 0.45 + (hash % 3) * 0.3;
  return new QuadraticBezierCurve3(source.clone(), midpoint, target.clone());
}
