# CCAI QA Record

## Phase 7 — Video Timeline and Editor (automated and independent code QA passed)
- Automated `npm test` suite passed for Phase 1–6 regressions and timeline approval gates, scene-aligned measured audio, estimated captions, non-destructive editing, speech overlap, undo/redo, snapping hooks, camera motion, transitions, clip-relative silence analysis/removal, same-track timing, and SQLite validation.
- Independent CCAI-05-QA code review passed after resolving cross-track undo/data corruption, scene speech drift, trimmed-source silence offsets, caption timing, ruler offset, touch alternative, first-image gap fallback, and same-track silence shifting.
- `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline prototype JavaScript `node --check`, and `git diff --check` passed.
- Browser QA could not run in this environment: CUA/browser automation tools are unavailable. Local Chromium is installed, but startup fails with a sandbox `setsockopt: Operation not permitted` error; local HTTP server startup is also denied. Desktop/mobile playback, visual transition fidelity, actual touch interaction, and storage/reload behavior therefore remain unverified.
- Provider generation is not triggered by timeline edits. No live AI calls or costs were used.


## Phase 7 deployment verification
- Commit `45438475cdedf4102b6d8c0bc28145b2a2aad4f2` implemented the editor. The initial Pages workflow failed because `npm ci` was missing.
- Workflow fix commit `9e050e77eede07a25c9236b265313190bcc7ab19` added `npm ci`; Actions run `44492004150` completed successfully.
- On 19 November 2026, `https://ccai.ur-project.biz/` returned HTTP/2 200 and served all editor markers. `/timeline-workflow.js` returned 200. The TLS handshake succeeded; egress proxy interception prevented independent inspection of the public certificate chain.
- GitHub REST confirmed the latest commit author and committer emails end in `@users.noreply.github.com`.
- Public source/artifact token-pattern scan: 50 text-like files scanned, zero flagged.

## Phase 8 — Video Rendering Engine (code/test QA and deployment passed)
- The first independent QA pass found and returned voice-gate bypass, image clip start/gap loss, rejected crossfades, accepted manifest clips beyond declared duration, non-monotonic progress, and full-buffer MP4 download. All were fixed before final QA.
- Focused `node --experimental-strip-types scripts/test-ffmpeg-renderer.mjs` passes: approved voice segments are required and referenced exactly once; malformed/oversized clips and clips beyond manifest duration fail; all six accepted transitions render; absolute image starts, explicit black gaps, caption timing and audio start are verified; render queue caps at one active plus five queued, queued/active cancellation works, failed media can be repaired and retried, progress stays monotonic, and output probes validate 1920x1080@30 and 1080x1920@60 MP4 with audio/caption evidence.
- The media suite produced real local MP4s using FFmpeg 7.1.5/libx264/AAC; temporary fixture files are cleaned by the test. All Phase 1–7 regression checks passed via `npm test`. `npx tsc --noEmit`, `npm run build:static`, `npm run build`, extracted inline JS `node --check`, and `git diff --check` passed. The Next build lists `/api/render`, `/api/render/[id]`, `/download`, and `/stream` routes.
- Independent CCAI-05-QA P8-QA-REVIEW-03: PASS for render logic, approval gates, bounded request input, safe `spawn` argument use, progress/queue/cancel/retry, output checks, bounded-memory download, and Pages simulation separation. The preview uses inline byte-range streaming; downloads stream from disk.
- Not tested end-to-end: actual Next HTTP status/headers for stream HEAD/200/206/416 or download, because the strip-types harness cannot import `next/server` directly; only pure byte-range parsing, typechecking and production route compilation passed. No browser test of the Node render path, rendered video player, iPhone/tablet layout, or mobile viewport was run.
- GitHub Pages has no Node/FFmpeg runtime, so the live preview cannot produce the video. The Pages render screen is a labelled simulation. No Node host exists, so the local engine is not a production-accessible service.
- Security scan covered 57 text source/artifact files: no common API token/private-key or personal-email patterns were found. Historical older public commits retain personal-email metadata; they were not rewritten. Cost RM0; RM20 budget untouched.
- Deployment is pending. GitHub Pages currently returns the HTTPS site, but the Pages API shows `https_enforced:false` and HTTP does not redirect. The connector lacks Pages settings writes; browser is signed out.

