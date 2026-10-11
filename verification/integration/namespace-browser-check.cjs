// Focused namespace-label privacy regression in the actual public-fixture UI.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.GRAPH_TEST_ORIGIN||'http://127.0.0.1:1421';
const out=process.env.EVIDENCE_DIR||'/tmp/whip-namespace';fs.mkdirSync(out,{recursive:true});
const key='whip-docs.intent-syntax-preview.v3',checks=[],errors=[];
const pass=text=>{checks.push(text);console.log('PASS',text)};
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1680,height:1050}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?preview=mixed');
 let count=0;
 for(const [file,label,hidden] of [['broken/namespace-name.cs','KeptCs','HiddenCs'],['broken/namespace-name.cpp','KeptCpp','HiddenCpp']]){
  await page.locator(`[data-node-id="file:${file}"]`).click();await page.locator('[data-diagnostic="unsupported_declaration_name"]').waitFor();
  assert.match(await page.locator('.syntax-metadata').innerText(),/Incomplete/);
  await page.getByRole('button',{name:'Expand '+file,exact:true}).click();
  assert.equal(await page.locator('.symbol-list button').filter({has:page.getByText(hidden,{exact:true})}).count(),0);
  await page.locator('.symbol-list button').filter({has:page.getByText(label,{exact:true})}).click();
  assert.equal(await page.locator('.symbol-title').innerText(),label);assert.equal(await page.locator('.selection-kind').innerText(),'class');
  assert.match(await page.locator('.inspector').innerText(),/UTF-8 byte range/);
  await page.getByLabel('Record type',{exact:true}).selectOption('original');
  const exact=`  Preserve ${label} intent — 蟹.\n\tKeep these words.  `;
  await page.getByLabel('Intent',{exact:true}).fill(exact);await page.getByRole('button',{name:'Preserve original intent',exact:true}).click();
  await page.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)).length===count,{key,count:++count});
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),original=before.at(-1).record;
  assert.equal(original.text,exact);assert.deepEqual(original.snapshot.structuralSnapshot.nodes.map(n=>n.label),[label]);
  await page.getByLabel('Record type',{exact:true}).selectOption('proposal');await page.getByLabel('Proposal',{exact:true}).fill('Separate proposed change.');
  await page.getByRole('button',{name:'Append separate entry',exact:true}).click();await page.waitForFunction(({key,count})=>JSON.parse(localStorage.getItem(key)).length===count,{key,count:++count});
  const rows=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.deepEqual(rows.slice(0,-1),before);assert.equal(rows.at(-1).record.parentId,original.id);assert.deepEqual(rows.at(-1).record.snapshot,original.snapshot);
  await page.getByRole('button',{name:'Collapse '+file,exact:true}).click();
 }
 pass('C# and C++ unsafe namespace names are explicitly diagnosed, rejected descendants stay absent, and safe classes retain compact header/range/intent controls');
 const bytes=await page.evaluate(key=>localStorage.getItem(key),key);
 for(const marker of ['PUBLIC_NAMESPACE_COMMENT','HiddenCs','HiddenCpp','namespace Alpha','class Kept'])assert(!bytes.includes(marker),marker);
 assert(JSON.parse(bytes).every(row=>row.record.snapshot.analysisIdentity.extractor==='whip-docs-syntax@6'));
 await page.reload();await page.getByRole('checkbox',{name:'Show all repository history'}).check();await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===4);
 assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),bytes);assert.equal(await page.locator('.intent-record[data-kind="original"]').count(),2);assert.equal(await page.locator('.intent-record[data-kind="proposal"]').count(),2);
 pass('Four @6 records survive reload unchanged, keep proposals separate, and persist neither namespace comments nor rejected names/source fragments');
 const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../fixtures/mixed-workspace.previous-v5-journal.json'),'utf8'));
 assert.equal(old.snapshot.analysisIdentity.extractor,'whip-docs-syntax@5');const prior=JSON.stringify([{schemaVersion:3,record:old}]);
 await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:prior});await page.reload();await page.getByRole('checkbox',{name:'Show all repository history'}).check();await page.getByText('stale',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();await page.locator('.symbol-list button').filter({has:page.getByText('Boxed',{exact:true})}).click();
 await page.getByLabel('Record type',{exact:true}).selectOption('proposal');await page.getByLabel('Proposal',{exact:true}).fill('Do not rebind old records.');assert(await page.getByRole('button',{name:'Append separate entry',exact:true}).isDisabled());assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),prior);
 pass('Real pre-repair @5 journal remains readable, stale and byte-preserved; UI rejects new derivatives against it');
 const bad='[{"schemaVersion":99}]';await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:bad});await page.reload();await page.getByText('Invalid syntax preview journal. It was left unchanged.',{exact:true}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),bad);
 assert.deepEqual(errors,[]);pass('Invalid storage still fails without rewriting bytes; no browser page errors');
 fs.writeFileSync(path.join(out,'namespace-browser-results.json'),JSON.stringify({backend:'Actual Chromium/WebGL UI; public Rust-exported fixture; no native IPC',extractor:'whip-docs-syntax@6',checks,errors},null,2)+'\n');
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'namespace-browser-results.json'),JSON.stringify({checks,errors,failure:String(error)},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
