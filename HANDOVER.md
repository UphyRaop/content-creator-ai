# CCAI Continuation Notes

- Current task is Phase 11 finalization for CCAI. Workspace `/workspace/ccai-qa-checkout` contains a stale local Git history; treat GitHub `main` SHA `98275deb11bfa611df006b8e92bfc4e0829d80ea` as the source of truth and synchronize via the GitHub connector only.
- User authorized Phases 7–11 together. Phase 11 safe code fixes and automated QA are complete with PARTIAL PASS. Latest P11 source/docs commit and Pages run will be recorded in `DEPLOYMENTS.md` after sync. Do not begin unapproved work beyond Phase 11.
- Phase 7 is deployed at https://ccai.ur-project.biz/ (Pages run `44492004150`, commit `9e050e77eede07a25c9236b265313190bcc7ab19`). Automated tests/builds and independent code QA passed; browser/mobile testing remains unavailable.
- GitHub Pages is static. SQLite API and server FFmpeg cannot run there; never present a simulation as actual persistent server storage or an actual render.
- Phase 8 tests passed with local FFmpeg 7.1.5: six transitions, approval/timing checks, queue/cancel/retry, monotonic progress, portrait/landscape metadata, and streamed preview/download code. Route HTTP byte-range responses and browser/mobile views remain unverified. Render jobs and output are process-local for one hour.
- Phase 9 adds local uploaded-audio waveforms, non-destructive settings/revisions, default-off music/ducking, plus a real Node FFmpeg post-production endpoint for derived MP4 revisions. Focused fixtures and independent QA passed. No sample-level fade/ducking test, route HTTP cancel/retry, or mobile/browser interaction has been run. Pages remains simulation-only with no post-production API calls.
- The GitHub Pages API currently reports `https_enforced:false`. HTTPS works, but HTTP does not redirect. The connector cannot update this setting; the GitHub browser tab is signed out, so the owner must enable “Enforce HTTPS” at `https://github.com/UphyRaop/content-creator-ai/settings/pages`.
- Before sync, re-read GitHub `main`; build a tree from the exact latest remote tree, use one parent and GitHub noreply identity, then update `main` fast-forward only with `force:false` and the exact expected head. Do not use local `git push`, rewrite history, or force-push. Exclude build cache, local hosting metadata, and secrets.
- Latest security scan found no common credentials or private keys in the source, but three older public commits expose personal author/committer email metadata. Do not rewrite history without approval. GitHub Pages reports `https_enforced:false` and HTTP responds 200; the owner must enable Enforce HTTPS in repository Pages settings. Preserve the private backup.
- Keep RM0 cost, leave RM20 untouched, preserve private backup, use GitHub noreply identity, and do not force-push.


## Phase 11 handover
- Preview: https://ccai.ur-project.biz/ ; public repository: `UphyRaop/content-creator-ai`; private backup `UphyRaop/content-creator-ai-backup` remains intact.
- Phase 11 is an audit-complete, partial-pass state; latest commit and Pages run are in `DEPLOYMENTS.md`. All automated suites/builds pass, but browser interactions after this change were not tested.
- Static GitHub Pages is simulation-only. It does not run SQLite, Node APIs, AI providers, background jobs, or FFmpeg.
- Production release blockers: unauthenticated project/entity APIs can disclose or overwrite records and forge stored approval states; no persistent Node host; Pages HTTPS enforcement is disabled; three old public commits contain personal author/committer email metadata.
- Do not configure a public Node server until authentication and per-user/project ownership are implemented. Do not rewrite Git history without separate approval. Owner must enable Pages “Enforce HTTPS” in repository Settings → Pages.
- Costs RM0; RM20 budget remains unused. Live Gemini/FLUX/ElevenLabs calls were not made.
