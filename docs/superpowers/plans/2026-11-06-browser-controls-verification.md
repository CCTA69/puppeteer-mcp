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

Independent review and additional verification results follow after they have run. Tests do not guarantee the absence of all bugs.
