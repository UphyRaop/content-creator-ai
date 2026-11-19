# Content Creator AI — Project Instructions

## Product definition
CCAI is an AI-powered video creation application. Do not add social media automation, account management, or automated publishing features.

## Approved production workflow
1. Idea and reference input
2. Creative brief approval
3. AI script generation
4. Script approval
5. Scene breakdown and image prompt generation
6. AI image generation
7. Individual scene approval and regeneration
8. AI voice generation
9. Video timeline and editing
10. Video rendering
11. Post-production
12. Thumbnail generation
13. Video export

Preserve the existing approval gates: approve the brief before generating a script, approve the script before creating scenes, and approve every scene before generating voice. A regeneration must be user-triggered, use the edited prompt, and affect only the selected scene.

## Approved development roadmap
Use the 11 approved development phases in `ROADMAP.md`: Application Foundation; Multimodal Idea Input; AI Script Generation; Project and Character Management; AI Image Generation Studio; AI Voice Generation; Video Timeline and Editor; Video Rendering Engine; Post-Production Studio; Thumbnail and Publishing Kit; Final Testing and Deployment. Phases 1–6 are complete as a simulated prototype. The user authorized Phases 7–11 on 19 November 2026 (Malaysia time); complete sequentially without inter-phase approval, passing QA and deployment gates before advancing.

## Approved technology and operating constraints
- Next.js, TypeScript, Node.js built-in SQLite (`node:sqlite`), GitHub, and the existing source files. Do not use Supabase or Cloudflare.
- Keep AI providers interchangeable: Gemini for scripts, FLUX.1 Schnell for images, ElevenLabs for voice, and FFmpeg for rendering.
- Use simulated AI/media responses until the user approves API integration and costs. Never make paid API calls without approval. RM20 is the approved initial testing budget, not permission to spend automatically.
- `ccai.ur-project.biz` is the official domain. GitHub Pages serves a static development preview from `dist`; that preview uses browser-local storage and does not run the SQLite API. Keep the SQLite backend source for a future Node.js host with persistent disk.
- Main repository: `UphyRaop/content-creator-ai` (public). Backup repository: `UphyRaop/content-creator-ai-backup` (private). Preserve the backup; never migrate its Git history.

## Product requirements
- Support desktop and iPhone layouts, keyboard access, readable contrast, and light/dark themes.
- The dashboard supports project create, rename/edit, duplicate, delete, and autosave. SQLite stores project data on a Node.js deployment; the static Pages preview stores projects in that browser on that device.
- Settings include 1–5 minute duration, 9:16/16:9 aspect ratio, language, visual style, multiple categorized image references, and multiple HTTPS reference-video URLs.
- Phase 3 includes a simulated brief/script workflow for Pages and a server-only interchangeable Gemini adapter. Live API calls remain disabled unless the user separately approves them; provider keys must stay in server environment variables.
- Users may paste a transcript or reference excerpts. Do not fetch arbitrary URLs or remote media automatically.
- Preserve version history and invalidate approval plus downstream work when approved brief/script content changes.
- Reference images are limited to 2 MB each and 12 per project in the prototype.
- Phase 4 provides reusable character/location/series/brand/channel libraries; project and scene assignments; continuity context; project status, search and manual queue priorities; and JSON backup/import. Imports add new records and never overwrite existing data.
- Keep all content generation user-triggered and simulated. Project outfit overrides and scene assignments must not mutate reusable source profiles.
- Phase 5 adds a scene image studio with an interchangeable, server-only FLUX.1 Schnell adapter. The GitHub Pages app uses clearly labelled simulated images only. Live image calls remain blocked unless separately approved and configured with server-only credentials and known MYR pricing.
- Phase 5 scene breakdown requires an approved script. Scene edits never auto-generate; only confirmed rejected scenes may regenerate, approved scenes remain locked and unchanged, and voice stays blocked until every scene has an approved image.
- Image references are retained as project context, but FLUX.1 Schnell reference-image conditioning is not supported by the adapter and must not be claimed.
- Phase 6 provides reusable narrator/character voice profiles, secure encrypted server-side API account storage, simulated local tone clips, scene audio review and approval, duration measurement/synchronization, and a gated server-only ElevenLabs adapter. Public Pages never accepts or stores API keys.
- Phase 8/9 FFmpeg routes are Node-only and must remain server-only. Post-production accepts only a completed in-memory render job ID/version, bounded uploaded audio, allowlisted media, and validated track settings; it must preserve the original render and use generated FFmpeg filter labels/argv arrays. Never accept a caller filesystem path. Optional music and ducking default off.
- GitHub Pages remains local simulation-only for render and post-production: do not make API calls or imply MP4 files exist unless an actual Node render job produced one.
- Live ElevenLabs calls remain disabled. Do not alter approved decisions outside the current authorization. Keep the RM20 API budget untouched and use no paid APIs or hosting. Update `ROADMAP.md` and `DECISIONS.md` when decisions change.

## Development checks
Use Node.js 24 or newer. Run `npm ci`, `npm test`, `npm run build`, and `npm run build:static` as relevant. Keep credentials and personal information out of source, public artifacts, and logs.

## Autonomous development team
- `CCAI-01-LEAD` — project manager, architect, integrator, reviewer, and direct contact for the user.
- `CCAI-02-UIUX` — responsive frontend, navigation, accessibility, themes, and interaction states.
- `CCAI-03-BACKEND` — APIs, SQLite, workflow logic, validation, persistence, and server security.
- `CCAI-04-AI` — provider adapters and content-generation workflow; no live generation or paid calls without approval.
- `CCAI-05-QA` — independent automated/browser QA, regression, approval gates, and issue reports.
- `CCAI-06-DEVOPS` — GitHub, CI/CD, Pages, security, deployment, rollback, and operational documentation.
- The team has at most six agents including the lead. Activate only roles required for the current phase and prefer non-overlapping file assignments.
- Preferred agent configuration is GPT-6 Luna, medium reasoning, fast mode off wherever the interface supports configuration. Report unsupported or undisclosed settings plainly; never claim a configuration that was not actually applied.
- Every assignment records role label, task ID, objective, project context, files/components, dependencies, acceptance criteria, deliverables, status, tests, and blockers in `TASKS.md`.
- Agents report their label, status, files, implementation, checks, issues, and blockers. QA reviews independently and returns failed work for correction.
- Complete phases sequentially. Require QA evidence, regression checks, a production build, deployment verification, and documentation before moving to the next phase. Browser testing limitations must be recorded, never represented as a pass.

## Git and deployment safeguards
- Commit only verified changes to `main` using the GitHub noreply identity. Do not rewrite history, force-push, delete the private backup, expose credentials, change repository visibility, or introduce paid services without explicit approval.
- GitHub Pages is static. It cannot run SQLite persistence, background workers, private API-key vaults, or server-side FFmpeg. Label preview simulations accurately and keep server functionality in the Next.js source for a separately approved persistent host.
- Maintain `ROADMAP.md`, `DECISIONS.md`, `REVISIONS.md`, `TASKS.md`, `QA.md`, `DEPLOYMENTS.md`, and `HANDOVER.md` as the durable project record. Reuse equivalent documentation if it already exists.
