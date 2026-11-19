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
- Reference images are limited to 2 MB each and 12 per project in the prototype.
- Do not add later production capabilities or alter approved decisions without user approval. Update `ROADMAP.md` and `DECISIONS.md` when decisions change.

## Development checks
Use Node.js 24 or newer. Run `npm ci`, `npm test`, `npm run build`, and `npm run build:static` as relevant. Keep credentials and personal information out of source, public artifacts, and logs.
