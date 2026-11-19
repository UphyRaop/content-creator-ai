# CCAI Deployment Record

## Current baseline
- Preview: https://ccai.ur-project.biz/
- Hosting: GitHub Pages from `dist/`; deploy workflow is configured on `main`.
- Last verified Phase 6 commit: `3d242ea81161084dbcc83cece53b1bcd126f4998`; Pages run `44476812207` succeeded.
- Phase 7 source commit `45438475cdedf4102b6d8c0bc28145b2a2aad4f2` reached `main`. Its first Pages run `44491505808` failed at `npm run build:static` because the workflow had not run `npm ci` after the build began importing the TypeScript compiler.
- The workflow now installs lockfile dependencies before the static build. Verification of the corrective deployment and custom-domain response is pending.

## Hosting limits
GitHub Pages serves static files. It cannot run the SQLite API routes, persistent server storage, background workers, or server FFmpeg. These features remain unavailable in the live static preview unless a separately approved production host is provided.
