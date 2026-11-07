# Browser controls verification

Branch: `feat/browser-controls-upgrade` in Try_2/puppeteer-mcp. Plan and amendment A1 approved. Native implementation with an independent final reviewer requested. Evidence collected on Windows, 6–7 November 2026 (Asia/Singapore).

## Before independent review

- Baseline: the old server built. Five of six first regression tests failed: write-value echo, raw evaluation error, accepted extra arguments, malformed undefined result, and unbounded output. Initial npm audit flagged 18 packages.
- Final lockfile clean installation succeeded. Puppeteer 25.16.0, Chrome for Testing 156.0.8078.47, MCP SDK 1.32.2, Zod 4.6.7. Separate `npm audit --json`: zero known vulnerabilities.
- Windows Node 22.15.0: `npm test` built TypeScript and passed 32 tests (6 protocol, 26 integration), zero failures or skips. `npm run test:stress` passed all 20 cycles (one additional test). The stress test checks each owned browser process exits.
- Headed Windows smoke: opened two fixture tabs, switched, filled a field, inspected the resulting JPEG, closed the active tab, externally closed the identified Chrome window and successfully ran a command in a fresh browser. Initial smoke exposed a redundant termination attempt after Chrome exited. The regression test failed before the fix and passed after it; the repeated headed smoke exited successfully without the diagnostic.
- Screenshot validation included decoding returned JPEGs in Chrome and checking dimensions and color; visually inspected a 120x60 red element and the 800x600 headed fixture. Pixel/byte caps and layout growth are covered.
- Dependency and build decisions: use the approved Puppeteer 25 major update, keep SDK v1, use Node's built-in test runner. Discover popup tabs by reconciling live pages during operations to avoid stale asynchronous registration. Keep the 20-cycle stress test a separate command, required by CI.
- CI configured for Windows and Ubuntu, Node 22/24. Actions pinned to verified upstream release commits. Ubuntu uses its installed Chrome sandbox profile; Windows uses Puppeteer's bundled browser. No remote CI run or macOS check is claimed.

## Independent review and final results

An independent reviewer examined commit `812f4d4` and recommended holding it back. All seven findings were reproduced and fixed. Ten targeted regression tests passed on the revised code:

| Finding | Behavior verified after the fix |
| --- | --- |
| Typing or pressing a key could write to the previously focused field. | A disabled target rejects input; typing stops if focus moves during entry. |
| Losing a click acknowledgement could trigger a duplicate click. | The fixture receives exactly one click even if its acknowledgement is lost. |
| Canceling a client request left browser work running. | Queued writes are removed; an interrupted running operation cannot continue against the old page. |
| A delayed timer let expired work start. | The queue checks the deadline before dispatch even when the event loop was busy. |
| Browser protocol debugging could print private request content. | Request content stays out of the server's diagnostic stream with protocol debugging enabled. |
| The visible tab could disagree with the selected tab. | A targeted background click reaches its intended tab and restores the selected tab. Closing the selected tab brings a surviving tab forward. |
| Clearing a field could leave the application's form state unchanged. | The fixture receives the change and its model matches the cleared field. |

| Final local run (Windows) | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Node 22.15.0 | 45 | 0 | 0 |
| Node 24.22.2 | 45 | 0 | 0 |

Each run included six protocol tests, 38 integration tests and one stress test covering 20 consecutive browser launch, timeout, restart and close cycles. The visible Windows browser smoke test also passed again after the fixes, including external window closure and a successful restart. Windows shutdown coverage uses real end-of-input and simulated delivery of SIGINT/SIGTERM to Node; real POSIX signal delivery requires a POSIX runner.

The reviewer examined the pre-fix revision; the revised code was verified by regression tests and full local runs, without a second independent sign-off. No reported finding was deferred. GitHub CI has not run on this local branch, and macOS was not tested. Passing tests do not guarantee the absence of all bugs.

Implementation decisions: the existing dedicated Try_2 checkout was reused. A PowerShell progress ledger replaced the Bash helper for recordkeeping. Tab listing was implemented early to verify that invalid arguments never launch Chrome. Live tab reconciliation trades an extra browser query for reliable popup discovery. The 20-cycle stress test runs separately on Node 22 and is required in CI. The only major dependency change to the approved plan was amendment A1.
