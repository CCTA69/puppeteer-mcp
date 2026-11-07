# Browser Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Native execution with one independent final review is recommended; execution choice and plan approval are pending.

**Goal:** Add useful browser controls while preventing known failures from reaching a ready-for-use release.

**Architecture:** Keep the existing local TypeScript/Puppeteer server and build/index.js entry point. Separate session ownership, tool registration and bounded response formatting; serialize actions through one session owner and invalidate uncertain browser state before accepting later work.

**Tech Stack:** TypeScript, MCP SDK v1, Puppeteer 24, Zod 4, Node's built-in test runner with JavaScript ESM tests against compiled code.

**Spec:** [Approved design](../specs/2026-11-06-browser-controls-design.md)

**Plain Version:** [Implementation plan in everyday language](2026-11-06-browser-controls-plain-version.md)

**Status:** Approved 2026-11-06: user chose native implementation with independent final review. Implementation underway; dependency amendment A1 below approved.

### A1 — Approved dependency amendment

Baseline npm audit reported 18 vulnerable packages, including high-severity Puppeteer transitive dependencies. Its supported fix for Puppeteer is 25.16.0, a major upgrade; newest v24 is 24.43.1. Upgrade Puppeteer to ^25.16.0 and its bundled Chrome, update SDK within v1 to ^1.32.2 and Zod within v4 to a patched release (>=4.6.6), then verify all browser and stdio tests. Puppeteer 25.16.0 requires Node >=22.12.0, already covered by this plan's >=22.15.0 minimum. Keep all public tool contracts unchanged. Cost: internal API adjustments and a new browser download. This replaces the initial Puppeteer-24 version choice under explicit user approval of A1.

## Global Constraints

- Preserve six existing tool names and required arguments, stdio, server name, build/index.js, npm build/start and type's append behavior.
- Free local community project; no publishing, hosting, payments, personal profile attachment or SDK-major migration.
- Default execution timeout is 30 seconds, configurable per applicable tool from 1 to 120 seconds.
- Limit text content to 25,000 characters by default, optionally up to 100,000; report truncation explicitly.
- Screenshot limit: 16 million pixels and 5 MiB encoded-image bytes; viewport JPEG by default; full-page and selector mutually exclusive.
- Active tab stays active until explicitly switched, replaced by new_tab, or closed; popups never steal the logical active tab.
- Never replay a potentially completed mutation or release uncertain timed-out work to execute later.
- No input values/scripts in write-tool responses, logs or validation errors. Content reads can expose page data.
- No ready-for-use claim with required checks failing or a known reproducible defect; never claim zero bugs.

## Review Focus

1. Old browser events arriving after recovery must not alter the new tab registry (P2 generation-event test).
2. Timed-out work waiting behind another request must never execute (P2 queued-expiry test).
3. A navigation watcher installed for a failed click must be canceled/settled without an unhandled rejection (P3 failed-click test).
4. High device-pixel ratio or layout growth must not bypass image limits (P4 screenshot-boundary tests).
5. An exception containing a submitted secret must not reach the client or stderr (P1/P5 sanitized-error tests).

## Files and interfaces

- `src/index.ts`: executable stdio entry point and shutdown hooks only.
- `src/server.ts`: export `createServer(session: BrowserSession): McpServer`; register all tools, schemas and annotations.
- `src/browser-session.ts`: BrowserSession class owns queue, browser, tab IDs and generation; no stdout logging.
- `src/browser-actions.ts`: `performPageAction(page: Page, action: PageAction, signal: AbortSignal): Promise<CallToolResult>`; PageAction is a discriminated union of validated page-tool arguments.
- `src/tool-schemas.ts`: schemas and inferred `PageAction`; shared optional tab_id/timeout_ms, argument constraints.
- `src/results.ts`: `toolError(code: ErrorCode): CallToolResult`, `textResult(text: string, limit: number): CallToolResult`, `valueResult(value: unknown, limit: number): CallToolResult`. Fixed error codes/messages, no raw exception formatting.
- `tests/helpers.mjs`: `startFixtureServer(): Promise<{url: string, close(): Promise<void>}>`, `startClient(): Promise<{client: Client, stderr: () => string, close(): Promise<void>}>`; deterministic local HTTP routes, SDK client subprocess.
- `tests/{protocol,session,actions,screenshot,lifecycle}.test.mjs`: behavioral test groups; helpers excluded from discovery.
- `package.json`, `package-lock.json`, `README.md`, `.github/workflows/ci.yml`, tracked `build/*.js`: configuration, documented contracts, automatic checks and reproducible generated output.

