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

## Phase 9 — Post-Production Studio (independent code QA PASS; deployment pending)
- CCAI-05-QA P9-QA-01 reviewed uploaded music/voice/effects, bounded validation, immutable revisions, default-off music/ducking, Node FFmpeg mix, parent-render preservation, Pages simulation and job controls. A filtergraph-injection risk through user-controlled track IDs was found and fixed: IDs now use a strict safe alphabet and FFmpeg filter labels are generated from numeric indices. Malicious-ID tests reject punctuation payloads.
- `node --experimental-strip-types scripts/test-post-production.mjs` passed validation, trim/fade bounds, default-off music, duck targets, immutable revisions and malicious-ID checks.
- `node --experimental-strip-types scripts/test-post-production-render.mjs` passed real FFmpeg output validation: uploaded WAV tracks with trim, fades, volume and ducking produced a derived 1920x1080 MP4 with audio/video streams and expected duration; original render bytes remained unchanged.
- `node --experimental-strip-types scripts/test-ffmpeg-renderer.mjs`, `npm test`, `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline prototype `node --check`, and `git diff --check` passed. Production route build includes post-production, status, stream and download endpoints.
- QA reviewed the 32 MiB request cap, 12-track limit, 8 MiB/file and 24 MiB aggregate caps, audio allowlist, ffprobe checks, generated temp names, server-side source render ID/version lookup, safe argv invocation, and Pages no-fetch boundary.
- Limitations: fixture does not assert sample-level fade/ducking amplitude; post-production HTTP status responses and cancel/retry were not exercised end-to-end. Browser playback/waveform appearance and mobile/touch behavior remain unverified. Deployment is pending. This is a code acceptance PASS, not a full browser or production-host acceptance.
