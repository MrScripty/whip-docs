import { BoxGeometry, BufferGeometry, Color, ConeGeometry, DodecahedronGeometry, Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, PerspectiveCamera, Raycaster, SphereGeometry, TorusGeometry, Vector3, type Object3D } from 'three';
import type { GraphNodeDto } from '../../backends/TauriArchitectureBackend';
import type { SymbolOverlay } from './symbolOverlay';

type SymbolEntry = { node: GraphNodeDto; fileId: string; offset: Vector3; mesh: Mesh<BufferGeometry, MeshLambertMaterial>; label: HTMLButtonElement };
type EdgeEntry = { sourceId: string; targetId: string; line: Line<BufferGeometry, LineBasicMaterial | LineDashedMaterial>; arrow: Mesh<ConeGeometry, MeshBasicMaterial> };
const COLORS: Record<GraphNodeDto['kind'], number> = { workspace: 0x8395ab, crate: 0x8395ab, file: 0x8fa8d5, module: 0x7dd3b0, struct: 0x72aff4, enum: 0xb7a0ef, trait: 0xefbc73, impl: 0xc38fe4, function: 0x66d5c2, method: 0x7ddbcf, tauri_command: 0xf09192, class: 0x72aff4, interface: 0xefbc73, type_alias: 0xb7a0ef, binding: 0xa4c4da, field: 0xc1b090, variant: 0xb7a0ef, parameter: 0x9bbdb5, component: 0xf09192, snippet: 0x7dd3b0 };

