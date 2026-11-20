# Approved Requirements and Decisions

## Product
- Name: Content Creator AI (CCAI).
- CCAI is an AI-powered video creation application, not a social-media automation product.
- Target devices: iPhone and desktop. Visual direction: premium corporate dark mode with a light mode option.
- The approved 13-stage production workflow and approval gates are in `ROADMAP.md` and `AGENTS.md`.
- Image and text content only for now; video generation is not part of this prototype.

## Technology and hosting
- Application: Next.js and TypeScript.
- Project storage for server deployments: Node.js built-in SQLite (`node:sqlite`) with a persistent writable data directory. Do not use Supabase or Cloudflare.
- Public development preview: GitHub Pages from `UphyRaop/content-creator-ai`, served at `https://ccai.ur-project.biz/`.
- Pages is static hosting. The deployed prototype stores projects in browser-local storage on that device; it does not run the SQLite API. Keep the SQLite backend source in this repository for a future Node.js deployment with persistent storage.
- GitHub Actions deploys the static build in `dist` whenever `main` is updated.
- `UphyRaop/content-creator-ai-backup` is the private backup. Keep it intact and private. Do not bring its Git history into the public main repository.

## AI providers and cost controls
- Script generation: Gemini API.
- Image generation: FLUX.1 Schnell.
- Voice generation: ElevenLabs.
- Video rendering: FFmpeg.
- Provider adapters must remain interchangeable.
- Prototype responses are simulated. Do not send real API calls or incur costs without explicit approval. The RM20 initial test budget remains unspent unless separately authorized.

## Phase 1 and Phase 2 requirements
- Use SQLite instead of Supabase for persistent server-side project storage.
- Dashboard operations: create, edit/rename, duplicate, delete, and autosave.
- Project settings: duration 1–5 minutes, 9:16 or 16:9, language, and visual style.
- Allow multiple character, background, and storyboard image references and multiple HTTPS reference-video URLs.
- Support desktop/mobile navigation and dark/light modes.

## Phase 4 approved scope
- Reusable character, location, video-series, brand-kit and channel-profile libraries. Library images are reference assets; no image generation runs automatically.
- Projects may be standalone or assigned to a series/season/episode, channel, brand kit, characters, and locations. Scene assignments and project-specific appearance/outfit overrides do not mutate reusable profiles.
- Previous events, character arcs, unresolved storylines and episode summaries can be supplied as continuity context to the creative brief. The existing brief/script approval gates remain mandatory.
- Project statuses are Draft, In Progress, Awaiting Approval, Completed and Archived. Queue priority is manually managed. No social account management or automated publishing.
- JSON project/library backup and import adds copies and prevents overwrites by default. Imported content is validated and existing workflow/version history is preserved.
- GitHub Pages continues to use browser-local storage; server-hosted libraries use the existing SQLite database. No external service, paid API or new subscription is approved.
- Store uploaded references with the project. Prototype image limits: 2 MB per image and 12 images per project.
- Preserve all workflow and approval gates; approved work must not be unnecessarily regenerated.

## Phase 5 approved scope
- The Image Generation Studio has an interchangeable, server-only FLUX.1 Schnell adapter. The static Pages preview uses clearly labelled simulated image placeholders at Full HD canvas sizes; each generation version has a unique identifier. The simulator costs RM0.
- Live FLUX calls remain disabled by default and require separate approval, a server-side API key, known positive per-image MYR pricing, and a project spending limit. The RM20 test budget remains unused. Unknown live pricing is not represented as RM0.
- FLUX.1 Schnell reference-image conditioning is not supported by this adapter and is not claimed. Manual image uploads can be cropped to 9:16 or 16:9 output without stretching.
- Scene breakdown requires an approved script. Scene edits are explicitly saved and never auto-generate. Confirmed decisions regenerate rejected scenes only from their latest saved text and prompt. Approved scenes remain locked and unchanged, and voice remains blocked until every scene image is approved.
- The studio tracks image versions and restoration, manual replacement/crop/download, queue status/progress/retry/cancel, interrupted-job recovery, deduplication, approval progress, and simulated generation/regeneration usage. The workflow was regression-tested in the live desktop preview; mobile viewport behavior remains unverified. Browser-local image history is subject to the browser storage quota; SQLite remains the future server-storage architecture.

