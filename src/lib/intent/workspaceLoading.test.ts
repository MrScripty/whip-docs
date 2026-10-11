import test from 'node:test';
import assert from 'node:assert/strict';
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
