# Browser controls upgrade design

Status: proposed; design approval pending. No implementation or tests have run.

[Plain Version](2026-11-06-browser-controls-design-plain-version.md)

## D1 — Purpose and approach

Modernize CCTA69/puppeteer-mcp as a free community tool. The user selected better browser controls (screenshots, tabs, forms, waiting, reliability) and specifically requested strong bug prevention. Zero defects cannot be guaranteed; release confidence must come from reproducible checks and disclosed limits.

Baseline inspected: main commit c4b8f745ebfbcf023a202c750097872ab89fde5e. One TypeScript file implements six tools; no tests or CI exist. Inputs are cast without runtime validation, type echoes entered text, and cached browser/page objects are not checked after external closure. Package repository links point to an older repository.

Approaches: incremental extension preserves existing integrations and permits focused regression tests; a full rewrite or remote service adds migration and operational work without helping the selected scope. The user chose browser controls over website auditing or a combined larger upgrade. Builder recommendation: incremental extension of the existing local TypeScript/Puppeteer server. This is a moderate feature upgrade, not a one-line patch.

## D2 — Compatibility and installation

Preserve server name, stdio transport, build/index.js entry point, npm build/start commands, and the names and required arguments of navigate, click, type, get_content, evaluate, close_browser. Preserve type's append behavior; fill is a separate replacement operation. Add optional tab_id to page tools. Absent tab_id means the active tab. Old text results remain present; exact wording is not a compatibility promise. Add structured results where useful, with proper MCP image content for screenshots.

Keep SDK v1 for this upgrade, using its McpServer/registerTool and Zod validation. SDK v2 is stable; v1 receives bug/security fixes rather than new features. A major SDK migration is a separate choice, not required for these controls. During planning verify actual package compatibility and supported Node versions; prefer a supported Node LTS with a documented minimum, rather than the stale README's Node 16 recommendation. Do not blindly upgrade all majors. Keep build output policy consistent with the existing tracked build/index.js. Correct repository links and examples; preserve the existing ISC declaration without inventing a copyright holder.

## D3 — Browser controls

Proposed additions (builder-selected names):

| Tool | Contract |
| --- | --- |
| list_tabs | Return stable session-local IDs, titles, URLs and active status; do not launch a browser just to list tabs. |
| new_tab | Create and activate a tab; optional URL. |
| switch_tab | Activate an existing ID; reject missing/stale IDs. |
| close_tab | Close an existing ID; select the oldest remaining tab if it was active. |
| screenshot | Return viewport JPEG by default; optional full-page or selector capture, mutually exclusive. No filesystem write. Enforce 16 million pixels and 5 MiB encoded-image bytes before returning; report a clear limit error rather than silently cropping. |
| fill | Replace a field's contents, including clearing with an empty string; never echo the value. |
| select_option | Select one or more values in a native select; return selection count, not potentially sensitive values. |
| press_key | Send a validated Puppeteer-supported key to the selected element or page. |
| wait_for | Wait for a selector to be visible, hidden, attached or detached, with a bounded timeout. |

Existing tools gain validated arguments, helpful errors and explicit timeout handling. Navigation defaults to DOM-ready rather than network-idle to avoid pages with continuous network traffic hanging; retain networkidle2 as an explicit option and document the default change. An optional click wait_until parameter installs a navigation listener before clicking when navigation is expected. Default click does not assume navigation. Prefer Puppeteer locators for actionable elements where their semantics fit. Selection uses native selects only; arbitrary custom dropdowns remain possible through existing click/evaluate tools.

## D4 — State, failures and privacy

Use a small session manager separate from tool registration. Serialize browser-affecting operations in arrival order, with validation before enqueueing, so tab changes and browser closure cannot race another action. Default execution timeout is 30 seconds, configurable per applicable tool from 1 to 120 seconds. Queue waiting must also be bounded and timed-out queued work must never execute later. Do not claim that a Promise timeout cancels Puppeteer work: operations that cannot be aborted must finish or invalidate/close their target before releasing the queue. Planning must settle and test the mechanism, especially evaluate.

Launch only when an operation requires a page. Use one shared launch attempt. Never recycle tab IDs during the server session, including after a browser restart. Track popups and external tab closure. Explicit stale IDs produce an error without creating a replacement. Without an explicit ID, use the active tab while it is live. Only when the active tab is absent or closed, select and activate the oldest remaining live tab; create and activate a blank one if none exist. Popups are registered but do not silently change the active tab. On browser disconnection, discard stale state; the next page operation may launch a fresh browser. Never automatically replay clicks, typing, scripts or navigation that may already have had effects. The failed operation reports the loss of state.

