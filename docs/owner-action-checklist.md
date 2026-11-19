# CCAI owner action checklist — after preparation review

No action below is required for the current Pages preview. Do not do the billing or deployment steps until a monthly ceiling and architecture are approved.

## 1. Select the durable hosting architecture
- **Purpose:** decide between keeping SQLite on one VM with persistent disk, or migrating application data to a network database/object storage/job service for Cloud Run.
- **Website:** [Phase 13 architecture review](phase13-cloud-architecture-review.md), [Cloud Run](https://cloud.google.com/run), [Cloud SQL pricing](https://cloud.google.com/sql/pricing).
- **Steps:** review data, media, job, region, and rollback trade-offs; choose a maximum monthly MYR amount (RM0 alone cannot be guaranteed); separately approve data migration if selecting Cloud Run.
- **Expected cost:** RM0 to decide; implementation/hosting cost depends on chosen path. Persistent services may incur charges every month.
- **Billing risk:** high if billing is enabled; Free Tier allowances are pooled and incomplete. Budget alerts are not a hard cap.
- **Dependency:** required before Docker/cloud runtime or schema migration can be enabled.

## 2. Authorize Google Cloud account and billing only if choosing a paid-capable path
- **Purpose:** access Cloud Run, persistent database/media, monitoring, and billing telemetry.
- **Website:** [Google Cloud Free Program](https://cloud.google.com/free), [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets).
- **Steps:** create/sign in to Google Cloud; create/select a billing account; review terms and payment method; create a project only after authorizing the services; configure a monthly budget and alert recipients. Treat alerts as warnings, not a spend cap. Do not use free trial credits as a recurring RM0 plan.
- **Expected cost:** registration can be RM0; enabled services and overages can cost money. No exact total can be quoted until region, workload, retention and egress are selected.
- **Billing risk:** high; usage and data transfer can exceed allowances, and alerts can arrive after chargeable usage starts.
- **Dependency:** architecture decision and an explicit maximum spend approval. This checklist does not authorize billing or resource creation.

## 3. Authorize least-privilege deployment access and secret configuration
- **Purpose:** let an approved deployment identity publish containers and read server-only secrets.
- **Website:** [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity), [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing).
- **Steps:** after architecture approval, create a dedicated runtime/deployment identity with only required roles; add application secrets directly in Secret Manager or the hosting control plane. Never paste credentials into chat, source code, GitHub issues, browser storage, or `.env.example`.
- **Expected cost:** identity configuration is not itself a paid subscription; secret versions/access beyond the current free allowance may be billed.
- **Billing risk:** medium; Secret Manager's free use is limited, and an over-scoped identity can expose data.
- **Dependency:** owner authorizes hosting and deploy workflow; exact IAM roles are defined only after selected architecture.

## 4. Authorize secure data migration and retention
- **Purpose:** move project/user/approval/history/usage data and permanent media without loss.
- **Website:** [Cloud SQL migration overview](https://cloud.google.com/database-migration/docs), [Cloud Storage pricing](https://cloud.google.com/storage/pricing).
- **Steps:** select migration path; approve a backup/restore window, media retention policy and rollback criteria; create an encrypted backup; validate record counts, ownership and approval links in a staging environment before cutover.
- **Expected cost:** local export can be RM0; cloud storage, migration services, DB and egress may be chargeable.
- **Billing risk:** medium to high for retained media and outbound downloads; avoid deleting source data before successful restore verification.
- **Dependency:** architecture and cloud account approval.

## 5. Separately authorize live AI tests
- **Purpose:** verify Gemini, FLUX, or ElevenLabs with real credentials and usage reporting.
- **Website:** [Google AI Studio](https://aistudio.google.com/), [ElevenLabs](https://elevenlabs.io/), [BFL API](https://docs.bfl.ai/).
- **Steps:** explicitly authorize one provider, a specific test operation and maximum amount; configure that provider's key through server-side Secret Manager; confirm metered admission and duplicate/cancellation handling are enabled; inspect provider usage after the test.
- **Expected cost:** RM0 if no requests are sent; any live calls can consume provider credits or incur paid usage. The existing RM20 limit remains untouched until a separate request approves a test.
- **Billing risk:** medium; retry/timeout ambiguity can duplicate charges.
- **Dependency:** secure production admission and a separate explicit live-API authorization.

## 6. DNS / domain
- **Purpose:** none for this preparation. Keep `ccai.ur-project.biz` on the current GitHub Pages preview.
- **Website:** [GoDaddy DNS management](https://dcc.godaddy.com/control/portfolio/).
- **Steps:** no DNS changes now. Consider a change only after hosting is approved, preview cutover and HTTPS are verified, and a separate DNS instruction is given.
- **Expected cost:** RM0 for leaving DNS unchanged.
- **Billing risk:** low; changing records prematurely can interrupt the working preview.
- **Dependency:** deployed target and separate owner approval.
