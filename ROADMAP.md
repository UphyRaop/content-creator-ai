# CCAI Roadmap and Progress

## Product definition
CCAI is an AI-powered video creation application. Social account management, publishing automation, and social analytics are out of scope.

## Approved 13-stage production workflow
1. Idea and reference input
2. Creative brief approval
3. AI script generation
4. Script editing and approval
5. Scene breakdown
6. AI image generation
7. Individual scene approval and regeneration
8. AI voice generation
9. Video timeline and editing
10. Video rendering
11. Post-production
12. Thumbnail generation
13. Video export

Approval gates are mandatory: no script before brief approval; no scene breakdown before script approval; no voice before every scene is approved. Editing approved brief/script content clears its approval and dependent downstream work. Simulated responses are always identified as simulations.

## Approved 11-phase development roadmap
1. **Application Foundation** — complete. Dashboard and project CRUD, browser autosave for the static preview, SQLite-backed server storage, responsive navigation, and dark/light themes.
2. **Multimodal Idea Input** — complete. Video idea, duration 1–5 minutes, aspect ratio, language, visual style, categorized image references, HTTPS video references, notes, and user-supplied transcript/context.
3. **AI Script Generation** — complete for the no-cost simulated preview and server provider boundary. Includes brief drafting/approval, narration/dialogue/mixed formats, editable scripts, word count and duration estimates, version save/restore, usage estimates, server-only Gemini adapter, and approval invalidation. No live Gemini API call was made. Reference media is not fetched automatically; users can provide transcript/context.
4. **Project and Character Management** — complete. Reusable asset libraries, project/scene assignments, episodic continuity, project organization and manual queue, and non-overwriting backups are implemented. Includes reusable character/location/series/brand/channel records, project and scene assignments, episode continuity context, search/status/priority queue, and non-overwriting JSON import/export.
5. **AI Image Generation Studio** — complete for the no-cost simulated preview and server provider boundary. Includes approved-script scene breakdowns; editable scene cards, prompts and continuity assignments; individual/batch queueing; approval/rejection and rejected-scene-only regeneration; unique simulated image versions; restore/download/manual replacement with aspect-ratio cropping; queue recovery/retry/cancellation; RM usage controls; and a server-only FLUX.1 Schnell adapter that remains disabled. Reference-image conditioning is not supported. See Phase 5 verification record below.
6. **AI Voice Generation** — complete for the RM0 simulated preview and server-only adapter/key-vault boundary. Includes reusable narrator/character profiles, mixed narration/dialogue lines, saved voice controls, explicit queue confirmation, per-line review and rejected-only regeneration, version history, manual audio upload, measured duration synchronization, aggregate project cost checks, and timeline lock until all lines are approved. No live ElevenLabs calls were made.
7. **Video Timeline and Editor** — complete. Source commit `45438475cdedf4102b6d8c0bc28145b2a2aad4f2`; Pages fix commit `9e050e77eede07a25c9236b265313190bcc7ab19`; deployment run `44492004150` succeeded and the custom domain serves the updated prototype over HTTPS. Browser UI/mobile interaction remains unverified because browser tools are blocked (see `QA.md`). Browser playback and touch QA are unavailable in this environment and remain explicitly unverified.
8. **Video Rendering Engine** — implementation and independent QA complete; GitHub synchronization and Pages deployment pending. A local Node/FFmpeg renderer produces H.264/AAC MP4 at 1080p, portrait or landscape, 30 or 60 FPS. GitHub Pages remains an explicit simulation.
9. **Post-Production Studio** — authorized; sequentially follows Phase 8 QA and deployment.
10. **Thumbnail and Publishing Kit** — authorized; sequentially follows Phase 9 QA and deployment.
11. **Final Testing and Deployment** — authorized; follows Phase 10 QA and deployment.

## Current authorization
- On 19 November 2026 (Malaysia time), the user authorized autonomous completion of Phases 7–11 under the attached multi-agent protocol. Continue phases sequentially without requesting inter-phase approval.
- Cost controls remain RM0: no paid APIs, subscriptions, external hosting, or use of the RM20 testing budget. Simulated providers remain simulated. The private backup repository must be preserved.
- Each phase is gated on independent QA and deployment before the next phase begins. Phase 7 passed the code/automated review and deployment gate; browser testing remains limited. Later phases follow the same gate. GitHub Pages can publish static preview behavior only; server FFmpeg remains a separate local/server capability and must not be represented as available on Pages.

