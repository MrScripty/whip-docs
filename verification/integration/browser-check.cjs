// Actual UI with recorded parser DTOs. Native IPC is explicitly unverified.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.GRAPH_TEST_ORIGIN||'http://127.0.0.1:1421';
const out=process.env.EVIDENCE_DIR||'/tmp/whip-integration';fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],pass=s=>{checks.push(s);console.log('PASS',s)};
const storageKey='whip-docs.intent-syntax-preview.v3';
const exact='  Preserve multilingual responsibility — 蟹.\n\tProposals stay separate.  ';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1680,height:1050}});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?preview=mixed');await page.locator('[data-node-id="file:web/app.ts"]').waitFor();
 assert.equal(await page.locator('.graph-mount canvas').count(),1);
 await page.waitForTimeout(350);await page.screenshot({path:path.join(out,'mixed-file-overview.png')});
 for(const file of ['api/handler.py','web/app.ts','web/Panel.svelte','include/api.h','scripts/task.lua','native/memory.zig','server/Service.cs']){
  await page.getByRole('button',{name:'Expand '+file,exact:true}).click();
  assert((await page.locator('.symbol-scene-label').count())>0,file);
  assert.match(await page.locator('.syntax-metadata').innerText(),/Supported subset|Incomplete/);
  await page.getByRole('button',{name:'Collapse '+file,exact:true}).click();
 }
 pass('Actual mixed UI expands parsed symbols across Python, TypeScript, Svelte, C++, Lua, Zig and C#');
 await page.locator('[data-node-id="file:unsupported/plugin.go"]').click();assert.match(await page.locator('.syntax-metadata').innerText(),/Outside captured scope/);
 assert(await page.getByRole('button',{name:'Expand unsupported/plugin.go',exact:true}).isDisabled());
 await page.locator('[data-node-id="file:broken/bad.py"]').click();assert.match(await page.locator('.syntax-metadata').innerText(),/Incomplete/);
 await page.locator('.analysis-coverage summary').click();assert.match(await page.locator('.analysis-coverage').innerText(),/Python defaulted type parameters.*Kotlin context parameters.*C23 _BitInt.*C\+\+ explicit object parameters.*C# extension blocks.*Svelte template expressions/s);
 pass('Unsupported, damaged and known unqualified syntax remain explicit');
 await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();await page.getByRole('button',{name:'Frame symbols',exact:true}).click();
 const symbol=page.locator('.symbol-list button').filter({hasText:/Box/}).first();await symbol.click();
 assert.match(await page.locator('.inspector').innerText(),/UTF-8 byte range/);
 await page.locator('#intent-text').fill(exact);await page.getByRole('button',{name:'Preserve original intent',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===1);
 const original=await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0],storageKey);
 assert.equal(original.record.text,exact);assert.equal(original.schemaVersion,3);assert.equal(original.record.snapshot.worktreeDigestScope,'captured_multilingual_sources_v1');
 await page.locator('#intent-kind').selectOption('proposal');await page.locator('#intent-text').fill('Propose another interpretation without changing structure.');await page.getByRole('button',{name:'Append separate entry',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===2);
 const records=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);assert.deepEqual(records[0],original);assert.equal(records[1].record.parentId,original.record.id);
 for(const marker of ['PUBLIC_MIXED_COMMENT','PUBLIC_MIXED_LITERAL','class Box','def '])assert(!JSON.stringify(records).includes(marker),marker);
 await page.screenshot({path:path.join(out,'mixed-file-expanded.png')});
 await page.reload();await page.locator('[data-node-id="file:api/handler.py"]').waitFor();await page.getByRole('checkbox',{name:'Show all repository history'}).check();await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===2);assert.equal(await page.locator('.intent-record[data-kind="original"] > p').textContent(),exact);
 pass('Schema3 exact intent, immutable original, separate proposal, explicit digest scope and source exclusion survive reload');
 await page.evaluate(key=>localStorage.setItem(key,'[{"schemaVersion":99}]'),storageKey);await page.reload();await page.getByText('Invalid syntax preview journal. It was left unchanged.',{exact:true}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),storageKey),'[{"schemaVersion":99}]');
 pass('Future/corrupt preview journals fail safely without changing their bytes');
 // Explicit IPC stub: verify restored dialect options and root/token read arguments.
 const nativePage=await context.newPage();nativePage.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../fixtures/mixed-workspace.snapshot.json'),'utf8'));
 await nativePage.addInitScript(({fixture})=>{
  window.isTauri=true;window.integrationCalls=[];let graph=fixture.overriddenSymbols;
  window.__TAURI_INTERNALS__={invoke:async(command,args)=>{
   if(command==='get_app_config'||command==='set_source_repo_path')return {schemaVersion:1,sourceRepoPath:fixture.files.sourceRoot,sourceRepoStatus:'valid'};
   if(command==='load_file_relation_graph')return fixture.files;
   if(command==='get_graph_snapshot')return graph;
   if(command==='get_source_analysis'){window.integrationCalls.push({command,args});if(args.expectedSourceRoot!==graph.sourceRoot||args.expectedAnalysisAt!==graph.generatedAt)throw Error('Wrong metadata association');return fixture.overriddenAnalysis;}
   if(command==='analyze_source_repo'){window.integrationCalls.push({command,args});graph={...graph,generatedAt:graph.generatedAt+'-next'};return graph;}
   if(command==='list_intent_records')return [];
   throw Error('Unexpected stub command '+command);
  }};
 },{fixture});
 await nativePage.goto(origin+'/');await nativePage.locator('[data-node-id="file:include/api.h"]').click();assert.equal(await nativePage.locator('#dialect-override').inputValue(),'cpp');
 await nativePage.getByRole('button',{name:'Open and analyze',exact:true}).click();await nativePage.getByText('File graph loaded. Select a file to expand its symbols.',{exact:true}).waitFor();
 let calls=await nativePage.evaluate(()=>window.integrationCalls);assert.deepEqual(calls.find(call=>call.command==='analyze_source_repo').args.dialectOverrides,{'include/api.h':'cpp','web/View.js':'jsx'});
 await nativePage.locator('[data-node-id="file:include/api.h"]').click();await nativePage.locator('#dialect-override').selectOption('');await nativePage.getByText('File graph loaded. Select a file to expand its symbols.',{exact:true}).waitFor();
 calls=await nativePage.evaluate(()=>window.integrationCalls);assert.deepEqual(calls.filter(call=>call.command==='analyze_source_repo').at(-1).args.dialectOverrides,{'web/View.js':'jsx'});
 pass('IPC-stub restoration retains effective C++/JSX overrides, explicit clear removes a key, and syntax reads use exact root/token');
 const scenePage=await context.newPage();scenePage.on('pageerror',e=>errors.push(e.message));await scenePage.goto(origin+'/');
 const sceneResults=await scenePage.evaluate(async()=>{
  const {DirectoryGraphScene}=await import('/src/lib/graph-v0/ThreeDirectoryGraphScene.ts');
  const {fileRelationSnapshotToRenderGraph}=await import('/src/lib/graph-v0/adapters.ts');
  const {projectSymbolOverlay}=await import('/src/lib/intent-graph/symbolOverlay.ts');
  const {mixedFiles,mixedSymbols}=await import('/src/lib/intent/mixedWorkspaceFixture.ts');
  const mount=document.createElement('div');mount.style.cssText='position:fixed;inset:0';document.body.append(mount);
  const scene=new DirectoryGraphScene(mount),graph=fileRelationSnapshotToRenderGraph(mixedFiles),options={layoutAlgorithm:'weighted-safe-radial-tree',edgeStyle:'c-curve',rootEdgeStyle:'elbow',leafDirectoryEdgeStyle:'straight',selectedNodeId:'file:web/app.ts'};
  const ensure=(yes,message)=>{if(!yes)throw Error(message)},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),sleep=()=>new Promise(r=>setTimeout(r,350));
  scene.updateGraph(graph,options);await sleep();
  const base=()=>({nodes:[...scene.nodeEntries].map(([id,e])=>[id,e.mesh.uuid,e.mesh.position.toArray()]),edges:[...scene.edgeEntries].map(([id,e])=>[id,e.line.uuid,Array.from(e.line.geometry.attributes.position.array),e.line.visible]),camera:scene.camera.position.toArray(),target:scene.cameraTarget.toArray()});
  const before=base(),empty=projectSymbolOverlay(graph,mixedFiles.sourceRoot,mixedSymbols,new Set());
  for(let i=0;i<5;i++)for(const file of ['web/app.ts','api/handler.py','web/Panel.svelte']){scene.updateSymbols(projectSymbolOverlay(graph,mixedFiles.sourceRoot,mixedSymbols,new Set(['file:'+file])),null,()=>{});ensure(same(base(),before),'Expansion changed base geometry/camera');scene.updateSymbols(empty,null,()=>{});ensure(same(base(),before),'Collapse changed base geometry/camera');}
  ensure(mixedSymbols.edges.every(e=>e.kind==='contains'&&e.provenance==='tree_sitter'),'Unexpected semantic edge');scene.dispose();mount.remove();return ['Fifteen mixed-language expansions preserve original file mesh IDs, routes, visibility, camera and target'];
 });
 sceneResults.forEach(pass);assert.deepEqual(errors,[]);pass('No browser page errors');
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({backend:'Recorded Rust fixture; no native Tauri IPC',checks,errors},null,2));await browser.close();
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checks,errors,failure:String(error)},null,2));process.exit(1)});
