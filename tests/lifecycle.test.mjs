import { test } from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import puppeteer from "puppeteer";
import { BrowserSession } from "../build/browser-session.js";
import { startClient, call, text } from "./helpers.mjs";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if (e.code === "ESRCH") return false;
    throw e;
  }
}
async function until(fn, ms = 8000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw Error("condition did not become true");
    await delay(25);
  }
}
for (const mode of ["EOF", "fatal"]) {
  test(
    mode + " reaps the owned browser and exits without leaking diagnostics",
    async (t) => {
      const child = fork("build/index.js", [], {
        execArgv: ["--import", "./tests/track-launch.mjs"],
        silent: true,
        env: { ...process.env, PUPPETEER_MCP_HEADLESS: "true" },
      });
      let stdout = "",
        stderr = "",
        ownedPid;
      child.stdout.on("data", (b) => (stdout += b));
      child.stderr.on("data", (b) => (stderr += b));
      child.on("message", (m) => {
        if (m.ownedPid) ownedPid = m.ownedPid;
      });
      const exited = once(child, "exit");
      t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
        await exited;
        if (ownedPid && alive(ownedPid)) process.kill(ownedPid);
      });
      const send = (id, method, params) =>
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
        );
      send(1, "initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "fixture", version: "1" },
      });
      await until(() => stdout.includes('"id":1'));
      send(2, "tools/call", { name: "evaluate", arguments: { script: "3+4" } });
      await until(() => ownedPid && stdout.includes('"id":2'));
      assert.ok(alive(ownedPid));
      if (mode === "EOF") child.stdin.end();
      else child.send("test-fatal");
      await until(() => child.exitCode !== null || child.signalCode !== null);
      const [code] = await exited;
      assert.equal(code, mode === "EOF" ? 0 : 1);
      await until(() => !alive(ownedPid));
      assert.equal(stderr.includes("PRIVATE_FATAL_SAMPLE_713"), false);
      assert.ok(
        stdout
          .trim()
          .split("\n")
          .every((line) => JSON.parse(line).jsonrpc === "2.0"),
      );
    },
  );
}
test("shutdown_during_launch_and_with_queued_work", async () => {
  let finishLaunch, started;
  const launching = new Promise((r) => (started = r));
  const gate = new Promise((r) => (finishLaunch = r));
  let browser;
  const s = new BrowserSession({
    headless: true,
    launch: async () => {
      browser = await puppeteer.launch({ headless: true });
      started();
      await gate;
      return browser;
    },
  });
  const running = s.withPage({ timeoutMs: 5000 }, (p) => p.title());
  const queued = s.withPage({ timeoutMs: 5000 }, (p) => p.title());
  const results = Promise.allSettled([running, queued]);
  try {
    await launching;
    const pid = browser.process().pid;
    const stopped = s.shutdown();
    finishLaunch();
    await stopped;
    assert.deepEqual(
      (await results).map((r) => r.status),
      ["rejected", "rejected"],
    );
    assert.equal(alive(pid), false);
    await assert.rejects(
      s.withPage({ timeoutMs: 5000 }, (p) => p.title()),
      /stopped/,
    );
  } finally {
    finishLaunch();
    await s.shutdown();
    await browser?.close().catch(() => {});
  }
});
test("infinite_and_never_resolving_scripts_stop_and_next_command_recovers", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  for (const script of ["for(;;){}", "new Promise(()=>{})"]) {
    assert.equal(
      (await call(h.client, "evaluate", { script: "1" })).structuredContent
        .value,
      1,
    );
    const result = await call(h.client, "evaluate", {
      script,
      timeout_ms: 1000,
    });
    assert.equal(result.isError, true);
    assert.match(text(result), /timed out/);
    assert.equal(
      (await call(h.client, "evaluate", { script: "42" })).structuredContent
        .value,
      42,
    );
  }
});
test("no_secret_in_failure_replies_or_logs", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const secret = "PRIVATE_FAULT_817";
  for (const [name, args] of [
    ["evaluate", { script: 'throw Error("' + secret + '")' }],
    ["type", { selector: "[" + secret, text: secret, timeout_ms: 1000 }],
    ["fill", { selector: "body", text: secret, [secret]: true }],
    ["press_key", { key: secret }],
  ]) {
    const r = await call(h.client, name, args);
    assert.equal(r.isError, true);
    assert.equal(JSON.stringify(r).includes(secret), false);
  }
  assert.equal(h.stderr().includes(secret), false);
});