/** An additive layer in DirectoryGraphScene's actual scene/camera, never a second renderer. */
export class SymbolSceneLayer {
  readonly group = new Group();
  private readonly labels: HTMLDivElement;
  private readonly nodes = new Map<string, SymbolEntry>();
  private readonly edges: EdgeEntry[] = [];
  private projection: SymbolOverlay | null = null;
  private anchorKey = '';
  private selectedId: string | null = null;
  private select: (id: string) => void = () => {};
  constructor(private readonly container: HTMLElement, private readonly fileObject: (id: string) => Object3D | undefined) {
    this.group.name = 'file-symbol-detail';
    this.labels = document.createElement('div');
    this.labels.className = 'symbol-scene-labels';
    this.labels.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    container.append(this.labels);
  }
  update(projection: SymbolOverlay, selectedId: string | null, select: (id: string) => void): void {
    this.select = select;
    if (projection !== this.projection) {
      this.clear(); this.projection = projection;
      const byFile = new Map<string, GraphNodeDto[]>();
      for (const node of projection.nodes) {
        const fileId = projection.fileIdBySymbolId.get(node.id)!;
        byFile.set(fileId, [...(byFile.get(fileId) ?? []), node]);
      }
      for (const [fileId, nodes] of byFile) {
        nodes.sort((a,b) => a.id.localeCompare(b.id));
        nodes.forEach((node,index) => {
          const ring = Math.floor(index / 10), count = Math.min(10, nodes.length - ring * 10);
          const angle = -Math.PI / 2 + (index % 10) * Math.PI * 2 / count;
          const radius = 5 + ring * 3.5;
          const offset = new Vector3(Math.cos(angle)*radius, 8 + radius + Math.sin(angle)*radius, 1.5);
          const mesh = new Mesh(geometry(node.kind),new MeshLambertMaterial({color:COLORS[node.kind],emissive:COLORS[node.kind],emissiveIntensity:0.1}));
          mesh.userData.symbolId = node.id; this.group.add(mesh);
          const label = document.createElement('button');label.type='button';label.className='symbol-scene-label';
          label.setAttribute('aria-label',`${node.kind.replaceAll('_',' ')} ${node.label}`);
          label.textContent=node.label;label.title=`${node.kind} · ${node.sourceRange?.path} · ~ line ${node.sourceRange?.startLine}`;
          label.addEventListener('click',()=>this.select(node.id));this.labels.append(label);
          this.nodes.set(node.id,{node,fileId,offset,mesh,label});
        });
      }
      for (const edge of projection.edges) {
        const color=edge.confidence==='exact'?0x6b979f:0xc4a06a;
        const material=edge.confidence==='exact'?new LineBasicMaterial({color,transparent:true,opacity:0.55}):new LineDashedMaterial({color,transparent:true,opacity:0.75,dashSize:0.25,gapSize:0.2});
        const line=new Line(new BufferGeometry(),material);
        const arrow=new Mesh(new ConeGeometry(0.10,0.36,6),new MeshBasicMaterial({color}));
        line.userData={symbolEdgeId:edge.id,kind:edge.kind,confidence:edge.confidence,provenance:edge.provenance};
        this.group.add(line,arrow);this.edges.push({sourceId:edge.sourceId,targetId:edge.targetId,line,arrow});
      }
      this.anchorKey='';this.synchronize();
    }
    this.selectedId=selectedId;
    for (const [id,entry] of this.nodes) {
      const selected=id===selectedId;entry.mesh.scale.setScalar(selected?1.3:1);
      entry.mesh.material.emissiveIntensity=selected?0.6:0.1;
      entry.label.setAttribute('aria-pressed',String(selected));entry.label.classList.toggle('selected',selected);
      entry.label.style.color='#'+new Color(COLORS[entry.node.kind]).getHexString();
    }
  }
  /** Re-anchor when directory focus moves/rotates parent files, without changing any file geometry. */
  synchronize(): void {
    const key=[...new Set([...this.nodes.values()].map(n=>n.fileId).concat([...this.projection?.fileIdByAnalysisId.values() ?? []]))].map(id=>{
      const file=this.fileObject(id);return file?`${id}:${file.position.toArray()}:${file.quaternion.toArray()}:${file.visible}`:id;
    }).join('|');
    if(key===this.anchorKey)return;this.anchorKey=key;
    for(const entry of this.nodes.values()) {
      const file=this.fileObject(entry.fileId);entry.mesh.visible=Boolean(file?.visible);
      if(file)entry.mesh.position.copy(entry.offset).applyQuaternion(file.quaternion).add(file.position);
    }
    for(const entry of this.edges) {
      const source=this.position(entry.sourceId),target=this.position(entry.targetId);
      entry.line.visible=entry.arrow.visible=Boolean(source&&target);
      if(!source||!target)continue;
      // Structural detail follows its observed endpoints. No edge-ID randomness or fake aggregate.
      const points=[source,target];entry.line.geometry.dispose();entry.line.geometry=new BufferGeometry().setFromPoints(points);entry.line.computeLineDistances();
      entry.arrow.position.copy(source).lerp(target,0.78);
      entry.arrow.quaternion.setFromUnitVectors(new Vector3(0,1,0),target.clone().sub(source).normalize());
    }
  }
  renderLabels(camera: PerspectiveCamera): void {
    this.synchronize();camera.updateMatrixWorld();
    for(const entry of this.nodes.values()) {
      const point=entry.mesh.position.clone().project(camera);
      entry.label.hidden=!entry.mesh.visible||point.z< -1||point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1;
      if(!entry.label.hidden)entry.label.style.transform=`translate(${(point.x*.5+.5)*this.container.clientWidth}px,${(-point.y*.5+.5)*this.container.clientHeight+12}px) translateX(-50%)`;
    }
  }
  hit(raycaster: Raycaster): {id:string;distance:number}|null {
    const hit=raycaster.intersectObjects([...this.nodes.values()].filter(n=>n.mesh.visible).map(n=>n.mesh))[0];
    return hit?{id:String(hit.object.userData.symbolId),distance:hit.distance}:null;
  }
  selectHit(id:string):void {this.select(id);}
  selectedPosition():Vector3|null {return this.selectedId?this.position(this.selectedId):null;}
  bounds(): {center:Vector3;radius:number}|null {
    const points=[...this.nodes.values()].flatMap(entry=>{const file=this.fileObject(entry.fileId);return file?[entry.mesh.position,file.position]:[];});
    if(!points.length)return null;
    const center=points.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(points.length);
    return {center,radius:Math.max(5,...points.map(p=>p.distanceTo(center)))+2};
  }
  private position(id:string):Vector3|null {
    const entry=this.nodes.get(id);if(entry)return entry.mesh.visible?entry.mesh.position.clone():null;
    const fileId=this.projection?.fileIdByAnalysisId.get(id);const file=fileId?this.fileObject(fileId):undefined;
    return file?.visible?file.position.clone():null;
  }
  clear():void {
    for(const entry of this.nodes.values()){entry.mesh.geometry.dispose();entry.mesh.material.dispose();}
    for(const entry of this.edges){entry.line.geometry.dispose();entry.line.material.dispose();entry.arrow.geometry.dispose();entry.arrow.material.dispose();}
    this.nodes.clear();this.edges.length=0;this.group.clear();this.labels.replaceChildren();
    this.projection=null;this.anchorKey='';this.selectedId=null;
  }
  dispose():void {this.clear();this.group.removeFromParent();this.labels.remove();}
}
function geometry(kind:GraphNodeDto['kind']):BufferGeometry {
  switch(kind){case 'class':case 'struct':case 'component':return new BoxGeometry(.8,.8,.8);case 'type_alias':case 'variant':case 'enum':return new OctahedronGeometry(.6);case 'interface':case 'trait':return new TorusGeometry(.4,.12,8,20);case 'impl':return new DodecahedronGeometry(.5);case 'module':case 'snippet':return new BoxGeometry(.6,.6,.6);case 'tauri_command':return new ConeGeometry(.5,.9,4);default:return new SphereGeometry(.33,16,12);}
}