## Phase 7 verification record
- The editor and pure timeline workflow have been implemented locally. The timeline requires approved script, scene images, and measured approved audio. Tracks cover images, narration, dialogue, and estimated captions. Edits are non-destructive; the persisted manifest uses seconds at 1 ms resolution. Trimming/splitting/rearranging, snap points, scene navigation, auto transitions and camera motion, captions/presets, clip and whole-timeline silence suggestions, source-preserving cuts, and undo/redo are included.
- Automated checks: the new timeline workflow suite and all existing project/script/image/voice regression checks pass; `npx tsc --noEmit`, `npm run build:static`, `npm run build`, and the inline prototype JavaScript syntax check pass.
- Independent CCAI-05-QA review passed after multiple defects were fixed. Browser UI QA is blocked by unavailable CUA and denied local Chromium/server startup; this limitation is recorded in `QA.md`. GitHub Pages run `44492004150` succeeded for commit `9e050e77eede07a25c9236b265313190bcc7ab19`; the custom domain returned HTTP/2 200 and the timeline module returned HTTP 200.

## Phase 8 verification record (deployment pending)
- The Node-only FFmpeg renderer consumes the validated Phase 7 manifest and saved project media. It supports 1080p 16:9/9:16, 30/60 FPS, H.264/AAC, still-image camera motion, cut/fade-black/crossfade/wipe/slide/zoom transitions, estimated captions, and narration/dialogue. It preserves absolute timeline starts, blank gaps, captions and audio; rejects media outside the project, clips outside manifest duration, omitted/duplicated/unapproved voice segments, and malformed manifests.
- The bounded queue runs one render at a time with up to five waiting jobs; status/progress, queued and active cancellation, retry, failure cleanup, one-hour temporary render history, inline byte-range preview and streamed MP4 download are implemented. Job metadata and temp files remain process-local and do not survive a restart or multiple Node processes.
- Pages is labelled simulation-only and blocks render API requests. No real MP4 is produced on `ccai.ur-project.biz`; server rendering needs a separate single-process Node.js host with FFmpeg/libx264, ffprobe, temporary disk and persistent SQLite storage. None is configured.
- Automated evidence on 19 November 2026 (Malaysia time): `node --experimental-strip-types scripts/test-ffmpeg-renderer.mjs` passed all six transitions, voice gate and exact-once references, image gap and absolute caption/audio alignment, manifest duration rejection, queue cap/cancellation, active process cancellation, repair/retry, monotonic progress, and landscape 1920x1080@30 plus portrait 1080x1920@60 output. `npm test`, `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline JavaScript `node --check`, and `git diff --check` passed.
- Independent CCAI-05-QA P8-QA-REVIEW-03 passed code acceptance, source safety and bounded-memory download. It did not exercise the Next route HTTP `HEAD`/200/206/416 response end-to-end; the pure range parser and route types were checked. No Node server or mobile browser test was run. Desktop Pages dashboard was observed loading before the new deployment.
- Source/artifact pattern scan covered 57 text files and found no common API key/token/private-key or personal-email patterns. The actual public main history has pre-existing personal email metadata in older commits; no history rewrite or force-push was authorized.
- GitHub synchronization and Pages deployment are pending. The live preview can run the Pages simulation only. GitHub reports `https_enforced:false` on the Pages configuration: HTTPS responds, but HTTP is not redirected. The available GitHub connector cannot update this setting, and the browser session is signed out.

## Architecture and deployment
- Public main repository: `UphyRaop/content-creator-ai`.
- Private backup: `UphyRaop/content-creator-ai-backup`; preserve it.
- Static preview: [https://ccai.ur-project.biz/](https://ccai.ur-project.biz/) from the `dist` directory using GitHub Actions on pushes to `main`.
- GitHub Pages uses browser-local storage. SQLite API routes require a Node.js server with persistent writable storage; GitHub Pages cannot run the backend.
- Gemini adapter is server-only. Preview uses simulation. Live calls require `CCAI_ENABLE_LIVE_AI=true`, `CCAI_LIVE_AI_APPROVED=true`, and a server-side `GEMINI_API_KEY`; no key or live consent is currently configured. Configure current token rates before showing a real cost estimate.
- Remote reference URLs are stored but not crawled/fetched. Users can paste accessible transcript or reference excerpts.

## Phase 3 verification record
- Verified 19 November 2026 (Malaysia time): `npm test` passed all 8 SQLite/project/script workflow checks; `npx tsc --noEmit`, `npm run build:static`, `npm run build`, and the prototype JavaScript syntax check passed.
- Desktop browser regression on `https://ccai.ur-project.biz/` verified project creation, rename, duplication, settings and reference entry, brief generation/approval, script blocked before brief approval, Malay mixed-format simulated script generation, word/time estimate, edit/save/restore version history, script approval, scene breakdown gate, and cost tracking at RM0.
- Final Phase 3 source commit: `e1b896954b0723b9443cb2de948b5a26f9212121`; GitHub Pages run `44453273340` completed successfully. The custom-domain preview loaded on HTTPS.
- Mobile viewport testing remains unverified because the available browser surface does not expose viewport emulation. Responsive breakpoints and layout rules remain in source; this is not a mobile test pass.
- Source and static artifact secret scans found no keys, credential values, personal emails, or private keys. The public repository still has three older commits with personal author/committer email metadata; history was not rewritten. New commits use the GitHub noreply address.
- No paid API calls, hosting, or new services were used. Cost: RM0; RM20 testing budget remains untouched.

