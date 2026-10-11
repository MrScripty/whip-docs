import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SourceAnalysisDto } from '../../backends/SyntaxAnalysis';
import { WorkspaceLoader, type WorkspaceBackend } from './workspaceLoading.ts';
import type { AppConfigDto, FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
function deferred<T>(){let resolve!:(v:T)=>void,reject!:(e:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const files=(sourceRoot:string):FileRelationGraphSnapshotDto=>({schemaVersion:1,sourceRoot,generatedAt:'files',rootNodeId:'root',nodes:[],edges:[],analyzers:[],diagnostics:[]});
const symbols=(sourceRoot:string):GraphSnapshotDto=>({schemaVersion:1,sourceRoot,generatedAt:'symbols',nodes:[],edges:[],diagnostics:[]});
const config=(sourceRepoPath:string):AppConfigDto=>({schemaVersion:1,sourceRepoPath,sourceRepoStatus:'valid'});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function receiver(log:string[]){return {files:(s:FileRelationGraphSnapshotDto)=>log.push('files:'+s.sourceRoot),configured:()=>log.push('configured'),symbols:(s:GraphSnapshotDto)=>log.push('symbols:'+s.sourceRoot),error:()=>log.push('error'),done:()=>log.push('done')};}
test('file relations are available even when optional Cargo/symbol analysis is unavailable',async()=>{
  const log:string[]=[];const backend:WorkspaceBackend={loadFileRelationGraph:async()=>files('/plain-source'),setSourceRepoPath:async()=>{throw Error('no Cargo')},analyzeSourceRepo:async()=>{throw Error('must not run')}};
  await new WorkspaceLoader().open(backend,' /plain-source ',receiver(log));assert.deepEqual(log,['files:/plain-source','error','done']);
});
test('late A success never commits after B; obsolete requests never mutate the backend',async()=>{
  const log:string[]=[],calls:string[]=[];const a=deferred<FileRelationGraphSnapshotDto>();let root='';
  const backend:WorkspaceBackend={loadFileRelationGraph:async(path)=>{calls.push('load:'+path);return path==='A'?a.promise:files('B')},setSourceRepoPath:async(path)=>{calls.push('set:'+path);root=path;return config(path)},analyzeSourceRepo:async()=>symbols(root)};
  const loader=new WorkspaceLoader();const first=loader.open(backend,'A',receiver(log));await tick();const last=loader.open(backend,'B',receiver(log));a.resolve(files('A'));await Promise.all([first,last]);
  assert.deepEqual(log,['files:B','configured','symbols:B','done']);assert.deepEqual(calls,['load:A','load:B','set:B']);
});
test('late errors and finally from cancelled loads cannot replace current state',async()=>{
  const log:string[]=[];const a=deferred<FileRelationGraphSnapshotDto>();const backend:WorkspaceBackend={loadFileRelationGraph:async()=>a.promise,setSourceRepoPath:async()=>config('A'),analyzeSourceRepo:async()=>symbols('A')};
  const loader=new WorkspaceLoader();const task=loader.open(backend,'A',receiver(log));await tick();loader.invalidate();a.reject(Error('late'));await task;assert.deepEqual(log,[]);
});
test('backend root mutations serialize across overlapping requests, and mismatched symbols are rejected',async()=>{
  const log:string[]=[],calls:string[]=[];const set=deferred<AppConfigDto>();let root='A';
  const backend:WorkspaceBackend={loadFileRelationGraph:async p=>{calls.push('load:'+p);return files(p)},setSourceRepoPath:async p=>{calls.push('set:'+p);root=p;return p==='A'?set.promise:config(p)},analyzeSourceRepo:async()=>symbols(root==='B'?'wrong-root':root)};
  const loader=new WorkspaceLoader();const a=loader.open(backend,'A',receiver(log));await tick();const b=loader.open(backend,'B',receiver(log));await tick();assert.deepEqual(calls,['load:A','set:A']);set.resolve(config('A'));await Promise.all([a,b]);
  assert.deepEqual(log,['files:A','files:B','configured','error','done']);
});
test('configured history remains available when optional symbol analysis fails',async()=>{
  const log:string[]=[];const backend:WorkspaceBackend={loadFileRelationGraph:async()=>files('/known'),setSourceRepoPath:async()=>config('/known'),analyzeSourceRepo:async()=>{throw Error('analysis failed')}};
  await new WorkspaceLoader().open(backend,'/known',receiver(log));assert.deepEqual(log,['files:/known','configured','error','done']);
});
const mixed=JSON.parse(readFileSync(new URL('../../../fixtures/mixed-workspace.snapshot.json',import.meta.url),'utf8')) as {symbols:GraphSnapshotDto;analysis:SourceAnalysisDto;files:FileRelationGraphSnapshotDto};
test('schema2 metadata is requested with exact root/token, and obsolete metadata never commits',async()=>{
  const log:string[]=[],requested:unknown[]=[];const metadata=deferred<SourceAnalysisDto>();let analysisCalls=0;
  const backend:WorkspaceBackend={loadFileRelationGraph:async()=>mixed.files,setSourceRepoPath:async p=>config(p),analyzeSourceRepo:async overrides=>{requested.push(overrides);return {...mixed.symbols,generatedAt:String(++analysisCalls)}},getSourceAnalysis:async(root,at)=>{requested.push([root,at]);return at==='1'?metadata.promise:mixed.analysis}};
  const loader=new WorkspaceLoader();const a=loader.open(backend,'A',receiver(log),{'include/api.h':'cpp'});await tick();const b=loader.open(backend,'B',receiver(log));metadata.resolve(mixed.analysis);await Promise.all([a,b]);
  assert.deepEqual(requested,[{'include/api.h':'cpp'},[mixed.files.sourceRoot,'1'],undefined,[mixed.files.sourceRoot,'2']]);
  assert.equal(log.filter(value=>value.startsWith('symbols:')).length,1);assert.equal(log.filter(value=>value==='done').length,1);
});
test('missing or future schema2 metadata preserves file overview/history availability but rejects symbols',async()=>{
  for(const graph of [mixed.symbols,{...mixed.symbols,schemaVersion:99}]){
    const log:string[]=[];const backend:WorkspaceBackend={loadFileRelationGraph:async()=>mixed.files,setSourceRepoPath:async p=>config(p),analyzeSourceRepo:async()=>graph,getSourceAnalysis:async()=>null};
    await new WorkspaceLoader().open(backend,'A',receiver(log));assert.deepEqual(log,['files:'+mixed.files.sourceRoot,'configured','error','done']);
  }
});
