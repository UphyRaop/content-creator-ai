# CCAI Deployment Record

## Current baseline
- Preview: https://ccai.ur-project.biz/
- Hosting: GitHub Pages from `dist/`; deploy workflow is configured on `main`.
- Phase 10 latest confirmed source commit: `8efc7b73722f29b9ae851051edf9b6a910f4c496`; GitHub Pages workflow run `44511713809` completed successfully. The deployed preview contains the simulated thumbnail and local publishing kit.
- Last verified Phase 6 commit: `3d242ea81161084dbcc83cece53b1bcd126f4998`; Pages run `44476812207` succeeded.
- Phase 7 source commit `45438475cdedf4102b6d8c0bc28145b2a2aad4f2` reached `main`. Its first Pages run `44491505808` failed at `npm run build:static` because the workflow had not run `npm ci` after the build began importing the TypeScript compiler.
- The workflow now installs lockfile dependencies before the static build. Corrective commit `9e050e77eede07a25c9236b265313190bcc7ab19` deployed successfully in Pages run `44492004150`. `https://ccai.ur-project.biz/` returned HTTP/2 200 with updated HTML; `/timeline-workflow.js` returned HTTP 200. TLS handshake completed for `ccai.ur-project.biz`; the local egress proxy presents an intercepted certificate, so the public certificate issuer/chain was not independently observed. GitHub API confirmed both commit author and committer addresses use `@users.noreply.github.com`.

## Hosting limits
GitHub Pages serves static files. It cannot run the SQLite API routes, persistent server storage, background workers, or server FFmpeg. These features remain unavailable in the live static preview unless a separately approved production host is provided.

## Phase 9 deployment record
- Phase 9 Node post-production adds a real FFmpeg route to create derived video files from completed in-memory render jobs. It preserves the source render. The route is not available on GitHub Pages; the deployed prototype is local-storage simulation only and creates no MP4.
- Phase 9 code QA and local production build passed on 19 November 2026 (Malaysia time). Commit `1c3fc800efa8c3de1759c3e7ffec850b463888f5` was pushed to `main` by a fast-forward GitHub integration update; Actions run `44507225298` completed successfully. The deployed URL `https://ccai.ur-project.biz/` loaded in Chromium over HTTPS with the expected dashboard.
- HTTPS URL currently returns 200, but Pages API reports HTTPS enforcement disabled and HTTP does not redirect. The available connector cannot change Pages settings; enable “Enforce HTTPS” manually in repository Settings → Pages.

## Phase 10 deployment record
- Fast-forward commit `8efc7b73722f29b9ae851051edf9b6a910f4c496` (“Implement Phase 10 thumbnail and publishing kit”) is on `main`; author and committer use the GitHub noreply address. Pages workflow run `44511713809` completed successfully.
- `https://ccai.ur-project.biz/` loaded over HTTPS in the cloud browser. A read-only DOM check confirmed the page title “CCAI · Video Studio” and presence of the Phase 10 thumbnail and publishing-kit markers. Browser interaction QA is limited; see `QA.md`.
- GitHub Pages remains static: thumbnail variations and render/export states are simulations and browser-local persistence. It cannot run SQLite, Node API routes or FFmpeg. GitHub API reports `https_enforced:false`; HTTP still returns 200, so owner action is required to enable HTTPS enforcement.

## Phase 11 deployment verification
- Fast-forward commit `ba5a9d26c74355721d6a978f727b9e175ed2ce71` (“Complete Phase 11 audit and safety fixes”) reached `main`; both author and committer use `355911884+UphyRaop@users.noreply.github.com`. No history rewrite or force-push occurred.
- GitHub Actions Pages run `44517625068` completed successfully for this commit. Documentation follow-up commit `351a4d7171062f280ff1d44c0401cc02383d2cf4` (recording the verification) also deployed successfully in run `44518253736`; it did not change application code.
- `https://ccai.ur-project.biz/` loaded in Chrome after deployment. The desktop DOM showed the CCAI project dashboard, seven existing browser-local projects, `All Status`, `All Series`, and the `SIMULATED · COST RM0` label. No project data was edited. This confirms the static preview is accessible and does not verify every interaction.
- Mobile/tablet and keyboard runtime checks after deployment were not performed. The cloud browser did not expose viewport emulation; responsive behavior is source/build-tested only.
- This is a static prototype deployment only. It does not enable or deploy the SQLite/Node API routes. Production backend remains blocked pending authentication/ownership and a supported persistent Node host.
- GitHub Pages’ last verified setting is `https_enforced:false`: HTTPS responds, but HTTP also responds 200. Owner action is still needed to enforce HTTPS. Legacy personal email metadata remains in old public commits; no history rewrite occurred. See `QA.md`.
