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
- Store uploaded references with the project. Prototype image limits: 2 MB per image and 12 images per project.
- Preserve all workflow and approval gates; approved work must not be unnecessarily regenerated.

## Development boundary
- Phase 1 and Phase 2 are complete. Phase 3 has not started and requires the user's approval after reviewing the preview.
- No real AI, image, voice, or FFmpeg rendering integration is active. All provider/media responses remain simulated.
