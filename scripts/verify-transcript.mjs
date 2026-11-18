// Public gateway + real-browser integration on an owned synthetic installation. No unit runner.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { startUsabilityFixture } from './desk-usability-fixture.mjs';
const fixture=await startUsabilityFixture();
const {json,request,ledger}=fixture;
let browser;
const until=async(read,check,label)=>{const end=Date.now()+5000;do{const value=await read();if(check(value))return value;await pause(20);}while(Date.now()<end);throw Error(label);};
try {
  const direct=(await json('/rooms',{method:'POST',body:{id:'history-direct',name:'History direct',members:['other'],kind:'direct',lead:'other'}})).room.id;
  const ids={};
  for(const room of ['main',direct]) {
    ids[room]=[];
    for(let i=0;i<650;i++) {
      ids[room].push(ledger.append(room,'user','message',{text:`Question ${i}`}));
      ids[room].push(ledger.append(room,room==='main'?'boss':'other','bot_output',{text:`Answer ${i}\n\n${'A variable-height reply. '.repeat(i%4+1)}`}));
    }
    const page=await json(`/rooms/${room}/transcript`);
    assert.equal(page.events.length,50);
    assert.equal(page.events.at(-1).id,ids[room].at(-1).id);
    assert.ok(page.before);
    let before=page.before,all=[...page.events];
    while(before!==null) {const older=await json(`/rooms/${room}/transcript?before=${before}`);all=[...older.events,...all];before=older.before;}
    const seeded=all.filter(e=>ids[room].some(seed=>seed.id===e.id));
    assert.deepEqual(seeded.map(e=>e.id),ids[room].map(e=>e.id),'All retained messages are reachable once in order');
    assert.equal(new Set(all.map(e=>e.id)).size,all.length);
    const oldApi=await json(`/rooms/${room}/events`);
    assert.equal(oldApi.events.length,500,'Ledger endpoint stays forward-paged');
    assert.ok(oldApi.events[0].id<page.events[0].id);
    const appended=[];
    for(let i=0;i<520;i++)appended.push(ledger.append(room,'boss','config',{action:'synthetic-sync',index:i}));
    const forward=await json(`/rooms/${room}/transcript?after=${page.after}`);
    assert.equal(forward.events.length,500);assert.equal(forward.hasMore,true);
    const rest=await json(`/rooms/${room}/transcript?after=${forward.after}`);
    assert.equal(rest.hasMore,false);
    assert.deepEqual([...forward.events,...rest.events].map(e=>e.id),appended.map(e=>e.id));
    // Make the browser's recent window contain readable messages again.
    for(let i=650;i<700;i++)ledger.append(room,'user','message',{text:`Browser message ${i}\n${'Readable content. '.repeat(i%4+1)}`});
  }
  for(const query of ['before=0','after=-1','after=1.5','before=2&after=1','before=NaN','unknown=1'])assert.equal((await request('/rooms/main/transcript?'+query)).status,400,query);
  assert.equal((await request('/rooms/missing/transcript')).status,404);
  assert.equal((await fetch(fixture.url+'/rooms/main/transcript')).status,401);
  let release;
  fixture.controls.turnBarrier=new Promise(resolve=>{release=resolve;});
  await json('/rooms/main/messages',{method:'POST',body:{text:'Controlled active turn'}});
  await until(()=>json('/rooms/main/transcript'),p=>p.state.runningTurns.length>0,'Active turn starts');
  for(let i=0;i<510;i++)ledger.append('main','boss','config',{action:'busy-history',index:i});
  const active=await json('/rooms/main/transcript');
  assert.equal(active.events.length,500);assert.ok(active.before);
  assert.ok(active.events.every(e=>e.type!=='turn_started'));
  assert.ok(active.state.runningTurns.some(t=>t.botId==='boss'),'Active state survives a history window without its start event');
  release();
  await until(()=>json('/rooms/main/transcript'),p=>!p.state.runningTurns.length,'Turn completes');
  for(let i=700;i<750;i++)ledger.append('main','user','message',{text:`Browser message ${i}\n${'Readable content. '.repeat(i%4+1)}`});
  console.log('PASS HTTP: direct and room history paging, 500-event cap, full reachability, gap-safe forward pages, independent active state, validation and legacy endpoint.');
  if(process.argv.includes('--browser')) {
    const require=createRequire(import.meta.url);
    const {chromium}=require(process.env.OPENAG_PLAYWRIGHT_MODULE||'playwright');
    browser=await chromium.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addInitScript(token=>{
      localStorage.setItem('openag-token',token);
      const Native=window.WebSocket;window.__fixtureSockets=[];
      window.WebSocket=class extends Native{constructor(...args){super(...args);window.__fixtureSockets.push(this);}};
    },fixture.full.token);
    const page=await context.newPage();
    page.setDefaultTimeout(7000);
    let failNextSync=false,notifyFailure;
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const requests=[];page.on('request',r=>{if(r.url().includes('/transcript'))requests.push(r.url());});
    await page.route('**/transcript*',async route=>{
      if(failNextSync&&new URL(route.request().url()).searchParams.has('after')){
        failNextSync=false;notifyFailure();await pause(3000);await route.abort('failed');return;
      }
      await pause(120);await route.continue();
    });
    const viewport=page.locator('[data-slot="message-scroller-viewport"]');
    const anchor=()=>viewport.evaluate(el=>{const top=el.getBoundingClientRect().top;const row=[...el.querySelectorAll('[data-message-id]')].find(row=>row.getBoundingClientRect().bottom>top+2&&row.dataset.messageId.startsWith('event-'));return row?{id:row.dataset.messageId,offset:row.getBoundingClientRect().top-top}:null;});
    const offset=id=>viewport.evaluate((el,id)=>{const row=[...el.querySelectorAll('[data-message-id]')].find(row=>row.dataset.messageId===id);return row?row.getBoundingClientRect().top-el.getBoundingClientRect().top:null;},id);
    const waitLatest=()=>page.waitForFunction(()=>{const el=document.querySelector('[data-slot="message-scroller-viewport"]');return el&&getComputedStyle(el).visibility==='visible'&&el.scrollHeight-el.scrollTop-el.clientHeight<10;});
    const samples=[];
    const screenshots=process.argv.includes('--screenshots');
    if(screenshots)mkdirSync(resolve('docs/notes/evidence/oa488'),{recursive:true});
    for(const room of ['main',direct]) {
      const start=Date.now();
      await page.goto(fixture.url+'/#/room/'+room);
      await waitLatest();
      assert.equal(new URL(requests[requests.findIndex(url=>url.includes('/rooms/'+room+'/transcript'))]).search,'','Cold open requests newest window');
      assert.ok(await viewport.locator('[data-message-id^="event-"]').count()<=50);
      const coldMs=Date.now()-start;
      await viewport.hover();await page.mouse.wheel(0,-500);await pause(250);
      const reading=await anchor();assert.ok(reading);
      const count=requests.length;
      await page.evaluate(()=>{location.hash='#/settings/devices';});
      await page.getByRole('heading',{name:'Devices',exact:true}).waitFor();
      await page.evaluate(room=>{location.hash='#/room/'+room;},room);
      await page.waitForFunction(()=>{const el=document.querySelector('[data-slot="message-scroller-viewport"]');return el&&getComputedStyle(el).visibility==='visible';});
      await pause(300);
      const restored=await offset(reading.id);
      assert.ok(Math.abs(restored-reading.offset)<=2,`Revisit anchor moved ${restored-reading.offset}px`);
      assert.ok(requests.slice(count).every(url=>url.includes('?after=')),'Revisit fetches only newer events');
      ledger.append(room,'boss','bot_output',{text:'New output while reading earlier'});
      await viewport.getByText('New output while reading earlier',{exact:true}).waitFor();await pause(150);
      assert.ok(Math.abs(await offset(reading.id)-reading.offset)<=2,'Live output does not move reader');
      await viewport.evaluate((el,id)=>{
        const row=[...el.querySelectorAll('[data-message-id]')].find(row=>row.dataset.messageId===id);
        const previous=row?.previousElementSibling;
        if(previous){previous.dataset.originalMinHeight=previous.style.minHeight;previous.style.minHeight=(previous.getBoundingClientRect().height+150)+'px';}
      },reading.id);
      await pause(150);
      assert.ok(Math.abs(await offset(reading.id)-reading.offset)<=2,'Delayed preceding content keeps reading position');
      await viewport.evaluate(el=>{for(const row of el.querySelectorAll('[data-original-min-height]')){row.style.minHeight=row.dataset.originalMinHeight;delete row.dataset.originalMinHeight;}});
      await pause(100);
      // Load older rows while preserving an existing visible anchor.
      await viewport.evaluate(el=>{el.scrollTop=0;});await pause(100);
      const first=await anchor();assert.ok(first);
      await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();
      await page.getByRole('button',{name:'Loading earlier messages…'}).waitFor({state:'hidden'});await pause(200);
      const prepended=await offset(first.id);assert.ok(Math.abs(prepended-first.offset)<=2,`Prepend keeps anchor: ${prepended-first.offset}px`);
      await page.getByRole('button',{name:'Jump to latest message',exact:true}).click();await waitLatest();
      ledger.append(room,'boss','bot_output',{text:'Following latest marker'});
      await viewport.getByText('Following latest marker',{exact:true}).waitFor();await waitLatest();
      if(screenshots)await page.screenshot({path:resolve(`docs/notes/evidence/oa488/${room==='main'?'room':'direct'}-desktop.png`)});
      await page.setViewportSize({width:390,height:844});await pause(150);await waitLatest();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No phone page overflow');
      if(screenshots)await page.screenshot({path:resolve(`docs/notes/evidence/oa488/${room==='main'?'room':'direct'}-phone.png`)});
      samples.push({room,coldMs,mountedRows:await viewport.locator('[data-message-id]').count(),restoredDisplacement:restored-reading.offset});
      await page.setViewportSize({width:1440,height:1000});
    }
    // A reconnect queued behind a failing older request must still drain its gap.
    await page.evaluate(()=>{location.hash='#/settings/devices';});
    await page.getByRole('heading',{name:'Devices',exact:true}).waitFor();
    const failureStarted=new Promise(resolve=>{notifyFailure=resolve;});failNextSync=true;
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await failureStarted;
    await page.evaluate(()=>window.__fixtureSockets.forEach(socket=>socket.close()));
    await page.waitForFunction(()=>window.__fixtureSockets.every(socket=>socket.readyState===WebSocket.CLOSED));
    ledger.append(direct,'other','bot_output',{text:'Queued reconnect recovery marker'});
    await viewport.getByText('Queued reconnect recovery marker',{exact:true}).waitFor();
    // Lost live delivery is reconciled from the fetched cursor after reconnect.
    const reconnectRequests=requests.length;
    await page.evaluate(()=>window.__fixtureSockets.forEach(socket=>socket.close()));
    for(let i=0;i<520;i++)ledger.append(direct,'other','config',{action:'offline-fixture',index:i});
    ledger.append(direct,'other','bot_output',{text:'Reconnect catch-up marker'});
    await viewport.getByText('Reconnect catch-up marker',{exact:true}).waitFor();
    assert.ok(requests.slice(reconnectRequests).some(url=>url.includes('?after=')));
    // A delayed old-room response must not leak into the new room.
    await page.evaluate(()=>{location.hash='#/room/main';});
    await page.getByRole('heading',{name:'#Main',exact:true}).waitFor();
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await viewport.getByText('Reconnect catch-up marker',{exact:true}).waitFor();
    assert.equal(await viewport.getByText('Browser message 749',{exact:false}).count(),0);
    // Replacing the authenticated session discards the transient cache.
    await page.goto(fixture.url+'/#/settings/devices');await page.reload();
    await page.getByRole('heading',{name:'Devices',exact:true}).waitFor();
    const freshRequests=requests.length;
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await waitLatest();
    assert.equal(new URL(requests[freshRequests]).search,'','A fresh document opens a new recent window');
    // A trailing activity run keeps its identity when a reply arrives after it.
    ledger.append(direct,'other','tool_result',{turnId:'stable-activity',toolCallId:'stable-call',tool:'synthetic',ok:true,result:{text:'Recorded synthetic output'}});
    const activity=viewport.locator('[data-message-id^="activity-"]').last();
    await activity.waitFor();
    const activityId=await activity.getAttribute('data-message-id');
    ledger.append(direct,'other','bot_output',{text:'Reply following activity'});
    await viewport.getByText('Reply following activity',{exact:true}).waitFor();
    assert.equal(await viewport.locator('[data-message-id="'+activityId+'"]').count(),1,'A reply must not replace the trailing activity anchor');
    // Paging through other conversations evicts the least recently visited window.
    for(let i=0;i<6;i++) {
      const id='cache-'+i;
      await json('/rooms',{method:'POST',body:{id,name:id,members:['boss'],lead:'boss'}});
      ledger.append(id,'user','message',{text:'Cache fixture '+i});
      await page.evaluate(id=>{location.hash='#/room/'+id;},id);
      await viewport.getByText('Cache fixture '+i,{exact:true}).waitFor();
    }
    const evictedRequests=requests.length;
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await waitLatest();
    assert.equal(new URL(requests.slice(evictedRequests).find(url=>url.includes('/rooms/'+direct+'/transcript'))).search,'','LRU eviction opens a bounded recent window');
    // Oversized windows remain readable but are not retained in the revisit cache.
    await json('/rooms',{method:'POST',body:{id:'cache-large',name:'Large cache fixture',members:['boss'],lead:'boss'}});
    for(let i=0;i<22;i++)ledger.append('cache-large','boss','config',{action:'large-cache-fixture',text:'x'.repeat(250000)});
    ledger.append('cache-large','user','message',{text:'Oversized cache marker'});
    await page.evaluate(()=>{location.hash='#/room/cache-large';});
    await viewport.getByText('Oversized cache marker',{exact:true}).waitFor();
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await viewport.getByText('Reply following activity',{exact:true}).waitFor();
    const largeRequests=requests.length;
    await page.evaluate(()=>{location.hash='#/room/cache-large';});
    await viewport.getByText('Oversized cache marker',{exact:true}).waitFor();
    assert.equal(new URL(requests.slice(largeRequests).find(url=>url.includes('/rooms/cache-large/transcript'))).search,'','Oversized history is not cached');
    // Sign-out revokes this synthetic device and removes the rendered session.
    await page.evaluate(()=>{location.hash='#/settings/devices';});
    await page.getByRole('button',{name:'Sign out',exact:true}).click();
    await page.getByRole('textbox',{name:'Pairing code',exact:true}).waitFor();
    assert.equal(await viewport.count(),0);
    await page.getByRole('textbox',{name:'Pairing code',exact:true}).fill(fixture.pairCode().replaceAll('-',''));
    await page.getByRole('button',{name:'Connect device',exact:true}).click();
    await page.getByRole('textbox',{name:'Pairing code',exact:true}).waitFor({state:'hidden'});
    const replacementRequests=requests.length;
    await page.evaluate(room=>{location.hash='#/room/'+room;},direct);
    await waitLatest();
    assert.equal(new URL(requests.slice(replacementRequests).find(url=>url.includes('/rooms/'+direct+'/transcript'))).search,'','Replacement session cannot restore old cache');
    assert.deepEqual(errors,[]);
    console.log('PASS real Chromium: recent-first opening, cached revisit, reader hold, delayed content, prepend/activity anchoring, follow-latest, reconnect, rapid switching, LRU eviction, refresh, sign-out and replacement session, desktop and phone. '+JSON.stringify(samples));
    await context.close();
  }
} finally {await browser?.close();await fixture.close();}
