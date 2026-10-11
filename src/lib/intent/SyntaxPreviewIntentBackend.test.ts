import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SourceAnalysisDto } from '../../backends/SyntaxAnalysis';
import type { GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import type { IntentRecord } from './types';
import { SyntaxPreviewIntentBackend, syntaxSourceDigest, SYNTAX_PREVIEW_STORAGE_KEY } from './SyntaxPreviewIntentBackend.ts';
import { fingerprint, PREVIEW_STORAGE_KEY } from './PreviewIntentBackend.ts';
const fixture=JSON.parse(readFileSync(new URL('../../../fixtures/mixed-workspace.snapshot.json',import.meta.url),'utf8')) as {overriddenSymbols:GraphSnapshotDto;overriddenAnalysis:SourceAnalysisDto;journalVector:IntentRecord};
const graph=fixture.overriddenSymbols,analysis=fixture.overriddenAnalysis;
const sources=new Map(analysis.files.map(file=>[file.identity.path,readFileSync(new URL('../../../fixtures/mixed-workspace/'+file.identity.path,import.meta.url),'utf8')]));
class MemoryStorage {values=new Map<string,string>();getItem(key:string){return this.values.get(key)??null}setItem(key:string,value:string){this.values.set(key,value)}}
const input={nodeId:fixture.journalVector.symbol.nodeId,kind:'original' as const,parentId:null,text:'  Preserve Python responsibility — 蟹.\n\tNo proposal execution.  ',expectedAnalysisAt:graph.generatedAt};
test('browser multilingual digest matches an actual Rust journal vector',async()=>{
  const files=await Promise.all([...sources].map(async([path,source])=>({path,contentHash:await fingerprint(source),byteLength:new TextEncoder().encode(source).length})));
  assert.equal(await syntaxSourceDigest(files,analysis.identity),fixture.journalVector.snapshot.worktreeDigest);
});
test('mixed preview preserves exact original, separate proposals, source exclusion and legacy storage bytes',async()=>{
  const storage=new MemoryStorage(),legacy='[  {"old":"v2 bytes remain untouched"}  ]';storage.setItem(PREVIEW_STORAGE_KEY,legacy);
  const backend=new SyntaxPreviewIntentBackend(storage,graph,analysis,sources),original=await backend.appendRecord(input);
  const before=JSON.parse(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!)[0];
  const proposal=await backend.appendRecord({...input,kind:'proposal',parentId:original.id,text:'Propose a later change.'});
  assert.equal(original.text,input.text);assert.deepEqual(proposal.snapshot,original.snapshot);assert.equal(proposal.parentId,original.id);
  const serialized=storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!;assert.deepEqual(JSON.parse(serialized)[0],before);
  for(const marker of ['PUBLIC_MIXED_COMMENT','PUBLIC_MIXED_LITERAL','class Box','def '])assert.ok(!serialized.includes(marker),marker);
  assert.equal(storage.getItem(PREVIEW_STORAGE_KEY),legacy);
  const restarted=await new SyntaxPreviewIntentBackend(storage,graph,analysis,sources).listRecords();assert.equal(restarted.length,2);assert.ok(restarted.every(record=>record.bindingStatus==='current'));
});
test('changed identity, changed source, stale tokens and malformed journals are bounded failures without writes',async()=>{
  const storage=new MemoryStorage(),backend=new SyntaxPreviewIntentBackend(storage,graph,analysis,sources);await backend.appendRecord(input);const before=storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY);
  await assert.rejects(backend.appendRecord({...input,expectedAnalysisAt:'obsolete'}),/Analysis changed/);
  await assert.rejects(backend.appendRecord({...input,text:'x'.repeat(16385)}),/16 KiB/);
  const changed=structuredClone(analysis);changed.identity.extractor='future-version';
  const newer=new SyntaxPreviewIntentBackend(storage,graph,changed,sources);assert.equal((await newer.listRecords())[0].bindingStatus,'stale');
  const bytes=new Map(sources);bytes.set('api/handler.py',bytes.get('api/handler.py')+'\n# changed');
  const edited=new SyntaxPreviewIntentBackend(storage,graph,analysis,bytes);assert.equal((await edited.listRecords())[0].bindingStatus,'stale');await assert.rejects(edited.appendRecord(input),/source or parser identity changed/);
  assert.equal(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY),before);
  for(const bad of ['{broken','[{"schemaVersion":99}]']){storage.setItem(SYNTAX_PREVIEW_STORAGE_KEY,bad);await assert.rejects(backend.listRecords());await assert.rejects(backend.appendRecord(input));assert.equal(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY),bad);}
});
test('semantic corruption and unexpected source fields reject reads/appends without rewriting storage',async()=>{
  const storage=new MemoryStorage(),backend=new SyntaxPreviewIntentBackend(storage,graph,analysis,sources);const original=await backend.appendRecord(input);
  const good=storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!;
  const corruptions:[string[],unknown][]=[
    [['record','rawSource'],'UNEXPECTED_RAW_SOURCE'],
    [['record','snapshot','byteLength'],-10],
    [['record','symbol','sourceRange','startLine'],0],
    [['record','snapshot','structuralSnapshot','nodes','0','rawSource'],'UNEXPECTED_RAW_SOURCE'],
    [['record','snapshot','analysisIdentity','sourceBody'],'UNEXPECTED_RAW_SOURCE'],
  ];
  for(const [path,value] of corruptions){const rows=JSON.parse(good);let item=rows[0] as Record<string,unknown>;for(const key of path.slice(0,-1))item=item[key] as Record<string,unknown>;item[path.at(-1)!]=value;const bad=JSON.stringify(rows);storage.setItem(SYNTAX_PREVIEW_STORAGE_KEY,bad);await assert.rejects(backend.listRecords(),/Invalid syntax preview journal/);await assert.rejects(backend.appendRecord({...input,kind:'proposal',parentId:original.id}),/Invalid syntax preview journal/);assert.equal(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY),bad);}

});
test('new parameters and template bindings round-trip through the existing journal without source/default text',async()=>{
  const storage=new MemoryStorage(),backend=new SyntaxPreviewIntentBackend(storage,graph,analysis,sources);
  for(const [path,label,kind] of [['api/default-type-parameters.py','T','parameter'],['mobile/context-parameters.kt','logger','parameter'],['native/bitint.c','Counter','type_alias'],['web/template-bindings.svelte','alias','parameter'],['web/template-bindings.svelte','index','binding']]){
    const node=graph.nodes.find(node=>node.sourceRange?.path===path&&node.label===label&&node.kind===kind)!;assert.ok(node);
    const original=await backend.appendRecord({...input,nodeId:node.id});
    const prior=JSON.parse(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!).at(-1);
    const proposal=await backend.appendRecord({...input,nodeId:node.id,kind:'proposal',parentId:original.id,text:'Separate proposal.'});
    assert.equal(proposal.parentId,original.id);assert.deepEqual(proposal.snapshot,original.snapshot);
    assert.deepEqual(JSON.parse(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!).at(-2),prior);
  }
  const records=await new SyntaxPreviewIntentBackend(storage,graph,analysis,sources).listRecords();
  assert.equal(records.length,10);assert.ok(records.every(record=>record.bindingStatus==='current'));
  const raw=storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY)!;
  for(const forbidden of ['Prefix: café','class Box[T','context(user: User','typedef unsigned','_BitInt(17)','label = \\"x\\"','fallback()','<script lang='])assert.ok(!raw.includes(forbidden),forbidden);
  assert.ok(records.every(record=>record.snapshot.analysisIdentity?.extractor==='whip-docs-syntax@4'));
});
for(const [file,extractor] of [['previous-journal','whip-docs-syntax@1'],['previous-v2-journal','whip-docs-syntax@2'],['previous-v3-journal','whip-docs-syntax@3']])test(`actual ${extractor} journal vector remains unchanged and stale after the follow-up`,async()=>{
  const old=JSON.parse(readFileSync(new URL(`../../../fixtures/mixed-workspace.${file}.json`,import.meta.url),'utf8')) as IntentRecord;
  assert.equal(old.snapshot.analysisIdentity?.extractor,extractor);assert.equal(analysis.identity.extractor,'whip-docs-syntax@4');
  const storage=new MemoryStorage(),originalBytes=JSON.stringify([{schemaVersion:3,record:old}]);storage.setItem(SYNTAX_PREVIEW_STORAGE_KEY,originalBytes);
  const backend=new SyntaxPreviewIntentBackend(storage,graph,analysis,sources);
  assert.equal((await backend.listRecords())[0].bindingStatus,'stale');
  await assert.rejects(backend.appendRecord({...input,kind:'proposal',parentId:old.id}),/historical intent is not relinked/);
  assert.equal(storage.getItem(SYNTAX_PREVIEW_STORAGE_KEY),originalBytes);
});
