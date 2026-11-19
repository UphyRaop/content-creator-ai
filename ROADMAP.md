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
4. **Project and Character Management** — implemented in this release; QA and deployment verification are recorded below. Includes reusable character/location/series/brand/channel records, project and scene assignments, episode continuity context, search/status/priority queue, and non-overwriting JSON import/export.
5. **AI Image Generation Studio** — not started.
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
- User authorized Phase 4 on 19 November 2026 (Malaysia time). Phase 5 remains not started and requires separate approval.
- Implemented reusable SQLite/browser-local libraries for characters, locations, video series, brand kits, and channel profiles, including edit, duplicate, delete, and multi-image references. Project records link series/channel/brand/characters/locations and episode number. Scene cards can assign characters, locations, and outfit overrides without changing reusable profiles. Series continuity notes are available to creative brief drafting; generation remains manually triggered and simulated.
- Dashboard adds search, status/series/channel filters, production progress, Draft/In Progress/Awaiting Approval/Completed/Archived status, manual priority and a queue ordered by priority. JSON exports cover one project or the whole project/library data; validated imports add copies instead of replacing entries.
- QA and deployment evidence will be recorded after checks complete. Cost: RM0; no paid providers or hosting.
