import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startClient, startFixtureServer, call } from "./helpers.mjs";
async function waitForHit(f, count) {
  for (let i = 0; i < 200; i++) {
    if (f.hits() >= count) return;
    await delay(20);
  }
  throw Error("fixture did not receive start signal");
}
test("MCP client cancellation removes queued writes and interrupts a running write", async (t) => {
  const f = await startFixtureServer();
  t.after(() => f.close());
  const h = await startClient();
  t.after(() => h.close());
  await call(h.client, "navigate", { url: f.url });
  const first = call(h.client, "evaluate", {
    script: "fetch('/hit').then(()=>new Promise(r=>setTimeout(()=>r(1),700)))",
  });
  await waitForHit(f, 1);
  const queued = new AbortController();
  const pending = h.client.callTool(
    {
      name: "type",
      arguments: { selector: "#field", text: "should not type" },
    },
    undefined,
    { signal: queued.signal },
  );
  const rejected = assert.rejects(pending);
  await delay(80);
  queued.abort();
  await rejected;
  await first;
  const field = await call(h.client, "evaluate", { script: "field.value" });
  assert.equal(field.structuredContent.value, "");
  const running = new AbortController();
  const mutation = h.client.callTool(
    {
      name: "evaluate",
      arguments: {
        script:
          "fetch('/hit').then(()=>new Promise(r=>setTimeout(()=>fetch('/hit').then(()=>r(1)),1200)))",
      },
    },
    undefined,
    { signal: running.signal },
  );
  const stopped = assert.rejects(mutation);
  await waitForHit(f, 2);
  running.abort();
  await stopped;
  await delay(1500);
  assert.equal(f.hits(), 2);
  assert.equal(
    (await call(h.client, "evaluate", { script: "2+2" })).structuredContent
      .value,
    4,
  );
});
