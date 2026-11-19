# PROD-QA-01 — production availability and integration audit

## Disposition

**API/build regression status: PASS. Lead-reported browser E2E: PARTIAL, reached stage 10 with fixes pending rebuild and test media path. Browser/mobile flow was not run by this QA agent.** All automated checks used isolated temporary SQLite files, synthetic records, and simulated providers. No deployed preview data was accessed or changed, and no paid provider calls or external network requests were made. A local Next server was left running on `127.0.0.1:3101` at the lead's request for UI E2E; it uses `/tmp/ccai-prod-qa-01.sqlite`, synthetic credentials, live-provider gates off, and `/bin/false` for FFmpeg. Only disposable `PROD-QA-01` projects/account rows exist in that database.

## Environment

| Capability | Result | Evidence / limit |
|---|---|---|
| Node / npm / Next | Available | Node 24.22.1, npm 11.9.0, Next 15.5.29 |
| SQLite | Available | `node:sqlite` 3.53.4; all route fixtures isolate `CCAI_DATABASE_PATH` |
| FFmpeg / ffprobe | Available | 7.1.5; renderer fixtures create and probe real MP4 files |
| Chromium | Available | `/usr/bin/chromium`, v156.0.8078.79 |
| Playwright / Puppeteer | Not installed | No automated browser driver package available |
| Loopback | Available with explicit local-only network grant | Next production server started at `127.0.0.1:3101`; mutations required `Origin: http://localhost:3101` because Next's observed request origin uses localhost. Mismatched origin returned 403. |
| Public/deployed browser data | Untouched | No request was made to the deployed preview; its seven existing projects were preserved. |

## Automated checks

| Check | Status | Evidence |
|---|---|---|
| In-process API route suite | **PASS** | `node --experimental-strip-types scripts/test-p11-http.mjs`: 77 checks, 0 failures. Covers fresh bootstrap, session/login/logout, same-origin writes, project/entity ownership, current/stale approvals, brief-change cascade, simulated saved-input script/image/voice, scene gates, render owner/gate checks, and voice-vault account isolation. |
| Auth/project/approval security fixture | **PASS** | `node --experimental-strip-types scripts/test-auth-api.mjs`: bootstrap and legacy claim, owner isolation, approval freshness/cascade, bounded request and per-email rate limit assertions passed. |
| Voice vault migration/route fixture | **PASS** | `node --import ./scripts/register-server-only-test-loader.mjs --experimental-strip-types scripts/test-voice-vault-security.mjs`: legacy encrypted account/settings/usage migration and tenant isolation passed; authenticated route guards passed. |
| AI routes and cost preflight | **PASS** | `node --experimental-strip-types scripts/test-ai-routes.mjs`: saved-source derivation, unpriced/unknown/over-cap zero-fetch rejection, and supplied test-fetch-only success passed. |
| FFmpeg render fixture | **PASS** | `node --import ./scripts/register-server-only-test-loader.mjs --experimental-strip-types scripts/test-ffmpeg-renderer.mjs`: six transitions, manifest approval/hash, gaps and timing, queue/cancel/retry, monotonic progress, byte-range parser, and real output profiles passed. |
| Post-production helper | **PASS** | `node --experimental-strip-types scripts/test-post-production.mjs`: audio metadata/trims/fades, default-off music, ducking, timing, immutable revisions passed. |
| Post-production MP4 fixture | **PASS** | `node --import ./scripts/register-server-only-test-loader.mjs --experimental-strip-types scripts/test-post-production-render.mjs`: derived playable MP4 probed; parent output preserved. |
| Publishing kit fixture | **PASS** | `node --experimental-strip-types scripts/test-publishing-kit.mjs` passed. |
| Legacy project workflow | **PASS** | `npm test` passed after adding a Node strip-types resolver for extensionless TypeScript imports in its test runner. |
| TypeScript | **PASS** | `npx tsc --noEmit` exited 0. |
| Static build | **PASS** | `npm run build:static` exited 0. |
| Next production build | **PASS** | `npm run build` exited 0 and listed all auth, project, entity, AI, render, stream/download, and post-production routes. |
| Inline JS syntax | **PASS** | Extracted the single inline `<script>` in `prototype.html` and parsed it with `vm.Script`. |
| Diff whitespace | **PASS** | `git diff --check` exited 0. |

## Real HTTP checks

A production Next server ran against the isolated `/tmp` database on port 3101. Local requests only; no external network was used.

