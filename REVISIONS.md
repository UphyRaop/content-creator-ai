# CCAI User Revisions and Preferences

## 19 November 2026 — Autonomous Phases 7–11
- User attached the autonomous multi-agent development protocol and authorized Phases 7–11 without inter-phase approval.
- Keep the RM20 API budget untouched; incur no paid APIs, hosting, subscriptions, or external services.
- Preserve all prior Phase 1–6 functionality, project data, SQLite architecture, static Pages compatibility, public main, and private backup.
- Do not expose credentials; do not force-push or rewrite history.
- Each phase requires independent QA and verified deployment before the next phase starts.
- Continue using simulated generation until separately authorized; distinguish simulated functions from production capabilities.


## 19 November 2026 — autonomous multi-agent protocol
- User supplied the CCAI protocol authorizing Phases 7–11 to complete sequentially with labeled native agents, independent QA, deployment and documentation. No inter-phase approval is required.
- Preserve RM0 cost, leave RM20 unused, keep current static Pages preview and private backup, use noreply commits, and never rewrite history without approval.
- Report actual model/reasoning/Fast Mode only if the runtime exposes them; otherwise state not verifiable.
- Final QA exposed public-history personal email metadata, disabled HTTPS enforcement, unauthenticated SQLite CRUD APIs, and no persistent Node production host. These remain release blockers; do not declare production readiness.
# 2026-11-19 — Phase 12–14 production readiness continuation
- Hardened Gemini accounting to keep the conservative preflight estimate when provider token usage is missing or malformed.
- Hardened FLUX image retrieval: output URL must be HTTPS on an exact server-configured hostname; credentials/custom ports and redirects are rejected. Added empty `CCAI_FLUX_OUTPUT_HOSTS` configuration documentation and safety tests. No live provider calls made.
- Added HTTP-level fail-closed gates for non-simulated script/image providers and Cloud Run render requests until metered durable admission is active; local simulated/authorized render tests remain available.
- Added mocked Gemini, FLUX and ElevenLabs adapter tests with stubbed fetch; bounded FLUX polling to 120 seconds. No network provider access.
- Versioned SQLite cloud-ledger migration preserves prior emergency-stop state transactionally; emergency stop is installation-wide; public reservation create/release stay disabled (503) until trusted telemetry and worker reconciliation are in place.
- Added Google Cloud architecture readiness review and updated project status/continuity docs. No GCP resources, paid services, DNS, or API usage; RM0 spent.

## 2026-11-20 — CCAI branding and safe preview entry
- Rebranded the application shell with exact brand tokens, CCAI mark, Creator Studio metadata/favicon, loading screen, and requested footer/company copy.
- Added seven-tap logo behavior leading to an unavailable-only Developer Mode preview notice. Added owner-authenticated, same-origin, disabled server route and focused security test.
- Closed cloud render retry and post-production admission gaps with the same fail-closed cloud gate; added route-guard fixtures.
- Automated functional and build suites passed. Chromium/Playwright runtime failed to start in the sandbox (SIGTRAP/Crashpad permission), so screenshots and requested exact viewport runtime checks were not completed.
- No live AI or cloud work, DNS changes, hosting spend, or data migration. RM0 used.


## 2026-11-20 — Developer Preview Mode and automated device QA (local PASS; remote pending)
- Replaced the hidden seven-tap unavailable-notice behavior with an authorized UI-only simulator for the six target viewports. The app itself renders live in a same-origin iframe; no screenshots are used to simulate devices. Existing project browser storage and approval workflow remain in the child application.
- Added zoom/fit controls and save/sync behavior on exit. Privileged Developer Mode stays unavailable.
- Added a Playwright GitHub Actions workflow with retained screenshots/reports. Local Chromium QA passed all six exact viewport sizes and the desktop-only simulated 13-stage walk-through, gate matrix, and exit/reopen state checks (9 passed, 15 expected skips). During QA, fixed the 2px iframe sizing defect, a Stage 5 preview render error, and project selection restoration.
- Regression tests, TypeScript, static and Next production builds, script syntax/security-pattern checks, and diff check passed. Pages deployment run `44683636101` succeeded. First Playwright Actions run failed before job creation because `NO_PROXY` and `no_proxy` were duplicate case-insensitive environment keys; the lowercase key has been removed and the workflow rerun is pending.
- No live AI, paid service, cloud resource, database migration or user-data overwrite occurred.
