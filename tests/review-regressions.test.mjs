import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserSession } from "../build/browser-session.js";
import { startFixtureServer, startClient, call } from "./helpers.mjs";
for (const name of ["type", "press_key"]) {
  test(
    name +
      " on a disabled field must not write into the previously focused field",
    async (t) => {
      const f = await startFixtureServer();
      t.after(() => f.close());
      const h = await startClient();
      t.after(() => h.close());
      await call(h.client, "navigate", { url: f.url });
      await call(h.client, "evaluate", { script: "field.focus()" });
      const result = await call(h.client, name, {
        selector: "#disabled",
        ...(name === "type" ? { text: "private" } : { key: "x" }),
        timeout_ms: 1000,
      });
      const state = await call(h.client, "evaluate", {
        script: "[field.value,disabled.value]",
      });
      assert.deepEqual(state.structuredContent.value, ["", ""]);
      assert.equal(result.isError, true);
    },
  );
}
test("clearing a filled field updates its input-driven form model", async (t) => {
  const f = await startFixtureServer();
  t.after(() => f.close());
  const h = await startClient();
  t.after(() => h.close());
  await call(h.client, "navigate", { url: f.url });
  await call(h.client, "evaluate", {
    script:
      "field.value='old';window.model='old';field.oninput=()=>window.model=field.value;true",
  });
  await call(h.client, "fill", { selector: "#field", text: "" });
  assert.deepEqual(
    (await call(h.client, "evaluate", { script: "[field.value,window.model]" }))
      .structuredContent.value,
    ["", ""],
  );
});
test("typing stops when a page transfers focus mid-entry", async (t) => {
  const f = await startFixtureServer();
  t.after(() => f.close());
  const h = await startClient();
  t.after(() => h.close());
  await call(h.client, "navigate", { url: f.url });
  await call(h.client, "evaluate", {
    script: "disabled.disabled=false;field.oninput=()=>disabled.focus();true",
  });
  const result = await call(h.client, "type", {
    selector: "#field",
    text: "abc",
  });
  assert.deepEqual(
    (
      await call(h.client, "evaluate", {
        script: "[field.value,disabled.value]",
      })
    ).structuredContent.value,
    ["a", ""],
  );
  assert.equal(result.isError, true);
});
test("queue deadline holds when the event loop delays timer callbacks", async (t) => {
  const s = new BrowserSession({ headless: true });
  t.after(() => s.shutdown());
  let entered, release;
  const gate = new Promise((r) => (release = r)),
    ready = new Promise((r) => (entered = r));
  const first = s.withPage({ timeoutMs: 20000 }, async () => {
    entered();
    await gate;
  });
  await ready;
  let writes = 0;
  const next = s.withPage({ timeoutMs: 1000 }, async () => {
    writes++;
  });
  const checked = Promise.allSettled([first, next]);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  release();
  const [, outcome] = await checked;
  assert.equal(outcome.status, "rejected");
  assert.equal(writes, 0);
});
test("Puppeteer protocol debug flags cannot expose private scripts on stderr", async (t) => {
  const h = await startClient({ NODE_DEBUG: "puppeteer:protocol:*" });
  t.after(() => h.close());
  const secret = "PRIVATE_PROTOCOL_991";
  const result = await call(h.client, "evaluate", {
    script: 'throw Error("' + secret + '")',
  });
  assert.equal(result.isError, true);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(h.stderr().includes(secret), false);
});
