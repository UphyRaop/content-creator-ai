# Phase 12 QA Results — Usage allowances and job accounting

## Goal and status

Independent acceptance run for allowance enforcement, concurrent reservations, persistence, and the usage preview. These results cover the local metering ledger and static simulation only. **No real Google billing telemetry or Cloud job worker is connected.**

## Executed results — 19 November 2026

| Area | Result | Evidence / limitation |
|---|---|---|
| 80%, 85%, 90% thresholds | PASS | 79.99%, 80%, 84.99%, 85%, 89.99% and exactly 90% fixtures passed; warnings begin at 80/85 and current or projected 90% blocks. |
| Concurrent resource reservations | PASS | Two separate Node processes shared a synthetic SQLite ledger with a 100-unit limit. One 60-unit reservation succeeded; the other was rejected; exactly one reservation persisted. |
| Shared MYR reservations across pools | PASS | Focused fixture reserves estimated cost across resource pools and rejects the reservation that reaches the shared 90% safety boundary. |
| Missing/stale/unverified metrics | PASS | Missing pool allowance, unavailable metrics, stale metrics, estimated-only and simulated-only data fail closed; missing-pool summary reports `canReserve=false`. |
| Auth and bypass controls | PASS | Session and same-origin checks passed; clients cannot set allowance values/provenance, verified observations, billing period, TTL or job estimates. Reservation admission is explicitly disabled with HTTP 503 until production integrations exist. |
| Period reset/history | PASS | Pacific month boundaries including PST/PDT transitions, immutable allowance history and SQLite connection reopen retained prior period records. |
| Idempotency/review state | PASS | Identical reservation/event requests deduplicate; conflicting use is rejected; ambiguous reservations remain reserved beyond the review deadline rather than being silently released. |
| Failed jobs, real retries, timeouts, cancellation | NOT TESTED | There is no active Cloud job worker and reservation admission is disabled. A future worker must implement bounded timeout/retry/idempotency and reconcile terminal state before release. |
| Real provider metrics and billing accuracy | NOT TESTED | No billing account, API, metrics importer, invoice or resource was connected. Demo values are not Google telemetry. |
| Responsive UI/browser/device runtime | NOT TESTED | Source assertions confirmed labels, no dashboard external calls, accessible table/status markup and responsive CSS breakpoints. No browser viewport/device run was available. |
| Phase 1–11 regression/builds | PASS | Project/workflow, auth/approval, AI preflight, voice vault, render, post-production and publishing suites, TypeScript, static build and Next production build passed. |
| Cost/resource usage | PASS | RM0. No GCP resource, paid API or external host was created or called. |

**Future production integration blockers:** the reservation API returns 503 until trusted current-period multi-pool telemetry/estimates and a durable job worker can reserve every affected resource. Existing AI/render endpoints do not yet call this ledger. The current release endpoint can release an owner's reservation without proving the corresponding job stopped, and ledgers are owner-scoped rather than shared across multiple owners of one billing account. These are not live-spend bypasses while cloud operations remain inactive, but must be resolved before admission is enabled.

The following matrix defines the cases used for this run and outstanding integration tests. Do not invent provider limits; use values from isolated synthetic fixtures only.

## Acceptance matrix

