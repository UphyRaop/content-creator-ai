# Phase 13 Google Cloud architecture review

**Review date:** 19 November 2026  
**Scope:** Read-only review of the current CCAI source and official Google Cloud documentation. No owner account was accessed; no project, billing setting, resource, credential, DNS record, or deployment was created or changed. No paid test was run.  
**Related research:** [Google Cloud Phase 12 pricing and infrastructure research](google-cloud-phase12.md) contains the detailed Cloud Run rate tables, allowances, and regional cost examples. This note applies that research to the current application and identifies the decisions still required for Phase 13.

## Readiness summary

| Area | Status | Evidence / limitation |
|---|---|---|
| Google Cloud account/project/billing | **BLOCKED** | No owner account or project was inspected. The repository documents that no Cloud project, resource, billing change, or deployment is authorized. |
| App runtime on Cloud Run | **POSSIBLE WITH ARCHITECTURE WORK** | A Cloud Run Service can host the HTTP application; a Job can run a containerized FFmpeg task. Current render queue, SQLite state, and output paths are local/process-bound and are not safe across instance replacement or separate jobs. |
| Durable SQLite on Cloud Run | **BLOCKED** | Cloud Run's container filesystem is ephemeral. Cloud Storage FUSE and Cloud Run NFS semantics are not safe for this SQLite design; see the evidence and official references in the Phase 12 note. |
| Durable project database and media on Cloud Run | **NOT SELECTED** | A Cloud SQL/network database plus Cloud Storage objects is the likely serverless pattern, but it changes the approved SQLite architecture and is not guaranteed RM0. Cloud SQL's listed free option is a 30-day trial, not recurring free capacity. |
| Secure runtime credentials | **DESIGNABLE, NOT CONFIGURED** | Cloud Run supports Secret Manager and service identities. Current app uses environment secrets and an encrypted SQLite voice-key vault; no GCP Secret Manager adapter or IAM configuration exists. |
| Durable render queue / accounting gate | **BLOCKED** | Cloud metering has no trusted GCP telemetry importer or durable worker. Reservation admission intentionally returns HTTP 503 and `cloudOperationsActive` is false. |
| RM0 guarantee | **NOT POSSIBLE TO ASSERT** | Some services have pooled Free Tier quotas; durable database, media, Malaysian egress, logs, images, builds, and excess rendering can incur costs. Budget notifications are not a hard cap. |

## Current CCAI design observed in source

- `src/lib/project-store.ts` uses Node's built-in `node:sqlite`, defaults to `data/ccai.sqlite`, and honors `CCAI_DATABASE_PATH`. Project payloads are stored as JSON in SQLite; the current payload can include image/audio data URLs. `src/lib/auth-store.ts`, `src/lib/approval-store.ts`, `src/lib/entity-store.ts`, `src/lib/voice-vault.ts`, and `src/lib/cloud-metering.ts` also rely on local SQLite.
- `src/lib/voice-vault.ts` encrypts stored provider keys with AES-256-GCM. The encryption key and admin token are server environment variables (`CCAI_VOICE_VAULT_ENCRYPTION_KEY`, `CCAI_VOICE_VAULT_ADMIN_TOKEN`). `CCAI_BOOTSTRAP_TOKEN` is also server-side. These variables are not a Cloud Secret Manager integration.
- `src/lib/ffmpeg-renderer.ts` holds render job state in a process-global `Map`, queue in a process-global array, and limits the queue to five with one render active at a time. FFmpeg scratch files and output paths are local to the running process/container. The queue, progress, cancellation, retries, and media output do not survive restart or move across instances.
- `src/lib/cloud-metering.ts` persists usage and reservations in SQLite. The UI's emergency stop is application state, not a GCP kill switch. The reservation route returns **503** until a trusted telemetry adapter, multi-pool estimator, and durable worker are active; the usage route reports `cloudOperationsActive: false`. This fail-closed behavior should remain in place until the new architecture and limits are verified.
- `.env.example` contains empty provider credentials and live provider switches disabled. GitHub Pages uses a static preview; it cannot host the Node API, SQLite, FFmpeg, Secret Manager access, or background execution.

## Cloud Run fit and required redesign

### HTTP service and scale-to-zero

