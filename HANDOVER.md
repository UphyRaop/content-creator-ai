# CCAI Continuation Notes

- Continue from `/workspace/ccai-qa-checkout`; preserve existing Phase 1–6 source and project architecture.
- Phases 7–11 are authorized. Phase 7 is complete. Phase 8 implementation and independent code QA pass; source sync and Pages deployment are pending. After a successful Pages deployment, proceed to Phase 9 under the existing authorization.
- Phase 7 is deployed at https://ccai.ur-project.biz/ (Pages run `44492004150`, commit `9e050e77eede07a25c9236b265313190bcc7ab19`). Automated tests/builds and independent code QA passed; browser/mobile testing remains unavailable.
- GitHub Pages is static. SQLite API and server FFmpeg cannot run there; never present a simulation as actual persistent server storage or an actual render.
- Phase 8 tests passed with local FFmpeg 7.1.5: six transitions, approval/timing checks, queue/cancel/retry, monotonic progress, portrait/landscape metadata, and streamed preview/download code. Route HTTP byte-range responses and browser/mobile views remain unverified. Render jobs and output are process-local for one hour.
- The GitHub Pages API currently reports `https_enforced:false`. HTTPS works, but HTTP does not redirect. The connector cannot update this setting; the GitHub browser tab is signed out, so the owner must enable “Enforce HTTPS” at `https://github.com/UphyRaop/content-creator-ai/settings/pages`.
- The local Git checkout history is stale. To sync, create file blobs, create a tree from latest remote main tree `3106b4b56dfcb23a23af46c4c1335cf0663262d1`, create one-parent commit with GitHub noreply identity and update main via `github_update_ref` with `force:false` and expected SHA `9e050e77eede07a25c9236b265313190bcc7ab19`. Do not use local push or rewrite history.
- Current repo scan covered 57 text files and found no common token/private-key/personal-email patterns. Three older public commits still include personal author/committer emails; do not rewrite history. Preserve the private backup.
- Keep RM0 cost, leave RM20 untouched, preserve private backup, use GitHub noreply identity, and do not force-push.
