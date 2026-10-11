// Genuine browser captures of the public @5 fixture, with exact source hashes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const origin=process.env.GRAPH_TEST_ORIGIN||'http://127.0.0.1:1421';
const out=process.env.EVIDENCE_DIR||'/tmp/whip-inspector';fs.mkdirSync(out,{recursive:true});
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1680,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?preview=mixed');await page.locator('[data-node-id="file:api/handler.py"]').click();
 await page.locator('.navigator').evaluate(e=>{e.scrollTop=0;});await page.waitForTimeout(500);
 await page.screenshot({path:path.join(out,'compact-file-overview.png')});
 await page.getByRole('button',{name:'Expand api/handler.py',exact:true}).click();
 await page.locator('.symbol-list button').filter({has:page.getByText('Boxed',{exact:true})}).click();
 await page.getByRole('button',{name:'Frame symbols',exact:true}).click();
 await page.getByLabel('Intent',{exact:true}).fill('Keep each request’s responsibility explicit. Preserve this original wording.');
 await page.getByRole('button',{name:'Preserve original intent',exact:true}).click();await page.locator('.intent-record[data-kind="original"]').waitFor();
 await page.getByLabel('Record type',{exact:true}).selectOption('proposal');
 await page.getByLabel('Proposal',{exact:true}).fill('Consider a later change while retaining the original intent.');
 await page.getByRole('button',{name:'Append separate entry',exact:true}).click();await page.locator('.intent-record[data-kind="proposal"]').waitFor();
 await page.locator('.navigator').evaluate(e=>{e.scrollTop=0;});await page.locator('.inspector').evaluate(e=>{e.scrollTop=0;});await page.waitForTimeout(500);
 await page.screenshot({path:path.join(out,'compact-file-expanded.png')});
 await page.locator('.inspector').screenshot({path:path.join(out,'compact-inspector.png')});
 for(const width of [768,390,360]){
  await page.setViewportSize({width,height:1000});await page.locator('.inspector').evaluate(e=>{e.scrollTop=0;});await page.waitForTimeout(350);
  await page.screenshot({path:path.join(out,`compact-expanded-${width}.png`)});
 }
 if(errors.length)throw Error(errors.join('\n'));
 const files=['src/lib/intent/IntentWorkspace.svelte','src/styles.css','fixtures/mixed-workspace.snapshot.json'];
 const sourceSha256=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../..',file))).digest('hex')]));
 fs.writeFileSync(path.join(out,'capture-provenance.json'),JSON.stringify({capturedAt:new Date().toISOString(),backend:'Actual Chromium/WebGL UI; public Rust-exported fixture; no native Tauri IPC',extractor:'whip-docs-syntax@5',sourceSha256,images:['compact-file-overview.png','compact-file-expanded.png','compact-inspector.png','compact-expanded-768.png','compact-expanded-390.png','compact-expanded-360.png'],viewports:[{width:1680,height:1050},{width:768,height:1000},{width:390,height:1000},{width:360,height:1000}],errors},null,2)+'\n');
 console.log('Captured six actual UI images with source hashes; no browser page errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();});
