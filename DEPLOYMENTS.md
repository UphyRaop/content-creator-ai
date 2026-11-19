# CCAI Deployment Record

## Current baseline
- Preview: https://ccai.ur-project.biz/
- Hosting: GitHub Pages from `dist/`; deploy workflow is configured on `main`.
- Last previously verified application commit: `3d242ea81161084dbcc83cece53b1bcd126f4998`.
- Last previously reported successful Pages workflow: run `44476812207`.
- Phase 7 source has not yet been published. Record the new commit, Actions run and URL checks here only after verifying the actual remote state.

## Hosting limits
GitHub Pages serves static files. It cannot run the SQLite API routes, persistent server storage, background workers, or server FFmpeg. These features remain unavailable in the live static preview unless a separately approved production host is provided.
