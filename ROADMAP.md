# CCAI Roadmap and Progress

## Product definition
CCAI is an AI-powered video creation application. Social account management, content calendars for social posting, automated publishing, and social analytics are out of scope.

## Approved production workflow
1. Idea and reference input
2. Creative brief approval
3. AI script generation
4. Script editing and approval
5. Scene breakdown and image prompt generation
6. AI image generation
7. Individual scene approval and regeneration
8. AI voice generation
9. Video timeline and editing
10. Video rendering
11. Post-production
12. Thumbnail generation
13. Video export

Approval gates are mandatory: no script before the brief is approved; no scene breakdown before the script is approved; no voice before every scene is approved. Regeneration is selected-scene only and must use the revised prompt. Simulated AI responses must not be described as live integrations.

## Phase status

- [x] **Phase 1 — Cloud Infrastructure and Dashboard:** project dashboard, create/edit/duplicate/delete, browser autosave for static preview, SQLite-backed server API, navigation, and light/dark themes.
- [x] **Phase 2 — AI Content Planning:** idea/reference inputs; duration 1–5 minutes; 9:16 and 16:9; language and style; multiple categorized image references; multiple HTTPS video URLs; existing approval gates preserved.
- [ ] **Phase 3 — AI Content Production:** not started; requires user approval. Real API use is also gated by user approval and budget.
- [ ] **Phase 4 — Approval Center:** not started.
- [ ] **Phase 5 — Social Media Automation:** not part of the approved CCAI product; do not implement.
- [ ] **Phase 6 — Analytics and Optimization:** not started; requires scope approval.

## Current preview and infrastructure
- Public main repository: `UphyRaop/content-creator-ai`.
- Private backup: `UphyRaop/content-creator-ai-backup`; keep it intact.
- Static preview: [https://ccai.ur-project.biz/](https://ccai.ur-project.biz/), deployed from `dist` using GitHub Actions on pushes to `main`.
- GitHub Pages preview persistence is browser-local and device-local. SQLite API routes and storage are preserved in source but need a Node.js server with persistent writable storage; GitHub Pages cannot execute them.
- No external hosting provider, paid subscription, or live AI/media API was introduced.

## Migration and verification record
- Migrated the source snapshot from the private backup to public `main` in commit `d343d21c0eda74f12b9bf8188b4b757e90b014aa`; backup Git history was not migrated. The private backup remains intact.
- Scanned all 23 published files before upload and rescanned the remote blobs. No credentials, tokens, private keys, JWTs, personal emails, stale preview-repository references, or obsolete Sites project ID were found. The unused `.openai/hosting.json` Sites identifier was excluded.
- Verified the migration commit author and committer use the GitHub noreply address.
- Regression checks after migration: all five project-store tests, TypeScript check, static build, and Next.js production build passed.
- GitHub Actions run `44447043844` deployed successfully. The custom domain `https://ccai.ur-project.biz/` loads with HTTPS. Desktop browser check passed at 1180 px with no horizontal overflow or page console errors.
- Mobile viewport check remains unverified: the managed browser blocks DevTools/device emulation by organization policy. Responsive CSS breakpoints are present; this is not a mobile test pass.
- Phase 3 has not started and still requires user approval.

## Cost status
No AI/media API calls or paid hosting were used. The RM20 testing budget remains untouched.
