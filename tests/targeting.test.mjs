import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { BrowserSession } from "../build/browser-session.js";
import { performPageAction } from "../build/browser-actions.js";
test("lost click acknowledgement never repeats a dispatched click", async (t) => {
  const b = await puppeteer.launch({ headless: true });
  t.after(() => b.close());
  const p = await b.newPage();
  await p.setContent(
    '<button onclick="window.count=(window.count||0)+1">Once</button>',
  );
  const click = p.mouse.click.bind(p.mouse);
  let sent = false;
  p.mouse.click = async (...args) => {
    await click(...args);
    if (!sent) {
      sent = true;
      throw Error("lost acknowledgement");
    }
  };
  const [outcome] = await Promise.allSettled([
    performPageAction(
      p,
      { name: "click", selector: "button", timeout_ms: 2000 },
      AbortSignal.timeout(2000),
    ),
  ]);
  assert.equal(await p.evaluate("window.count"), 1);
  assert.equal(outcome.status, "rejected");
});
test("closing active tab brings oldest survivor to the front, including external close", async (t) => {
  let b;
  const s = new BrowserSession({
    headless: true,
    launch: async () => (b = await puppeteer.launch({ headless: true })),
  });
  t.after(() => s.shutdown());
  const a = await s.newTab();
  const first = await s.withPage(
    { tabId: a.id, timeoutMs: 5000 },
    async (p) => {
      await p.evaluate('document.title="first"');
      return p;
    },
  );
  await s.newTab();
  let c = await s.newTab();
  await s.closeTab(c.id);
  assert.equal((await s.listTabs()).find((x) => x.active).id, a.id);
  assert.equal(await first.evaluate("document.visibilityState"), "visible");
  c = await s.newTab();
  const last = await s.withPage({ tabId: c.id, timeoutMs: 5000 }, (p) =>
    Promise.resolve(p),
  );
  await last.close();
  await s.listTabs();
  assert.equal(await first.evaluate("document.visibilityState"), "visible");
});
test("explicit background click targets A and restores visible active B", async (t) => {
  let b;
  const s = new BrowserSession({
    headless: true,
    launch: async () => (b = await puppeteer.launch({ headless: true })),
  });
  t.after(() => s.shutdown());
  const a = await s.newTab();
  const pageA = await s.withPage(
    { tabId: a.id, timeoutMs: 5000 },
    async (p) => {
      await p.setContent('<button onclick="window.n=1">Go</button>');
      return p;
    },
  );
  const next = await s.newTab();
  const pageB = await s.withPage({ tabId: next.id, timeoutMs: 5000 }, (p) =>
    Promise.resolve(p),
  );
  await s.withPage({ tabId: a.id, timeoutMs: 2000 }, (p, signal) =>
    performPageAction(
      p,
      { name: "click", selector: "button", timeout_ms: 2000 },
      signal,
    ),
  );
  assert.equal(await pageA.evaluate("window.n"), 1);
  assert.equal(await pageB.evaluate("document.visibilityState"), "visible");
  const tabs = await s.listTabs();
  assert.equal(tabs.length, 2);
  assert.equal(tabs.find((x) => x.active).id, next.id);
});