Session public contract: `listTabs(): Promise<TabInfo[]>`, `newTab(url?: string, timeoutMs?: number): Promise<TabInfo>`, `switchTab(id: string): Promise<TabInfo>`, `closeTab(id: string): Promise<void>`, `closeBrowser(): Promise<void>`, `shutdown(): Promise<void>`, and `withPage<T>(options: {tabId?: string; timeoutMs: number}, operation: (page: Page, signal: AbortSignal) => Promise<T>): Promise<T>`. `TabInfo = {id: string; title: string; url: string; active: boolean}`. Constructor accepts `{headless: boolean, launch?: () => Promise<Browser>}`; injected launch supports fault tests and otherwise uses Puppeteer. Tab methods enqueue once; no nested queue acquisitions.

Tool arguments: existing fields preserved; page tools add optional `tab_id`, `timeout_ms`. `navigate` adds `wait_until`; `click` adds optional `wait_until`; values are `load`, `domcontentloaded`, `networkidle0`, `networkidle2`. `fill` takes selector/text, `select_option` selector/values, `press_key` key/optional selector, `wait_for` selector/state, `screenshot` optional selector/full_page, `new_tab` optional url/timeout_ms, switch_tab/close_tab require tab_id. get_content/evaluate add `max_chars`. list_tabs/close_browser take no arguments. Runtime schemas reject unknown fields. Bound selectors to 4,096 characters, text/scripts to 100,000, URLs to 8,192, IDs to 64; no nonempty constraint on fill/type text. select_option accepts 1–100 values, each at most 4,096 characters. Key must be in installed Puppeteer's supported key definitions. List tabs uses a fixed 30-second metadata deadline; a title-read failure returns empty title for that live tab.

## State transition contract

| Trigger | State transition | Surviving work | Observable result / test |
| --- | --- | --- | --- |
| Concurrent first calls | idle → one launch → active | queued actions | One owned browser, FIFO ordering / P2 |
| Active tab closes | active A → oldest live B | explicit A requests | A errors; implicit calls use B / P2 |
| Popup appears | existing active unchanged | tool operation | New ID listed; action target unchanged / P2 |
| Queue deadline expires | queued → removed | current operation | Expired callback never invoked / P2 |
| Running deadline expires | active → recovering | pending calls | Abort, close affected page; if not confirmed, terminate owned browser; reject already queued calls before fresh generation / P2/P5 |
| Browser disconnects | active → invalid generation | stale events/callbacks | No replay, no ID reuse; next fresh call can launch / P2/P5 |
| Client exits | accepting → stopping → closed | launch/queue/browser | Reject queued work and reap owned browser, then exit / P5 |

## P1 — Validate tools and preserve the six existing calls

**Files:** package.json/lock, src/index.ts, server.ts, browser-session.ts, browser-actions.ts, tool-schemas.ts, results.ts; tests/helpers.mjs and protocol.test.mjs. Consumes current source behavior; produces createServer, result helpers and SDK client harness. Initially extract the existing getPage/close behavior into withPage/closeBrowser/shutdown and the six existing actions into performPageAction so P1 builds independently; P2 replaces session internals and P3 extends actions. Do not register unfinished new tools in P1.

