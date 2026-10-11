// Focused compact-inspector checks against the actual UI and public @6 fixture.
// Native Tauri IPC is not exercised. No browser sandbox override is requested.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const origin=process.env.GRAPH_TEST_ORIGIN||'http://127.0.0.1:1421';
const out=process.env.EVIDENCE_DIR||'/tmp/whip-inspector';fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],metrics=[],pass=text=>{checks.push(text);console.log('PASS',text)};
const key='whip-docs.intent-syntax-preview.v3';
const exact='  Keep each request’s responsibility explicit — 蟹.\n\tPreserve this original wording.  ';
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1680,height:1050}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?preview=mixed');await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();
 const selectBox=()=>page.locator('.symbol-list button').filter({has:page.getByText('Boxed',{exact:true})}).click();await selectBox();
 const inspector=page.getByRole('complementary',{name:'Selection inspector'});
 for(const removed of ['CAPTURE THE WHY','What should this symbol mean?','Append-only · 16 KiB limit','INSPECTOR'])assert(!(await inspector.innerText()).includes(removed),removed);
 assert.equal(await inspector.locator('.source-path').count(),0);
 assert.equal(await inspector.locator('.selection-header').count(),1);assert.equal(await inspector.locator('.symbol-title').innerText(),'Boxed');
 assert.equal(await inspector.locator('.selection-kind').innerText(),'class');
 const parent=page.getByRole('button',{name:'Back to parent file: api/handler.py',exact:true});assert.equal(await parent.getAttribute('title'),'api/handler.py');
 assert.match(await inspector.innerText(),/UTF-8 byte range/);assert.match(await inspector.innerText(),/Header \/ body/);assert.match(await inspector.innerText(),/Supported subset/);
 const beforeSave=await page.evaluate(()=>Object.fromEntries(['.inspector','.symbol-title','.intent-composer','#intent-text','.intent-composer .primary','.journal-heading'].map(selector=>[selector,document.querySelector(selector).getBoundingClientRect().toJSON()])));
 metrics.push({viewport:1680,emptyOriginal:beforeSave});
 assert(beforeSave['.symbol-title'].y-beforeSave['.inspector'].y<24);
 assert(beforeSave['.intent-composer .primary'].bottom-beforeSave['.inspector'].y<400);
 pass('One compact selection row retains symbol/kind and accessible parent path; requested copy is absent and precision/completeness/coverage remain visible');
 await parent.focus();await page.keyboard.press('Enter');assert.equal(await inspector.locator('.symbol-title').innerText(),'handler.py');
 assert.equal(await inspector.locator('.symbol-title').getAttribute('title'),'api/handler.py');assert.equal(await inspector.locator('#selection-path').textContent(),'api/handler.py');
 await selectBox();await page.getByLabel('Record type',{exact:true}).focus();await page.keyboard.press('Tab');assert(await page.getByLabel('Intent',{exact:true}).evaluate(e=>e===document.activeElement));
 await page.keyboard.insertText(exact);await page.keyboard.press('Tab');assert(await page.getByRole('button',{name:'Preserve original intent',exact:true}).evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Enter');await page.locator('.intent-record[data-kind="original"]').waitFor();
 const savedOriginal=await page.evaluate(key=>JSON.parse(localStorage.getItem(key))[0],key);
 assert.equal(savedOriginal.record.text,exact);
 await page.getByLabel('Record type',{exact:true}).selectOption('proposal');await page.getByLabel('Record type',{exact:true}).focus();await page.keyboard.press('Tab');assert(await page.getByLabel('Based on original intent',{exact:true}).evaluate(e=>e===document.activeElement));
 await page.keyboard.press('Tab');assert(await page.getByLabel('Proposal',{exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.insertText('Consider a later change while retaining the original intent.');
 await page.keyboard.press('Tab');assert(await page.getByRole('button',{name:'Append separate entry',exact:true}).evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');await page.locator('.intent-record[data-kind="proposal"]').waitFor();
 const rows=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);assert.equal(rows.length,2);assert.deepEqual(rows[0],savedOriginal);assert.equal(rows[1].record.parentId,rows[0].record.id);assert.equal(rows[1].record.snapshot.analysisIdentity.extractor,'whip-docs-syntax@6');
 assert.match(await inspector.innerText(),/Captured multilingual source set/);assert.match(await inspector.innerText(),/whip-docs-syntax@6/);assert.match(await inspector.innerText(),/current/);
 pass('Keyboard parent navigation and original/proposal tab order work; Enter appends verbatim originals and separate proposals with visible binding/provenance');
 for(const width of [1680,768,390,360]){
  await page.setViewportSize({width,height:width===1680?1050:1000});await inspector.evaluate(e=>{e.scrollTop=0;});
  await page.waitForTimeout(250);
  const geometry=await page.evaluate(()=>{const region=document.querySelector('.inspector'),header=region.querySelector('.selection-header'),title=region.querySelector('.symbol-title');return {viewport:innerWidth,document:document.documentElement.scrollWidth,inspector:region.getBoundingClientRect().toJSON(),header:header.getBoundingClientRect().toJSON(),title:title.getBoundingClientRect().toJSON(),scrollWidth:region.scrollWidth,clientWidth:region.clientWidth,fontSize:parseFloat(getComputedStyle(title).fontSize)};});
  assert(geometry.document<=geometry.viewport,JSON.stringify(geometry));assert(geometry.scrollWidth<=geometry.clientWidth,JSON.stringify(geometry));assert(geometry.fontSize>=15);
  for(const locator of [parent,page.getByLabel('Record type',{exact:true}),page.getByLabel('Based on original intent',{exact:true}),page.getByRole('button',{name:'Reload',exact:true}),page.getByRole('button',{name:'Append separate entry',exact:true})]){
   await locator.scrollIntoViewIfNeeded();assert(await locator.evaluate(e=>{const b=e.getBoundingClientRect();return b.height>=28&&b.width>=24&&e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}));
  }
  // The existing inspector scroll container must keep every control reachable.
  await page.getByLabel('Record type',{exact:true}).focus();await page.keyboard.press('Tab');assert(await page.getByLabel('Based on original intent',{exact:true}).evaluate(e=>e===document.activeElement));
  await page.keyboard.press('Tab');assert(await page.getByLabel('Proposal',{exact:true}).evaluate(e=>e===document.activeElement));
  await inspector.evaluate(e=>{e.scrollTop=0;});metrics.push({viewport:width,geometry});
 }
 pass('1680/768/390/360px layouts retain readable headers, no horizontal overflow, reachable 28px-plus controls and logical keyboard order');
 await page.setViewportSize({width:1680,height:1050});await page.getByRole('button',{name:'Expand native/callable-groups.odin',exact:true}).click();await page.locator('.symbol-list button').filter({has:page.getByText('(Parcel) .grow',{exact:true})}).click();
 assert.equal(await inspector.locator('.symbol-title').innerText(),'(Parcel) .grow');assert.equal(await inspector.locator('.selection-kind').innerText(),'function');
 await page.setViewportSize({width:768,height:1000});assert(await inspector.evaluate(e=>e.scrollWidth<=e.clientWidth));
 await page.locator('[data-node-id="file:broken/unsupported-callable.cpp"]').click();await page.locator('[data-diagnostic="unsupported_callable_declaration"]').waitFor();assert.match(await inspector.innerText(),/Incomplete/);
 pass('Qualified callable spelling wraps without overflow and meaningful unsupported-region diagnostics remain visible');
 await page.reload();await page.getByRole('checkbox',{name:'Show all repository history'}).check();await page.waitForFunction(()=>document.querySelectorAll('.intent-record').length===2);assert.equal(await page.locator('.intent-record[data-kind="original"] > p').textContent(),exact);
 const old=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../fixtures/mixed-workspace.previous-v5-journal.json'),'utf8')),oldBytes=JSON.stringify([{schemaVersion:3,record:old}]);
 await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:oldBytes});await page.reload();await page.getByRole('checkbox',{name:'Show all repository history'}).check();await page.getByText('stale',{exact:true}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),oldBytes);
 await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();await selectBox();await page.getByLabel('Record type',{exact:true}).selectOption('proposal');await page.getByLabel('Proposal',{exact:true}).fill('Cannot rebind a stale original.');assert(await page.getByRole('button',{name:'Append separate entry',exact:true}).isDisabled());
 const invalid='[{"schemaVersion":99}]';await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:invalid});await page.reload();await page.getByText('Invalid syntax preview journal. It was left unchanged.',{exact:true}).waitFor();assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),invalid);
 assert.deepEqual(errors,[]);pass('Reload retains original bytes; stale originals stay unchanged and cannot receive proposals; corrupt journal errors remain visible without rewriting storage');
 fs.writeFileSync(path.join(out,'inspector-browser-results.json'),JSON.stringify({backend:'Actual Chromium/WebGL UI; recorded public @6 fixture; no native IPC',checks,metrics,errors},null,2)+'\n');
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'inspector-browser-results.json'),JSON.stringify({checks,metrics,errors,failure:String(error)},null,2));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
