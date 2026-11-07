import { test } from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { BrowserSession } from '../build/browser-session.js';
test('20 consecutive launch, timeout, restart and close cycles', {timeout:240000}, async()=>{
  const children=[]; let lastId=0;
  const session=new BrowserSession({headless:true,launch:async()=>{const b=await puppeteer.launch({headless:true});children.push(b.process());return b;}});
  try {for(let cycle=1;cycle<=20;cycle++){
    const outcomes=await Promise.all([1,2].map(n=>session.withPage({timeoutMs:30000},p=>p.evaluate(v=>v,n))));
    assert.deepEqual(outcomes,[1,2]);assert.equal(children.length,cycle);
    const id=Number((await session.listTabs())[0].id.split('-')[1]);assert.ok(id>lastId);lastId=id;
    await assert.rejects(session.withPage({timeoutMs:1000},p=>p.evaluate('new Promise(()=>{})')),/timed out/);
    assert.equal(await session.withPage({timeoutMs:30000},p=>p.evaluate('6*7')),42);
    await session.closeBrowser();
    assert.ok(children.every(c=>c.exitCode!==null || c.signalCode!==null),'all owned browsers must exit after cycle '+cycle);
  }}finally{await session.shutdown();}
});