| ID | Scenario and method | Acceptance | Run mode |
|---|---|---|---|
| P12-01 | Allowance threshold boundary: submit a request below, exactly at, and just above each configured limit. Repeat for every separately metered resource and project/account scope. | Allowed usage is never exceeded; boundary behavior matches the published rule; response/UI says what was reserved, consumed, remaining, or blocked. No rounding loophole. | Headless provider-stub integration; UI display manual/browser. |
| P12-02 | Reservation atomicity: with current usage `U` and remaining allowance `R`, launch concurrent requests whose combined estimates exceed `R` (e.g. two requests each need more than half of `R`). | Transaction/lock grants only requests whose total reservations fit. Sum of committed usage plus active reservations never exceeds the cap. No duplicate reservation rows or negative remainder. Repeat across two server processes if supported. | Headless parallel API/database test. |
| P12-03 | Release and commit: exercise success, provider rejection, validation failure before provider call, cancellation, timeout, and process crash while reserved. | Provider success commits exactly once. Definite pre-call/failed/cancelled outcomes release once. Ambiguous timeout/crash follows a documented reconciliation state and cannot silently make capacity available if a provider may have charged. | Headless fault-injected provider and DB assertions. |
| P12-04 | Retry semantics: fail a job, retry with the same operation/idempotency key, retry after a definite failure, and submit the same request concurrently. | One provider execution/charge per idempotent operation; retry reuses or safely replaces the reservation according to contract; repeated terminal retries cannot double count, spend, or create duplicate artifacts. | Headless fake-provider integration. |
| P12-05 | Idempotency collision and validation: reuse a key with identical payload, changed payload, another owner, malformed key, and oversized key. | Identical retry returns the canonical job/result. Conflicting payload or cross-owner key is rejected without disclosing another job and without consuming allowance. Invalid keys do not reserve. | Headless API tests. |
| P12-06 | Timeouts and stuck jobs: stall provider before response, stall after provider acceptance, delay polling, and exceed each configured timeout. | Jobs transition to documented terminal/unknown states, progress is monotonic, capacity accounting follows P12-03, and status polling/retry remains bounded. A timeout cannot leave an immortal active reservation. | Headless fake timers/provider; browser status copy manual. |
| P12-07 | Reset boundary: test just before/at/after the allowance window boundary, including server timezone changes and daylight-saving boundary if local time is used. Test any admin reset twice and with concurrent jobs. | Reset occurs once at the defined boundary/time zone; active reservations are treated per policy; counters do not reset early, twice, or based on client clock. Reset authority is server-side and auditable. | Headless clock-controlled DB test; UI preview manual. |
| P12-08 | Restart and recovery: stop/restart with active, completed, failed, and reserved jobs; test process death during provider call and after provider success but before local commit. | Durable state recovers deterministically, no job is charged twice, orphan reservations reconcile or expire safely, and UI matches persisted server status. | Headless isolated SQLite plus child-process restart. |
| P12-09 | Metrics unavailable or stale: make provider pricing, account balance, usage source, or allowance store unavailable; return null, malformed, stale, or contradictory measurements. | Never coerce unknown usage to zero or display it as verified. Live spend blocks or is constrained by the documented safe policy; UI labels unknown/stale state and does not promise capacity. Simulated zero-cost work is explicitly labeled simulated. | Headless zero-fetch assertions; UI text manual. |
| P12-10 | Unauthorized bypass and tenant separation: unauthenticated request; other owner/project; forged owner, account, cap, cost, provider, `free`/simulation flag, usage/reset fields, approval booleans; direct job/retry endpoint calls. | Server derives ownership, rate, cost, and allowance from trusted configuration/records. Client fields cannot raise limits, reset or erase usage, bypass approval, select another owner's reservation, or claim a live job is free. Same-origin/session gates remain enforced. | Headless route/security suite. |
| P12-11 | Abuse and resource bounds: many unique idempotency keys, parallel submissions, malformed JSON, duplicate body fields, very large payloads, and reservation-table growth. | Body/queue/worker/database limits are enforced; no unbounded work or memory growth; rate/queue denials do not leave reservations. Errors are generic and contain no API key or secret. | Headless load/fuzz bounds with local stubs. |
| P12-12 | Job UX and responsive preview: view near-cap, reserved, blocked, pending, failed, timeout/unknown, retry, reset and unavailable states in light/dark themes and desktop/tablet/mobile widths. | Available/reserved/consumed numbers and reset time are understandable; confirmation precedes billable live work; failure/retry never suggests a second charge when idempotent; controls remain reachable by keyboard/touch; no clipping or inaccessible status-only color. | Browser/manual, actual viewport emulation required. |
| P12-13 | Regression: rerun Phase 1–11 project store, auth/owner isolation, approval freshness, AI preflight/no-fetch, voice vault, renderer, post-production, publishing, builds, and diff checks. | Existing approval, cost preflight, simulation labeling, render, import/export, and ownership behavior remains intact. No paid calls. | Headless suite/builds; browser smoke for critical UI. |

## Suggested executable evidence

- Add an isolated temporary SQLite fixture for reservations and usage state; reset it per run. Inject providers and clocks so no live API, sleep-heavy test, or real billable action is used.
- For each threshold, record configured limit `L`, prior committed usage `U`, active reservations `A`, and request estimate `E`; assert `U + A + E` against the implementation's documented boundary. Include exact-equality and rounding cases.
- Use a gated fake provider to hold simultaneous requests at reservation time, then release them in controlled order. Assert database state as well as HTTP responses.
- Capture provider invocation count, idempotency key/job identity, reservation rows, committed usage, release reason, and resulting remaining allowance after each outcome.
- Test production route wrappers as well as pure helpers; a correct helper alone does not prove auth, ownership, request limits, or UI confirmation.

## Manual evidence and hard limits

A rendered allowance dashboard, simulated usage estimate, mocked provider response, or local-only counter does **not** verify actual provider telemetry, billing, account balance, or invoice accuracy. Mark those items **NOT VERIFIED** unless independently reconciled against an authorized provider test account and its usage record; use no paid calls for this phase's QA. Do not report mobile responsiveness without actual viewport/device emulation. Keep browser data isolated in a disposable project and do not touch deployed user projects.
