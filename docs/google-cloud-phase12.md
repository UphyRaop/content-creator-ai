# Google Cloud Phase 12 deployment research

**Research date:** 19 November 2026  
**Scope:** Official Google Cloud documentation only. This is a research note; no Google Cloud account, billing configuration, project, API, DNS, deployment, or resource was created or changed. No paid service was called. Cost examples use the requested provisional assumptions of **2 vCPU, 4 GiB memory, and 300 video renders per month** only where stated. Prices are USD, region-sensitive, and exclude tax.

## Findings at a glance

- Cloud Run Services and Jobs can run a Node.js container and a custom FFmpeg image. Jobs are the better execution primitive for video rendering because a service request times out after at most 60 minutes, while a Job task can be configured up to 168 hours (7 days); a long timeout is not a promise of uninterrupted execution.
- With `min instances = 0`, a service may scale to zero and does not incur minimum-instance idle charges. A configured minimum instance is billed while idle. Jobs are billed for each started instance for its full lifetime (minimum one minute).
- Cloud Run's free compute allowances are usage discounts pooled across projects linked to a billing account and reset monthly; they are not a dedicated quota per project. A one-time new-account trial credit is separate from the continuing Free Tier.
- Cloud Run's writable container filesystem is ephemeral. Google documents Cloud Storage FUSE as non-POSIX and unsuitable as a database backend; Cloud Run mounts NFS in no-lock mode. Consequently, this research found **no safe persistent SQLite filesystem for a Cloud Run Service or Job**. This is the main production blocker for preserving CCAI's SQLite decision on Cloud Run.
- A split Cloud Run architecture is viable if the database design changes to a network database: stateless Cloud Run Service, durable object storage for media, and authenticated Cloud Run Jobs for FFmpeg. To keep SQLite, the lower-change architecture is a single Compute Engine VM with a persistent disk hosting the Node app, SQLite, and renderer; that is a different deployment from Cloud Run and would require a separate cost/configuration review.
- A standard budget alert is a notification, not a spending cap. Google now documents spend-cap budgets for Cloud Run, but they only apply to a single project and single eligible service, are not instantaneous, let in-flight requests finish, and do not stop fixed persistent-resource charges or other services. They cannot provide a hard cap for the whole CCAI stack.

## Cloud Run Services and Jobs

| Capability | Service | Job |
|---|---|---|
| Intended use | HTTP website/API with autoscaling. Supports request-based (default) and instance-based billing. | Batch/container tasks that run to completion; all Jobs use instance-based billing. Useful for background FFmpeg rendering. |
| Scale behavior | Default minimum is zero; scale-to-zero can cold-start the next request. Maximum instances can be configured, but is an operational bound rather than a hard spend cap. | Configure task count, parallelism, timeout, and retries. Default task timeout is 10 minutes, default retries are 3; maximum task timeout is 168 hours. Retries require idempotent rendering and status updates to prevent duplicate outputs. |
| Request/task duration | Request timeout defaults to 5 minutes and can be set up to 60 minutes. A timed-out client request does not necessarily stop container-side processing. | A task can run for up to 7 days, but infrastructure interruptions are possible. Jobs should checkpoint and safely retry. |
| Local files | Writable container filesystem is in-memory/ephemeral; terminating an instance discards local state. Use only for scratch data. | Scratch disk is ephemeral to execution; upload finished output to durable storage. A task restart must not depend on scratch state. |
| Restart behavior | Instances can be started, stopped, or replaced by autoscaling; local process memory and local files are not durable. | Job task failures can be retried and jobs can be relaunched. Persist job state and outputs outside the container. |

