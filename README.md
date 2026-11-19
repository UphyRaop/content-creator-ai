# Content Creator AI (CCAI)

CCAI is an AI-assisted video creation workspace with a project dashboard and an approval-gated 13-stage production prototype. Phases 1–10 are implemented in source; the GitHub Pages preview simulates AI and media generation. Node source includes FFmpeg rendering and non-destructive post-production export. No paid API calls are made.

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

Do not add real provider credentials or make paid API calls. Phases 7–11 are authorized for sequential development; retain all content approval gates.


## Phase 4 project management

The dashboard includes reusable character, location, series, brand kit, and channel profile libraries. Projects can be assigned to a series/season/episode, channel, brand, characters, and locations; scene cards keep their own cast, location, and outfit overrides. Series continuity notes inform a creative brief only when the user explicitly generates one. Project search, filters, workflow status, progress, manual queue priority, single-project export, and full-library JSON backup/import are included. Imports validate and add copies instead of replacing existing records.

On GitHub Pages, projects and libraries persist only in that browser's local storage. SQLite provides server persistence for a future Node.js deployment. AI and media responses remain simulated; the Phase 3 approval gates are unchanged. Editing a reusable profile refreshes its saved scene continuity on project reopen, invalidating only affected scene approvals.

Phase 4 and Phase 5 automated/regression test results are recorded in [ROADMAP.md](ROADMAP.md). The latest Phase 5 preview is live at the HTTPS custom domain. Desktop interactive QA passed; mobile viewport testing remains unverified because the browser tool did not expose viewport resizing.


## Phase 5 quick review
A browser-local QA project named **CCAI Phase 5 QA - 2026-11-19** is saved in the attached preview browser for inspection. It contains simulated scene images and one manual crop test. Existing projects were left unchanged. In the preview, verify the Scene Approval screen, per-scene prompt/version history, the RM0 usage panel, and that Voice Generation is unlocked only after all scene images are approved. Do not expect real AI images: the production provider adapter is disabled and the preview labels its simulated images.


## Phase 6 voice studio

The voice studio adds reusable narrator and character voice profiles, per-scene dialogue lines, speed/stability/similarity/emotion/style/pronunciation controls, explicit generation confirmation, simulated queue progress/retry/cancellation, per-line approval and rejected-only regeneration, audio version restore, manual recording upload, and measured audio timing for the Phase 7 timeline. The browser preview creates a labelled low-volume tone clip at an estimated speech duration; it is not spoken narration and costs RM0. Uploads are measured by the browser and limited to 1 MB in Pages preview to reduce local-storage pressure. The dashboard places search above its filters and defaults to “All Status” and “All Series.”

The public Pages preview never renders an API-key input and does not write credentials to browser storage. For a future HTTPS Node.js host, multiple ElevenLabs accounts can be added, updated, selected, and removed through an administrator-token-gated endpoint; keys are encrypted with AES-256-GCM in SQLite and only a label and last four characters are returned. The server requires `CCAI_VOICE_VAULT_ENCRYPTION_KEY` and `CCAI_VOICE_VAULT_ADMIN_TOKEN`. No keys are configured. Live calls require separate user approval, and current balances are not queried while live access is disabled. Estimated usage is recorded by project/account when a server live call is explicitly enabled; actual cost stays unknown when the provider does not return it.

The ElevenLabs adapter remains disabled. Unknown credits/MYR rates block live generation, and the server checks aggregate batch cost against both the request and saved project limits before any provider call. This adapter does not claim a direct emotional-delivery control or free-text pronunciation dictionary; those settings are stored for the preview but are rejected for live generation unless a compatible provider capability is verified. No real ElevenLabs call was made.

Phase 6 automated checks and desktop preview QA passed on 19 November 2026. GitHub Pages deployed commit `5dd708e35357311b4a93969f475eeea36cf86b01`. The current browser tool does not expose mobile viewport emulation. See [ROADMAP.md](ROADMAP.md) for evidence and limits.

## Phase 8 video rendering

The Node.js source includes an FFmpeg renderer and `/api/render` job routes. It renders 1080p MP4 at 30/60 FPS in 16:9 or 9:16, with supported still-image motion, transitions, estimated captions, narration and dialogue. It enforces script/image/voice approval and the saved timeline manifest, and supports job progress, bounded queueing, cancel/retry, streamed preview and download. Post-production can add user-uploaded audio with trims, volume, fades and optional ducking, producing a derived MP4 while preserving the source render. Run on a Node.js single-process host with FFmpeg/libx264, ffprobe, temporary disk and SQLite storage. Job history and outputs are process-local and expire after one hour.

GitHub Pages cannot run Node.js APIs or FFmpeg. Its render and post-production screens remain RM0 simulations and never create an MP4. The production preview does not have a Node render host configured. See the Phase 8 QA matrix in [docs/phase8-qa-plan.md](docs/phase8-qa-plan.md) and evidence in [ROADMAP.md](ROADMAP.md).

## Phase 10 thumbnail and publishing kit
The thumbnail studio builds deterministic simulated portrait and landscape layout options from approved scene references, script context, and a saved brand kit. It supports editable overlay text, fonts and colors, manual PNG/JPEG/WebP upload up to 2 MiB, selected draft regeneration, explicit approval, and PNG download. The publishing kit provides local editable metadata suggestions for YouTube, TikTok, Instagram, and Facebook, plus copy, JSON download, and an export checklist. It has no social login, API calls, analytics, posting, or scheduling. GitHub Pages produces simulated thumbnail/render content and does not create an MP4. See [QA.md](QA.md) for test evidence and limitations.


## Development progress
Phases 1–10 are completed and deployed; Phase 11 is authorized and starts after the Phase 10 verification records finish deploying. See [ROADMAP.md](ROADMAP.md), [TASKS.md](TASKS.md), and [QA.md](QA.md). GitHub Pages is static and does not execute the SQLite API or FFmpeg routes. The Next.js render APIs require a Node.js host with FFmpeg/libx264 and writable temporary storage; no such production host is configured. The live Pages preview continues to simulate rendering and post-production and never claims to produce an MP4. Repository review also found legacy personal email metadata in three old public commits and HTTPS enforcement is currently disabled; see [DEPLOYMENTS.md](DEPLOYMENTS.md).