## Phase 9 — Post-Production Studio (independent code QA PASS; deployed)
- CCAI-05-QA P9-QA-01 reviewed uploaded music/voice/effects, bounded validation, immutable revisions, default-off music/ducking, Node FFmpeg mix, parent-render preservation, Pages simulation and job controls. A filtergraph-injection risk through user-controlled track IDs was found and fixed: IDs now use a strict safe alphabet and FFmpeg filter labels are generated from numeric indices. Malicious-ID tests reject punctuation payloads.
- `node --experimental-strip-types scripts/test-post-production.mjs` passed validation, trim/fade bounds, default-off music, duck targets, immutable revisions and malicious-ID checks.
- `node --experimental-strip-types scripts/test-post-production-render.mjs` passed real FFmpeg output validation: uploaded WAV tracks with trim, fades, volume and ducking produced a derived 1920x1080 MP4 with audio/video streams and expected duration; original render bytes remained unchanged.
- `node --experimental-strip-types scripts/test-ffmpeg-renderer.mjs`, `npm test`, `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline prototype `node --check`, and `git diff --check` passed. Production route build includes post-production, status, stream and download endpoints.
- QA reviewed the 32 MiB request cap, 12-track limit, 8 MiB/file and 24 MiB aggregate caps, audio allowlist, ffprobe checks, generated temp names, server-side source render ID/version lookup, safe argv invocation, and Pages no-fetch boundary.
- Limitations: fixture does not assert sample-level fade/ducking amplitude; post-production HTTP status responses and cancel/retry were not exercised end-to-end. Browser playback/waveform appearance and mobile/touch behavior remain unverified. This is a code acceptance PASS, not a full browser or production-host acceptance.
- Deployment verification: commit `1c3fc800efa8c3de1759c3e7ffec850b463888f5`, Pages run `44507225298` completed successfully. `https://ccai.ur-project.biz/` loaded in Chromium over HTTPS. The dashboard and labels were visible; existing browser-local test projects remained present. Mobile viewport and post-production interaction were not tested.

## Phase 10 — Thumbnail and Publishing Kit (automated/code acceptance PASS; browser checks blocked)
- `node --experimental-strip-types scripts/test-publishing-kit.mjs` passed 3+3 and 5+5 orientation counts, unique IDs, brand/reference context, one global approval across ratios, selected-variant regeneration, source immutability, upload PNG/JPEG/WebP allowlisting, malformed/SVG/oversized rejection, metadata normalization, and `autoPublish:false` export.
- Phase 8/9 regression fixtures passed: `scripts/test-ffmpeg-renderer.mjs`, `scripts/test-post-production.mjs`, and `scripts/test-post-production-render.mjs`. The Phase 1–7 `npm test` suite, `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline JavaScript `node --check`, and `git diff --check` also passed. Metadata edits and refreshed suggestions were retested to invalidate an already prepared checklist.
- Gate/security review: completed post-production gates thumbnail generation/upload; publishing kit requires post-production, thumbnail approval, and script approval. Approved thumbnails cannot be changed until explicitly unapproved. No social platform requests, OAuth, account connections, auto posting, or paid API calls exist. The Pages artifact clearly identifies thumbnail/render output as simulated and does not create an MP4.
- **PARTIAL:** seeded title suggestions are shortened by platform, but the editable title limits are generic rather than platform-specific. The project kit does not post content.
- **NOT TESTED:** browser-level file chooser size boundary, copy/download behavior, storage reload/quota, P10 stage interactions, runtime network instrumentation, desktop visual/theme review, mobile/touch layout. Local browser smoke was blocked because CUA refused `file://` and the managed environment refused local server binds (`listen EPERM`).
- Live deployment verification: `8efc7b73722f29b9ae851051edf9b6a910f4c496` deployed in Pages run `44511713809`. The custom-domain page loaded over HTTPS; a read-only DOM check confirmed the thumbnail and publishing UI markers. This proves the deployment artifact contains Phase 10 but does not replace interaction QA.
- **Security FAIL for repository state:** the working-tree scan found no common credentials, private keys, source email addresses or social/API endpoints. The full public Git history still exposes personal author/committer email metadata in three old commits (six identity fields); history was not rewritten. GitHub Pages also has `https_enforced:false`, and HTTP returns 200. No history or Pages security setting was changed.
- Cost RM0; no paid APIs/hosting or RM20 testing budget use.


## Phase 11 final QA — 19 November 2026 (Malaysia time)