- [ ] Inspect applicable AGENTS and execution/testing skills; use the existing feature branch. Check installed versions and baseline build after approval. Adopt Node `>=22.15.0`; test Node 22 and 24 in CI. Keep locked Puppeteer 24.41.0 and SDK 1.29.0 initially, add direct Zod `^4.3.6` already compatible with the SDK lock. Align Node types to major 22, remove unused ts-node. Refresh lock only through npm; audit before accepting version choices. Compatible fixes may update patches; a required major/behavior change needs an amendment.
- [ ] Add scripts `test:unit` = `node --test tests/protocol.test.mjs`, `test:integration` = `node --test --test-concurrency=1 tests/session.test.mjs tests/actions.test.mjs tests/screenshot.test.mjs tests/lifecycle.test.mjs`, `test` = `npm run build && npm run test:unit && npm run test:integration`. Build-first individual runs are mandatory. Fixtures include input, select, delayed DOM, navigation, popup, long page and hung-script routes; bind only localhost on a random port.
- [ ] Add failing tests `legacy_names_remain`, `invalid_arguments_do_not_launch`, `write_results_do_not_echo_values`, `error_messages_do_not_echo_script`. Assert old tool names are present; wrong types/unknown tools cause errors with launch count 0; `assert.equal(replyText.includes(secret), false)` and the same for stderr. Throw a page error whose message contains a unique secret; it must be replaced by a fixed diagnostic.
- [ ] Run `npm run build` then `npm run test:unit`; record actual failure showing missing validation/redaction, not a broken fixture.
- [ ] Implement high-level registerTool/Zod registration for the original six tools, fixed sanitized errors and typed output. Keep stdout protocol-only. `valueResult(undefined, 25000)` returns a valid explicit undefined representation. Oversized values return a valid JSON envelope with a bounded preview, not broken JSON. Content excerpts must have actual content <= selected max_chars plus a small metadata envelope. Unsupported values produce a serialization error without their contents.
- [ ] Re-run P1 checks; assert text limit boundaries at 25,000/100,000 and one beyond, Unicode and JSON parseability. Add useful tool annotations; arbitrary click/type/fill/evaluate/key actions must never be labeled read-only. Commit passing P1 changes and regenerated build files.

## P2 — Own tabs and stop failed work safely

**Files:** src/browser-session.ts, server.ts, browser-actions.ts; tests/session.test.mjs. Consumes P1 registration/results; produces BrowserSession contract above and tab tools.

- [ ] Write failing real-browser tests: `one_launch_for_concurrent_calls`, `implicit_target_tracks_switch`, `stale_id_never_targets_replacement`, `popup_does_not_steal_active_tab`, `queued_expiry_never_executes`, `old_generation_events_are_ignored`, `launch_failure_allows_retry`. Assertions: one browser launch; switched tab receives the text; stale tab yields error; fresh tab ID differs after restart; expired callback count stays 0 even after preceding operation finishes.
- [ ] Run `npm run build` then `node --test tests/session.test.mjs`; verify the intended failure.
- [ ] Implement monotonic tab IDs and generation-scoped listeners. FIFO queue waiting has its own timeout equal to requested timeout_ms; start execution timer only when dequeued. Validate before enqueueing. On timeout of queued work, remove/mark it permanently canceled. Capture implicit active tab at execution start, then never re-resolve during that action. Unknown explicit IDs never launch a browser. new_tab navigation failure closes its new tab and restores previous active tab if still live. Limit cleanup to owned targets/processes.
- [ ] For running timeout, abort supported Puppeteer waits, stop issuing further action stages, and close the affected page with runBeforeUnload false. Allow 2 seconds to confirm close; otherwise terminate the owned browser, clear its generation and reject already queued work. Allow a further 3 seconds for termination confirmation; if it fails, mark the session unusable and require restart rather than releasing unsafe work. Do not mistake disconnect for process death. Use the tracked child handle; on Windows use a no-shell process-tree termination helper limited to that live owned PID. No generic Chrome process cleanup. On any timeout requiring recovery, reject previously queued work so implicit commands cannot move to a replacement tab. Report effects may already have occurred; never retry.
- [ ] Test close-active, close-last, repeated close_browser, externally killed browser, recovery after launch failure, and controlled delayed work attempting a mutation after its timeout. Use a local fixture hit counter and assert no hit after confirmed cleanup. Test late events cannot repopulate registry. Then run P1+P2 suites and commit.

## P3 — Implement forms, waiting and reliable navigation

**Files:** src/browser-actions.ts, tool-schemas.ts, server.ts; tests/actions.test.mjs. Consumes withPage; produces performPageAction for navigate/click/type/get_content/evaluate/fill/select_option/press_key/wait_for.