close_browser is idempotent and clears state; shutdown on transport closure, SIGINT or SIGTERM closes owned browser processes. Listing tools, bad arguments and unknown tools must not launch a browser. Keep fresh isolated browser profiles and headed mode by default, with documented headless configuration for automation. Do not attach to the user's personal signed-in browser.

Do not include entered form values or scripts in success messages, diagnostic logs or validation errors. Explicit content-reading tools and screenshots can still reveal page data; this is not a redaction system. Keep diagnostics off stdout because it carries MCP messages. Validate input types, lengths, keys, tab IDs and timeout ranges before use. Navigation supports HTTP/HTTPS and about:blank; document that other URL schemes are rejected. Localhost HTTP remains allowed for development. Existing evaluate remains powerful page JavaScript and should be annotated accordingly; tool hints do not enforce user permission.

Cap text content at a documented 25,000-character default, with an optional bounded limit up to 100,000 and explicit truncation metadata; never truncate raw serialized JSON into invalid JSON. Represent undefined evaluation results explicitly; serialization failures are tool errors. Test large outputs and image limits. Proposed validation limits and output changes must be documented as intentional compatibility changes.

## D5 — Evidence required before calling it ready

Use controlled local fixture pages and a real Chromium browser; no test should depend on a changing public website or submit real user data. Add tests that verify externally visible behavior, not just mocks of the implementation.

- Regression: all six old tool names and required arguments still work; type appends, fill replaces; close_browser can be repeated.
- New controls: valid screenshot bytes and dimensions; tab targeting, switching, popups, close-active and close-last; input, native selects, keys, delayed elements and navigation triggered by clicks.
- Failures: malformed inputs and unknown tools leave the browser unlaunched; missing selectors time out; invalid/stale tabs fail; failed navigation is recoverable; closing a tab/browser externally does not poison later calls.
- Concurrency: simultaneous initial calls create one browser; queued commands retain order; timeout/close/restart interleavings cannot execute on an unintended tab or cause delayed mutations.
- Protocol/privacy: an SDK client starts the actual stdio entry point, lists tools, calls them and receives valid text/structured/image results; stdout has no diagnostics; supplied secret markers are absent from write-tool replies and logs. Content reads are intentionally exempt.
- Boundaries: empty fill, Unicode, undefined/nonserializable evaluation results, long pages, oversized images, output limits, invalid timeouts and scripts that never finish.
- Cleanup: disconnecting the client exits the server and its owned browser without leaving processes running.

Required checks: TypeScript build, full automated suite, dependency compatibility/advisory review, focused diff review and a Windows headed-browser smoke test. Add CI for Windows and Linux on the documented supported Node line. Report local passes separately from CI results. Do not claim macOS or every MCP client was tested. A failing required test or unresolved reproducible defect blocks a ready-for-use claim; record all remaining limitations. This design has not yet been implemented or tested.

## D6 — Scope and next stage

This release does not include website-audit reports, remote hosting, account/payment features, browser extensions, personal profile attachment, uploads/download management or Agensi publication. It remains a free community contribution. An Agensi listing and public release are separate actions. No extra fees are introduced; running a browser uses the user's own machine.

After design approval, prepare the implementation plan and its Plain Version for review before code changes. Builder may choose module boundaries, test runner, exact fixtures and compatible dependency patch versions; material behavior changes require a design amendment. Zero-bug claims are prohibited even when tests pass.

## D7 — Skill coverage and references

- superpowers-conductor:orchestrate: current stage is design; preserve the chosen scope and design/plan review gates.
- superpowers:brainstorming and grilling: repository discovery and the browser-controls scope choice; builder review found ambiguous active-tab fallback, corrected in both versions. No other material unanswered questions were identified.
- dummy-plan: matched technical/plain design with D1–D7 identifiers; both files and reciprocal links verified. Plain-language review completed.
- External anthropics/skills mcp-builder (read, not installed): local stdio, registerTool, runtime schemas, tool annotations, structured responses and testable errors inform D2–D5. Discovery compared it with the Claude-specific mcp-server-dev router; generic guidance better fits an existing cross-client server. Examples are guidance, not substitutes for installed SDK type checks.
- Implementation, dependency installation and builds are deferred until the presented implementation plan is approved. Next action: present this design pair for approval, then prepare the implementation plan pair.

References: [repository](https://github.com/CCTA69/puppeteer-mcp), [MCP Builder](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md), [SDK roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md), [Puppeteer interactions](https://pptr.dev/guides/page-interactions), [Puppeteer requirements](https://pptr.dev/guides/system-requirements).

You can say: Change D3 so screenshots capture the full page by default.