## Phase 6 approved scope
- Phase 6 is implemented as a simulated voice prototype. The preview produces clearly labelled local tone samples, not AI speech, and records zero credits/RM0. No provider call was made and the RM20 budget remains untouched.
- Voice lines stay locked until every scene image is approved. Each scene can contain narration/dialogue lines with reusable narrator or character profiles; changes are explicitly saved, do not trigger generation, and reset approval only for the edited line. Approved audio remains locked until explicitly unlocked. Only confirmed rejected lines regenerate.
- Manual audio uploads retain version history, use browser-measured duration, and update scene timing. Timeline access requires every voice line to be approved.
- ElevenLabs keys are unavailable in public Pages. A future HTTPS Node.js deployment can manage multiple authorized keys through an admin-token-gated API and AES-256-GCM encrypted SQLite vault. Keys are not returned, logged, placed in source, or stored in browser storage. Server vault variables are blank in `.env.example`. No user key or account was configured.
- Live ElevenLabs calls remain disabled unless separately approved and configured with known model credits and MYR rates. The preview reports account balance as not checked because it makes no live balance request. Emotional delivery and free-text pronunciation are not sent as unsupported ElevenLabs controls.
- Before future live batch generation, the server estimates aggregate batch credits and MYR cost and compares that amount against the saved project limit. Unknown rates or over-limit batches are rejected before contacting the provider. Phase 6 verification is recorded in `ROADMAP.md`; the RM20 budget remains untouched.

## Development boundary
- Phases 1–6 are complete as a simulated prototype. The user authorized Phases 7–11 for autonomous sequential development on 19 November 2026.
- The GitHub Pages preview uses local simulation. Live Gemini calls are disabled by default and require separate explicit approval; no credential has been configured or used.
- Brief/script approval is required before downstream stages. Changes to the approved brief or script clear approval and downstream state. Script versions are stored with the project payload.
- Reference links are not fetched. Users can paste transcript/reference excerpts for context; inaccessible content is described gracefully.
- No live AI, image, or voice provider call is authorized. Phase 8 adds real local/server FFmpeg rendering, while GitHub Pages continues to simulate rendering. No rendering service is configured in production.


## Phase 7–11 authorization (19 November 2026, Malaysia time)
- The user authorized autonomous development through Phases 7–11 under the attached multi-agent protocol.
- Keep RM20 testing budget untouched. No paid APIs, subscriptions, hosting, or external providers. Simulations must be labeled.
- Preserve the existing SQLite backend, browser-local Pages preview, public main, and private backup. Do not rewrite Git history or force-push.
- Each phase must pass its appropriate QA and deployment checkpoint before the next phase; Pages cannot run the Node/SQLite API or server-side FFmpeg.

## Phase 8 technical decisions
- Render locally/server-side with the system FFmpeg executable plus libx264 and ffprobe; do not add a hosted render provider or dependency. Use 1080p H.264/AAC MP4, 9:16 or 16:9, at 30 or 60 FPS.
- Run one FFmpeg render at a time with at most five queued jobs. Jobs, status history and temp outputs are process-local and retained for up to one hour; persistent render jobs require a single-process host with durable storage or a future database-backed queue.
- Enforce approved script, images and every saved approved voice segment; each voice segment must be represented exactly once in the timeline manifest. Captions and clips must fit inside the declared timeline duration. Preserve absolute scene/audio/caption timing and gaps.
- GitHub Pages stays simulation-only and never calls the Node render routes. No real MP4 is claimed or produced on the preview site.
- Do not introduce production hosting without separate approval. Pages HTTPS responds, but GitHub reports enforcement is disabled; HTTP is not redirected. The connected GitHub tools cannot update Pages settings, and the current browser session is signed out.

## Phase 9 technical decisions
- Post-production accepts user-uploaded music, voice recordings and sound effects only; it does not generate or add audio automatically. Music and ducking are disabled by default.
- The source render is immutable. Every post-production export is a new derived FFmpeg job tied to the completed parent job ID and exact version.
- Audio track limits: 12 tracks, 8 MiB per audio file, 24 MiB total; request JSON is limited to 32 MiB. Validate type, duration, source trim, fades, gain and duck targets before FFmpeg.
- Node post-production uses the existing bounded local render queue, generated temporary paths, safe argv invocation, server-generated FFmpeg graph labels, and ffprobe output validation. Derived files/jobs expire after one hour and are process-local.
- The Pages preview records local post-production settings and simulated revision history only. It does not call APIs or create an MP4. No paid APIs, hosting, storage service, or subscriptions were introduced; RM20 remains unused.