- **PASS 6/6:** anonymous session and project denial; login; synthetic project creation; server brief approval; script generation from saved project using the simulated provider (client-forged text ignored); cross-origin mutation rejection; logout.
- A first draft of this HTTP check had an incomplete test project and expected `provider` at the wrong response path. The route correctly returned 400 for missing `scriptFormat`; after supplying a valid project and checking `usage.provider`, the final HTTP flow passed.
- A deliberate wrong Origin returned 403. The matching Origin in this setup is `http://localhost:3101`, although the server is bound only to `127.0.0.1`.
- The voice-account API was tested through imported route handlers (above), not over the live HTTP socket.

## Lead-reported CUA browser progress

The lead reports bootstrap and project creation succeeded, and the isolated browser flow advanced through stage 10. Three compatibility defects were found and fixed in the shared worktree:

1. New project validation rejected `timeline: null`; `src/lib/project-store.ts` was updated.
2. Timeline construction rejected the UI's image model (`image: true` with `imageData` and saved audio versions); the UI adapter was updated.
3. Real FFmpeg rendering looked for image bytes in `scene.image` instead of `imageData`/image versions; renderer asset lookup was updated.

After those fixes, the browser flow reached the expected render error while awaiting a rebuilt app and a valid test-media path. The lead has not yet reported a post-rebuild rerun, so successful completion of render and later stages remains **NOT VERIFIED**. These are lead-reported browser findings, not tests run by QA.

## Remaining untested / limited

| Area | Status | Limit |
|---|---|---|
| Browser 13-stage workflow | **PARTIAL / NOT VERIFIED** | Lead reports flow reached stage 10; three issues were fixed, but render and later stages await rebuilt app and corrected test-media path. No CUA/browser run by this QA agent. |
| Mobile/tablet breakpoints and touch behavior | **NOT TESTED** | No viewport emulation performed. |
| Browser console/runtime errors, theme switching, reload persistence, import/export UI | **NOT TESTED** | Requires browser UI interaction. |
| Live HTTP voice account operations | **NOT TESTED** | The route handlers passed in-process with an isolated DB and synthetic encryption key; live-socket endpoint was not exercised. |
| Live HTTP render range/HEAD/download and cancel/retry | **PARTIAL** | Route handlers and pure range parser are covered; HTTP 206/416/HEAD and stream lifecycle were not exercised over the socket. Renderer fixture covers actual MP4 output, cancellation, retry, and probe. |
| External Gemini/image/voice providers | **NOT TESTED by design** | Live provider flags were false; preflight tests use a supplied fake fetch only. |
| Production/deployed data | **NOT TESTED by design** | Preview localStorage/projects were deliberately not touched. |

## QA-only file changes

QA-owned changes: `docs/qa/prod-qa-01.md`, `scripts/test-p11-http.mjs`, `scripts/test-project-store.mjs`, and the PROD-QA-01 entry in `TASKS.md`. Shared worktree also contains product edits from the implementation team, including the reported validator, UI adapter, and renderer fixes; QA did not make those product edits. No commit or push was made.


## Lead's resumed final browser verification — 19 November 2026

The lead completed a fresh isolated local Node/SQLite desktop run after the rebuild. Stages 1–13 completed using synthetic account/project data and simulated AI responses. The run includes actual local FFmpeg rendering, not the hosted Pages simulation. The MP4 played in-browser; an authenticated range request returned HTTP 206 (`bytes 0-1023/1161418`), and after export approval its download returned HTTP 200 with a valid MP4 signature. Post-production generated a separate completed render revision while preserving the original bytes; a thumbnail variant was approved and the export checklist was recorded. No CCAI-origin browser console warnings/errors were observed. Desktop viewport: 1212×798.

This browser control could not resize/emulate mobile or tablet, so those dimensions remain NOT TESTED. The deployed preview's browser-local projects were not changed. This lead-run evidence supersedes the earlier “awaiting rebuild/media” status above; the prior note is retained as the intermediate checkpoint only.


## Final Pages deployment verification — 19 November 2026

Commit `6bc9831852b7a378b500e652cb3531740ea09c65` is on `main` as a normal fast-forward and used the GitHub noreply identity. Pages workflow run `44542558589` succeeded through deploy. The custom-domain HTTPS response returned 200, contained expected CCAI markers, and its body hash matched local `dist/index.html`. Plain HTTP returned 200 without redirect. TLS verification was successful at the managed egress proxy, whose substituted certificate prevents direct inspection of GitHub Pages' origin certificate chain. Mobile/tablet viewport testing remains unsupported.

Dependency audit: `npm audit --audit-level=high` returned 0 vulnerabilities.
