import { test } from "node:test";
import assert from "node:assert/strict";
import { startClient, startFixtureServer, call, text } from "./helpers.mjs";
import puppeteer from "puppeteer";
import { performPageAction } from "../build/browser-actions.js";

test("screenshots_decode_with_expected_dimensions_and_pixels", async (t) => {
  const f = await startFixtureServer();
  t.after(() => f.close());
  const h = await startClient();
  t.after(() => h.close());
  await call(h.client, "navigate", { url: f.url });
  await call(h.client, "evaluate", {
    script: "document.body.style.height='1800px'",
  });
  for (const [options, size] of [
    [{}, [800, 600]],
    [{ selector: "#box" }, [120, 60]],
    [{ full_page: true }, null],
  ]) {
    const r = await call(h.client, "screenshot", options);
    assert.equal(r.isError, undefined, text(r));
    const img = r.content.find((x) => x.type === "image");
    assert.equal(img.mimeType, "image/jpeg");
    const decoded = await call(h.client, "evaluate", {
      script: `(async()=>{const i=new Image();i.src='data:image/jpeg;base64,${img.data}';await i.decode();const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(i,5,5,1,1,0,0,1,1);return [i.width,i.height,...ctx.getImageData(0,0,1,1).data]})()`,
    });
    const pixels = decoded.structuredContent.value;
    if (size) assert.deepEqual(pixels.slice(0, 2), size);
    else assert.ok(pixels[1] >= 1800);
    if (options.selector) {
      assert.ok(pixels[2] > 200);
      assert.ok(pixels[3] < 50);
    }
    assert.deepEqual(
      [r.structuredContent.width, r.structuredContent.height],
      pixels.slice(0, 2),
    );
    assert.ok(r.structuredContent.tab_id);
  }
});
test("incompatible_capture_options_rejected_before_launch", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  assert.equal(
    (await call(h.client, "screenshot", { selector: "body", full_page: true }))
      .isError,
    true,
  );
  assert.deepEqual(
    (await call(h.client, "list_tabs")).structuredContent.tabs,
    [],
  );
});
test("pixel_limit_counts_device_scale_and_refuses_oversized_page", async (t) => {
  const b = await puppeteer.launch({ headless: true });
  t.after(() => b.close());
  const p = await b.newPage();
  await p.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
  await p.setContent("<style>body{height:5100px}</style>");
  await assert.rejects(
    performPageAction(
      p,
      { name: "screenshot", full_page: true, timeout_ms: 30000 },
      new AbortController().signal,
      "fixture",
    ),
    /limit/i,
  );
});
test("encoded_image_and_pixel_boundaries_are_inclusive", async () => {
  const { checkImageBounds } = await import("../build/screenshot.js");
  assert.doesNotThrow(() => checkImageBounds(4000, 4000, 1, 5 * 1024 * 1024));
  for (const dims of [
    [4001, 4000, 1, 0],
    [4000, 4000, 1, 5 * 1024 * 1024 + 1],
    [2001, 2000, 2, 0],
    [0, 10, 1, 0],
  ])
    assert.throws(() => checkImageBounds(...dims), /limit/i);
});
test("layout_growth_during_capture_is_rechecked", async (t) => {
  const b = await puppeteer.launch({ headless: true });
  t.after(() => b.close());
  const p = await b.newPage();
  await p.setContent("<body>Growing fixture</body>");
  const capture = p.screenshot.bind(p);
  p.screenshot = async (options) => {
    const pixels = await p.evaluate(() => {
      document.body.style.height = "24000px";
      return (
        document.documentElement.scrollWidth *
        document.documentElement.scrollHeight
      );
    });
    assert.ok(pixels > 16_000_000);
    return capture(options);
  };
  await assert.rejects(
    performPageAction(
      p,
      { name: "screenshot", full_page: true, timeout_ms: 30000 },
      new AbortController().signal,
      "fixture",
    ),
    /limit/i,
  );
});
test("content_boundaries_are_truncated_only_when_needed", async (t) => {
  const h = await startClient();
  t.after(() => h.close());
  for (const [n, limit, truncated] of [
    [24998, undefined, false],
    [24999, undefined, true],
    [99998, 100000, false],
    [99999, 100000, true],
  ]) {
    const r = await call(h.client, "evaluate", {
      script: `'x'.repeat(${n})`,
      ...(limit ? { max_chars: limit } : {}),
    });
    assert.equal(r.structuredContent.truncated, truncated);
    assert.doesNotThrow(() => JSON.parse(text(r)));
  }
});
