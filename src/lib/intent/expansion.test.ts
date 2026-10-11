import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleExpansion,isBatchKey,MAX_EXPANDED_FILES,MAX_EXPANDED_SYMBOLS } from './expansion.ts';
const files=Array.from({length:5},(_,i)=>({id:'file:'+i,path:'src/'+i+'.ts',symbolCount:i+1}));
test('normal disclosure toggles only its target and preserves other files and input state',()=>{
  const before=new Set(['file:0']);const open=toggleExpansion(before,'file:1',files);assert.deepEqual([...open.expanded],['file:0','file:1']);assert.deepEqual([...before],['file:0']);
  assert.deepEqual([...toggleExpansion(open.expanded,'file:0',files).expanded],['file:1']);
});
test('batch disclosure follows the target new state for all eligible repository files',()=>{
  const candidates=[...files,{id:'unsupported',path:'a.go',symbolCount:0}];
  const open=toggleExpansion(new Set(['file:0']),'file:1',candidates,true);assert.equal(open.expanded.size,5);assert.ok(open.expanded.has('file:0'));assert.ok(open.expanded.has('file:1'));assert.ok(!open.expanded.has('unsupported'));
  assert.equal(toggleExpansion(open.expanded,'file:1',candidates,true).expanded.size,0);
  for(let i=0;i<6;i++)assert.equal(toggleExpansion(toggleExpansion(new Set(),'file:2',files,true).expanded,'file:2',files,true).expanded.size,0);
});
test('large eligible counts are deterministic, preserve existing files, prioritize target and report file bounds',()=>{
  const many=Array.from({length:20000},(_,i)=>({id:'f'+i,path:String(i).padStart(5,'0'),symbolCount:1}));
  const opened=toggleExpansion(new Set(['f999']),'f19999',many,true);assert.equal(opened.expanded.size,MAX_EXPANDED_FILES);assert.ok(opened.expanded.has('f999'));assert.ok(opened.expanded.has('f19999'));assert.match(opened.notice,/24 of 20000.*Limit/);
  assert.deepEqual([...opened.expanded],[...toggleExpansion(new Set(['f999']),'f19999',[...many].reverse(),true).expanded]);
  assert.equal(toggleExpansion(opened.expanded,'f19999',many,true).expanded.size,0);
});
test('symbol budget and oversized targets fail visibly without silently closing existing files',()=>{
  const large=files.map(file=>({...file,symbolCount:1024}));const open=toggleExpansion(new Set(),'file:4',large,true);assert.equal(open.expanded.size,4);assert.ok(open.expanded.has('file:4'));assert.match(open.notice,/4,096 symbols/);
  const missing=large.find(file=>!open.expanded.has(file.id))!;const refused=toggleExpansion(open.expanded,missing.id,large);assert.deepEqual([...refused.expanded],[...open.expanded]);assert.match(refused.notice,/Close a file/);
  assert.equal(toggleExpansion(new Set(),'huge',[{id:'huge',path:'huge.ts',symbolCount:MAX_EXPANDED_SYMBOLS+1}]).expanded.size,0);
});
test('Control Enter and Space are the batch keyboard equivalents; normal keyboard activation stays single',()=>{
  assert.ok(isBatchKey({ctrlKey:true,key:'Enter'}));assert.ok(isBatchKey({ctrlKey:true,key:' '}));assert.ok(!isBatchKey({ctrlKey:false,key:'Enter'}));assert.ok(!isBatchKey({ctrlKey:true,key:'ArrowDown'}));
});