## Phase 10 technical decisions
- On GitHub Pages, thumbnail concepts are deterministic layout simulations using approved local script/scene/brand context; no image-generation provider is called. Manual thumbnail uploads are local-only, PNG/JPEG/WebP, and capped at 2 MiB.
- Thumbnail approval is global across portrait and landscape options and is required before the publishing kit unlocks. Publishing metadata is a local suggestion/export format only; there is no social account connection, analytics, upload, scheduling or automatic posting.
- No paid APIs, hosting, dependencies, or subscriptions were added. RM20 remains untouched.


## Phase 11 decisions and constraints
- Automated AI script/image and FFmpeg render routes now use saved project data and a canonical approved timeline hash; Gemini also requires positive prices and a per-request MYR ceiling before network access. Live provider switches remain disabled and no calls were made.
- The production-readiness continuation implements session authentication, project/entity ownership, and server-held approval records with content freshness checks. These protections are covered by the API QA suite. Do not expose the Node APIs until a supported production deployment has been configured and reviewed.
- Do not rewrite the old public Git history without separately approved history rewrite; it contains personal author/committer email metadata. New commits continue using GitHub noreply identities.
- Keep GitHub Pages HTTPS-only enforcement enabled as an owner action; current connector cannot toggle the Pages setting.


## Phase 12 — Google Cloud usage protection (19 November 2026)
- Google Cloud is approved as the future hosting provider. RM0 monthly hosting is the target; this is not a promise that workloads beyond free allowances are cost-free. No Cloud project/resource, paid service, billing change or deployment is authorized by this decision.
- Evaluate Cloud Run Services plus Cloud Run Jobs for the future architecture; 2 vCPU/4 GiB render benchmark and 300 videos/month are provisional assumptions only. Keep minimum instances at zero where supported.
- Usage and free-tier allowances may be shared across projects/services under one billing account. Model a shared allowance pool and use official current documentation; do not count the same free quota once per CCAI service. The app's billing cycle must be explicit and historical periods retained.
- Only fresh, verified usage telemetry may authorize cloud operations. Unknown, stale, estimated or simulated usage must not satisfy the production preflight. Track actual, reserved, remaining and estimated cost separately. Cloud operations that could incur unapproved paid usage fail closed.
- Budget alerts notify but do not alone guarantee a hard spending cap. Strict RM0 protection requires service-specific limits plus an operational stop/disable-billing plan approved by the owner; no such cloud control is active yet.
- The Pages section is a local simulation and must label all values simulated/estimated. No Google Cloud metrics or API credentials may be exposed in the browser.
- Render jobs require durable database state, idempotency, bounded retries/timeouts, transactional resource reservations, and permanent media in durable object storage or persistent volumes; ephemeral Cloud Run files are temporary only. No storage product is selected until free-tier and pricing suitability are confirmed.
- Phase 12 implementation status: SQLite metering history, Pacific billing windows, resource-unit pools, warning/projection logic and emergency-stop state are implemented and tested. Cloud reservation admission remains disabled with HTTP 503 until trusted multi-pool estimates/metrics and a durable worker can reserve all affected resources. This does not authorize live provider use or cloud resources.

## Phase 13–14 readiness findings (19 November 2026)
- Existing decision to use SQLite remains unchanged for local development and current app data. Cloud Run's ephemeral filesystem and FUSE/NFS storage semantics are not safe for this SQLite database or permanent media.
- Architecture alternatives have not been approved: (A) one VM plus persistent POSIX disk to preserve SQLite, with ongoing host cost; or (B) Cloud Run Service/Jobs plus Cloud SQL/PostgreSQL, Cloud Storage, and durable job records/queue, with a data migration and persistent service charges. Review `docs/phase13-cloud-architecture-review.md` before selecting either.
- No architecture switch, GCP deployment, billing activation, live API, or credential configuration is authorized by this preparation task. RM0 remains a design goal, not a guarantee or verified bill.
- Phase 14 adapters remain disabled. Provider and renderer actions must not be enabled until cloud metering, idempotency, durable job state, and ambiguous-outcome reconciliation are connected and verified.

## Branding and Developer Mode preview decision (2026-11-20)
- Approved brand: black `#090909`, orange `#FF8A24`, maroon `#800024`; preserve existing themes, saved data, approvals, and production workflow.
- The public GitHub Pages logo's seven-tap sequence may reveal only an unavailable notice. It must not expose the developer console or privileged controls.
- Recent server-side owner reauthentication is not implemented. The Node endpoint stays unavailable (503) for authenticated requests, with unauthenticated requests rejected; no browser flag can enable it.
- No screenshot or exact viewport runtime evidence is available from the restricted browser sandbox. Treat all six viewports as NOT TESTED until captured in a supported browser.
