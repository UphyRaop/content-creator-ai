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


## Production readiness continuation checkpoint — 19 November 2026
- Local source and regression verification are complete. The next deployment record must name the exact fast-forward commit, Actions run result, and accessible preview response.
- Sync must use GitHub's current `main` as parent and the noreply address `355911884+UphyRaop@users.noreply.github.com`; never force-update or rewrite history. Preserve `content-creator-ai-backup`.
- Deployment can only publish the static simulation. SQLite, authentication routes, background processing and FFmpeg require a separately approved persistent Node host.
- Owner action remains: enable Settings → Pages → Enforce HTTPS. No DNS change was made.


## Production readiness deployment verification — 19 November 2026
- **PASS:** `npm audit --audit-level=high` reported 0 vulnerabilities (including production and development dependency tree).
- Commit `6bc9831852b7a378b500e652cb3531740ea09c65` was added to `main` by a fast-forward from `ab61711b1eb332a008c5e7579343f3e4dba2604b`. GitHub reports author and committer `355911884+UphyRaop@users.noreply.github.com`. No force push or history rewrite occurred.
- Pages workflow run [`44542558589`](https://github.com/UphyRaop/content-creator-ai/actions/runs/44542558589) completed successfully; install, static build, Pages configure, artifact upload, and deploy steps all succeeded.
- `https://ccai.ur-project.biz/` returned HTTP 200 after deployment. The downloaded response SHA-256 matched local `dist/index.html` (`14ec582d7ddc80ab7c5acb3c5dd9f5c75dd00bdd6fab44f9a1d857411fdfca74`). Expected CCAI title, status labels and RM0 simulation marker were present.
- HTTPS returned 200 with `curl` verification result 0. The managed egress proxy substituted its own certificate for `ccai.ur-project.biz`, so the origin/GitHub Pages certificate chain was not independently inspected. Plain HTTP also returned 200 with zero redirects: owner must still enable Settings → Pages → Enforce HTTPS. No DNS records were changed.
- The deployed site is desktop-accessible. Mobile/tablet viewport testing is not available through the active browser-control tools; local desktop E2E was performed separately on isolated synthetic data.


## Phase 12 deployment boundary
- Deployment is limited to the existing GitHub Pages static preview and its simulated usage dashboard. Do not create a GCP project, Cloud Run service/job, Cloud Billing export, logging sink, storage bucket or paid API activation.
- Pages cannot run the persistent SQLite usage ledger, secure telemetry adapter, Cloud Run orchestration or true emergency stop. These remain server-side preparation only.

## Phase 12 preview verification — 19 November 2026
- Fast-forward commit `dd4c08340f6680e00809176f2d20982b18ba9f6c` (“Implement Phase 12 cloud usage protection”) reached `main`; both author and committer use `355911884+UphyRaop@users.noreply.github.com`.
- GitHub Actions Pages run [`44563461113`](https://github.com/UphyRaop/content-creator-ai/actions/runs/44563461113) completed successfully. Checkout, install, static build, artifact upload and deploy steps passed.
- `https://ccai.ur-project.biz/` loaded over HTTPS in Chrome. The desktop dashboard displayed “LIVE METRICS UNAVAILABLE,” demo-only RM costs, provisional 2 vCPU/4 GiB and 300-video planning assumptions, and unavailable resource meters. The simulated emergency-stop control changed the local preview status; it did not affect any real workload. CCAI page-origin console errors were not observed; only extension errors appeared.
- Desktop dashboard smoke check ran at 1168×735. Mobile/tablet viewport testing remains unverified. This is the Pages-only UI; it does not execute SQLite, authenticated API routes, telemetry import, or Cloud Run jobs.
- No Google Cloud resource, billing configuration, API, hosting subscription or charge was created. Cost RM0; RM20 remains untouched. The private backup repository was not changed.

## Phase 12–14 continuation deployment — 19 November 2026
- Commit `8d021590fbf060245020356ca573a7732f1b4b00` (“Harden provider admission and document cloud readiness”) fast-forwarded from `5b2e66dac4cb0d11f0279b0649b52d3538bf0fb6` with GitHub noreply author/committer. GitHub Pages Actions run [`44581029545`](https://github.com/UphyRaop/content-creator-ai/actions/runs/44581029545) completed successfully.
- Preview `https://ccai.ur-project.biz/` loaded over HTTPS in shared Chrome after sync. Search and status filter behavior passed at 1180×757; document width did not overflow the viewport. Console showed a browser-extension error only, no CCAI-origin errors. The mobile/tablet viewport was not emulated.
- The checkout's local `origin` points to `/workspace/ccai-history-rewrite.git`; no local push was attempted. GitHub integration was used against current remote `main` with an expected-head fast-forward update and no history rewrite.
- Gemini now has a 45-second request timeout and conservative cost fallback when usage metadata is absent. FLUX sample download requires an exact `CCAI_FLUX_OUTPUT_HOSTS` allowlist and rejects redirects; this must be configured/validated by an owner only if live FLUX is later approved. No provider requests were executed.
- GitHub Pages continues as static simulation only; it cannot host the Node APIs, SQLite ledger, FFmpeg, Cloud Run workers, or secret manager.
- Phase 13 deployment remains BLOCKED. Do not deploy until the owner selects the data/runtime architecture and approves any associated recurring cost, billing account use, IAM/service secrets, database/media migration and rollback. No DNS changes were made.
- Current public `main` history scan found personal email metadata in three older commits. Current commits use noreply. History was not rewritten or force-pushed under the project restrictions; treat this as an outstanding privacy issue.
