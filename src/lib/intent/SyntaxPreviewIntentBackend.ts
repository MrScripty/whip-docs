import type { AnalysisIdentity, SourceAnalysisDto } from '../../backends/SyntaxAnalysis';
import type { GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { AppendIntent, IntentBackend, IntentRecord } from './types';
import { digestBytes, fingerprint, structureFor, type StoragePort } from './PreviewIntentBackend.ts';
import { canonicalIdentity, validIdentity, validateGraphAnalysis, SYNTAX_DECLARATIONS } from './syntaxSupport.ts';

export const SYNTAX_PREVIEW_STORAGE_KEY = 'whip-docs.intent-syntax-preview.v3';
type Row = { schemaVersion: 3; record: IntentRecord };
type Fingerprint = { path:string; contentHash:string; byteLength:number };
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const utf8Compare=(a:string,b:string)=>{const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;};

/** Native v3 digest vector: JSON tuple of the ordered source manifest and identity. */
export async function syntaxSourceDigest(files: Fingerprint[], identity: AnalysisIdentity): Promise<string> {
  const sorted=[...files].sort((a,b)=>utf8Compare(a.path,b.path)).map(file=>({path:file.path,contentHash:file.contentHash,byteLength:file.byteLength}));
  const encode=new TextEncoder(),prefix=encode.encode('whip-docs:captured-multilingual-sources:v1\0'),body=encode.encode(JSON.stringify([sorted,canonicalIdentity(identity)]));
  const bytes=new Uint8Array(prefix.length+8+body.length);bytes.set(prefix);new DataView(bytes.buffer).setBigUint64(prefix.length,BigInt(body.length),false);bytes.set(body,prefix.length+8);
  return digestBytes(bytes);
}

/** Explicit recorded syntax fixture. Separate key leaves every legacy preview byte untouched. */
export class SyntaxPreviewIntentBackend implements IntentBackend {
  private readonly graph: GraphSnapshotDto;
  private readonly identity: AnalysisIdentity;
  private readonly sources: ReadonlyMap<string,string>;
  private readonly storage: StoragePort;
  constructor(storage: StoragePort, graph: GraphSnapshotDto, analysis: SourceAnalysisDto, sources: ReadonlyMap<string,string>) {
    validateGraphAnalysis(graph,analysis);this.storage=storage;this.graph=structuredClone(graph);this.identity=canonicalIdentity(structuredClone(analysis.identity));this.sources=new Map(sources);
  }
  private read(): Row[] {
    const raw=this.storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY);if(raw===null)return [];
    if(raw.length>128*1024*1024)throw Error('Preview journal exceeds its read bound. It was left unchanged.');
    const rows:unknown=JSON.parse(raw);
    if(!Array.isArray(rows)||!rows.every(validRow))throw Error('Invalid syntax preview journal. It was left unchanged.');
    const prior=new Map<string,IntentRecord>();
    for(const {record} of rows){
      if(prior.has(record.id))throw Error('Duplicate journal ID. Nothing was changed.');
      if(record.kind==='original') {if(record.parentId!==null||record.originalId!==record.id)throw Error('Invalid original binding.');}
      else {const parent=prior.get(record.originalId);if(!parent||parent.kind!=='original'||record.parentId!==parent.id||!equal(record.symbol,parent.symbol)||!equal(record.snapshot,parent.snapshot))throw Error('Invalid derivative binding. Nothing was changed.');}
      prior.set(record.id,record);
    }
    return rows;
  }
  private async capture() {
    const files=await Promise.all([...this.sources].map(async([path,source])=>({path,contentHash:await fingerprint(source),byteLength:new TextEncoder().encode(source).length})));
    return {files,digest:await syntaxSourceDigest(files,this.identity)};
  }
  private status(record: IntentRecord, files: Fingerprint[], digest: string): IntentRecord['bindingStatus'] {
    const file=files.find(file=>file.path===record.symbol.sourceRange.path),node=this.graph.nodes.find(node=>node.id===record.symbol.nodeId);
    if(!file||!node)return 'missing';
    return record.snapshot.contentHash===file.contentHash && record.snapshot.worktreeDigest===digest && equal(record.snapshot.analysisIdentity,this.identity) && node.label===record.symbol.label && node.kind===record.symbol.kind && equal(node.sourceRange,record.symbol.sourceRange) && equal(record.snapshot.structuralSnapshot,structureFor(this.graph,record.symbol.sourceRange.path)) ? 'current':'stale';
  }
  async listRecords(): Promise<IntentRecord[]> {
    const {files,digest}=await this.capture();return this.read().filter(row=>row.record.symbol.sourceRoot===this.graph.sourceRoot).map(({record})=>({...record,bindingStatus:this.status(record,files,digest)}));
  }
  async appendRecord(input: AppendIntent): Promise<IntentRecord> {
    if(input.expectedAnalysisAt!==this.graph.generatedAt)throw Error('Analysis changed. Select the symbol again.');
    if(!['original','interpretation','proposal'].includes(input.kind)||!input.text.trim()||new TextEncoder().encode(input.text).length>16*1024)throw Error('Enter nonblank intent within 16 KiB.');
    const node=this.graph.nodes.find(node=>node.id===input.nodeId);
    if(!node?.sourceRange||['workspace','crate','file'].includes(node.kind))throw Error('Select a captured declaration first.');
    const {files,digest}=await this.capture(),file=files.find(file=>file.path===node.sourceRange!.path);
    if(!file || files.length!==this.identity.files.length || this.identity.files.some(identity=>!files.some(file=>file.path===identity.path&&file.contentHash===identity.sourceDigest&&file.byteLength===identity.byteLength)))throw Error('Fixture source or parser identity changed. Analyze again.');
    const rows=this.read(),parent=rows.find(row=>row.record.id===input.parentId)?.record;
    if(input.kind==='original'&&input.parentId!==null)throw Error('Original intent cannot have a parent.');
    if(input.kind!=='original'&&(!parent||parent.kind!=='original'||parent.symbol.nodeId!==node.id||parent.symbol.sourceRoot!==this.graph.sourceRoot||this.status(parent,files,digest)!=='current'))throw Error('Choose a current original; historical intent is not relinked.');
    const now=new Date().toISOString(),id=`syntax-preview-${crypto.randomUUID()}`;
    const record:IntentRecord={id,kind:input.kind,text:input.text,parentId:input.parentId,originalId:parent?.id??id,createdAt:now,symbol:parent?.symbol??{nodeId:node.id,label:node.label,kind:node.kind,sourceRange:node.sourceRange,sourceRoot:this.graph.sourceRoot},snapshot:parent?.snapshot??{contentHash:file.contentHash,hashAlgorithm:'sha256',byteLength:file.byteLength,capturedAt:now,analysisAt:this.graph.generatedAt,precision:'syntax_byte_ranges_v1',repositoryRevision:null,worktreeDigest:digest,worktreeDigestScope:'captured_multilingual_sources_v1',structuralSnapshot:structureFor(this.graph,node.sourceRange.path),analysisIdentity:this.identity},bindingStatus:'current'};
    const next=JSON.stringify([...rows,{schemaVersion:3,record}]);if(new TextEncoder().encode(next).length>128*1024*1024)throw Error('Preview journal is full. Nothing was changed.');
    this.storage.setItem(SYNTAX_PREVIEW_STORAGE_KEY,next);return structuredClone(record);
  }
}
function validRow(value:unknown):value is Row {
  try {
    const keys=(item:unknown,fields:string[])=>!!item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===fields.length&&Object.keys(item).every(key=>fields.includes(key));
    const string=(item:unknown)=>typeof item==='string'&&item.length>0;
    const natural=(item:unknown)=>Number.isSafeInteger(item)&&Number(item)>=0;
    const hash=(item:unknown)=>typeof item==='string'&&/^sha256:[a-f0-9]{64}$/.test(item);
    const path=(item:unknown)=>typeof item==='string'&&item.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!part.includes('\\'));
    const kind=(item:string)=>item==='impl'||SYNTAX_DECLARATIONS.has(item)&&item!=='implementation';
    if(!keys(value,['schemaVersion','record']))return false;
    const row=value as Row,r=row.record,s=r?.snapshot;
    if(row.schemaVersion!==3||!keys(r,['id','kind','text','parentId','originalId','createdAt','symbol','snapshot','bindingStatus'])||!string(r.id)||!string(r.originalId)||!string(r.createdAt)||typeof r.text!=='string'||!r.text.trim()||new TextEncoder().encode(r.text).length>16*1024||!['original','interpretation','proposal'].includes(r.kind)||!['current','stale','missing','unverified'].includes(r.bindingStatus)||(r.parentId!==null&&!string(r.parentId)))return false;
    if(!keys(r.symbol,['nodeId','label','kind','sourceRange','sourceRoot'])||!string(r.symbol.nodeId)||!string(r.symbol.label)||!string(r.symbol.sourceRoot)||!kind(r.symbol.kind))return false;
    if(!keys(s,['contentHash','hashAlgorithm','byteLength','capturedAt','analysisAt','precision','repositoryRevision','worktreeDigest','worktreeDigestScope','structuralSnapshot','analysisIdentity'])||s.precision!=='syntax_byte_ranges_v1'||s.worktreeDigestScope!=='captured_multilingual_sources_v1'||s.hashAlgorithm!=='sha256'||!hash(s.contentHash)||!hash(s.worktreeDigest)||!natural(s.byteLength)||s.byteLength>2*1024*1024||!string(s.capturedAt)||!string(s.analysisAt)||(s.repositoryRevision!==null&&!string(s.repositoryRevision))||!validIdentity(s.analysisIdentity))return false;
    // Key order is irrelevant; unknown identity fields are rejected instead of copied.
    const sorted=(item:unknown):unknown=>Array.isArray(item)?item.map(sorted):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>[key,sorted(value)])):item;
    if(!equal(sorted(s.analysisIdentity),sorted(canonicalIdentity(s.analysisIdentity))))return false;
    const range=(range:typeof r.symbol.sourceRange)=>keys(range,['path','startLine','startColumn','endLine','endColumn'])&&path(range.path)&&[range.startLine,range.startColumn,range.endLine,range.endColumn].every(n=>natural(n)&&n>=1&&n<=s.byteLength+1)&&(range.endLine>range.startLine||range.endLine===range.startLine&&range.endColumn>=range.startColumn);
    if(!range(r.symbol.sourceRange))return false;
    const file=s.analysisIdentity.files.find(file=>file.path===r.symbol.sourceRange.path);
    if(!file||file.sourceDigest!==s.contentHash||file.byteLength!==s.byteLength||!keys(s.structuralSnapshot,['nodes','edges']))return false;
    const {nodes,edges}=s.structuralSnapshot;
    if(!Array.isArray(nodes)||nodes.length>4096||!Array.isArray(edges)||edges.length>4096)return false;
    if(nodes.some(node=>!keys(node,['id','kind','label','sourceRange'])||!string(node.id)||!string(node.label)||!kind(node.kind)||!node.sourceRange||!range(node.sourceRange)||node.sourceRange.path!==r.symbol.sourceRange.path))return false;
    const ids=new Set(nodes.map(node=>node.id));if(ids.size!==nodes.length)return false;
    const node=nodes.find(node=>node.id===r.symbol.nodeId);
    if(!node||node.label!==r.symbol.label||node.kind!==r.symbol.kind||!equal(node.sourceRange,r.symbol.sourceRange))return false;
    return new Set(edges.map(edge=>edge.id)).size===edges.length&&edges.every(edge=>keys(edge,['id','kind','sourceId','targetId','provenance','confidence'])&&string(edge.id)&&ids.has(edge.sourceId)&&ids.has(edge.targetId)&&edge.kind==='contains'&&edge.provenance==='tree_sitter'&&edge.confidence==='exact');
  } catch { return false; }
}
