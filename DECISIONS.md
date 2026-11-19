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

## Development boundary
- Phases 1–6 are complete as a simulated prototype. Phase 7 requires separate user approval.
- The GitHub Pages preview uses local simulation. Live Gemini calls are disabled by default and require separate explicit approval; no credential has been configured or used.
- Brief/script approval is required before downstream stages. Changes to the approved brief or script clear approval and downstream state. Script versions are stored with the project payload.
- Reference links are not fetched. Users can paste transcript/reference excerpts for context; inaccessible content is described gracefully.
- No real AI, image, voice, or FFmpeg rendering integration is active. All provider/media responses remain simulated.