### Automated QA results
- **PASS:** `npm test` (project storage, 18 checks).
- **PASS:** `node --experimental-strip-types scripts/test-ai-routes.mjs` — saved project input derivation; brief/script/image approval and scene ownership gates; Gemini unknown-rate, missing ceiling, unpriced-image and over-ceiling zero-fetch behavior. This tests pure gate/preflight helpers, not Next HTTP route handlers.
- **PASS:** `node --experimental-strip-types scripts/test-ffmpeg-renderer.mjs` — approved timeline manifest/hash; approved image/voice assets; render timing, formats, queue/cancel/retry fixtures.
- **PASS:** `node --experimental-strip-types scripts/test-post-production.mjs`.
- **PASS:** `node --experimental-strip-types scripts/test-post-production-render.mjs` after the fixture was corrected to approve its source timeline.
- **PASS:** `node --experimental-strip-types scripts/test-publishing-kit.mjs`.
- **PASS:** `npx tsc --noEmit`, `npm run build:static`, `npm run build`, extracted inline JS `node --check`, and `git diff --check`. Next emitted only non-fatal Node module-type warnings.
- **PASS (source checks):** script/image requests derive approval and generation inputs from saved SQLite payloads rather than caller-supplied prompt/state; Gemini blocks before fetch without positive rates/ceiling/reference-image price; render creation checks saved `renderApproval` and canonical SHA-256 hash. Timeline edits/undo/redo invalidate approval; UI includes separate timeline approval and render confirmation.

### Full 13-stage workflow coverage
Stages 1–13 are present in the application. Phase-specific source/helper tests exist for project/input storage, AI gates, voice/workflow, timeline, render, post-production, and publishing kit. **NOT TESTED as a single browser end-to-end run:** brief/script editing, all UI approval clicks, image/voice generation interaction, timeline playback/touch editing, thumbnail upload/download, and final export workflow were not automated through the browser in this run. Stages using simulations are not real provider integrations.

### Runtime, responsive and security disposition
- The deployed Pages dashboard was opened in Chrome after commit `ba5a9d26c74355721d6a978f727b9e175ed2ce71` / run `44517625068`; its DOM showed seven existing projects, `All Status`, `All Series`, and `SIMULATED · COST RM0`. No project data was changed. Mobile/tablet, full interactions, keyboard runtime, and color contrast were not browser-tested.
- No live provider calls, paid APIs, video generation, or external hosting were used; cost RM0 and the RM20 budget remains untouched.
- **FAIL / release blocker:** project and entity APIs have no authentication/ownership checks. Anyone able to reach a Node deployment can read, create, or replace project payloads, including saved approval flags, then call generation/render endpoints. New saved-state checks do not prevent that attack. A documented authentication and ownership layer is required before exposing Node APIs.
- **FAIL:** public history includes author/committer personal email metadata in commits `05026b50`, `88da6c7c`, and `e2396853` (six identity fields). No history rewrite was performed.
- **FAIL:** GitHub Pages reports HTTPS enforcement disabled; HTTPS works, but HTTP also responds 200.
- **PASS for source scan:** independent DevOps scan found no common API key, access token, JWT, private key, or sensitive email strings in current tracked file contents; blank examples only.
- **BLOCKED:** durable production hosting is not configured. Pages cannot run SQLite, server routes, background work, or FFmpeg.

**Disposition:** Phase 11 audit and safe code fixes complete with PARTIAL PASS. Do not call CCAI production-ready or expose Node routes until the release blockers are resolved.

## Production Readiness continuation — final local QA, 19 November 2026

### Automated and HTTP API evidence
- **PASS:** `npm test` (19 workflow/storage checks), `npx tsc --noEmit`, `git diff --check`, `npm run build`, and `npm run build:static`.
- **PASS:** `scripts/test-auth-api.mjs` (session/bootstrap/same-origin/tenant isolation/content hashes/cascade/request bounds); `scripts/test-ai-routes.mjs` (saved source, disabled live providers and no-fetch pricing gates); `scripts/test-voice-vault-security.mjs` (data-preserving owner migration and account isolation); `scripts/test-p11-http.mjs` (77 route assertions); `scripts/test-ffmpeg-renderer.mjs` (real FFmpeg output and render gate/range/queue fixtures); post-production and publishing-kit fixtures.
- **PASS:** Local HTTP UI setup, synthetic owner login, project save, brief approval, simulated script and script approval, scene breakdown, simulated unique images, all-scene approval, simulated audio and all-line approval, timeline construction/review, actual local render, post-production revision, thumbnail approval and export checklist. The test used a disposable SQLite database and synthetic content. Deployed preview localStorage and the private backup were not accessed.
- **PASS:** Local FFmpeg produced a 1920×1080 H.264/AAC MP4, 62.1 seconds, 1,161,418 bytes. `ffprobe` verified streams, dimensions and duration. Protected render streaming returned HTTP 206 for bytes 0–1023; after export approval, download returned HTTP 200 and a valid `ftyp` MP4 signature. Post-production produced a separate completed MP4; the original render remained unchanged.
- **PASS:** Browser console had no CCAI-origin JavaScript errors/warnings in the inspected runtime. Extension errors were excluded. Desktop screen tested at 1212×798.

