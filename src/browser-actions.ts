import type { Page } from 'puppeteer';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { PageAction } from './tool-schemas.js';
import { jsonResult, textResult, valueResult, SessionError } from './results.js';
import { capture } from './screenshot.js';
export async function performPageAction(page: Page, action: PageAction, signal: AbortSignal, tabId?: string): Promise<CallToolResult> {
  signal.throwIfAborted();
  switch (action.name) {
    case 'screenshot': return capture(page,action,signal,tabId);
    case 'navigate': await page.goto(action.url, { waitUntil:action.wait_until, timeout:0, signal }); return jsonResult({status:'Navigated'});
    case 'click': {
      const end = new AbortController();
      const clickSignal=AbortSignal.any([signal,end.signal]);
      const navigation = action.wait_until ? page.waitForNavigation({waitUntil:action.wait_until,timeout:0,signal:clickSignal}) : undefined;
      try { await Promise.all([navigation,page.locator(`:is(${action.selector}):not(:disabled)`).setTimeout(0).click({signal:clickSignal})]); }
      finally { end.abort(); await navigation?.catch(()=>{}); }
      return jsonResult({status:'Clicked'});
    }
    case 'type': {
      using element=await page.waitForSelector(action.selector,{signal,timeout:0});
      signal.throwIfAborted(); if (!element) throw new SessionError('failed');
      await element.type(action.text); return jsonResult({status:'Typed'});
    }
    case 'fill': await page.locator(`:is(${action.selector}):not(:disabled)`).setTimeout(0).fill(action.text,{signal}); return jsonResult({status:'Filled'});
    case 'select_option': {
      using element=await page.waitForSelector(action.selector,{signal,timeout:0});
      if (!element || !await element.evaluate((el,values)=>el instanceof HTMLSelectElement && !el.disabled && (el.multiple || values.length===1) && values.every(v=>Array.from(el.options).some(o=>o.value===v && !o.disabled)),action.values)) throw new SessionError('failed');
      signal.throwIfAborted(); const selected=await element.select(...action.values);
      if(new Set(action.values).size!==selected.length) throw new SessionError('failed');
      return jsonResult({count:selected.length});
    }
    case 'press_key': {
      if (action.selector) { using element=await page.waitForSelector(action.selector,{signal,timeout:0}); signal.throwIfAborted(); if (!element) throw new SessionError('failed'); await element.press(action.key); }
      else await page.keyboard.press(action.key);
      return jsonResult({status:'Key pressed'});
    }
    case 'wait_for': {
      if (action.state==='detached') { using handle=await page.waitForFunction(sel=>!document.querySelector(sel), {timeout:0,signal}, action.selector); }
      else { using handle=await page.waitForSelector(action.selector, {timeout:0,signal,visible:action.state==='visible',hidden:action.state==='hidden'}); }
      return jsonResult({state:action.state});
    }
    case 'get_content': {
      if (action.selector) { using el=await page.waitForSelector(action.selector,{signal,timeout:0}); if(!el) throw new SessionError('failed'); signal.throwIfAborted(); return textResult(await el.evaluate(e=>e.outerHTML),action.max_chars); }
      return textResult(await page.content(), action.max_chars);
    }
    case 'evaluate': {
      // A handle preserves the distinction between undefined and a value CDP cannot serialize.
      await using handle=await page.evaluateHandle(action.script);
      signal.throwIfAborted();
      const encoded=await handle.evaluate((value,limit)=>{
        if(value===undefined) return {kind:'undefined'} as const;
        try {
          const json=JSON.stringify(value,(_key,v:unknown)=>{
            if (['undefined','function','symbol','bigint'].includes(typeof v) || (typeof v==='number' && !Number.isFinite(v))) throw Error();
            return v;
          });
          if(json.length<=limit) return {kind:'json',json} as const;
          let preview=json.slice(0,limit); if(/[\uD800-\uDBFF]$/.test(preview)) preview=preview.slice(0,-1);
          return {kind:'preview',preview,total_chars:json.length} as const;
        } catch { return {kind:'unsupported'} as const; }
      },action.max_chars);
      if(encoded.kind==='undefined') return valueResult(undefined);
      if(encoded.kind==='unsupported') throw new SessionError('serialization');
      if(encoded.kind==='preview') return jsonResult({truncated:true,preview:encoded.preview,total_chars:encoded.total_chars});
      return valueResult(JSON.parse(encoded.json),action.max_chars);
    }
  }
}
