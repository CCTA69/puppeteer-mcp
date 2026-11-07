# Puppeteer MCP

Control a separate Chrome browser from a local MCP client. Open tabs, interact with forms, wait for page changes and return screenshots directly to your assistant. No account, API key or hosted service is required.

## Install and connect

Use Node.js **22.15 or later** and npm. From this repository:

```sh
npm ci
npm run build
```

Puppeteer downloads Chrome for Testing during installation. If downloads were disabled, run `npx puppeteer browsers install chrome` before starting. On Linux, check [Puppeteer's system requirements and sandbox setup](https://pptr.dev/troubleshooting) if Chrome will not launch.

Configure a client that supports local stdio MCP servers to run:

```json
{
  "mcpServers": {
    "puppeteer-browser": {
      "command": "node",
      "args": ["/absolute/path/to/puppeteer-mcp/build/index.js"]
    }
  }
}
```

Replace the path with your actual checkout. On Windows, forward slashes work, for example `C:/projects/puppeteer-mcp/build/index.js`. The server waits for protocol messages on standard input. For a manual launch use `npm start`; configure the client with `node` as shown so npm's own startup output stays off the protocol stream.

Chrome opens on the first page action in a fresh profile, visible by default. Set `PUPPETEER_MCP_HEADLESS=true` in the client's server environment to hide the window. Listing tools/tabs or closing an idle browser does not launch Chrome.

## Tools

| Tool | Arguments | Result |
| --- | --- | --- |
| `navigate` | `url`, optional `wait_until` | Opens HTTP/HTTPS or `about:blank`. Default: `domcontentloaded`; request `networkidle2` for the former default. |
| `new_tab` | Optional `url`, `timeout_ms` | Opens and activates a tab; returns its ID, URL, title and active status. |
| `list_tabs` | None | Lists open tabs and identifies the active one. Popups appear here without changing the active tab. |
| `switch_tab` / `close_tab` | `tab_id` | Activates or closes the specified tab. Closing the active tab selects the oldest remaining one. |
| `click` | CSS `selector`, optional `wait_until` | Clicks an actionable match. Set `wait_until` if the click is expected to navigate. |
| `type` / `fill` | CSS `selector`, `text` | Type sends keystrokes at the caret; fill replaces the field's contents. Pass an empty string to fill to clear it. |
| `select_option` | CSS `selector`, `values` (array) | Selects existing values in a native dropdown. Returns the count. For custom menus use click. |
| `press_key` | Puppeteer `key`, optional CSS `selector` | Presses one key on the element or the currently focused control. |
| `wait_for` | CSS `selector`, optional `state` | Waits for `visible` (default), `hidden`, `attached` or `detached`. Hidden includes absent elements. |
| `get_content` | Optional CSS `selector`, `max_chars` | Reads whole-page HTML or one element's outer HTML. |
| `evaluate` | `script`, optional `max_chars` | Runs JavaScript in the page. Returns a JSON value or an explicit undefined marker; unsupported values produce an error. |
| `screenshot` | Optional CSS `selector` or `full_page: true` | Returns an MCP JPEG image (quality 80) and its tab ID, dimensions and byte count. Defaults to the visible viewport. |
| `close_browser` | None | Closes this server's browser. Safe to call repeatedly. |

Page tools take optional `tab_id` and `timeout_ms` (1,000–120,000; default 30,000). Without a tab ID they use the active tab; if none remain a page action opens a blank tab. A closed tab ID is never reused during the server process's lifetime. The supported `wait_until` values are `domcontentloaded`, `load`, `networkidle0` and `networkidle2`. Modern pages can update after initial navigation: wait for the element you need.

Example sequence: call `new_tab` with `{"url":"http://localhost:3000"}`, then `fill` with `{"selector":"#search","text":"community"}`, then `press_key` with `{"selector":"#search","key":"Enter"}`. Use `wait_for` to wait for results and `screenshot` with `{"selector":"#results"}` to see them. Substitute selectors that actually exist on your page.

## Limits and recovery

- Inputs are checked before a page action runs. Selectors are limited to 4,096 characters, URLs to 8,192, text and scripts to 100,000, and dropdown selection to 100 values of up to 4,096 characters each.
- HTML and evaluated results default to 25,000 characters, adjustable to 100,000. Truncated output is marked; an oversized evaluated result returns a JSON envelope containing a preview. Screenshots larger than 16 million pixels or 5 MiB of JPEG data return an error. No screenshot is written to disk.
- Browser operations run in arrival order. Queue waiting and execution have separate time limits. An expired queued command is removed. An interrupted action is never replayed. If necessary the affected page is closed; if cleanup cannot be confirmed, the owned browser is stopped and its tabs can be lost. If cleanup still cannot be confirmed, restart the server. Stopping a page cannot undo a request already sent to a website. Inspect the page before repeating a click or submission.
- Write confirmations and error logs do not repeat typed values or scripts. The client still sees the arguments it sends. Page reads, screenshots and script results can expose displayed information. Only use trusted MCP clients and inspect scripts before allowing arbitrary evaluation. Time and output limits are not a guarantee against a script consuming available memory.

## Check a change

```sh
npm ci
npm test
npm run test:stress
npm audit
```

The suite launches real browsers against local fixtures and checks the compiled stdio entry point. The stress test runs 20 launch/timeout/recovery cycles and checks browser process exits. GitHub Actions is configured for Windows and Ubuntu on Node 22 and 24. Ubuntu uses the runner's system Chrome with its installed sandbox profile; Windows uses the browser installed by Puppeteer. A green run is evidence for that build and environment, not a guarantee that every site or client works.