## Known repository history issue
The public repository contains three older commits whose author/committer metadata used personal email addresses. New commits use GitHub noreply identities. History was intentionally not rewritten or force-pushed; see the security scan record in the prior migration history.


## Phase 4 verification record
- User authorized Phase 4 on 19 November 2026 (Malaysia time).
- Implemented reusable SQLite/browser-local libraries for characters, locations, video series, brand kits, and channel profiles, including edit, duplicate, delete, and multi-image references. Project records link series/channel/brand/characters/locations and episode number. Scene cards can assign characters, locations, and outfit overrides without changing reusable profiles. Series continuity notes are available to creative brief drafting; generation remains manually triggered and simulated.
- Dashboard adds search, status/series/channel filters, production progress, Draft/In Progress/Awaiting Approval/Completed/Archived status, manual priority and a queue ordered by priority. JSON exports cover one project or the whole project/library data; validated imports add copies instead of replacing entries.
- Verified 19 November 2026 (Malaysia time). `npm test` passed all 10 project, SQLite library, validation, approval-gate, simulated script and version-history checks. `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline JavaScript syntax check and `git diff --check` passed. The only build/test output was Node's non-fatal module-type performance warning.
- Desktop preview regression verified reusable character editing and duplication, multiple character reference image upload, scene/project assignment, project-only outfit overrides, brand and location continuity in scene prompts, series/channel context, project statuses and priority ordering, previous Phase 3 script/version compatibility, approval gates, browser-local persistence after reload, and JSON export/import that adds copies without overwriting originals. Profile edits refresh scene continuity on project reopen; only prompts that changed have their scene approvals invalidated.
- `https://ccai.ur-project.biz/` is accessible over HTTPS and served the latest `main` build. The Pages workflow remains configured for pushes to `main`. No CCAI page-origin console errors were observed; browser extension errors were excluded. This browser surface does not expose mobile viewport emulation, so mobile layout behavior remains unverified.
- Source, documentation and static artifact scans found no API keys, credential patterns, private keys, or personal email addresses. The known older Git history email metadata issue remains unchanged; new commits use the GitHub noreply identity. Private backup repository preserved.
- No paid APIs or hosting were used. Cost: RM0.



