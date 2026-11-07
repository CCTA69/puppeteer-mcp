import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export const text = (result) =>
  result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
export const call = (client, name, args = {}) =>
  client.callTool({ name, arguments: args });
export async function startClient() {
  let errors = "";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["build/index.js"],
    env: { ...process.env, PUPPETEER_MCP_HEADLESS: "true" },
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => {
    errors += chunk;
  });
  const client = new Client({ name: "reliability-tests", version: "1.0.0" });
  await client.connect(transport);
  return {
    client,
    transport,
    stderr: () => errors,
    async close() {
      try {
        await call(client, "close_browser");
      } finally {
        await client.close();
      }
    },
  };
}
export async function startFixtureServer() {
  let hits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/hit") {
      hits++;
      res.end("ok");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url === "/next") {
      res.end("<title>Next</title><h1>Arrived</h1>");
      return;
    }
    res.end(`<!doctype html><meta charset="utf-8"><title>Fixture</title>
      <input id="field"><input id="disabled" disabled><select id="select" multiple>
      <option value="one">One</option><option value="two">Two</option></select>
      <a id="next" href="/next">Next</a><button id="popup" onclick="window.open('/next')">Popup</button>
      <div id="box" style="width:120px;height:60px;background:red">Picture</div>
      <div id="hidden" hidden>Hidden</div><div id="remove">Remove</div>
      <script>setTimeout(()=>{let e=document.createElement('div');e.id='delayed';e.textContent='Ready';document.body.append(e);document.querySelector('#remove')?.remove()},300)</script>`);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    hits: () => hits,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  };
}
