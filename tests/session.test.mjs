import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';
import { BrowserSession } from '../build/browser-session.js';
import { startClient, call, startFixtureServer } from './helpers.mjs';

async function session(t, launch) {
  const browsers = [];
  const s = new BrowserSession({headless:true, launch: async () => {
    const b = await (launch?.() ?? puppeteer.launch({headless:true})); browsers.push(b); return b;
  }});
  t.after(async () => { await s.shutdown(); await Promise.all(browsers.map(b => b.close().catch(()=>{}))); });
  return {s,browsers};
}
test('one_launch_for_concurrent_calls', async t => {
  const {s,browsers} = await session(t);
  const order = [];
  await Promise.all([1,2,3].map(i => s.withPage({timeoutMs:30000}, async p => { await p.title(); order.push(i); })));
  assert.equal(browsers.length,1); assert.deepEqual(order,[1,2,3]);
});
test('implicit_target_tracks_switch_and_stale_id_never_targets_replacement', async t => {
  const h = await startClient(); t.after(()=>h.close());
  const first = await call(h.client,'new_tab'); assert.equal(first.isError,undefined);
  const a = first.structuredContent.id;
  const b = (await call(h.client,'new_tab')).structuredContent.id;
  await call(h.client,'switch_tab',{tab_id:a});
  await call(h.client,'evaluate',{script:'document.title="Chosen"'});
  const tabs = (await call(h.client,'list_tabs')).structuredContent.tabs;
  assert.equal(tabs.find(x=>x.id===a).title,'Chosen'); assert.equal(tabs.find(x=>x.id===b).title,'');
  await call(h.client,'close_tab',{tab_id:a});
  assert.equal((await call(h.client,'evaluate',{tab_id:a,script:'1'})).isError,true);
  assert.equal((await call(h.client,'list_tabs')).structuredContent.tabs.find(x=>x.active).id,b);
  await call(h.client,'close_browser');
  const c = (await call(h.client,'new_tab')).structuredContent.id;
  assert.notEqual(c,a); assert.notEqual(c,b);
  await call(h.client,'close_tab',{tab_id:c});
  assert.deepEqual((await call(h.client,'list_tabs')).structuredContent.tabs,[]);
  assert.equal((await call(h.client,'evaluate',{script:'2'})).structuredContent.value,2);
});
test('popup_does_not_steal_active_tab', async t => {
  const {s} = await session(t); const f = await startFixtureServer(); t.after(()=>f.close());
  await s.withPage({timeoutMs:30000},async p=>{await p.goto(f.url); const popup=p.waitForEvent ? null : p.browser().waitForTarget(x=>x.url()===f.url+'/next'); await p.click('#popup'); await popup;});
  const tabs=await s.listTabs(); assert.equal(tabs.length,2); assert.equal(tabs.find(x=>x.active).url,f.url+'/');
});
test('queued_expiry_never_executes', async t => {
  const {s}=await session(t); await s.withPage({timeoutMs:30000},p=>p.title());
  let count=0;
  const first=s.withPage({timeoutMs:5000},()=>delay(1400));
  const second=s.withPage({timeoutMs:1000},async()=>{count++});
  await assert.rejects(second,/waiting/); await first; await delay(50); assert.equal(count,0);
});
test('launch_failure_allows_retry',async t=>{
  let attempts=0; const {s}=await session(t,()=>{if(++attempts===1) throw new Error('injected'); return puppeteer.launch({headless:true});});
  await assert.rejects(s.withPage({timeoutMs:30000},p=>p.title()));
  assert.equal(await s.withPage({timeoutMs:30000},p=>p.title()),'');
});
test('running_timeout_stops_delayed_mutation_and_rejects_waiting_work',async t=>{
  const {s}=await session(t); const f=await startFixtureServer(); t.after(()=>f.close());
  await s.withPage({timeoutMs:30000},p=>p.goto(f.url));
  const running=s.withPage({timeoutMs:1000},p=>p.evaluate('new Promise(resolve=>setTimeout(()=>fetch("/hit").then(resolve),1600))'));
  let ran=false;
  const queued=s.withPage({timeoutMs:5000},async()=>{ran=true;});
  const outcomes=await Promise.allSettled([running,queued]);
  assert.equal(outcomes[0].status,'rejected'); assert.equal(outcomes[1].status,'rejected');
  await delay(800); assert.equal(f.hits(),0); assert.equal(ran,false);
  assert.equal(await s.withPage({timeoutMs:30000},p=>p.title()),'');
});
test('old_generation_events_are_ignored_and_external_close_recovers',async t=>{
  const {s,browsers}=await session(t); await s.withPage({timeoutMs:30000},p=>p.title());
  const old=browsers[0]; const oldId=(await s.listTabs())[0].id;
  await old.close();
  await s.withPage({timeoutMs:30000},p=>p.title());
  old.emit('disconnected');
  assert.equal((await s.listTabs()).length,1); assert.notEqual((await s.listTabs())[0].id,oldId);
  await s.withPage({timeoutMs:30000},p=>p.close());
  assert.equal((await s.listTabs()).length,0);
  assert.equal(await s.withPage({timeoutMs:30000},p=>p.title()),'');
  await s.closeBrowser(); await s.closeBrowser();
});