### Defects fixed during final verification
- Accepted `timeline:null` for new draft projects while retaining schema checks for populated timelines.
- Restored the missing scene-card renderer and image-queue processing flag; corrected the timeline adapter to use the existing scene-image resolver.
- Reduced simulated Full HD image storage from PNG data URLs (about 27 MB for 15 images in the test) to JPEG at quality 0.78 (about 1.52 MB for the same 15 images). Dimensions and unique preview labels remain unchanged; renderer accepts the raster output.
- Bulk scene/audio approval now saves the current project payload once before recording per-item server approvals, avoiding repeated multi-megabyte writes.
- Timeline normalization passes the current scene image bytes and audio data URLs to the timeline builder.
- Project and render validators tolerate only floating-point representation noise at adjacent clip boundaries; genuine overlaps remain rejected. Tests cover fifteen adjacent 4.4-second clips.
- FFmpeg resolves scene image data from the stored data URL or latest saved image version, instead of reading the boolean image flag as media.

### Security, deployment and limits
- Source safety scan: no populated provider-key/token patterns or private-key blocks found. `.env.example` contains only blank secret variables, including `CCAI_BOOTSTRAP_TOKEN=`. Synthetic test credentials were confined to `/tmp` commands and were not committed. Provider switches stayed false; no external provider requests were sent.
- Authentication/ownership protections and server-authoritative approvals are exercised in the API suites. GitHub Pages remains a static, browser-local simulation and cannot run SQLite, auth routes, background workers, or server FFmpeg. A persistent Node host has not been selected or deployed.
- Tablet/mobile viewport interaction remains **NOT TESTED** because the available browser control exposes no viewport resizing/emulation. Responsive CSS is present; that source check is not a mobile runtime pass.
- GitHub Pages reports `https_enforced:false`; HTTPS works, but HTTP does not redirect. Owner must enable **Settings → Pages → Enforce HTTPS**. No DNS or unrelated settings were changed.
- Three old public commits contain personal author/committer email metadata. No history rewrite was authorized or performed; future commits continue with GitHub noreply identities.
- Hosting options are researched in `docs/hosting-options.md`. No host/account/resource was created and no additional cost was incurred.
- Cost RM0. Gemini, FLUX, ElevenLabs, and the RM20 API testing budget were not used.

**Updated disposition:** local API security and the full desktop workflow are verified. The hosted preview still runs only in static simulation mode. Production readiness remains **BLOCKED** by absent persistent Node hosting and Pages HTTPS-enforcement setting; mobile/tablet runtime remains unverified and legacy public commit metadata remains unchanged.


## Production readiness continuation — final regression rerun (19 November 2026)

