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
- The live Pages dashboard had previously loaded on desktop with seven existing browser-local projects and the RM0 simulation indicator; no project data was changed. Phase 11 code edits were not tested in a browser after deployment, and mobile/tablet, keyboard runtime, and color contrast were not browser-tested.
- No live provider calls, paid APIs, video generation, or external hosting were used; cost RM0 and the RM20 budget remains untouched.
- **FAIL / release blocker:** project and entity APIs have no authentication/ownership checks. Anyone able to reach a Node deployment can read, create, or replace project payloads, including saved approval flags, then call generation/render endpoints. New saved-state checks do not prevent that attack. A documented authentication and ownership layer is required before exposing Node APIs.
- **FAIL:** public history includes author/committer personal email metadata in commits `05026b50`, `88da6c7c`, and `e2396853` (six identity fields). No history rewrite was performed.
- **FAIL:** GitHub Pages reports HTTPS enforcement disabled; HTTPS works, but HTTP also responds 200.
- **PASS for source scan:** independent DevOps scan found no common API key, access token, JWT, private key, or sensitive email strings in current tracked file contents; blank examples only.
- **BLOCKED:** durable production hosting is not configured. Pages cannot run SQLite, server routes, background work, or FFmpeg.

**Disposition:** Phase 11 audit and safe code fixes complete with PARTIAL PASS. Do not call CCAI production-ready or expose Node routes until the release blockers are resolved.
