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
await evaluate('Promise.race([Promise.all([...document.images].map(image=>image.complete?Promise.resolve():new Promise(resolve=>{image.addEventListener("load",resolve,{once:true});image.addEventListener("error",resolve,{once:true})}))),new Promise(resolve=>setTimeout(resolve,2000))])');
await sleep(200);
assert.equal(await evaluate('document.querySelectorAll(".card").length'),9);
assert.deepEqual(
  await evaluate('[...document.querySelectorAll(".text-card-title")].map(card => card.textContent)'),
  [
    'Type here to edit!',
    'Move me around!',
    'Set my color with the star!',
    'Expand cards over here ->',
    'Set card category',
    'Drag from Create to make a card',
    'Drag to Destroy to destroy me!',
    'You can also search for cards!',
    'How to destroy all cards',
  ],
);
assert.equal(await evaluate('[...document.images].every(i=>i.complete && i.naturalWidth>0)'),true);
assert.deepEqual(
  await evaluate('[...document.querySelectorAll(".footer-links a")].map(link=>({text:link.textContent,href:new URL(link.href).pathname}))'),
  [
    {text:'Privacy',href:'/privacy.html'},
    {text:'Terms',href:'/terms.html'},
  ],
);
assert.equal(await evaluate('["#import-board","#download-board"].every(selector=>document.querySelector(selector).textContent.trim()===""&&document.querySelector(selector).querySelector("img"))'),true);
assert.equal(await evaluate('(()=>{const imported=document.querySelector("#import-board").getBoundingClientRect();const downloaded=document.querySelector("#download-board").getBoundingClientRect();const saved=document.querySelector("#save").getBoundingClientRect();return imported.right<downloaded.left&&downloaded.right<saved.left&&imported.height===saved.height&&downloaded.height===saved.height})()'),true);
const screenshot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-desktop.png',Buffer.from(screenshot.data,'base64'));
const click=async selector=>{const p=await evaluate(`(async()=>{const el=document.querySelector(${JSON.stringify(selector)});let r=el.getBoundingClientRect();if(!el.closest("#color-palette")&&(r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth)){el.scrollIntoView({block:'center',inline:'center'});await new Promise(requestAnimationFrame);r=el.getBoundingClientRect()}return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(50);};
await call('Emulation.setDeviceMetricsOverride',{width:1400,height:700,deviceScaleFactor:1,mobile:false});await sleep(200);
const wrappedCards=await evaluate('(()=>[...document.querySelectorAll("[data-column=todo] .priority .card")].map(card=>{const rect=card.getBoundingClientRect();return {id:card.dataset.card,left:rect.left,right:rect.right,x:rect.x+rect.width/2,y:rect.y+rect.height/2}}))()');
assert.equal(Math.abs(wrappedCards[0].y-wrappedCards[1].y)<2,true);
assert.equal(wrappedCards[2].y>wrappedCards[1].y,true);
const wrappedTarget={x:(wrappedCards[0].right+wrappedCards[1].left)/2,y:wrappedCards[0].y};
await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,x:wrappedCards[2].x,y:wrappedCards[2].y});
for(let i=1;i<=12;i++)await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:wrappedCards[2].x+(wrappedTarget.x-wrappedCards[2].x)*i/12,y:wrappedCards[2].y+(wrappedTarget.y-wrappedCards[2].y)*i/12});
assert.equal(await evaluate('drag.target.before'),wrappedCards[1].id);
assert.equal(await evaluate('(()=>{const marker=document.querySelector(".drop-marker").getBoundingClientRect();return marker.height>marker.width})()'),true);
assert.equal(await evaluate('Number(getComputedStyle(document.querySelector(".drop-marker")).zIndex)>Number(getComputedStyle(document.querySelector(".drag-ghost")).zIndex)'),true);
const wrappedDropShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-wrapped-drop.png',Buffer.from(wrappedDropShot.data,'base64'));
await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...wrappedTarget});await sleep(100);
assert.equal(await evaluate('board.columns[0].cards.filter(card=>card.priority)[1].id'),wrappedCards[2].id);
await call('Emulation.setDeviceMetricsOverride',{width:765,height:541,deviceScaleFactor:1,mobile:false});await sleep(200);
await evaluate(`window.realObjectUrl=URL.createObjectURL;window.realAnchorClick=HTMLAnchorElement.prototype.click;window.downloadProbe={};URL.createObjectURL=blob=>{downloadProbe.blob=blob;return "blob:jiayou-test"};HTMLAnchorElement.prototype.click=function(){downloadProbe.name=this.download}`);
await click('#download-board');
const downloadedBoard=JSON.parse(await evaluate('(async()=>JSON.stringify({name:downloadProbe.name,type:downloadProbe.blob.type,board:JSON.parse(await downloadProbe.blob.text())}))()'));
assert.match(downloadedBoard.name,/^jiayou-board-\d{4}-\d{2}-\d{2}\.json$/);
assert.equal(downloadedBoard.type,'application/json');
assert.equal(downloadedBoard.board.columns.reduce((total,column)=>total+column.cards.length,0),9);
await evaluate('URL.createObjectURL=window.realObjectUrl;HTMLAnchorElement.prototype.click=window.realAnchorClick');
await evaluate(`window.realConfirm=window.confirm;window.confirm=()=>true;(()=>{const imported=JSON.parse(JSON.stringify(board));imported.columns[0].cards[0].description="Imported marker";const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(imported)],"board.json",{type:"application/json"}));Object.defineProperty(document.querySelector("#board-file-input"),"files",{value:transfer.files,configurable:true});document.querySelector("#board-file-input").dispatchEvent(new Event("change"))})()`);await sleep(100);
assert.equal(await evaluate('board.columns[0].cards[0].description'),'Imported marker');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards[0].description'),'Imported marker');
await evaluate('window.confirm=window.realConfirm');
await click('#create');assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
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
const drag=async(from,to)=>{const a=await evaluate(`(()=>{let r=document.querySelector(${JSON.stringify(from)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+5}})()`);const b=await evaluate(`(()=>{let r=document.querySelector(${JSON.stringify(to)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...a});for(let i=1;i<=12;i++){await call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12});}const rotation=await evaluate('parseFloat(document.querySelector(".drag-ghost").style.getPropertyValue("--drag-rotation"))');await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...b});await sleep(100);return rotation;};
const firstPriority=await evaluate('document.querySelector("[data-column=todo] .priority .card").dataset.card');
await drag('[data-column="todo"] .priority .card:first-child','[data-column="todo"] .priority .card:last-child');
assert.equal(await evaluate('document.querySelector("[data-column=todo] .priority .card:last-child").dataset.card'),firstPriority);
await click('[data-column="todo"] .priority-toggle');await sleep(350);
assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-column=todo] .priority")).backgroundColor'),'rgb(255, 255, 255)');
await click('[data-column="todo"] .priority-toggle');await sleep(350);
assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-column=todo] .priority")).backgroundColor'),'rgb(87, 87, 87)');
await drag('#create','.masthead');assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
const createRotation=await drag('#create','[data-column="done"] .regular');assert.ok(Math.abs(createRotation)>0.5);assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[2].cards.length'),2);
await drag('[data-column="done"] .regular .card:last-child','[data-column="progress"] .regular');assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[2].cards.length'),1);
await drag('[data-column="progress"] .regular .card:last-child','#destroy');assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
await call('Page.reload');await sleep(500);assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
await click('#search');await call('Input.insertText',{text:'no-such-task'});await click('#create');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),11);
assert.equal(await evaluate('document.querySelector("#search").value'),'');
await evaluate('window.testClientId=window.JIAYOU_CONFIG.googleClientId;window.JIAYOU_CONFIG.googleClientId=""');await click('#save');assert.equal(await evaluate('document.querySelector("#setup").open'),true);
assert.equal(await evaluate('document.querySelector("#setup").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
await click('#setup [data-close-dialog]');assert.equal(await evaluate('document.querySelector("#setup").open&&document.querySelector("#setup").classList.contains("closing")'),true);await sleep(100);
await evaluate('window.JIAYOU_CONFIG.googleClientId=window.testClientId');
// Exercise Drive's native REST integration without a real account or credentials.
await evaluate(`window.driveCalls=[];window.realFetch=window.fetch;drive.token='test-token';drive.expires=Date.now()+60000;window.fetch=async(url,options={})=>{driveCalls.push({url,options});return new Response(JSON.stringify(url.includes('spaces=')?{files:[]}:url.includes('uploadType=multipart')?{id:'test-file'}:{}),{status:200,headers:{'Content-Type':'application/json'}})};connectDrive()`);
assert.equal(await evaluate('document.querySelector("#save").textContent'),'Autosaved');
assert.equal(await evaluate('document.querySelector("#drive-connection-status").hidden'),false);
assert.equal(await evaluate('document.querySelector("#drive-connection-status").textContent.trim()'),'CONNECTED TO DRIVE');
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
assert.equal(await evaluate('document.querySelector("#drive-disconnected-dialog").open'),true);
assert.equal(await evaluate('document.querySelector("#drive-disconnected-dialog").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
const disconnectedShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-drive-disconnected.png',Buffer.from(disconnectedShot.data,'base64'));
await click('#drive-disconnected-dialog [data-close-dialog]');await sleep(100);
// Exercise multiple named Drive boards with a stateful in-browser REST mock.
await evaluate(`(()=>{
  clearAuth();
  const makeBoard=(label,updatedAt)=>{const value=initialBoard();value.updatedAt=updatedAt;value.columns[0].cards[0].title=label;return value};
  window.driveStore=new Map([
    ['board-a',{id:'board-a',name:'Alpha.jiayou.json',modifiedTime:'2025-01-01T00:00:00.000Z',appProperties:{jiayouType:'board',jiayouSchema:'1'},board:makeBoard('Drive Alpha',400)}],
    ['board-z',{id:'board-z',name:'Zenith.jiayou.json',modifiedTime:'2026-01-01T00:00:00.000Z',appProperties:{jiayouType:'board',jiayouSchema:'1'},board:makeBoard('Drive Zenith',300)}],
  ]);
  window.driveDeleted=[];
  window.failNextBoardSave=false;
  window.driveDelay=0;
  window.fetch=async(url,options={})=>{
    if(driveDelay)await new Promise(resolve=>setTimeout(resolve,driveDelay));
    const parsed=new URL(url);const method=options.method||'GET';
    if(parsed.pathname==='/drive/v3/files'&&method==='GET'){
      const all=[...driveStore.values()];const second=parsed.searchParams.get('pageToken')==='second';
      const files=(second?all.slice(1):all.slice(0,1)).map(({board,...file})=>file);
      return new Response(JSON.stringify({files,...(!second&&all.length>1?{nextPageToken:'second'}:{})}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(parsed.pathname==='/upload/drive/v3/files'&&method==='POST'){
      const boundary=options.headers['Content-Type'].split('boundary=')[1];
      const parts=options.body.split('--'+boundary).filter(part=>part.includes('\\r\\n\\r\\n')).map(part=>part.slice(part.indexOf('\\r\\n\\r\\n')+4).trim());
      const metadata=JSON.parse(parts[0]);const value=JSON.parse(parts[1]);const id='board-'+(driveStore.size+1);
      const file={id,...metadata,modifiedTime:new Date().toISOString(),board:value};driveStore.set(id,file);
      const {board,...response}=file;return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
    }
    const id=decodeURIComponent(parsed.pathname.split('/').at(-1));const file=driveStore.get(id);
    if(parsed.pathname.startsWith('/upload/drive/v3/files/')&&method==='PATCH'){
      if(failNextBoardSave){failNextBoardSave=false;return new Response('{}',{status:503,headers:{'Content-Type':'application/json'}})}
      file.board=JSON.parse(options.body);file.modifiedTime=new Date().toISOString();
      return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(parsed.pathname.startsWith('/drive/v3/files/')&&parsed.searchParams.get('alt')==='media')
      return new Response(JSON.stringify(file.board),{status:200,headers:{'Content-Type':'application/json'}});
    if(parsed.pathname.startsWith('/drive/v3/files/')&&method==='PATCH'){
      Object.assign(file,JSON.parse(options.body),{modifiedTime:new Date().toISOString()});
      const {board,...response}=file;return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(parsed.pathname.startsWith('/drive/v3/files/')&&method==='DELETE'){
      driveDeleted.push(id);driveStore.delete(id);return new Response(null,{status:204});
    }
    return new Response('{}',{status:404,headers:{'Content-Type':'application/json'}});
  };
  board=makeBoard('Newer local Alpha',500);persist(false);
  cachedDriveContext={fileId:'board-a',name:'Alpha'};localStorage.setItem(DRIVE_CONTEXT_KEY,JSON.stringify(cachedDriveContext));
  drive.token='test-token';drive.expires=Date.now()+60000;connectDrive();
})()`);await sleep(100);
assert.equal(await evaluate('document.querySelector("#conflict-dialog").open'),true);
assert.equal(await evaluate('document.querySelector("#conflict-dialog").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
await click('#use-drive-board');await sleep(100);
assert.equal(await evaluate('board.columns[0].cards[0].title'),'Drive Alpha');
assert.equal(await evaluate('document.querySelectorAll("#board-select option").length'),2);
assert.equal(await evaluate('document.querySelector("#board-select").value'),'board-a');
assert.equal(await evaluate('JSON.parse(localStorage.getItem(DRIVE_CONTEXT_KEY)).fileId'),'board-a');
// Reconnect and choose the newer local fallback to verify the upload branch.
await evaluate(`(()=>{const local=JSON.parse(JSON.stringify(board));local.updatedAt=900;local.columns[0].cards[0].title='Keep local Alpha';board=local;persist(false);clearAuth();drive.token='test-token';drive.expires=Date.now()+60000;connectDrive()})()`);await sleep(100);
assert.equal(await evaluate('document.querySelector("#conflict-dialog").open'),true);
await click('#use-local-board');await sleep(100);
assert.equal(await evaluate('driveStore.get("board-a").board.columns[0].cards[0].title'),'Keep local Alpha');
// Create validates names and starts with the tutorial board.
await click('#new-board');
assert.equal(await evaluate('document.querySelector("#board-name-dialog").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
await evaluate('document.querySelector("#board-name-input").value="Alpha"');
await click('#board-name-submit');
assert.equal(await evaluate('document.querySelector("#board-name-error").textContent.includes("already exists")'),true);
await evaluate('document.querySelector("#board-name-dialog").close()');
await click('#new-board');await evaluate('document.querySelector("#board-name-input").value="Project"');await click('#board-name-submit');await sleep(100);
assert.equal(await evaluate('drive.fileName'),'Project');
assert.equal(await evaluate('board.columns.reduce((sum,column)=>sum+column.cards.length,0)'),9);
// Rename and duplicate through the management UI.
await click('#manage-board');
assert.equal(await evaluate('document.querySelector("#manage-dialog").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
await click('#rename-board');
assert.equal(await evaluate('document.querySelector("#manage-dialog").open&&document.querySelector("#manage-dialog").classList.contains("closing")'),true);
await sleep(120);await evaluate('document.querySelector("#board-name-input").value="Roadmap"');await click('#board-name-submit');await sleep(100);
assert.equal(await evaluate('drive.fileName'),'Roadmap');
await click('#manage-board');await click('#duplicate-board');await sleep(120);await click('#board-name-submit');await sleep(100);
assert.equal(await evaluate('drive.fileName'),'Roadmap copy');
assert.equal(await evaluate(`(()=>{const source=[...driveStore.values()].find(file=>file.name==='Roadmap.jiayou.json').board;const copy=[...driveStore.values()].find(file=>file.name==='Roadmap copy.jiayou.json').board;return source.columns[0].cards[0].id!==copy.columns[0].cards[0].id})()`),true);
// Deleting is permanent and chooses the next board alphabetically.
const duplicateId=await evaluate('drive.fileId');
await click('#manage-board');await click('#delete-board');await sleep(120);
assert.equal(await evaluate('document.querySelector("#delete-board-dialog").getAnimations().some(animation=>animation.animationName==="dialog-in")'),true);
await click('#delete-board-form button[type="submit"]');await sleep(100);
assert.equal(await evaluate(`driveDeleted.includes(${JSON.stringify(duplicateId)})`),true);
assert.equal(await evaluate('drive.fileName'),'Zenith');
// A switch flushes edits to the old file before loading the target.
await evaluate('driveDelay=120;board.columns[0].cards[0].title="Saved to Zenith";persist();document.querySelector("#board-select").value="board-a";document.querySelector("#board-select").dispatchEvent(new Event("change"))');
assert.equal(await evaluate('document.querySelector("#board-loading").hidden'),false);
assert.equal(await evaluate('document.querySelector("#board-loading-text").textContent'),'Loading Alpha…');
const loadingShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-loading.png',Buffer.from(loadingShot.data,'base64'));
await evaluate('driveDelay=0');await sleep(250);
assert.equal(await evaluate('driveStore.get("board-z").board.columns[0].cards[0].title'),'Saved to Zenith');
assert.equal(await evaluate('drive.fileName'),'Alpha');
// A failed outgoing save blocks the requested switch and retains its local fallback.
await evaluate('board.columns[0].cards[0].title="Unsaved Alpha";persist();failNextBoardSave=true;document.querySelector("#board-select").value="board-z";document.querySelector("#board-select").dispatchEvent(new Event("change"))');await sleep(150);
assert.equal(await evaluate('drive.fileName'),'Alpha');
assert.equal(await evaluate('board.columns[0].cards[0].title'),'Unsaved Alpha');
assert.equal(await evaluate('document.querySelector("#board-select").value'),'board-a');
await evaluate('flushDrive()');await sleep(50);
// Management remains usable without creating page-level mobile overflow.
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(100);
assert.equal(await evaluate('document.querySelector("#board-manager").hidden'),false);
assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
const driveMobile=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-drive-mobile.png',Buffer.from(driveMobile.data,'base64'));
await call('Emulation.setDeviceMetricsOverride',{width:765,height:541,deviceScaleFactor:1,mobile:false});await sleep(100);
// The sole-board guard is reflected in the management controls.
await evaluate('window.allDriveBoards=drive.boards;drive.boards=[activeDriveBoard()];renderDriveBoards()');
await click('#manage-board');
assert.equal(await evaluate('document.querySelector("#delete-board").disabled'),true);
await evaluate('document.querySelector("#manage-dialog").close();drive.boards=window.allDriveBoards;renderDriveBoards()');
// The original single Drive file is recognized, selected by ID, and migrated.
await evaluate(`(()=>{const legacy=JSON.parse(JSON.stringify(board));legacy.updatedAt=board.updatedAt+1000;legacy.columns[0].cards[0].title='Legacy board';driveStore.set('legacy',{id:'legacy',name:LEGACY_DRIVE_FILE,modifiedTime:new Date().toISOString(),appProperties:{},board:legacy});clearAuth();cachedDriveContext={fileId:'legacy',name:'My Board'};localStorage.setItem(DRIVE_CONTEXT_KEY,JSON.stringify(cachedDriveContext));drive.token='test-token';drive.expires=Date.now()+60000;return connectDrive()})()`);
assert.equal(await evaluate('drive.fileId'),'legacy');
assert.equal(await evaluate('driveStore.get("legacy").name'),'My Board.jiayou.json');
assert.equal(await evaluate('board.columns[0].cards[0].title'),'Legacy board');
assert.equal(await evaluate('new URL(oauthUrl(true,"state")).searchParams.get("prompt")'),'none');
assert.equal(await evaluate('localStorage.getItem(OAUTH_TOKEN_KEY)'),null);
await click('#manage-board');await click('#disconnect-drive');await sleep(180);
assert.equal(await evaluate('localStorage.getItem(DRIVE_REMEMBERED_KEY)'),null);
assert.equal(await evaluate('localStorage.getItem(DRIVE_CONTEXT_KEY)'),null);
assert.equal(await evaluate('document.querySelector("#board-manager").hidden'),true);
assert.equal(await evaluate('document.querySelector("#drive-disconnected-dialog").open'),false);
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
assert.equal(await evaluate('document.querySelectorAll("select").length'),1);
await sleep(150);
const paletteShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-card-palette.png',Buffer.from(paletteShot.data,'base64'));
await click('.palette-option[data-color="blue"]');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).color'),'blue');
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns[0].cards.at(-1).priority'),false);
assert.equal(await evaluate('document.querySelector("#color-palette").hidden'),true);
await call('Page.reload');await sleep(400);
assert.equal(await evaluate('document.querySelector("[data-column=todo] .regular .star img").getAttribute("src")'),'./assets/component-imgStar4.svg');
await click('#search-color');await click('.palette-option[data-color="blue"]');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),2);
await click('#search');await call('Input.insertText',{text:'no match'});
assert.equal(await evaluate('document.querySelectorAll(".card").length'),0);
await evaluate('document.querySelector("#search").value="step";document.querySelector("#search").dispatchEvent(new Event("input"))');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),2);
await click('#search-color');await sleep(150);
const searchShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-search-palette.png',Buffer.from(searchShot.data,'base64'));
await click('.all-colors');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),8);
assert.equal(await evaluate('document.querySelector("#search").value'),'step');
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
assert.equal(await evaluate('document.querySelectorAll(".card").length'),1);
await click('#create');
assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
assert.equal(await evaluate('document.querySelector("#search-color").classList.contains("active")'),false);
await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
await click('#search-color');
assert.equal(await evaluate('(()=>{const r=document.querySelector("#color-palette").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0})()'),true);
assert.equal(await evaluate('[...document.images].every(i=>i.complete && i.naturalWidth>0)'),true);
console.log(await evaluate('JSON.stringify({star:getComputedStyle(document.querySelector(".star img")).width,search:getComputedStyle(document.querySelector(".search img")).width,cat:getComputedStyle(document.querySelector(".cat")).width})'));
await click('.masthead');
const destroyPoint=await evaluate('(()=>{const r=document.querySelector("#destroy").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...destroyPoint});await sleep(1150);
assert.equal(await evaluate('document.querySelector("#destroy-status").textContent'),'Destroying board in 2…');
assert.equal(await evaluate('document.body.classList.contains("is-destroying-board")'),true);
assert.equal(await evaluate('getComputedStyle(document.querySelector(".card")).animationName'),'card-wiggle');
await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...destroyPoint});await sleep(100);
assert.equal(await evaluate('document.querySelectorAll(".card").length'),10);
assert.equal(await evaluate('document.querySelector("#destroy-status").textContent'),'DRAG TO...');
await call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...destroyPoint});await sleep(3100);
assert.equal(await evaluate('board.columns.reduce((total,column)=>total+column.cards.length,0)'),0);
assert.equal(await evaluate('document.body.classList.contains("is-clearing-board")'),true);
assert.equal(await evaluate('Number(getComputedStyle(document.querySelector(".card")).opacity)<1'),true);
const clearingShot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/jiayou-board-clearing.png',Buffer.from(clearingShot.data,'base64'));
await call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...destroyPoint});await sleep(400);
assert.equal(await evaluate('document.querySelectorAll(".card").length'),0);
assert.equal(await evaluate('JSON.parse(localStorage.getItem("jiayou.board.v1")).columns.every(column=>column.cards.length===0)'),true);
assert.equal(errors.length,0);
await call('Emulation.setDeviceMetricsOverride',{width:900,height:800,deviceScaleFactor:1,mobile:false});
await call('Page.navigate',{url:'http://localhost:8000/privacy.html'});await sleep(350);
assert.equal(await evaluate('document.querySelector("h1").textContent'),'Privacy Policy');
assert.equal(await evaluate('document.body.textContent.includes("drive.appdata")'),true);
assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
const privacyShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('/tmp/jiayou-privacy.png',Buffer.from(privacyShot.data,'base64'));
await call('Page.navigate',{url:'http://localhost:8000/terms.html'});await sleep(350);
assert.equal(await evaluate('document.querySelector("h1").textContent'),'Terms of Service');
assert.equal(await evaluate('document.querySelector("a[href="+JSON.stringify("./privacy.html")+"]")!==null'),true);
assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
const termsShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile('/tmp/jiayou-terms.png',Buffer.from(termsShot.data,'base64'));
assert.equal(errors.length,0);
console.log('PASS: star palette color changes and persistence, no priority side effects, combined text/color filtering, All colors, Escape/outside dismissal, keyboard selection, create reset, mobile positioning.');
console.log('PASS: assets, creation, inline edit, fuzzy search, priority, collapse, pointer drag physics/create/move/delete, hold-to-clear cancellation/countdown/wiggle/fade/persistence, reload persistence, Drive setup, mocked multi-board listing/conflicts/lifecycle/safe switching/autosave/failure/retry/expiry/disconnect, legal pages, mobile overflow, no runtime errors.');
ws.close();