- [ ] Write failing tests `type_appends_fill_replaces`, `empty_fill_clears`, `native_select_and_keys`, `four_wait_states`, `click_waits_for_navigation`, `failed_click_leaves_no_navigation_listener`, `invalid_url_does_not_launch`. Assert input value becomes `ab` after two types and `c` after fill; empty fill yields empty string; all four wait states resolve correctly; failed click produces one error without later unhandled rejection. Test hidden present element differs from detached element, disabled controls and elements replaced during waiting.
- [ ] Run `npm run build` then `node --test tests/actions.test.mjs`; record intended failures.
- [ ] Implement Puppeteer locators for click/fill where appropriate, append-only type, native select and supported key validation. Use one operation deadline across multi-stage actions. For navigation-aware click, install the navigation watcher first and settle/cancel it on every exit path. Navigate defaults to domcontentloaded; explicit wait_until overrides it. HTTP/HTTPS/about:blank only. wait_for defaults to visible; distinguish hidden from detached through DOM presence checks, not a shared hidden shortcut.
- [ ] Evaluate must preserve string-as-script semantics without executing on the Node host. Handle undefined, objects, promises and serialization failures explicitly; running limits still come from P2. Add infinite-loop and never-resolving Promise cases in P5. Sanitize exceptions and input errors; include no raw script in errors.
- [ ] Test all old tools through the SDK client on local fixtures, including full-page/selector HTML, missing selector, failed navigation followed by a successful call, Unicode, empty values, dropdown nonmatches and invalid keys/timeouts. Run P1–P3 suites and commit.

## P4 — Return bounded screenshots and content

**Files:** src/browser-actions.ts, results.ts, tool-schemas.ts, server.ts; tests/screenshot.test.mjs. Consumes P2 page ownership/P1 responses; produces screenshot handler and final bounded content behavior.

- [ ] Write failing tests `viewport_jpeg_is_decodable`, `selector_and_full_page_capture`, `incompatible_capture_options_rejected`, `pixel_limit_counts_device_scale`, `image_byte_limit`, `layout_growth_rechecked`. Assert MCP image MIME is image/jpeg; decoded dimensions match the requested region; pixel count <=16,000,000 and encoded JPEG bytes <=5*1024*1024. Test exactly-at/over boundaries using pure bound helpers; real browser checks validate those helpers against actual dimensions.
- [ ] Run `npm run build` then `node --test tests/screenshot.test.mjs`; verify intended failures.
- [ ] Implement JPEG capture at fixed documented quality 80. Measure capture bounds using device scale before capture; validate final JPEG dimensions and byte size after capture as well. Refuse oversized requests before capture where measurable; reject growth races after capture. Return MCP image content with tab metadata and no filesystem writes. Selector/full_page=true are mutually exclusive. Do not change the user's viewport just to fit a limit.
- [ ] Add content-limit tests at default, explicit smaller limit and 100,000; test serialized Unicode and huge evaluation output without invalid JSON. Browser serialization remains bounded by execution time, not a promise of safety against arbitrary hostile scripts exhausting machine memory; document that limitation.
- [ ] Run P1–P4 suites, inspect one actual captured fixture image, and commit.

## P5 — Verify interruptions, privacy and process cleanup

**Files:** src/index.ts, browser-session.ts; tests/lifecycle.test.mjs, helpers.mjs. Consumes complete server/session; produces real stdio lifecycle guarantees.

- [ ] Write failing tests `stdio_close_reaps_browser`, `shutdown_during_launch`, `shutdown_with_queued_work`, `infinite_script_is_stopped`, `never_resolving_script_is_stopped`, `no_secret_in_failure_logs`, `restart_after_forced_recovery`. Track owned process handles from a test child harness; do not add public debug tools. Assert server exits within a bounded test deadline and every tracked owned process exits. Validate outcomes through the SDK transport as well as session-level fault injection.
- [ ] Run `npm run build` then `node --test tests/lifecycle.test.mjs`; verify failures are meaningful and cleanup failures do not strand test browsers.
- [ ] Implement a single idempotent shutdown path shared by transport EOF, SIGINT/SIGTERM and fatal errors. Stop admission, cancel queued calls, abort ongoing work, settle launch results and close/terminate only owned processes. If launch finishes after shutdown begins, close that new browser immediately. Await cleanup, close transport and exit; don't call process.exit before cleanup completes. On Windows test EOF and supported termination separately rather than assuming Unix signal behavior.
- [ ] Verify loss-of-page errors never replay actions; test secrets deliberately embedded in field values, thrown exceptions, invalid selector strings and unknown arguments remain absent from write replies and stderr. Privacy assertion applies to errors and write responses; deliberate page reads may contain secrets.
- [ ] Run full `npm test`; additionally repeat the concurrent-launch/timeout/restart scenario 20 deterministic cycles because these lifecycle races justify repeated testing. Record seeds/sequence and observed process cleanup, not just elapsed time. Commit once passing.

