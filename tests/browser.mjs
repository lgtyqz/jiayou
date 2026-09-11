import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const ws = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve, {once:true}));
let counter=0; const callbacks=new Map(); const errors=[];
ws.addEventListener('message', event => {const m=JSON.parse(event.data); if(m.id){const cb=callbacks.get(m.id); callbacks.delete(m.id); m.error?cb.reject(m.error):cb.resolve(m.result);} if(m.method==='Runtime.exceptionThrown') errors.push(m.params);});
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++counter; callbacks.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
await call('Runtime.enable');await call('Page.enable');
await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
await call('Emulation.setDeviceMetricsOverride',{width:765,height:541,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'http://localhost:8000/'});await sleep(800);
await evaluate('localStorage.clear(); location.reload()');await sleep(500);
await evaluate('document.fonts.ready');
await sleep(200);
assert.equal(await evaluate('document.querySelectorAll(".card").length'),7);
assert.deepEqual(
  await evaluate('[...document.querySelectorAll(".text-card-title")].map(card => card.textContent)'),
  [
    'Move cards',
    'Set card color',
    'Expand cards',
    'Set card category',
    'Create cards',
    'Destroy cards',
    'Search for cards',
  ],
);
assert.equal(await evaluate('[...document.images].every(i=>i.complete && i.naturalWidth>0)'),true);
const screenshot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-desktop.png',Buffer.from(screenshot.data,'base64'));
const click=async selector=>{const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(50);};
await click('#create');assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
await call('Input.insertText',{text:'Ship a lovely board'});
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).title'),'Ship a lovely board');
await click('#search');await call('Input.insertText',{text:'shp lvly'});assert.equal(await evaluate('document.querySelectorAll(".card").length'),1);
await evaluate('document.querySelector("#search").value="";document.querySelector("#search").dispatchEvent(new Event("input"))');
await evaluate('document.querySelector("[data-column=todo] .regular .card:last-child").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).priority'),true);
await click('[data-column="progress"] .column-toggle');await sleep(350);
assert.equal(await evaluate('Math.round(document.querySelector("[data-column=progress]").getBoundingClientRect().width)'),56);
const collapsed=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-collapsed.png',Buffer.from(collapsed.data,'base64'));
await click('[data-column="progress"] .column-toggle');await sleep(350);
const drag=async(from,to)=>{const a=await evaluate(`(()=>{let r=document.querySelector(${JSON.stringify(from)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+5}})()`);const b=await evaluate(`(()=>{let r=document.querySelector(${JSON.stringify(to)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...a});for(let i=1;i<=12;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12});}await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b});await sleep(100);};
const firstPriority=await evaluate('document.querySelector("[data-column=todo] .priority .card").dataset.card');
await drag('[data-column="todo"] .priority .card:first-child','[data-column="todo"] .priority .card:last-child');
assert.equal(await evaluate('document.querySelector("[data-column=todo] .priority .card:last-child").dataset.card'),firstPriority);
await click('[data-column="todo"] .priority-toggle');await sleep(350);
assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-column=todo] .priority")).backgroundColor'),'rgb(255, 255, 255)');
await click('[data-column="todo"] .priority-toggle');await sleep(350);
assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-column=todo] .priority")).backgroundColor'),'rgb(87, 87, 87)');
await drag('#create','.masthead');assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
await drag('#create','[data-column="done"] .regular');assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[2].cards.length'),1);
await drag('[data-column="done"] .card','[data-column="progress"] .regular');assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[2].cards.length'),0);
await drag('[data-column="progress"] .regular .card:last-child','#destroy');assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
await call('Page.reload');await sleep(500);assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
await click('#search');await call('Input.insertText',{text:'no-such-task'});await click('#create');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),9);
assert.equal(await evaluate('document.querySelector("#search").value'),'');
await click('#save');assert.equal(await evaluate('document.querySelector("#setup").open'),true);await evaluate('document.querySelector("#setup").close()');
// Exercise Drive's native REST integration without a real account or credentials.
await evaluate(`window.driveCalls=[];window.realFetch=window.fetch;drive.token='test-token';drive.expires=Date.now()+60000;window.fetch=async(url,options={})=>{driveCalls.push({url,options});return new Response(JSON.stringify(url.includes('spaces=')?{files:[]}:url.includes('uploadType=multipart')?{id:'test-file'}:{}),{status:200,headers:{'Content-Type':'application/json'}})};connectDrive()`);
assert.equal(await evaluate('document.querySelector("#save").textContent'),'Autosaved');
assert.equal(await evaluate('driveCalls.filter(c=>c.options.method==="POST").length'),1);
await evaluate('board.columns[0].cards[0].title="Autosave test";persist()');await sleep(800);
assert.equal(await evaluate('driveCalls.filter(c=>c.options.method==="PATCH").length'),1);
await evaluate('window.fetch=async()=>new Response("{}",{status:503});board.columns[0].cards[0].title="Offline edit";persist()');await sleep(800);
assert.equal(await evaluate('document.querySelector("#save").textContent'),'Retry Drive save');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards[0].title'),'Offline edit');
await evaluate('window.fetch=async()=>new Response("{}",{status:200});drive.pending=true;flushDrive()');
assert.equal(await evaluate('document.querySelector("#save").textContent'),'Autosaved');
await evaluate('drive.expires=0;drive.pending=true;flushDrive()');
assert.equal(await evaluate('document.querySelector("#save").textContent'),'Save to Drive');
await evaluate('window.fetch=window.realFetch');
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(300);
assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
const mobile=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-mobile.png',Buffer.from(mobile.data,'base64'));
assert.equal(errors.length,0);
// Shared star palettes: edit/persist color, combine filters, clear, and dismiss.
await call('Emulation.setDeviceMetricsOverride',{width:765,height:541,deviceScaleFactor:1,mobile:false});
await evaluate('clearAuth();localStorage.clear();location.reload()');await sleep(500);
await click('[data-column="todo"] .regular .star');
assert.equal(await evaluate('document.querySelector("#color-palette").hidden'),false);
assert.equal(await evaluate('document.querySelectorAll(".palette-option").length'),7);
assert.equal(await evaluate('document.querySelectorAll("select").length'),0);
await sleep(150);
const paletteShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-card-palette.png',Buffer.from(paletteShot.data,'base64'));
await click('.palette-option[data-color="blue"]');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).color'),'blue');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).priority'),false);
assert.equal(await evaluate('document.querySelector("#color-palette").hidden'),true);
await call('Page.reload');await sleep(400);
assert.equal(await evaluate('document.querySelector("[data-column=todo] .regular .star img").getAttribute("src")'),'./assets/component-imgStar4.svg');
await click('#search-color');await click('.palette-option[data-color="blue"]');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),1);
await click('#search');await call('Input.insertText',{text:'no match'});
assert.equal(await evaluate('document.querySelectorAll(".card").length'),0);
await evaluate('document.querySelector("#search").value="gde";document.querySelector("#search").dispatchEvent(new Event("input"))');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),1);
await click('#search-color');await sleep(150);
const searchShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-search-palette.png',Buffer.from(searchShot.data,'base64'));
await click('.all-colors');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),7);
assert.equal(await evaluate('document.querySelector("#search").value'),'gde');
await click('#search-color');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
assert.equal(await evaluate('document.querySelector("#color-palette").hidden'),true);
assert.equal(await evaluate('document.activeElement.id'),'search-color');
await click('#search-color');await click('.masthead');
assert.equal(await evaluate('document.querySelector("#color-palette").hidden'),true);
await click('#search-color');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
assert.equal(await evaluate('document.activeElement.dataset.color'),'soul');
await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
assert.equal(await evaluate('document.querySelectorAll(".card").length'),2);
await click('#create');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
assert.equal(await evaluate('document.querySelector("#search-color").classList.contains("active")'),false);
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
await click('#search-color');
assert.equal(await evaluate('(()=>{const r=document.querySelector("#color-palette").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()'),true);
assert.equal(await evaluate('[...document.images].every(i=>i.complete && i.naturalWidth>0)'),true);
assert.equal(errors.length,0);
console.log('PASS: star palette color changes and persistence, no priority side effects, combined text/color filtering, All colors, Escape/outside dismissal, keyboard selection, create reset, mobile positioning.');
console.log('PASS: assets, creation, inline edit, fuzzy search, priority, collapse, pointer drag create/move/delete, reload persistence, Drive setup, mocked Drive creation/autosave/failure/retry/expiry, mobile overflow, no runtime errors.');
console.log(await evaluate('JSON.stringify({star:getComputedStyle(document.querySelector(".star img")).width,search:getComputedStyle(document.querySelector(".search img")).width,cat:getComputedStyle(document.querySelector(".cat")).width})'));
ws.close();
