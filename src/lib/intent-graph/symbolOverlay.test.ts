import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileRelationSnapshotToRenderGraph } from '../graph-v0/adapters.ts';
import { projectSymbolOverlay } from './symbolOverlay.ts';
import type { FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
const fixture=JSON.parse(readFileSync(new URL('../../../fixtures/file-workspace.snapshot.json',import.meta.url),'utf8')) as {files:FileRelationGraphSnapshotDto;symbols:GraphSnapshotDto};

test('backend-derived multi-file aggregates survive expansion and collapse unchanged',()=>{
  const files=fileRelationSnapshotToRenderGraph(fixture.files),before=JSON.stringify(files);
  assert.ok(files.nodes.filter(n=>n.kind==='file').length>4);
  const aggregate=files.edges.find(e=>e.kind==='calls'&&e.weight===2)!;
  assert.equal(aggregate.direction,'directed');assert.equal(aggregate.confidence,'partial');assert.equal(aggregate.provenance,'syn');assert.equal(aggregate.evidenceCount,2);
  for(let i=0;i<5;i++){
    const open=projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.symbols,new Set(['file:src/checkout.rs']));
    assert.ok(open.nodes.length>5);assert.ok(open.nodes.every(n=>n.sourceRange?.path==='src/checkout.rs'));
    assert.ok(open.edges.some(e=>e.kind==='defines'));
    assert.equal(JSON.stringify(files),before);
    assert.deepEqual(projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.symbols,new Set()).nodes,[]);
  }
});
test('overlay retains original node IDs and exact symbol evidence; never substitutes collapsed endpoints',()=>{
  const files=fileRelationSnapshotToRenderGraph(fixture.files);
  const open=projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.symbols,new Set(['file:src/checkout.rs','file:src/receipt.rs']));
  for(const node of open.nodes)assert.ok(fixture.symbols.nodes.includes(node));
  for(const edge of open.edges){assert.ok(fixture.symbols.edges.includes(edge));assert.ok(open.nodes.some(n=>n.id===edge.targetId)||open.fileIdByAnalysisId.has(edge.targetId));}
  const all=projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.symbols,new Set(files.nodes.filter(n=>n.kind==='file').map(n=>n.id)));
  assert.ok(all.edges.some(e=>e.kind==='calls'));
});
test('overlay refuses other roots, ambiguous paths and stale expansion IDs',()=>{
  const files=fileRelationSnapshotToRenderGraph(fixture.files);
  assert.equal(projectSymbolOverlay(files,'other-root',fixture.symbols,new Set(['file:src/checkout.rs'])).nodes.length,0);
  assert.equal(projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.symbols,new Set(['unknown'])).nodes.length,0);
  const file=files.nodes.find(n=>n.path==='src/checkout.rs')!;
  const duplicate={...files,nodes:[...files.nodes,{...file,id:'duplicate'}]};
  assert.equal(projectSymbolOverlay(duplicate,fixture.files.sourceRoot,fixture.symbols,new Set([file.id])).nodes.length,0);
});
