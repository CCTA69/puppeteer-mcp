import { test } from "node:test";
import assert from "node:assert/strict";
import { startClient, startFixtureServer, call, text } from "./helpers.mjs";

test("legacy_names_remain", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const names = (await h.client.listTools()).tools.map((tool) => tool.name);
  for (const name of [
    "navigate",
    "click",
    "type",
    "get_content",
    "evaluate",
    "close_browser",
  ])
    assert.ok(names.includes(name));
});
test("write_results_do_not_echo_values", async (t) => {
  const f = await startFixtureServer();
  t.after(() => f.close());
  const h = await startClient();
  t.after(() => h.close());
  await call(h.client, "navigate", { url: f.url });
  const secret = "PRIVATE_MARKER_5829";
  const result = await call(h.client, "type", {
    selector: "#field",
    text: secret,
  });
  assert.equal(result.isError, undefined);
  assert.equal(text(result).includes(secret), false);
  assert.equal(h.stderr().includes(secret), false);
});
test("error_messages_do_not_echo_script", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const result = await call(h.client, "evaluate", {
    script: 'throw new Error("PRIVATE_ERROR_5829")',
  });
  assert.equal(result.isError, true);
  assert.equal(text(result).includes("PRIVATE_ERROR_5829"), false);
  assert.equal(h.stderr().includes("PRIVATE_ERROR_5829"), false);
});
test("invalid_arguments_do_not_launch", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const result = await call(h.client, "navigate", {
    url: "about:blank",
    extra: "PRIVATE_ARGUMENT_5829",
  });
  assert.equal(result.isError, true);
  assert.equal(text(result).includes("PRIVATE_ARGUMENT_5829"), false);
  const tabs = await call(h.client, "list_tabs");
  assert.deepEqual(tabs.structuredContent?.tabs, []);
});
test("undefined_evaluation_is_a_valid_result", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const result = await call(h.client, "evaluate", { script: "undefined" });
  assert.equal(result.isError, undefined);
  assert.match(text(result), /undefined/);
});
test("content_limits_preserve_valid_unicode_and_json", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  const result = await call(h.client, "evaluate", {
    script: '"😀".repeat(20000)',
    max_chars: 25,
  });
  assert.equal(result.isError, undefined);
  const data = JSON.parse(text(result));
  assert.equal(data.truncated, true);
  assert.ok(data.preview.length <= 25);
  assert.equal(data.preview.isWellFormed(), true);
});
