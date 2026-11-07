import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClient, startFixtureServer, call, text } from './helpers.mjs';
async function setup(t) {
  const f=await startFixtureServer(); t.after(()=>f.close()); const h=await startClient(); t.after(()=>h.close());
  const run=(name,args)=>call(h.client,name,args);
  const ok=async(name,args)=>{const r=await run(name,args);assert.equal(r.isError,undefined,text(r));return r;};
  await ok('navigate',{url:f.url}); return {f,run,ok,read:async script=>(await ok('evaluate',{script})).structuredContent.value};
}
test('type_appends_fill_replaces_and_empty_fill_clears',async t=>{
  const {ok,read}=await setup(t); await ok('type',{selector:'#field',text:'a'}); await ok('type',{selector:'#field',text:'b'});
  assert.equal(await read('field.value'),'ab'); await ok('fill',{selector:'#field',text:'c雪😀'}); assert.equal(await read('field.value'),'c雪😀');
  await ok('fill',{selector:'#field',text:''}); assert.equal(await read('field.value'),'');
});
test('native_select_and_keys_on_target',async t=>{
  const {ok,run,read}=await setup(t);
  const res=await ok('select_option',{selector:'#select',values:['one','two']});assert.equal(res.structuredContent.count,2);
  assert.deepEqual(await read('Array.from(document.querySelector("select").selectedOptions,o=>o.value)'),['one','two']);
  assert.equal((await run('select_option',{selector:'#select',values:['missing']})).isError,true);
  await ok('press_key',{selector:'#field',key:'a'});await ok('press_key',{key:'b'});assert.equal(await read('field.value'),'ab');
  assert.equal((await run('press_key',{key:'not-a-key'})).isError,true);
});
test('four_wait_states_and_replaced_element',async t=>{
  const {ok,read}=await setup(t);
  for(const [selector,state] of [['#delayed','visible'],['#hidden','attached'],['#hidden','hidden'],['#remove','detached']]) await ok('wait_for',{selector,state});
  await read('setTimeout(()=>{const e=disabled.cloneNode();e.disabled=false;disabled.replaceWith(e)},150);true');
  await ok('fill',{selector:'#disabled',text:'ready',timeout_ms:3000});assert.equal(await read('disabled.value'),'ready');
});
test('click_waits_for_navigation_and_reads_html',async t=>{
  const {ok}=await setup(t);await ok('click',{selector:'#next',wait_until:'load'});
  assert.match(text(await ok('get_content',{selector:'h1'})),/<h1>Arrived<\/h1>/);
  assert.match(text(await ok('get_content',{})),/<title>Next<\/title>/);
});
test('failed_click_leaves_no_dangling_navigation_and_can_recover',async t=>{
  const {run,ok,f}=await setup(t); const r=await run('click',{selector:'#missing',wait_until:'load',timeout_ms:1000});assert.equal(r.isError,true);
  await ok('navigate',{url:f.url}); assert.equal((await ok('evaluate',{script:'7'})).structuredContent.value,7);
  assert.equal((await run('navigate',{url:'http://127.0.0.1:1/'})).isError,true); await ok('navigate',{url:f.url});
});
test('bad_urls_unknown_tools_and_timeouts_do_not_open_browser',async t=>{
  const h=await startClient();t.after(()=>h.close());
  for(const [name,args] of [['navigate',{url:'file:///no'}],['unknown',{}],['wait_for',{selector:'body',timeout_ms:0}],['press_key',{key:'toString'}]]) {
    assert.equal((await call(h.client,name,args)).isError,true);
  } assert.deepEqual((await call(h.client,'list_tabs')).structuredContent.tabs,[]);
});
test('evaluation_distinguishes_undefined_from_unsupported_values',async t=>{
  const {ok,run}=await setup(t);
  for(const script of ['({x:1n})','(()=>{const o={};o.o=o;return o})()','()=>42']) assert.equal((await run('evaluate',{script})).isError,true,script);
  assert.deepEqual((await ok('evaluate',{script:'Promise.resolve({answer:42})'})).structuredContent.value,{answer:42});
});