Sources: [Cloud Run overview and scaling](https://docs.cloud.google.com/run/docs/overview/what-is-cloud-run), [service billing settings](https://docs.cloud.google.com/run/docs/configuring/billing-settings), [minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances), [maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances), [service request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout), [create Jobs](https://docs.cloud.google.com/run/docs/create-jobs), [Job task timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout), [Job retries](https://docs.cloud.google.com/run/docs/configuring/max-retries), [Job parallelism](https://docs.cloud.google.com/run/docs/configuring/parallelism), [container runtime contract](https://docs.cloud.google.com/run/docs/container-contract).

For this workload, put generation/rendering behind an authenticated job submission API, set the service minimum to zero unless paid warm capacity is approved, and keep a low service maximum. For render jobs set parallelism to one initially, explicitly bound queued work, and set retry behavior after making the renderer idempotent. The application's current render queue and status live in process memory, so they must be migrated to durable state before Cloud Run scaling or Job execution can reliably resume and report jobs. Service maximum-instance settings can be temporarily exceeded during revision transitions; neither maximum instances nor task parallelism is a billing cap.

## Free-tier allowances and billing scope

Cloud Run's pricing page says Free Tier usage is **aggregated across projects by billing account** and resets every month; overage is charged. Google documents the monthly SKU free-tier counter reset as **12:00 AM Pacific Time (US/Canada) on the first day of each month**, observing U.S. daylight saving time. This is a billing-system reset boundary; it is unrelated to CCAI's app-local operating timezone (Malaysia). The Cloud Billing Free Tier is calculated per billing account, not copied as a fresh allowance into every project. The Cloud Run page lists distinct allowances for its billing modes and Job execution; do not multiply allowances by project count. New-customer $300/90-day trial credits are temporary credits, not recurring free capacity, and are not included below.

| Cloud Run category | Listed monthly free allowance | Notes |
|---|---:|---|
| Service, request-based | 180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests | The request-based Free Tier is based on active pricing. The separate outbound data allowance is 1 GiB/month **within North America**. |
| Service, instance-based | 240,000 vCPU-seconds, 450,000 GiB-seconds | Idle minimum instances are billed at the idle rate; do not assume a minimum instance is free or covered by active-time allowances. |
| Cloud Run Jobs, standard on-demand | 240,000 vCPU-seconds, 450,000 GiB-seconds | Job compute is instance-based and billed for the whole instance lifetime (minimum one minute). |
| Delayed Jobs | 342,857 vCPU-seconds, 642,857 GiB-seconds | A separate discounted delayed-execution mode has its own eligibility, delay, and timeout constraints; it is not assumed in the estimates below. |

Kuala Lumpur (`asia-southeast4`) appears in the Tier 1 regions list for Cloud Run. The Free Tier is expressed using `us-central1` rates and the actual bill depends on selected region and service billing mode. The North America-only Cloud Run egress allowance does **not** establish free video downloads for Malaysian users.

Sources: [Cloud Run pricing (including free tiers and region tiers)](https://cloud.google.com/run/pricing), [SKU free-tier reset boundary](https://docs.cloud.google.com/billing/docs/how-to/pricing-table), [Google Cloud Free Tier limits](https://docs.cloud.google.com/free/docs/free-cloud-features), [Free Trial terms and operation](https://docs.cloud.google.com/free/docs/free-cloud-features#free-trial).

## Cloud Run compute cost model

The following Cloud Run standard rates are from the current Tier 1 pricing table and are shown to make the estimates reproducible. Region-specific prices can differ.

| Billable item | Standard Tier 1 price beyond free tier | Free allowance / treatment |
|---|---:|---|
| Service, instance-based CPU | $0.000018 per vCPU-second | 240,000 vCPU-seconds/month |
| Service, instance-based RAM | $0.000002 per GiB-second | 450,000 GiB-seconds/month |
| Service, request-based active CPU | $0.000024 per vCPU-second | 180,000 vCPU-seconds/month |
| Service, request-based active RAM | $0.0000025 per GiB-second | 360,000 GiB-seconds/month |
| Service requests | $0.40 per million | 2 million/month |
| Request-based minimum-instance idle CPU and RAM | $0.0000025 per vCPU-second and per GiB-second | Billed while minimum instances remain idle; minimums can be restarted |
| Cloud Run Job CPU/RAM | $0.000018 per vCPU-second; $0.000002 per GiB-second | 240,000 vCPU-seconds and 450,000 GiB-seconds/month |
| Ephemeral disk volume | $0.000109589 per GiB-hour | No separate always-free disk allowance is listed on the Cloud Run pricing table; temporary scratch only |

With request-based service billing and `min instances = 0`, there is no standing idle-instance bill, but active API request CPU/RAM remain usage-billed after pooled free allowances. If a 2 vCPU/4 GiB request-based Service instead kept one minimum instance idle for a 30-day month, the published idle rates imply about **$38.88** in idle CPU/RAM charges before active requests, using the listed rate and without assuming any free credit applies to idle time. Instance-based always-on service billing costs more: at 2 vCPU/4 GiB for 30 days, raw compute is about **$114.05** before applicable usage credits and other costs.

### Provisional 300-render example

Assumptions: 300 Job executions/month, each using 2 vCPU and 4 GiB, one task/instance, no GPU, and Tier 1 rates. These are compute-only numbers; they do not include the web service, persistent data, request/network traffic, logs over free allowance, build/image storage, task retries, or tax.

At these rates, one render consumes approximately **$0.00264 per minute** (2 vCPU × $0.000018/sec + 4 GiB × $0.000002/sec). Job execution overhead has a one-minute minimum per instance. Estimated aggregate Job compute:

| Average duration per video | Total Job runtime | Raw CPU/RAM | Approx. CPU/RAM after the listed Jobs free allowances* |
|---:|---:|---:|---:|
| 5 minutes | 25 hours | $3.96 | $0.00 |
| 10 minutes | 50 hours | $7.92 | $2.70 |
| 30 minutes | 150 hours | $23.76 | $18.54 |

\*Assumes no other Cloud Run Jobs consume that billing account's monthly Job allowance, the rates/region shown above, and no retries. The 10-minute example applies the 240,000 vCPU-second and 450,000 GiB-second Jobs allowances separately. Total service cost cannot be inferred from “300 videos” because average render duration, application request time, scene duration/resolution, retries, concurrency, and output sizes are unspecified. A representative FFmpeg render and measurements are required before a bill can be forecast.

## Other Google Cloud costs and free-tier coverage

| Component | Current official allowance/rate summary | CCAI effect |
|---|---|---|
| Internet egress | Cloud Run uses Premium Network Service Tier and Google Cloud networking rates. Its listed 1 GiB free data transfer is within North America only. Traffic between Cloud Run and Google Cloud resources in the same region has no Cloud Run networking charge. | Exporting 300 MP4s to iPhones/desktops can dominate egress cost. Output sizes and user locations are needed to estimate it; Malaysian traffic is outside the North America allowance. |
| Cloud Storage media | Free Tier includes 5 GiB-month standard storage, 5,000 Class A and 50,000 Class B operations, and a 100 GiB outbound transfer allowance from North America to specified destinations; these apply only in `us-east1`, `us-west1`, and `us-central1`. Outside that set, standard region pricing, operations, and transfer apply. | Suitable for references, source audio/images, and completed MP4 objects through the Storage API. Do not mount it as the SQLite file system. More than 5 GiB or media in a non-US region is billable. |
| Cloud Logging | First 50 GiB/project/month is free; ingestion above the allowance is $0.50/GiB. Retention beyond the default 30 days is $0.01/GiB/month. | Verbose FFmpeg stdout/stderr and request logs can exceed free volume; cap/rotate logs and avoid logging media, prompts, or credentials. |
| Artifact Registry | First 0.5 GiB-month storage per billing account is free; above that, published storage rate is $0.000136986/GiB-hour (about $0.10/GiB-month). Repository data transfer may also be billable. | Container images containing Next.js and FFmpeg accumulate by revision. Add cleanup/retention for old tags and keep registry co-located with Cloud Run. |
| Cloud Build | 2,500 build-minutes per billing account/month for `e2-standard-2` in the default pool is a promotional allowance subject to change. Queued time is not counted. Other machine types/build configurations have their own rates. | Deploying source via Google Cloud Build can use this allowance; this is a build allowance, not a Cloud Run/Artifact Registry allowance. An external GitHub build workflow would have a different cost path. |
| Filestore / NFS | Filestore is charged for provisioned capacity/instance even when unused; there is no Free Tier line for Filestore. Current published minimums include 1 TiB for Basic HDD and 2.5 TiB for Basic SSD. At the listed unit rates, those minimums are approximately **$164/month** and **$768/month**, respectively, before region differences or network. The 100 GiB–1 TiB Basic HDD sizes are currently available only for GKE users. | Cloud Run can mount Filestore over NFS, but the minimum provisioned sizes and rates are far above the project's USD 20/month target. More critically, Cloud Run NFS mounts are explicitly no-lock, which is not a safe SQLite locking environment. |
| Network/VPC to Filestore | VPC networking can add charges; Cloud Run documents serverless VPC connector compute as separately charged, while same-region Cloud Run-to-Google-Cloud data transfer is free for supported paths. | A Filestore workaround also requires a VPC, firewall rules, mount operations, and network configuration; it is not a free lightweight persistent disk. |

Sources: [Cloud Run pricing and networking](https://cloud.google.com/run/pricing), [Cloud Storage pricing](https://cloud.google.com/storage/pricing), [Cloud Storage Free Tier region limits](https://docs.cloud.google.com/free/docs/free-cloud-features), [Cloud Logging pricing](https://cloud.google.com/logging), [Artifact Registry pricing](https://cloud.google.com/artifact-registry/pricing), [Cloud Build pricing](https://cloud.google.com/build/pricing), [Filestore capacity and pricing](https://docs.cloud.google.com/filestore/docs/creating-instances) and [Filestore price table](https://cloud.google.com/filestore/pricing), [Serverless VPC Access pricing](https://cloud.google.com/vpc/network-pricing).

## Durable SQLite, media, and background rendering

### Why Cloud Run cannot safely preserve CCAI's SQLite file as currently designed

1. Cloud Run container file systems are in-memory and ephemeral; stopping/replacing a container discards local files. This cannot hold the production `data/ccai.sqlite` file.
2. Cloud Storage FUSE exposes a file-like mount but is not POSIX. Google's documentation explicitly says it does not support file locks and should not be used as a database backend. This disqualifies a bucket-mounted SQLite database.
3. Cloud Run NFS volumes are supported, including Filestore, but Cloud Run explicitly states it does not support NFS locking and automatically mounts NFS in no-lock mode. SQLite's file-based database relies on filesystem locks for safe concurrent access. Setting Cloud Run `max instances = 1` does not restore NFS locking, so it is not a safe SQLite fix.
4. Filestore is not budget-compatible for small database storage: it is billed on provisioned capacity, has large minimum sizes, and no free monthly allowance. The minimum-capacity/rate combination is materially above CCAI's USD 20/month target even before app compute, media, or network.

Sources: [Cloud Run container file system and volumes](https://docs.cloud.google.com/run/docs/securing/security), [Cloud Storage FUSE limitations](https://docs.cloud.google.com/storage/docs/cloud-storage-fuse/overview), [Cloud Run NFS no-lock mode](https://docs.cloud.google.com/run/docs/configuring/services/nfs-volume-mounts), [Filestore minimum sizes](https://docs.cloud.google.com/filestore/docs/creating-instances), [Filestore pricing](https://cloud.google.com/filestore/pricing).

### Viable architectures

**Preserve SQLite with the least code/operational change:** run the Node.js application, SQLite file, and FFmpeg worker on one Compute Engine VM with a persistent boot/block disk; use Cloud Storage via API for image/video assets and exports/backups. This keeps SQLite on a local POSIX file system and avoids sharing a database file over Cloud Run FUSE/NFS. It is not a Cloud Run deployment and has separate always-on compute, patching, firewall, backup, and domain/TLS responsibilities. Current VM cost and budget fit need a separate region-specific estimate; the Free Tier `e2-micro` VM is only in three US regions and is not a 2 vCPU/4 GiB video host.

**Use Cloud Run for stateless scale-out:** Cloud Run Service for the Next.js HTTP/API layer, a durable network database for project and job state, Cloud Storage objects for references/render outputs, and authenticated Cloud Run Jobs for FFmpeg. Persist job IDs/status before launching Jobs; pass object references rather than local paths; write outputs to Storage; update status through the durable database. A production queue/trigger (for example Pub/Sub or Cloud Tasks) must have retry/idempotency logic and has its own limits and cost model. This replaces SQLite with a server database and requires an approved architecture change and database cost review.

**Do not use:** SQLite on Cloud Storage FUSE or on a Cloud Run NFS mount, even with one service instance, because the platform's documented mount semantics omit the required file locking. A Cloud Run Job also cannot rely on another instance's local SQLite file or local render outputs.

## Cost guardrails, budgets, and hard stops

- **Alerts-only budget:** Google says this only sends threshold notifications and does not cap usage. Billing reporting is delayed, so the alert can arrive after costs have accumulated.
- **Cloud Run spend cap:** The current Cloud Billing docs describe an enforcement option that pauses new usage for an eligible service when gross estimated charges exceed the cap. Cloud Run is eligible, but one cap can cover only one project and one eligible service; the budget period is monthly. It is limited to first-party accounts. Estimates exclude savings/credits, enforcement is not instant, remaining overage is billed, and in-flight work is completed. A manually lifted cap stays lifted for the rest of that month.
- **Not covered by a Cloud Run spend cap:** Cloud Storage, Filestore, Cloud Build, Artifact Registry, Cloud Logging, network egress, and other non-Cloud-Run services do not become capped just because a Cloud Run cap is present. Fixed charges for persistent resources continue when a cap triggers. Therefore even an enabled Cloud Run spend cap is **not** an account-wide hard invoice limit for this design.
- **Service scaling settings:** `min = 0` avoids paid idle capacity but accepts cold starts. `max instances`, job task count, parallelism, task timeout, and retry limits help bound workload but do not guarantee a dollar ceiling; service maximums can be temporarily exceeded around revision changes and jobs can be launched multiple times unless the application limits them.
- **Safer operating policy if separately approved:** keep the Cloud Run service at `min = 0`; set a low maximum; disable unauthenticated job submission; use one render task at a time initially; set bounded retries and a monthly application-level render quota; use idempotent job IDs and cleanup policies; configure a Cloud Run spend cap below the maximum Cloud Run budget; and separately budget and alert on each paid persistent/egress component. This reduces risk but does not convert the total stack into a guaranteed hard cap.

Sources: [alerts-only budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets), [spend cap budget scope, services, enforcement, and limits](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps), [Cloud Run maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances), [Cloud Run Jobs retries and timeout](https://docs.cloud.google.com/run/docs/create-jobs).

## Remaining unknowns before a real estimate

Need actual region, average video duration, render duration on the selected CPU, output resolution/size, source-media storage volume and retention, concurrent projects/jobs, API request volume, log verbosity/retention, number of retained container images, and whether trial credits or a paid billing account are involved. The current backend also needs durable render-state and asset-path redesign before Cloud Run Jobs can replace its process-local renderer safely. No account or billing APIs were accessed, so no existing billing allowance, region quota, or project-specific eligibility was verified.
