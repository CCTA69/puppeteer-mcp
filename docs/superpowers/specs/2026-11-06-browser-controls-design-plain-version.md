# Browser controls upgrade design (Plain Version)

Make your free browser tool more useful and dependable while keeping existing connections working.

[Technical Version](2026-11-06-browser-controls-design.md)

Status: you approved this design on 6 November 2026 and reaffirmed reliability as the priority. No product code has changed and no tests have run. The implementation plan is the next review step.

## D1 — Improve what is already there

You chose screenshots, tabs, forms, waiting and reliability. We will extend the existing project rather than rebuild it. That gives people useful features while reducing the chance of breaking their current setup. A rewrite or an online hosted service would add work and migration without helping this goal. This is a moderate upgrade, not a tiny patch.

We found six basic tools, no automated tests, text entry that repeats what was typed back into the chat, and weak handling of a manually closed browser. The checks below must address those weaknesses. Nobody can guarantee software has zero bugs.

## D2 — Keep existing setups working

Keep the same connection method, launch commands and six existing tool names. Existing typing will still add text; the new fill tool will replace it. Responses may be clearer, so their exact wording can change. We will test the old calls alongside the new ones.

Keep the current major version of the MCP connection library for this upgrade. Its newer version is available, but the current one now receives only bug and security fixes. Moving to the new major version would be a separate migration. We will check compatible dependencies and correct the installation instructions and outdated repository links. A supported Node version, the software that runs this tool, may be required instead of the very old version currently suggested. Keep the existing ISC license declaration without guessing an author's name.

## D3 — Add useful controls

- Take a picture of the visible page, full page, or one element and return it directly to the assistant. Pictures over 16 million pixels or 5 MiB are rejected with a helpful message. Nothing is silently cropped or saved to a file.
- List, open, switch and close tabs. Each tab gets an identifier so a command can target it explicitly. Without one, commands use the active tab.
- Replace or clear text in a field, choose native dropdown options, and press keys. Custom dropdowns can still be operated with clicks.
- Wait until an element appears or disappears. Clicking can optionally wait for a new page to load, avoiding a missed page change.

Navigation will normally return when the page's initial document is ready; waiting for network activity to settle remains an option. This prevents pages with continuous background traffic from getting stuck, but callers may need an explicit wait before reading later-loading content. Check every new control against local sample pages with predictable results.

## D4 — Recover clearly from failures

Run browser commands one at a time in arrival order so they cannot accidentally interfere. Commands normally have 30 seconds to finish, adjustable from 1 to 120 seconds. Waiting commands also have a limit. A command reported as timed out must not unexpectedly act later. If an unresponsive page must be closed to stop a command, report that clearly.

If a tab closes, its old identifier must produce an error. Commands without an explicit tab use the active tab while it remains open. Only when that tab closes or is missing do they activate the oldest remaining tab, or create a blank one. Newly opened popups are listed but do not silently become active. If the browser closes, a later command may start a fresh browser. Never automatically repeat a click or form entry that might already have happened. Tab identifiers will not be reused. Closing the tool must also clean up the browser it started.

Keep a separate fresh browser session, visible by default, with an option to run without a visible window. Do not connect to the user's personal signed-in browser. Reject malformed commands before opening a browser. Ordinary website addresses and blank pages are supported; other address types are rejected. Local development websites remain supported.

Stop repeating entered values and scripts in replies or logs. Reading a page or taking its picture can still expose what is on that page; this upgrade does not hide sensitive page content automatically. Existing page-script execution remains a powerful capability.

Keep large text replies manageable: normally up to 25,000 characters, optionally up to 100,000. Clearly report when content was shortened. Results must remain readable by the connected assistant, including when a script returns no value. Test wrong arguments, oversized results, crashes, concurrent requests and recovery.

## D5 — Prove it works before calling it ready

Build automated checks using local sample pages and a real browser. They must cover all six old tools, every new control, missing elements, wrong tab identifiers, externally closed tabs and browsers, long-running scripts, timeouts, repeated close commands and overlapping requests. Check that timed-out commands never perform a delayed action on another tab.

Also connect a real MCP client through the normal launch command to verify messages and images arrive correctly. Check screenshots are valid, typing adds text, filling replaces it, secret test values are not repeated by writing tools, and stopping the tool leaves no browser running.

Check the project builds, review dependency compatibility and reported vulnerabilities, review the changes, and manually try a visible browser on Windows. Add automatic checks for Windows and Linux. Report what passed locally separately from checks run on GitHub. Do not claim macOS or every assistant app was tested. Any known reproducible defect or failing required check prevents calling the upgrade ready. Even passing all checks cannot prove the absence of every bug.

## D6 — Keep this release focused

This is a free community improvement. It does not add fees, accounts, online hosting, website-audit reports, personal browser profiles, extensions, file-upload/download management or automatic publication on Agensi. Running it uses the user's own computer.

After you approve this design, you will receive the implementation plan for review before coding. The builder can choose internal file organization and test tools; changes that affect what users get must be brought back for review.

## D7 — How the design was checked

The project inspection and your chosen direction shaped this design. The MCP Builder guidance informed argument checks, responses and cleanup. The brainstorming and plain-language planning guidance require a matching design review before building. A separate reviewer found an ambiguity about which tab receives commands; both versions now clarify that the active tab is used until it closes. No other important missing decisions were identified. The matching sections and links were checked. Implementation and testing are still pending.

You can say: Change D3 so screenshots capture the full page by default.
