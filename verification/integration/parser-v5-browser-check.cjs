// Focused @5 contract replay. Separate inspector/browser checks qualify layout.
// Uses actual Chromium/WebGL with Rust-exported fixture data, not native IPC.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.GRAPH_TEST_ORIGIN||'http://127.0.0.1:1421';
const out=process.env.EVIDENCE_DIR||'/tmp/whip-parser-v5';fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../fixtures/mixed-workspace.snapshot.json'),'utf8'));
const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../fixtures/mixed-workspace.previous-v4-journal.json'),'utf8'));
const key='whip-docs.intent-syntax-preview.v3',checks=[],errors=[];
const pass=text=>{checks.push(text);console.log('PASS',text)};
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1680,height:1050}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/?preview=mixed');await page.locator('[data-node-id="file:api/default-type-parameters.py"]').waitFor();
 assert.equal(await page.locator('.graph-mount canvas').count(),1);
 assert.match(await page.locator('.top-meta').getAttribute('title'),/Native Tauri IPC is not running/);
 const entries=[];
 const cases=[
  ['mobile/properties.kt','current','field',0],
  ['mobile/properties.kt','constructor','method',0],
  ['native/assignments.zig','idle','variant',0],
  ['native/special-members.cpp','~Gear','method',0],
  ['native/special-members.cpp','operator()','method',0],
  ['native/special-members.cpp','operator()','method',1],
  ['native/callable-groups.odin','(Parcel) .grow','function',0],
  ['native/callable-groups.odin','render_any','function',0],
 ];
 for(const [file,label,kind,occurrence] of cases){
  await page.getByRole('button',{name:'Expand '+file,exact:true}).click();
  assert.match(await page.locator('.syntax-metadata').innerText(),/Supported subset/);
  const node=fixture.overriddenSymbols.nodes.filter(node=>node.sourceRange?.path===file&&node.label===label&&node.kind===kind)[occurrence];
  const declaration=fixture.overriddenAnalysis.files.find(item=>item.identity.path===file).declarations.find(item=>item.id===node.id);
  await page.locator('.symbol-list button').filter({has:page.getByText(label,{exact:true})}).nth(occurrence).click();
  assert.equal(await page.locator('.symbol-title').innerText(),label);
  const inspector=await page.locator('.inspector').innerText();
  assert.match(inspector,/UTF-8 byte range/);assert(inspector.includes(`${declaration.range.startByte}–${declaration.range.endByte}`));
  const exact=`  Preserve ${file} / ${label} — 蟹.\n\tKeep this intent verbatim.  `;
  await page.locator('#intent-text').fill(exact);await page.getByRole('button',{name:'Preserve original intent',exact:true}).click();
  await page.waitForFunction(count=>JSON.parse(localStorage.getItem('whip-docs.intent-syntax-preview.v3')).length===count,entries.length+1);
  entries.push({file,label,exact,nodeId:node.id});
  assert.equal(await page.locator('.intent-record[data-kind="original"] > p').textContent(),exact);
  await page.getByRole('button',{name:'Collapse '+file,exact:true}).click();
 }
 assert.notEqual(entries[4].nodeId,entries[5].nodeId);
 pass('Existing overlay and inspector show corrected Kotlin/Zig ownership and exact C++/Odin callable names/ranges; duplicate operator labels retain distinct IDs and each accepts verbatim intent');
 const originals=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
 await page.getByRole('button',{name:'Expand native/callable-groups.odin',exact:true}).click();
 await page.locator('.symbol-list button').filter({has:page.locator('span').filter({hasText:/^render_any$/})}).click();
 await page.locator('#intent-kind').selectOption('proposal');await page.locator('#intent-text').fill('Separate proposed interpretation.');
 await page.getByRole('button',{name:'Append separate entry',exact:true}).click();
 await page.waitForFunction(count=>JSON.parse(localStorage.getItem('whip-docs.intent-syntax-preview.v3')).length===count,entries.length+1);
 const rows=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.deepEqual(rows.slice(0,entries.length),originals);
 assert.equal(rows[entries.length].record.parentId,rows[entries.length-1].record.id);assert.deepEqual(rows[entries.length].record.snapshot,rows[entries.length-1].record.snapshot);
 for(const row of rows){assert.equal(row.schemaVersion,3);assert.equal(row.record.snapshot.analysisIdentity.extractor,fixture.overriddenAnalysis.identity.extractor);}
 for(const marker of ['Prefix: café','PUBLIC_MIXED_COMMENT','PUBLIC_NAME_COMMENT','class Ledger','struct Gear','return compute','package demo','spare :='])assert(!JSON.stringify(rows).includes(marker),marker);
 await page.reload();await page.locator('[data-node-id="file:api/default-type-parameters.py"]').waitFor();await page.getByRole('checkbox',{name:'Show all repository history'}).check();
 await page.waitForFunction(count=>document.querySelectorAll('.intent-record').length===count,entries.length+1);
 for(let i=0;i<entries.length;i++)assert.equal(await page.locator('.intent-record[data-kind="original"] > p').nth(i).textContent(),entries[i].exact);
 assert.equal(await page.locator('.intent-record[data-kind="proposal"]').count(),1);
 pass('Corrected callable names and neutral kinds persist after reload, preserve original bytes, keep proposals separate and exclude source/default/comment text');
 for(const [file,diagnostic,excluded] of [
  ['broken/unsupported-callable.cpp','unsupported_callable_declaration',['orphan']],
  ['broken/destructuring.kt','unsupported_destructuring_property',['left','right']],
  ['broken/variants.odin','unsupported_variant_inventory',['Pale','Dark']],
  ['broken/patterns.js','unsupported_private_field',['hidden','value','rest']],
  ['broken/namespace.cs','unsupported_file_scoped_namespace_scope',[]],
  ['broken/alternatives.c','preprocessor_alternatives_unresolved',[]],
 ]){
  await page.locator(`[data-node-id="file:${file}"]`).click();
  assert.match(await page.locator('.syntax-metadata').innerText(),/Incomplete/);
  await page.locator(`[data-diagnostic="${diagnostic}"]`).first().waitFor();
  if(file.endsWith('patterns.js'))await page.locator('[data-diagnostic="unsupported_parameter_pattern"]').first().waitFor();
  await page.getByRole('button',{name:'Expand '+file,exact:true}).click();
  for(const name of excluded)assert.equal(await page.locator('.symbol-list button').filter({has:page.getByText(name,{exact:true})}).count(),0);
  await page.getByRole('button',{name:'Collapse '+file,exact:true}).click();
 }
 await page.locator('.analysis-coverage summary').click();
 const coverage=await page.locator('.analysis-coverage').innerText();assert.match(coverage,/Kotlin destructuring/);assert.match(coverage,/does not describe lexical visibility/);assert.match(coverage,/Complete language or Passeur parity is not claimed/);
 pass('Six negative fixtures show precise remaining diagnostics without phantom or orphan declarations; scope and semantic limitations stay visible');
 const priorBytes=JSON.stringify([{schemaVersion:3,record:old}]);
 await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:priorBytes});await page.reload();
 await page.locator('[data-node-id="file:api/handler.py"]').waitFor();await page.getByRole('checkbox',{name:'Show all repository history'}).check();
 await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===1);
 assert.equal(await page.locator('.record-heading span').innerText(),'stale');
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),priorBytes);
 await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();
 await page.locator('.symbol-list button').filter({has:page.locator('span').filter({hasText:/^Boxed$/})}).click();
 await page.locator('#intent-kind').selectOption('proposal');await page.locator('#intent-text').fill('Must not rebind an older original.');
 assert.equal(await page.locator('#original-intent option').count(),1);assert(await page.getByRole('button',{name:'Append separate entry',exact:true}).isDisabled());
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),priorBytes);
 pass('Actual @4 journal survives byte-for-byte as stale under the current extractor and cannot receive a derivative from the UI');
 const bad='[{"schemaVersion":99}]';await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:bad});await page.reload();
 await page.getByText('Invalid syntax preview journal. It was left unchanged.',{exact:true}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),bad);
 assert.deepEqual(errors,[]);pass('Invalid journal remains unchanged; no browser page errors');
 fs.writeFileSync(path.join(out,'parser-v5-browser-results.json'),JSON.stringify({backend:'Real WebGL UI; Rust-exported fixture; no native IPC',extractor:fixture.overriddenAnalysis.identity.extractor,checks,errors},null,2));
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'parser-v5-browser-results.json'),JSON.stringify({checks,errors,failure:String(error)},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
