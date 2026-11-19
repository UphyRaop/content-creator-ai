# Content Creator AI (CCAI)

CCAI is an AI-assisted video creation workspace with a project dashboard and an approval-gated 13-stage production prototype. Phase 1 and Phase 2 are complete. AI and media responses remain simulated; there are no paid API calls.

## Preview

Open the live static development preview: **[https://ccai.ur-project.biz/](https://ccai.ur-project.biz/)**.

GitHub Pages serves `dist/index.html`. The preview saves project data in browser-local storage on the current device. Static Pages hosting does not run the SQLite API or provide shared, server-side persistence.

## Run locally

Requirements: Node.js 24 or newer and npm. SQLite is provided by Node.js `node:sqlite`; no external database service is used.

```sh
npm ci
npm test
npm run build
npm run start
```

Open the URL printed by Next.js. The default SQLite database is created at `data/ccai.sqlite`. Set `CCAI_DATABASE_PATH` to select a different path. Keep the data directory on persistent storage for project data to survive server replacement. Reference images are stored in SQLite as image data. Each image is limited to 2 MB and each project supports up to 12 reference images.

For the static preview build, run:

```sh
npm run build:static
```

This copies the interactive prototype to `dist/index.html`. GitHub Actions deploys `dist` to GitHub Pages whenever `main` changes. The existing SQLite API and storage code stays in `src/app/api` and `src/lib` for a future Node.js host with persistent storage.

## Project records

- [Project instructions](AGENTS.md)
- [Roadmap and progress](ROADMAP.md)
- [Approved decisions](DECISIONS.md)

Do not add real provider credentials, make paid API calls, or start Phase 3 without the user's approval.
