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
6. **AI Voice Generation** — not started.
7. **Video Timeline and Editor** — not started.
8. **Video Rendering Engine** — not started.
9. **Post-Production Studio** — not started.
10. **Thumbnail and Publishing Kit** — not started.
11. **Final Testing and Deployment** — not started.

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
- User authorized Phase 5 on 19 November 2026 (Malaysia time). The 13-stage production workflow, approval gates and SQLite/browser-local split are preserved.
- Implemented scene breakdowns from approved scripts, targeting four-second beats and keeping script order; adjustable scene cards include title, dialogue, duration, prompt, assigned characters/location, outfit overrides, and add/duplicate/delete/rearrange controls before any image exists. Explicit save never starts generation.
- Added a server-only `ImageProvider` boundary with simulated default and FLUX.1 Schnell adapter. The static GitHub Pages preview creates distinct, clearly labelled simulated SVG image versions at Full HD canvas sizes. Live FLUX calls remain disabled by default and require flags, a server-side key, positive configured per-image MYR pricing and project limit. No live call was made. The adapter does not claim reference-image conditioning.
- Image Studio provides batch/individual requests with cost preview; scene approval, rejection, bulk decisions, confirmation, scene filters and grid/single view; approved-scene locking; rejected-only regeneration from the latest saved prompt and script; version history/restore/download; manual image replacement and no-distortion crop; queue progress/status/cancel/retry/deduplication/recovery; generation/regeneration usage tracking; and a voice gate that requires all approved images. Preview generation cost is RM0.
- Automated checks: `npm test` passed 15 SQLite, entity, Phase 3, Phase 5 validation, continuity, approval, queue, pricing and crop checks. `npx tsc --noEmit`, `npm run build:static`, `npm run build`, inline JavaScript `node --check`, and `git diff --check` passed. The test run includes a Chinese-script segmentation case.
- Browser QA limitation: the local headless Chromium process could not start in this managed environment (crashed with a sandboxed crashpad socket error); no Playwright browser interaction or viewport test is recorded as passed. Desktop/mobile interactive browser QA remains outstanding unless the deployed browser check succeeds.
- Deployment, HTTPS and public preview checks are pending the Phase 5 commit and GitHub Actions run. No paid APIs, subscriptions or hosting were used. RM0 spent; the RM20 budget remains untouched.
- Security scan: source, config, docs and static build contain no credential values or private keys. Existing environment templates contain blank API-key variable names only. The historical public-repository commit email metadata issue is unchanged; this phase does not rewrite Git history. New commits use GitHub's noreply identity. The private backup is preserved.