Cloud Run Services are request-oriented. Minimum instances default to zero; scale-up from zero is triggered by a request. This supports low idle compute usage but introduces cold starts. With request-based billing, CPU becomes disabled or severely limited after request handling; Google cautions against background threads in this mode. Setting a minimum instance or using instance-based billing can keep processing capacity available, but creates ongoing cost. [Autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling), [billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings), and [general Cloud Run development tips](https://docs.cloud.google.com/run/docs/tips/general) document these behaviors.

CCAI may use a Service for the Next.js HTTP layer, but it must not rely on a process-local queue or background thread for durable work. If the endpoint is publicly reachable, retain the application's authenticated session, ownership checks, same-origin mutation protections, and server-side approval checks. Keep worker control paths authenticated; do not expose credentials or trusted metering controls in the browser.

### FFmpeg worker

Cloud Run Jobs can run a custom Node/FFmpeg container to completion, so they are a viable *execution* primitive for bounded render tasks. They are not a durable queue or database by themselves. Before Jobs are enabled, CCAI needs durable job records and reservations, idempotency keys, retry-safe state transitions, bounded retry/timeout policy, and a durable location for inputs and outputs. A worker should receive object IDs and a durable job ID rather than paths in the web service's local filesystem. Persist completion/failure/cancellation and release or commit reservations transactionally. See [Cloud Run Jobs](https://docs.cloud.google.com/run/docs/create-jobs), [Job task timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout), [retry limits](https://docs.cloud.google.com/run/docs/configuring/max-retries), and [service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service).

### Database and media

The Phase 12 review found that Cloud Run's writable container filesystem is ephemeral, Cloud Storage FUSE does not provide the file-locking behavior required by this SQLite design, and Cloud Run NFS mounts use no-lock mode. A single Cloud Run instance limit does not restore the missing locking semantics. Therefore do not place `ccai.sqlite` on a Cloud Run container filesystem, Cloud Storage FUSE mount, or Cloud Run NFS mount.

Two architecture paths remain:

1. **Keep SQLite:** run the app, database, and renderer on one Node-capable VM with a persistent POSIX block disk. This is the lower-change architecture, but it is not Cloud Run, needs an always-available single host for the current process queue, backups/patches/monitoring, and a separate region-specific cost and security review. A small US-only VM Free Tier allowance does not establish a suitable Malaysia-hosted 2-vCPU/4-GiB renderer or a complete RM0 system.
2. **Use serverless Cloud Run:** migrate project/auth/approval/voice-vault/usage state to a supported network database; move image, audio, reference, and MP4 bytes to object storage; and make Jobs consume durable job records via an authenticated, durable queue/dispatcher. Cloud SQL is not on the perpetual Free Tier list; Google currently lists a 30-day Cloud SQL free trial. Cloud Storage's limited always-free storage applies only in specified US regions. This path requires a deliberate database/storage decision and data migration before deployment.

For CCAI, the current choice cannot be made solely from the compute free tier: the app stores binary media in project JSON in SQLite, so using object storage also requires asset migration, object access control, lifecycle policy, quota enforcement, and export/deletion semantics. Cost estimates need expected project count, image/audio/MP4 sizes, retention, backup frequency, egress geography, render duration, and concurrency.

## IAM and secrets

Cloud Run separates the deployer identity from the workload's runtime service identity. Use a dedicated service account for each runtime role, granting only the permissions needed to the exact buckets, secrets, database connection, and job invocation path. The app should use the runtime identity through Application Default Credentials rather than a downloaded user-managed service-account key. Google documents [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity) and [service identity configuration](https://docs.cloud.google.com/run/docs/configuring/services/service-identity).

Use [Secret Manager integration for Services](https://docs.cloud.google.com/run/docs/configuring/services/secrets) and [Jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets) for server-only keys, with narrowly scoped `Secret Manager Secret Accessor` permission on the required secret versions. Pin secret versions where appropriate and avoid logging secret values. Secret Manager's published free allowance is 6 active versions and 10,000 accesses per month per billing account; beyond that, current listed prices apply. This is shared with other projects under the billing account, not a separate allowance for CCAI. [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing).

For a public Next.js endpoint, separate public user requests from internal job execution. A worker-to-service call can use a Google-signed OIDC ID token, and the receiving service should grant `roles/run.invoker` only to the calling workload identity. Do not make Job execution or administrative endpoints publicly invokable just to simplify wiring. Google documents [service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service) and [Cloud Run IAM roles](https://docs.cloud.google.com/run/docs/reference/iam/roles).

The current encrypted voice-key vault stores user-supplied provider API keys inside the application database. Before a Cloud migration, decide whether these remain encrypted DB values with a separately protected encryption key, or move to a tenant-safe secret storage design. A single global environment secret is not a substitute for safely isolating multiple users' credentials. No integration should expose key material to browser storage or a static Pages build.

## Cost controls and RM0 limits

- Cloud Run Free Tier is a monthly shared billing-account allowance, not an isolated allowance per CCAI project. It covers bounded compute/request categories only; it does not automatically make the whole app free. Detailed allowances, reset boundary, regional assumptions, and example compute-only estimates are in [Phase 12 research](google-cloud-phase12.md).
- The free-tier Cloud Run egress line is limited geographically (North America). It does not imply free downloads of generated videos to Malaysia. Object storage in a non-US region, storage above allowance, Cloud SQL after its trial, network traffic, builds, container images, and excess logging may be billed.
- Secret Manager has a small account-pooled free allowance; dynamic user-key counts or high access volume can exceed it. Do not fetch secrets on every media operation if a safer, bounded caching design is available; still respect rotation behavior.
- Set service max instances, Job parallelism, per-user/project quotas, maximum render duration/output size, concurrency, and upload/object quotas. These are operational safeguards, not invoice hard caps. Verify every other billable component and region before launch.
- Google Cloud Billing budget alerts notify when estimated thresholds are crossed; they do not stop all spending. The documented Cloud Run spend-cap feature is service-specific and not instantaneous: work in flight can finish, fixed charges continue, and other services are outside its scope. It cannot cap the full CCAI architecture. See [budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets), [Cloud Run spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps), and the component analysis in the Phase 12 note.
- **Conclusion:** no honest RM0 guarantee can be given for production Cloud Run + durable DB + media + video rendering. A target budget is a planning constraint; it is not a bill protection. Keep cloud operations fail-closed and run no paid test until a concrete estimate and separate approval exist.

## Required owner decisions and blockers

No infrastructure work is authorized by this review. Before a production proposal can proceed, the owner must:

1. Choose whether to preserve SQLite on a single persistent-disk VM or approve migration from SQLite to a network database for Cloud Run. The serverless path changes the approved storage architecture.
2. Approve a region, data residency/latency trade-off, monthly maximum spend, media retention policy, and expected monthly render/egress workload. The RM0 target alone is insufficient for the selected components.
3. If proceeding, explicitly authorize a Google Cloud project/billing setup and each resource class. Billing enablement and resource creation can incur charges; this review has not inspected the owner's account or existing billing allowance.
4. Approve the secure migration of existing project/media/user data and any change to the current user API-key vault. Until then, do not connect this public static preview to production APIs or add credentials to GitHub.
5. Separately authorize any DNS or custom-domain changes; none were checked or changed here.

Until these are resolved, the concrete safe state is the existing static GitHub Pages simulation, no production backend exposure, and HTTP 503 for cloud job reservations. Do not mark Phase 13 cloud deployment ready.

## Rendering capacity estimate (compute-only; not a benchmark)

For the requested provisional 2 vCPU / 4 GiB Cloud Run Job assumption, the documented standard on-demand monthly free pool of 240,000 vCPU-seconds and 450,000 GiB-seconds yields at most 2,000 vCPU-limited job-minutes or 1,875 memory-limited job-minutes. The lower bound is 1,875 job-minutes. At 300 videos/month, this is an average ceiling of 6.25 minutes of billed instance runtime per video if that Job pool is otherwise unused by every project on the billing account. This is only a quota arithmetic ceiling: service/Job startup time, retries, other projects, database, media storage, image builds, logs, monitoring, egress/downloads, and price/region differences reduce the usable capacity. A video that takes longer to encode than its playback duration further reduces the count. The 300 video target is not guaranteed.

Illustrative compute-only case: 300 jobs averaging 10 minutes each consume 360,000 vCPU-seconds and 720,000 GiB-seconds. Above the listed Job allowances, the Phase 12 Tier 1 rates imply about USD 2.70 in excess CPU+RAM (USD 2.16 CPU + USD 0.54 RAM), or about **RM11.11** using Bank Negara Malaysia's 19 November 2026 USD/MYR reference of 4.1145. This is not a monthly forecast; it excludes every other service and network/data cost, and region/account pricing is unverified. See [BNM exchange rates](https://www.bnm.gov.my/exchange-rates).

## Official sources consulted

- [Cloud Run instance autoscaling](https://docs.cloud.google.com/run/docs/about-instance-autoscaling)
- [Cloud Run billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run development tips](https://docs.cloud.google.com/run/docs/tips/general)
- [Cloud Run Jobs](https://docs.cloud.google.com/run/docs/create-jobs)
- [Cloud Run service identity](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Cloud Run service secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets)
- [Cloud Run Job secrets](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)
- [Cloud Run service-to-service authentication](https://docs.cloud.google.com/run/docs/authenticating/service-to-service)
- [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)
- [Cloud SQL free features](https://docs.cloud.google.com/free/docs/free-cloud-features)
- [Cloud Billing budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets)
- [Cloud Run spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
- [Cloud Run and Google Cloud cost research, Phase 12](google-cloud-phase12.md)