- **PASS:** `npm test` (19 project, phase-gate and workflow checks), `scripts/test-auth-api.mjs`, `scripts/test-ai-routes.mjs`, `scripts/test-voice-vault-security.mjs`, and `scripts/test-p11-http.mjs` (77/77 HTTP API assertions). These use isolated synthetic data; they do not contact a paid provider.
- **PASS:** `scripts/test-ffmpeg-renderer.mjs`, `scripts/test-post-production.mjs`, `scripts/test-post-production-render.mjs` (actual local derived MP4 fixture and source preservation), and `scripts/test-publishing-kit.mjs`. A test-only resolver was corrected so the post-production fixture can import the project approval module under Node's strip-types runtime.
- **PASS:** `npx tsc --noEmit`, `npm run build:static`, `npm run build` (Next.js 15.5.29; API routes compiled), and `git diff --check`. Node emitted only the non-fatal module-type warning in test execution.
- **PASS:** final regex scan of workspace source, docs, and deployable static artifacts found no common API-key/token patterns, JWT-shaped values, cloud access key IDs, or private-key blocks. `.env.example` contains blank placeholders only. This scan does not erase or rewrite old Git identity metadata.
- **PASS (isolated desktop E2E):** all 13 production stages completed on local Node/SQLite with synthetic owner/project data. Local FFmpeg produced and played the approved 1080p MP4; protected byte-range preview and approved export download worked; post-production kept the source render intact; thumbnail approval and export checklist completed. CCAI console errors/warnings were not observed. Desktop viewport was 1212×798.
- **NOT TESTED:** mobile/tablet runtime. This browser-control environment has no viewport emulation. The hosted GitHub Pages data store and the existing seven browser-local preview projects were not modified by the isolated run.
- **BLOCKED for production:** static Pages does not run SQLite/auth APIs/background jobs/FFmpeg, no persistent Node host is configured, and Pages “Enforce HTTPS” remains an owner action. Three older public commits retain personal author/committer emails; history was not rewritten.
- **Cost:** RM0; no paid APIs or hosting and no use of the RM20 testing budget.


### Deployment verification after the final commit
- **PASS:** commit `6bc9831852b7a378b500e652cb3531740ea09c65` is the current `main` head; author and committer are GitHub noreply. Pages workflow `44542558589` completed successfully.
- **PASS:** `https://ccai.ur-project.biz/` returns HTTP 200 and its response SHA-256 matches the exact local `dist/index.html` build. Expected dashboard and simulation labels are present.
- **PARTIAL:** curl's TLS check succeeded through the managed egress proxy, which presents its own certificate for the domain; therefore the origin GitHub Pages certificate chain was not independently verified. HTTP returns 200 without redirect, so owner Enforce HTTPS setting remains outstanding.

### Dependency audit
- **PASS:** `npm audit --audit-level=high` reported 0 vulnerabilities (including production and development dependency tree).
## Phase 12 Google Cloud usage protection — 19 November 2026

- **PARTIAL PASS:** SQLite metering tracks independent CPU-seconds, GiB-seconds, GB-months, egress bytes, requests, container bytes, log bytes and other units, alongside separate MYR measures. Billing windows are server-derived Pacific time periods with PST/PDT UTC bounds and retained history. The GitHub Pages dashboard is explicitly simulated; actual provider telemetry is unavailable.
- **PASS:** `node --experimental-strip-types scripts/test-cloud-metering.mjs` covers 80/85/90 thresholds, projected reservations, shared MYR across pools, authenticated API controls, forged-source/allowance/period/TTL rejection, Pacific rollover/DST, idempotency and SQLite reopen persistence.
- **PASS:** independent two-process SQLite contention: one 60-unit job reserved against a 100-unit synthetic pool; the competing reservation was rejected and only one row persisted. Separate shell process launching is blocked by the managed sandbox, but QA's process executor successfully ran the two-process fixture.
- **PASS:** after correcting the missing-pool status defect, `canReserve=false` when any required allowance/metrics are missing. Reservation projections that reach 90% of the pool or shared MYR allowance are rejected.
- **PASS:** `npm test`, `scripts/test-auth-api.mjs`, `scripts/test-ai-routes.mjs`, `scripts/test-p11-http.mjs` (77 HTTP assertions), `scripts/test-voice-vault-security.mjs`, `scripts/test-ffmpeg-renderer.mjs`, post-production helper/render and publishing suites; `npx tsc --noEmit`; `npm run build:static`; `npm run build`; `git diff --check`.
- **NOT TESTED:** actual GCP account metrics/billing; Cloud job failure/retry/timeout/cancel execution; mobile/tablet viewport runtime. **PASS (desktop preview):** the deployed dashboard loaded in Chrome at 1168×735, displayed the simulated/unavailable labels and eight unknown resource meters, and its emergency-stop demo control changed the preview status. No CCAI page-origin console errors were recorded; reported errors were from a browser extension. This was a dashboard smoke check, not the full workflow.
- **Production blockers:** reservation admission returns 503 until trusted multi-pool estimates/telemetry and a durable worker exist. AI/render routes are not connected to cloud reservations; the owner DELETE can release a reservation without evidence the job stopped; ledgers are per-owner and do not yet aggregate across several owners sharing a billing account. Do not enable cloud operations until these are resolved and independently tested.
- No live Google API, paid provider, GCP resource, host or billing configuration was used. Cost RM0; RM20 remains untouched.
