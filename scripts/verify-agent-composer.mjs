// Mounted production composer plus real disposable gateway/model transports; no unit runner.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {startFixture} from './bot-models-fixture.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(base+'apps/desk/package.json'),dir=mkdtempSync(join(tmpdir(),'openag-bot-models-')),token='controlled-agent-composer-owner';
const f=await startFixture(dir,token),{JSDOM}=require('jsdom'),dom=new JSDOM('<div id="root"></div>',{url:f.url+'/#/room/main',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLInputElement','HTMLTextAreaElement','Element','Node','DocumentFragment','MutationObserver','localStorage','sessionStorage'])globalThis[key]=dom.window[key];
for(const key of ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.matchMedia=dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
globalThis.WebSocket=dom.window.WebSocket=createRequire(base+'apps/daemon/package.json')('ws');
const {createServer}=await import(require.resolve('vite')),vite=await createServer({configFile:false,root:base+'apps/desk',resolve:{alias:{'@':base+'apps/desk/src'}},server:{middlewareMode:true,hmr:false},appType:'custom'});
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{fireEvent}=require('@testing-library/react'),root=createRoot(document.getElementById('root'));
const {StreamProvider}=await vite.ssrLoadModule('/src/stream.tsx');
const {Composer}=await vite.ssrLoadModule('/src/components/Composer.tsx'),{createApi}=await vite.ssrLoadModule('/src/api.ts');
const api=createApi(token,()=>{},(path,init)=>fetch(f.url+path,init));
const wait=async check=>{const end=Date.now()+8000;while(!check()){assert.ok(Date.now()<end,'Composer convergence');await act(async()=>new Promise(r=>setTimeout(r,20)));}};
try{
 await api.putBotHandle('coder','analyst');const {bots}=await api.getRoom('main');let sent=false;
 await act(async()=>root.render(React.createElement(StreamProvider,{token,onAuthFailure(){}},React.createElement(Composer,{api,roomId:'main',bots,defaultBotId:'boss',canManage:true,onSend:async text=>{await api.sendMessage('main',text);sent=true;}}))));
 await wait(()=>document.querySelector('textarea'));const area=document.querySelector('textarea');
 await act(async()=>fireEvent.change(area,{target:{value:'@analyst check selected evidence'}}));
 await wait(()=>document.querySelector('[aria-label="Model settings for coder"]'));
 assert.equal(document.querySelector('[aria-label="Model settings for boss"]'),null,'renamed recipient does not expose lead model controls');
 for(const text of ['@coder @boss mixed retired and current','@analyst @unknown mixed current and unknown']){
  await act(async()=>fireEvent.change(area,{target:{value:text}}));
  assert.equal(document.querySelector('[aria-label^="Model settings for "]'),null,'mixed unresolved mentions never expose controls for only one recipient');
 }
 await act(async()=>fireEvent.change(area,{target:{value:'@analyst check selected evidence'}}));
 await wait(()=>!document.querySelector('button[type="submit"]').disabled);await act(async()=>document.querySelector('button[type="submit"]').click());await wait(()=>sent);await f.runner.drain();
 assert.equal(f.stats.prompts.at(-1).bot,'coder','the gateway and model picker target the same permanent agent');
 await act(async()=>fireEvent.change(area,{target:{value:'@coder old alias'}}));
 assert.equal(document.querySelector('[aria-label="Model settings for boss"]'),null,'unresolved old aliases never select an unrelated lead model');
 console.log('PASS agent composer: current handle selects correct controls and actual gateway recipient; unresolved mentions never fall back to another model.');
}finally{await act(async()=>root.unmount());await vite.close();dom.window.close();await f.close();rmSync(dir,{recursive:true,force:true});}
