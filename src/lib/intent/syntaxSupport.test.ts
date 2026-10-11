import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SourceAnalysisDto } from '../../backends/SyntaxAnalysis';
import type { FileRelationGraphSnapshotDto, GraphSnapshotDto } from '../../backends/TauriArchitectureBackend';
import { validateGraphAnalysis, coverageLabel, dialectChoices, restoredDialectOverrides } from './syntaxSupport.ts';
import { projectSymbolOverlay } from '../intent-graph/symbolOverlay.ts';
import { fileRelationSnapshotToRenderGraph } from '../graph-v0/adapters.ts';
const fixture=JSON.parse(readFileSync(new URL('../../../fixtures/mixed-workspace.snapshot.json',import.meta.url),'utf8')) as {files:FileRelationGraphSnapshotDto;symbols:GraphSnapshotDto;analysis:SourceAnalysisDto;overriddenSymbols:GraphSnapshotDto;overriddenAnalysis:SourceAnalysisDto};

test('real no-Cargo mixed parser output validates; nullable file ranges still connect to actual symbols',()=>{
  const analysis=validateGraphAnalysis(fixture.overriddenSymbols,fixture.overriddenAnalysis)!;
  assert.ok(new Set(analysis.files.map(file=>file.identity.dialect)).size>=12);
  const files=fileRelationSnapshotToRenderGraph(fixture.files),before=JSON.stringify(files);
  for(const path of ['api/handler.py','web/app.ts','web/Panel.svelte','include/api.h','native/explicit-object.cpp','native/extension-blocks.cs','api/default-type-parameters.py','mobile/context-parameters.kt','native/bitint.c','web/template-bindings.svelte']){
    for(let i=0;i<4;i++){
      const overlay=projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.overriddenSymbols,new Set(['file:'+path]));
      assert.ok(overlay.nodes.length>1,path);assert.equal(overlay.fileIdByAnalysisId.get('file:'+path),'file:'+path);
      assert.ok(overlay.edges.some(edge=>edge.sourceId==='file:'+path));
      assert.ok(overlay.edges.every(edge=>edge.kind==='contains'&&edge.provenance==='tree_sitter'));
      assert.equal(JSON.stringify(files),before);
      assert.deepEqual(projectSymbolOverlay(files,fixture.files.sourceRoot,fixture.overriddenSymbols,new Set()).nodes,[]);
    }
  }
  assert.ok(analysis.files.some(file=>file.relations.some(fact=>fact.kind==='call_syntax')));
  assert.equal(analysis.identity.extractor,'whip-docs-syntax@4');
  const extensions=analysis.files.find(file=>file.identity.path==='native/extension-blocks.cs')!;
  assert.ok(extensions.declarations.some(node=>node.kind==='implementation'&&node.name==='extension'));
  assert.ok(fixture.overriddenSymbols.nodes.some(node=>node.kind==='impl'&&node.label==='extension'));
});
test('owned grammar identities and mapped Svelte bindings fit existing neutral contracts without semantic edges',()=>{
  const analysis=validateGraphAnalysis(fixture.overriddenSymbols,fixture.overriddenAnalysis)!;
  for(const [path,name,kind] of [['api/default-type-parameters.py','T','parameter'],['mobile/context-parameters.kt','logger','parameter'],['native/bitint.c','Counter','type_alias'],['web/template-bindings.svelte','alias','parameter'],['web/template-bindings.svelte','index','binding']]){
    const file=analysis.files.find(file=>file.identity.path===path)!;
    assert.equal(file.identity.coverage,'supported_subset');
    if(!path.endsWith('.svelte'))assert.ok(file.identity.grammars.some(grammar=>/^whip\/.+@.+\+sha256:[a-f0-9]{64}$/.test(grammar.grammar)));
    const declaration=file.declarations.find(node=>node.name===name&&node.kind===kind)!;assert.ok(declaration);
    const bytes=readFileSync(new URL('../../../fixtures/mixed-workspace/'+path,import.meta.url));
    assert.equal(bytes.subarray(declaration.nameRange.startByte,declaration.nameRange.endByte).toString('utf8'),name);
    assert.ok(fixture.overriddenSymbols.nodes.some(node=>node.id===declaration.id&&node.label===name&&node.kind===kind));
    if(path.endsWith('.svelte'))assert.equal(file.declarations.find(node=>node.id===declaration.parentId)?.name,'card');
    assert.ok(file.relations.every(fact=>fact.qualification.endsWith('_unresolved')));
  }
  for(const path of ['broken/context-property.kt','broken/snippet-header.svelte']){
    const file=analysis.files.find(file=>file.identity.path===path)!;assert.equal(file.identity.coverage,'incomplete');assert.ok(file.diagnostics.length);
    assert.ok(!fixture.overriddenSymbols.nodes.some(node=>node.sourceRange?.path===path));
  }
  assert.ok(analysis.files.find(file=>file.identity.path==='broken/context-property.kt')!.diagnostics.some(d=>d.code==='unsupported_context_property'));
});
test('schema drift, mismatched metadata and out-of-bounds ranges fail closed',()=>{
  assert.throws(()=>validateGraphAnalysis({...fixture.symbols,schemaVersion:99},fixture.analysis),/Unsupported graph schema/);
  assert.throws(()=>validateGraphAnalysis(fixture.symbols,null),/missing source-analysis/);
  assert.throws(()=>validateGraphAnalysis(fixture.overriddenSymbols,fixture.analysis),/disagree/);
  const broken=structuredClone(fixture.overriddenAnalysis);broken.files[0].declarations[0].range.endByte=999999;
  assert.throws(()=>validateGraphAnalysis(fixture.overriddenSymbols,broken),/byte range/);
  const graph=structuredClone(fixture.overriddenSymbols);graph.edges[0].kind='calls';
  assert.throws(()=>validateGraphAnalysis(graph,fixture.overriddenAnalysis),/Unresolved facts/);
});
test('coverage and narrow dialect choices preserve unsupported and incomplete states',()=>{
  assert.equal(coverageLabel('supported_subset'),'Supported subset');assert.equal(coverageLabel('incomplete'),'Incomplete');
  assert.deepEqual(dialectChoices('include/api.h'),['c','cpp']);assert.deepEqual(dialectChoices('web/View.js'),['jsx']);assert.deepEqual(dialectChoices('web/runes.svelte.js'),[]);
  assert.ok(fixture.analysis.diagnostics.some(d=>d.code==='ambiguous_header_dialect'));
  assert.ok(fixture.analysis.diagnostics.some(d=>d.path==='unsupported/plugin.go'));
  assert.equal(fixture.analysis.files.find(f=>f.identity.path==='broken/bad.py')?.identity.coverage,'incomplete');
  assert.equal(fixture.analysis.files.find(f=>f.identity.path==='web/View.js')?.identity.coverage,'incomplete');
  assert.equal(fixture.overriddenAnalysis.files.find(f=>f.identity.path==='web/View.js')?.identity.dialect,'jsx');
  assert.deepEqual(Object.fromEntries(restoredDialectOverrides(fixture.overriddenAnalysis)),{'include/api.h':'cpp','web/View.js':'jsx'});
  const template=fixture.overriddenAnalysis.files.find(file=>file.identity.path==='web/Template.svelte')!;
  assert.ok(template.relations.some(fact=>fact.kind==='call_syntax'&&fact.qualification==='written_syntax_unresolved'));
  assert.ok(fixture.overriddenSymbols.edges.every(edge=>edge.kind==='contains'));
});