## Phase 5 verification record
- User authorized Phase 5 on 19 November 2026 (Malaysia time). Phases 1–4 and the approval-gated 13-stage workflow remain in place.
- Scene planning requires an approved script and creates about four-second chronological beats. Before images exist, scene text, prompts, durations, cast/location assignments and outfit overrides can be edited, saved, duplicated, added, removed and reordered. Saves do not start generation.
- The server has an interchangeable `ImageProvider` with a simulated default and a server-only FLUX.1 Schnell adapter. GitHub Pages uses uniquely identified, clearly labelled Full HD simulated images. The live adapter is disabled; it requires separate user approval, a server-side key, known positive MYR pricing and a project limit. No live request was sent. Reference conditioning is explicitly unsupported.
- The preview includes individual and batch image requests, confirmation, usage/cost preview, per-scene approvals/rejections, bulk decisions, approval progress, grid/single view and status filters. Confirmed rejection regenerated only the rejected scene, kept the approved scene unchanged, and recorded the latest edited prompt and script in that image version. Voice remained locked until all 15 images were approved.
- Manual image replacement, crop to the project ratio, image download links and version restoration were exercised. A two-scene batch confirmed one pending job could be cancelled while preserving its prior image; the other completed. The cancelled scene was then requeued. Queue failure injection confirmed a failed scene stayed failed without clearing other completed images, and retry completed after editing its prompt. All 15 visible generated image URLs were unique.
- Desktop browser QA on `https://ccai.ur-project.biz/` verified the custom domain loads over HTTPS, Phase 1–4 local project storage, brief/script gates, 15-scene planning, simulated batch generation, failure and retry, rejected-only regeneration, edited prompt history, approval locking, image restore/crop, queue cancellation, filters/views, and the voice gate. A retry-dialog `requested` reference error and an edited-scene batch-selection defect were found during QA and fixed in follow-up commits; the final deployed checks passed with no new CCAI page-origin console errors. Browser-extension errors are outside the app.
- `npm test` passed 15 SQLite/entity/script/image workflow checks, including multilingual scene segmentation, job deduplication/recovery, pricing and crop geometry. `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline JavaScript `node --check`, and `git diff --check` passed. The only warning was Node's non-fatal ES-module performance warning in the test runner.
- GitHub Pages runs #17–#19 completed successfully; latest Phase 5 code commit `d8b15c3` was served at the custom domain. GitHub HTTPS loaded without a certificate warning. The public source, configs, docs and static artifact credential scans found no populated API keys or private keys. `.env.example` contains blank key names only. Earlier public Git history still contains legacy personal author/committer email metadata; history was not rewritten. Phase 5 commits use the GitHub noreply address. The private backup remains unchanged.
- Desktop viewport QA passed on the attached desktop browser. Mobile viewport testing was not available because the browser control did not expose viewport resizing; responsive CSS is present, but this is not a mobile test pass. Local headless Chromium was blocked by the managed sandbox's crashpad socket restriction.
- No paid APIs, hosting or subscriptions were used. Cost: RM0; the RM20 testing budget remains untouched. Phase 6 has not started.


## Phase 6 verification record
- User authorized Phase 6 and the small dashboard adjustments on 19 November 2026 (Malaysia time); Phase 7 is underway under the later 19 November 2026 authorization.
- Desktop dashboard QA verified search above filters, defaults “All Status” and “All Series”, “Imported” search returning 3 cards, status “In Progress” narrowing those to 1, series filtering, and reset to all seven cards.
- Voice library adds reusable narrator/character profiles and character links. Every approved scene can contain multiple saved narration/dialogue segments with per-line voice profiles and speed, stability, similarity, emotion, style, and pronunciation settings. Saving edits only invalidates the affected line and never starts generation.
- The Pages preview creates clearly labelled playable tone files matched to estimated speech timing; these are not spoken voice generation. Users must confirm the simulated queue, can monitor/retry/cancel jobs, approve/reject each line, and only confirmed rejected lines regenerate. Approved lines stay unchanged. Uploaded recordings are measured, versioned, and update scene timing. The timeline is locked until every line has approved audio; chronological clips use measured scene durations.
- The secure server boundary stores multiple ElevenLabs keys only in an AES-256-GCM encrypted SQLite vault, gated by an administrator token. The Pages preview never shows the credential form, and keys are neither returned to the browser nor saved in browser storage. Live generation and balance requests remain disabled; balances display as “not checked.” Current credit/MYR pricing is unknown, so live generation is blocked. Emotional delivery and free-text pronunciation are not sent to live ElevenLabs until an actual compatible capability is verified.
- Desktop live-preview QA confirmed all 15 approved scene images unlock voice. After explicit confirmation, the simulated batch generated 15 labelled tones (869 characters, 0 credits, RM0). Approving all and then unlocking/rejecting one segment allowed regeneration of only that 53-character line; the other 14 approved segments stayed locked. The scene displayed measured audio duration and the timeline remained locked until the rejected line is re-approved.
- Pages run `44475699762` deployed commit `5dd708e35357311b4a93969f475eeea36cf86b01` successfully at `https://ccai.ur-project.biz/` over HTTPS. Commit author and committer use the GitHub noreply identity. Console review found no CCAI page-origin errors; reported errors came from a browser extension.
- No provider credentials were added. Scan of 41 repository files found no provider-key patterns, private keys, credential assignments, or personal email addresses. No live API or balance request was sent. Mobile viewport emulation was unavailable, so mobile behavior is not marked tested. GitHub Pages is static and cannot run SQLite; secure key/account management and server persistence remain available only for a future Node.js host. Cost remains RM0; RM20 testing budget is untouched.
