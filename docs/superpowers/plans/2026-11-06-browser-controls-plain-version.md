# Browser Controls Implementation Plan (Plain Version)

Upgrade the browser tool, test its failure cases, and hold back any ready-for-use claim while required checks fail or a known reproducible bug remains.

[Technical Version](2026-11-06-browser-controls.md)

You approved this plan on 6 November 2026, including implementation here, an independent review, and the browser library upgrade below. The work is complete locally. The [verification report](2026-11-06-browser-controls-verification.md) lists what the reviewer found, how the fixes were tested, and what remains unverified.

### A1 — Approved dependency change

The initial vulnerability check found 18 affected packages. Fixing the browser library's reported issues requires moving Puppeteer from version 24 to version 25.16.0 and downloading its newer Chrome. The Node version already chosen supports it. Also update the connection and argument-checking libraries within their current major versions. Keep the tool commands unchanged and run all planned tests against the new versions. This may require internal adjustments but adds no user-facing features or fees. You explicitly approved moving to Puppeteer 25.

## P1 — Check commands and keep existing tools working

Keep the six old tool names, the existing launch method and typing behavior. Check every command's arguments before opening a browser. Stop repeating typed values, scripts and raw error messages that could contain private information. Keep large replies readable and clearly indicate shortened content.

Use the existing compatible browser and connection libraries initially, adding a direct dependency on the argument-checking library already present. Check reported vulnerabilities before accepting versions. Require Node 22.15 or newer, the software that runs this project, and check Node 22 and 24 automatically. If fixing a problem requires a major change, update the plan first.

Check old calls and deliberately invalid commands through a real assistant connection. Confirm bad calls do not open a browser and secret test values never appear in writing-tool replies or logs. Write a test that fails first, then fix the behavior and rerun it before saving each completed step.

## P2 — Make tabs and recovery predictable

Add tab listing, opening, switching and closing. Commands use the active tab unless they name another one. Popups do not steal the active tab. A closed tab's identifier never gets reused. If the active tab closes, choose the oldest remaining tab; create a blank tab only when needed.

Run commands in order. Both waiting in line and executing have time limits, normally 30 seconds each and adjustable from 1 to 120 seconds. An expired waiting command is removed permanently. A running command that cannot be stopped safely causes its target page to close. If closure cannot be confirmed within two seconds, stop the browser owned by this tool and allow three more seconds to confirm it has stopped. If that fails, require restarting the tool instead of allowing uncertain work to continue.

Recovery rejects commands already waiting so they cannot accidentally act on a replacement tab. Never repeat an action that might already have happened. A browser restart can lose its open tabs; an action already sent to a website cannot be undone by stopping the browser.

Check simultaneous first commands open only one browser, closed tabs give clear errors, late events cannot corrupt a restarted session, and commands reported as expired never act later. Failed browser starts must allow a later retry. Test cleanup only against browsers started by this tool.

## P3 — Add forms and useful waiting

Add replacing/clearing a field, native dropdown selection, key presses and waiting for elements. Keep old typing as adding text. Clicking can explicitly wait for navigation, with the watcher installed before the click. Ordinary navigation waits for the initial document to be ready; a caller can request a longer wait.

Check empty text, Unicode, missing/replaced/disabled elements, wrong keys, invalid time limits, failed navigation and all four waiting conditions. A failed click must not leave a background watcher that produces another error later. Preserve existing page-script execution, but return valid responses even when it produces no value or an unsupported result.

Only ordinary HTTP/HTTPS website addresses and a blank page are accepted. Local development websites remain supported. Do not echo supplied private content in errors. The tool still uses a separate fresh browser, visible by default, rather than the user's personal signed-in browser.

## P4 — Add screenshots with clear limits

Return a picture of the visible page, full page or selected element directly to the assistant. Use JPEG with quality set to 80. Do not save screenshots to disk. Reject conflicting screenshot options and images over 16 million pixels or 5 MiB, including on high-resolution screens or pages that grow while being captured. Do not crop or shrink the user's page silently.

Check actual image contents and dimensions, including a visual inspection of a captured sample page. Text replies normally contain up to 25,000 characters and can request up to 100,000; check the limits and ensure shortened results remain readable by the assistant.

Reading page content or taking screenshots can expose information on the page; this is not automatic privacy masking. Existing page scripts are powerful: time limits and response limits do not make arbitrary hostile scripts safe against exhausting the computer's memory. Document that limitation rather than claim otherwise.

## P5 — Test interruptions and cleanup

Stopping the assistant connection must stop this server and its owned browser. Test stopping during startup, during a command and with more commands waiting. Test an endlessly running script, a script that never returns, an externally closed browser and successful recovery afterward.

Check private markers embedded in inputs and exceptions never leak through writing-tool replies or logs. Deliberate content-reading calls are exempt because returning page content is their purpose.

Run the full test suite, then repeat the important startup/timeout/restart sequence 20 times to look for timing failures. Record whether processes actually exited. Prevent the test system itself from leaving browsers behind. A command may have had effects before failure, so the tool must report uncertainty without repeating it.

## P6 — Make readiness depend on evidence

Add automatic GitHub checks for Windows and Linux using Node 22 and 24. Check a clean installation, all tests and that the saved runnable files match the source. Review dependency vulnerability reports and fix relevant compatible issues. A necessary major library change comes back for plan review first.

Update installation instructions, every tool's usage, changed defaults, limits, recovery behavior, repository links and the option to run without a visible browser. Keep the existing ISC license declaration. This stays free and local; no publishing, hosted accounts, payments or Agensi listing is part of this upgrade.

Manually try a visible browser on Windows using local sample pages: open and switch tabs, fill a form, capture a picture, close a tab, recover after the browser closes and exit cleanly. Ask an independent reviewer to inspect the finished changes and the test evidence. Fix valid findings and rerun the affected checks and final full suite.

Report exactly what passed and what remains unverified. Local Windows checks do not prove Linux checks passed; GitHub checks stay marked pending until they actually run. Do not claim macOS or every assistant app was tested. Known reproducible bugs, missing required checks or failing required tests block a ready-for-use claim. Even all tests passing cannot prove the absence of every possible bug.

## Review and next action

The implementation steps were checked against the approved design, including failures during tab switching, timeouts and restart. Both document versions cover P1–P6 and link to each other. Coding and testing are still pending.

Recommended approach: I implement these tightly connected changes here, then an independent reviewer checks the whole result. Alternatively, separate implementing and reviewing agents can handle each step, using more processing for additional review points. Approving this plan and choosing an approach unlocks implementation.

Skills used: writing-plans structured the test-and-fix steps; dummy-plan produced this matching plain-language version; the workflow's state-transition guidance added checks for interrupted work and recovery.

You can say: Change P6 to require additional operating-system checks before calling it ready.
