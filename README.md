# Content Creator AI (CCAI)

CCAI is an AI-assisted video creation workspace with a project dashboard and an approval-gated 13-stage production prototype. Phases 1–5 are implemented for the simulated preview. No paid API calls are made.

## Preview

Open the live static development preview: **[https://ccai.ur-project.biz/](https://ccai.ur-project.biz/)**.

GitHub Pages serves `dist/index.html`. The preview saves project data in browser-local storage on the current device. Static Pages hosting does not run the SQLite API or provide shared, server-side persistence.

## Run locally

Requirements: Node.js 24 or newer and npm. SQLite is provided by Node.js `node:sqlite`; no external database service is used.

```sh
npm ci
npm test
npm run build
npm run start
```

Open the URL printed by Next.js. The default SQLite database is created at `data/ccai.sqlite`. Set `CCAI_DATABASE_PATH` to select a different path. Keep the data directory on persistent storage for project data to survive server replacement. Reference images are stored in SQLite as image data. Each image is limited to 2 MB and each project supports up to 12 reference images.

For the static preview build, run:

```sh
npm run build:static
```

This copies the interactive prototype to `dist/index.html`. GitHub Actions deploys `dist` to GitHub Pages whenever `main` changes. The existing SQLite API and storage code stays in `src/app/api` and `src/lib` for a future Node.js host with persistent storage.

## Phase 3 script generation

The Pages prototype creates a simulated creative brief and script, enforces brief/script approval, supports narration/dialogue/mixed formats, tracks word count and estimated duration, saves/restores script versions, and records simulated usage at RM0. The server has an interchangeable provider boundary with a simulated default and a Gemini implementation. Gemini is server-only and disabled unless both `CCAI_ENABLE_LIVE_AI=true` and `CCAI_LIVE_AI_APPROVED=true` are set with `GEMINI_API_KEY` in the server environment. Do not enable live calls without separate user approval. Configure current billing rates server-side before relying on a live cost estimate.

Reference URLs are stored but not fetched automatically. Paste a transcript or reference excerpt when the material should inform the brief or script.

## Phase 5 image studio

The image studio builds scene plans only from approved scripts and provides editable scene prompts, character/location continuity cues, a simulated generation queue, individual review decisions, rejected-scene regeneration, version history, manual image replacement/cropping, and per-project usage tracking. Preview images are explicitly labelled as simulations and cost RM0. The server-only FLUX.1 Schnell adapter is interchangeable but disabled; live requests require separate user approval, server-side credentials, known pricing, and a project spending limit. FLUX reference-image conditioning is not supported by the adapter. The preview supports 9:16 and 16:9 frames with Full HD dimensions; browser-local image history is subject to storage quotas.

## Project records

- [Project instructions](AGENTS.md)
- [Roadmap and progress](ROADMAP.md)
- [Approved decisions](DECISIONS.md)

Do not add real provider credentials or make paid API calls. Phase 6 requires the user’s approval.


## Phase 4 project management

The dashboard includes reusable character, location, series, brand kit, and channel profile libraries. Projects can be assigned to a series/season/episode, channel, brand, characters, and locations; scene cards keep their own cast, location, and outfit overrides. Series continuity notes inform a creative brief only when the user explicitly generates one. Project search, filters, workflow status, progress, manual queue priority, single-project export, and full-library JSON backup/import are included. Imports validate and add copies instead of replacing existing records.

On GitHub Pages, projects and libraries persist only in that browser's local storage. SQLite provides server persistence for a future Node.js deployment. AI and media responses remain simulated; the Phase 3 approval gates are unchanged. Editing a reusable profile refreshes its saved scene continuity on project reopen, invalidating only affected scene approvals.

Phase 4 QA passed all 10 automated checks plus the desktop browser regression and backup round-trip checks recorded in [ROADMAP.md](ROADMAP.md). Phase 5 automated workflow, storage, TypeScript and production build checks are recorded in [ROADMAP.md](ROADMAP.md). The live preview serves HTTPS. Mobile viewport testing was not available in this browser surface.