## P6 — Make the release checks reproducible

**Files:** README.md, package.json/lock as needed, .github/workflows/ci.yml, build/*.js; docs/superpowers/plans/2026-11-06-browser-controls-verification.md (created during implementation, not fabricated now).

- [ ] Add CI matrix windows-latest/ubuntu-latest on Node 22 and 24: clean checkout, npm ci, npm test, then `git diff --exit-code -- build` to verify committed generated output. Pin checkout/setup-node actions to verified upstream commit SHAs when authoring the workflow. Do not skip tests to make CI green. Use Puppeteer's supported headless launch without disabling its sandbox as a default fix.
- [ ] Document all tools, arguments, limits, typed/filled secret handling, changed DOM-ready navigation default, local-only transport, supported runtime, `PUPPETEER_MCP_HEADLESS=true` option and recovery behavior. Explain that a forced recovery may close the browser and discard its tabs, and cannot undo an action already sent to a website. Preserve ISC declaration and correct repository/bugs/homepage URLs. No npm publication or Agensi listing in this task.
- [ ] Run npm audit and inspect production/transitive findings. Apply compatible dependency fixes, re-run affected tests, and record unresolved advisories with reachability rather than claiming safety from an audit count. Block readiness on an unresolved reachable serious defect. Confirm the lock's selected browser version is supportable; if a major Puppeteer change is necessary, amend the plan before adopting it.
- [ ] Run clean-install verification `npm ci`, `npm test`, `git diff --check`, and generated-build consistency once final changes are in place. Perform a Windows headed-browser smoke test with local fixtures: open two tabs, switch, fill, capture, close active tab, recover from external browser closure, exit. Record actual outcomes and software versions. Local Windows success does not prove Linux CI or macOS support.
- [ ] Have an independent reviewer inspect the final diff and test evidence, concentrating on queue cancellation, stale events, target ownership, data leakage and shutdown. Fix valid findings with regression tests; run affected checks then the final full suite. Do not mark ready if a required check is missing or failing. Report external CI as pending unless it actually ran; do not invent a successful remote run or publish solely to obtain it.
- [ ] Save verification evidence, known limits, tested platforms and review results; commit the completed work. Present changes and evidence for the user's requested next action. Never describe the software as proven bug-free.

## Coverage and handoff

Spec mapping: D1 incremental upgrade throughout; D2 compatibility/dependencies P1/P6; D3 tools P2–P4; D4 state/privacy/limits P1–P5; D5 evidence P1–P6; D6 free local scope and gates P6; D7 coverage here. Self-review checked interface names, task ordering, all five Review Focus cases and both document views.

Skills applied: superpowers:writing-plans defines testable steps; dummy-plan provides the paired plain view; conductor state-transitions adds interrupted/restarted consumer checks. Previously read external MCP Builder guidance informs runtime schemas, valid MCP results and local stdio. Current SDK types, installed Puppeteer APIs and real-browser tests must verify implementation assumptions. No implementation/testing skill has been executed yet.

References: [Node 22 test runner](https://nodejs.org/download/release/v22.15.0/docs/api/test.html), [Puppeteer page close](https://pptr.dev/api/puppeteer.page.close), [owned browser process](https://pptr.dev/api/puppeteer.browser.process). Online Puppeteer docs currently describe v25; type-check against installed v24 and use version-matched upstream sources when an API differs.

Next action: obtain approval of this plan pair and execution method. Recommended native implementation in this chat plus an independent final review because the session/action interfaces are tightly coupled. Subagent-driven implementation with review after each task is available if the user prefers.

You can say: Change P6 to require additional operating-system checks before calling it ready.
