# CCAI Deployment Record

## Current baseline
- Preview: https://ccai.ur-project.biz/
- Hosting: GitHub Pages from `dist/`; deploy workflow is configured on `main`.
- Phase 9 latest confirmed source commit: `1c3fc800efa8c3de1759c3e7ffec850b463888f5`; GitHub Pages workflow run `44507225298` completed successfully. The deployment publishes the static post-production simulation only.
- Last verified Phase 6 commit: `3d242ea81161084dbcc83cece53b1bcd126f4998`; Pages run `44476812207` succeeded.
- Phase 7 source commit `45438475cdedf4102b6d8c0bc28145b2a2aad4f2` reached `main`. Its first Pages run `44491505808` failed at `npm run build:static` because the workflow had not run `npm ci` after the build began importing the TypeScript compiler.
- The workflow now installs lockfile dependencies before the static build. Corrective commit `9e050e77eede07a25c9236b265313190bcc7ab19` deployed successfully in Pages run `44492004150`. `https://ccai.ur-project.biz/` returned HTTP/2 200 with updated HTML; `/timeline-workflow.js` returned HTTP 200. TLS handshake completed for `ccai.ur-project.biz`; the local egress proxy presents an intercepted certificate, so the public certificate issuer/chain was not independently observed. GitHub API confirmed both commit author and committer addresses use `@users.noreply.github.com`.

## Hosting limits
GitHub Pages serves static files. It cannot run the SQLite API routes, persistent server storage, background workers, or server FFmpeg. These features remain unavailable in the live static preview unless a separately approved production host is provided.

## Phase 9 deployment record
- Phase 9 Node post-production adds a real FFmpeg route to create derived video files from completed in-memory render jobs. It preserves the source render. The route is not available on GitHub Pages; the deployed prototype is local-storage simulation only and creates no MP4.
- Phase 9 code QA and local production build passed on 19 November 2026 (Malaysia time). Commit `1c3fc800efa8c3de1759c3e7ffec850b463888f5` was pushed to `main` by a fast-forward GitHub integration update; Actions run `44507225298` completed successfully. The deployed URL `https://ccai.ur-project.biz/` loaded in Chromium over HTTPS with the expected dashboard.
- HTTPS URL currently returns 200, but Pages API reports HTTPS enforcement disabled and HTTP does not redirect. The available connector cannot change Pages settings; enable “Enforce HTTPS” manually in repository Settings → Pages.
