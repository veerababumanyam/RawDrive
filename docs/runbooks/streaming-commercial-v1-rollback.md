# Streaming Commercial v1 — Rollback Runbook

| Field | Value |
| --- | --- |
| Feature | F-014 Streaming Commercial v1 (M33–M35) |
| Owner | Platform / Streaming on-call |
| Severity triggers | P0 billing regression, DPDP breach, CF Stream provider outage >30m, credit-ledger corruption |
| Target RTO | 15 minutes (flag-off path); 45 minutes (full data rollback path) |
| Primary kill switch | `platform_settings` row `featureflag.streaming.commercial_v1` |
| Last drill | TBD — update after first quarterly exercise |
| Escalation | #eng-oncall -> PagerDuty `streaming-primary` -> Eng Lead |

## Overview

This runbook returns the streaming commercial v1 surface area to a safe-off
state. "Safe-off" means public playback, short-link resolution, preflight
sessions, chat, and recharge checkouts return 404 / disabled states while the
credit ledger, invoices, and retention audit records remain intact for
forensic and finance use.

Two rollback profiles are supported:

1. **Flag-off only (preferred, RTO 15m).** Feature flag flipped false; caches
   flushed; traffic drains within 60s. No schema or data changes. This is the
   path taken for >90% of incidents.
2. **Full rollback (RTO 45m).** Flag-off plus reversal of migrations 094 ->
   093 -> 092 -> 091. Only used when a bad migration or data corruption
   forces a schema revert. Requires an on-call DBA and explicit Eng Lead
   sign-off because it is destructive.

Code and data references used throughout:

- `backend/internal/featureflag/streaming.go` — flag evaluator (precedence:
  `platform_settings` -> env `FEATURE_STREAMING_COMMERCIAL_V1` -> default off).
- `backend/internal/streaming/handlers/` — public + workspace handlers gated
  by the flag.
- Migrations `089_f014_streaming_shortlinks.up.sql`,
  `090_f014_streaming_preflight_sessions.up.sql`,
  `091_f014_retention_audit.up.sql`,
  `092_f014_stream_chats_archive_and_drop.up.sql`,
  `093_f014_streams_pin_code_drop.up.sql`,
  `094_f014_streaming_commercial_v1_flag_seed.up.sql`.

## Pre-rollback Checklist

Perform in order. Abort to Eng Lead if any step fails.

- [ ] Incident declared in #inc-streaming with commander + scribe assigned.
- [ ] Decision logged: flag-off only vs. full rollback vs. hotfix (see
      Decision Matrix). Default bias is flag-off only.
- [ ] Current git SHA, deployed image tag, and active flag value captured.
- [ ] `kubectl get deploy -n rawdrive` or VPS `systemctl status rawdrive-api`
      shows all replicas healthy before the flip (so drain is observable).
- [ ] DBA paged if full rollback path selected.
- [ ] Finance paged if refund posture will change (Step 4).
- [ ] Customer comms draft prepared (template below) and Marketing notified
      if any public landing page references live streaming.
- [ ] Runbook open in a second terminal; copy/paste SQL verbatim — do not
      retype.

## Step 1: Flip Feature Flag

Primary kill switch. Expected duration: 30 seconds end-to-end.

### 1a. Flip via super-admin UI (preferred)

Navigate to `Settings -> Platform -> Feature Flags ->
streaming.commercial_v1` and toggle **Off**. Save.

### 1b. Flip via SQL (fallback if UI is down)

```sql
-- Connect as the migrations role.
UPDATE platform_settings
   SET value = '{"enabled": false}',
       updated_at = now()
 WHERE category = 'featureflag'
   AND key = 'streaming.commercial_v1';
-- Expect: UPDATE 1
```

### 1c. Bust the flag cache

Valkey caches the evaluated flag for 60s. Flush immediately so the change is
observed on the next request:

```bash
redis-cli -h valkey -n 0 --scan --pattern 'featureflag:streaming*' | \
  xargs -r redis-cli -h valkey -n 0 DEL
# If unsure of the key pattern, flush DB 0 only:
# redis-cli -h valkey -n 0 FLUSHDB
```

### 1d. Environment fallback check

Confirm no worker or replica has `FEATURE_STREAMING_COMMERCIAL_V1=true`
forcing the flag on despite the DB flip. The env fallback short-circuits the
settings value when the settings row is missing or unparseable.

```bash
kubectl exec -n rawdrive deploy/api -- env | grep FEATURE_STREAMING || true
# Expect no output. If set, remove from deployment/kustomize and roll.
```

## Step 2: Validate Traffic Drop

Expected duration: 2 minutes.

- [ ] Curl a known short-link: `curl -i
      https://rawdrive.live/s/<known-code>` returns `404` (handler served by
      `backend/internal/streaming/handlers/public_shortlink.go` behind the
      flag).
- [ ] Curl the public stream endpoint: `curl -i
      https://api.rawdrive.live/api/v1/public/streams/<id>` returns `404`.
- [ ] Grafana panel `streaming_requests_total` flatlines within 60 seconds.
- [ ] `/metrics` counter `streaming_flag_evaluations_total{source="settings",
      enabled="false"}` climbs while `enabled="true"` is flat.
- [ ] Super-admin streaming console is hidden for new sessions (existing
      sessions reload to empty state on next navigation).

If traffic does not drop within 3 minutes, re-verify step 1c (cache) and
1d (env). If still elevated, escalate and consider full rollback.

## Step 3: Pause Payment Webhooks

Expected duration: 3 minutes. Goal: stop accepting new recharges while the
feature is off so refund posture is predictable.

### 3a. PhonePe

1. Log in to PhonePe merchant dashboard as ops-admin.
2. Navigate to `Developer Settings -> Webhooks -> rawdrive-streaming`.
3. Click **Pause**. Paste incident ID in the reason field.
4. Verify: a test payment from the staging app returns webhook status
   `PAUSED` in the PhonePe console.

### 3b. Razorpay

1. Log in to Razorpay dashboard as ops-admin.
2. Navigate to `Settings -> Webhooks -> rawdrive-streaming-events`.
3. Toggle **Active** off. Save.
4. Verify: `GET https://api.razorpay.com/v1/webhooks/<id>` via the API
   returns `"active": false`.

### 3c. Backend flag for checkout UI

The frontend checkout page reads the same flag; with Step 1 complete, the
recharge CTA already renders disabled. No additional action needed unless a
stale CDN cache serves the old bundle — in that case purge the
`/billing/recharge` path on Cloudflare.

## Step 4: Refund Posture

Expected duration: 5 minutes to decide; ongoing for the refund window.

A flag-off incident does not automatically refund recharges. The credit
ledger is preserved intentionally — unused credits remain spendable once
the feature is re-enabled. Refunds are only issued when:

1. The incident is expected to exceed 72 hours of downtime, OR
2. The customer explicitly requests refund per Terms of Service clause 7.3,
   OR
3. A billing regression means the customer was debited credits without
   receiving the service.

### 4a. Identify affected workspaces

```sql
-- Workspaces that spent credits in the incident window.
SELECT DISTINCT workspace_id, SUM(debit_paise) AS debited_paise
  FROM credit_ledger_entries
 WHERE created_at BETWEEN :incident_start AND :incident_end
   AND entry_type = 'debit_streaming'
 GROUP BY workspace_id
 ORDER BY debited_paise DESC;
```

### 4b. Queue refunds

For each workspace flagged for refund, open a credit note referencing the
original invoice (see `docs/compliance/streaming-gst.md` — Credit Notes
section) and submit through the payment provider:

- PhonePe: merchant dashboard -> Transactions -> Refund. 3–7 business days.
- Razorpay: `POST /v1/payments/:id/refund` with idempotency key
  `refund:incident-<id>:<payment_id>`.

### 4c. Customer communication

See the **Customer Communication Template** section below. Send within 60
minutes of flag-off for any incident expected to exceed 30 minutes.

## Step 5: Database Rollback (Optional — Only If Required)

Expected duration: 30 minutes. **Destructive.** Requires DBA + Eng Lead
sign-off. Skip this entire section for a flag-off-only incident.

The migrations must be reversed in **reverse order**. Each step below
records the file, what it drops, and the caveat for data loss.

### 5a. Revert 094 — flag seed

File: `backend/internal/database/migrations/094_f014_streaming_commercial_v1_flag_seed.down.sql`.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/internal/database/migrations/094_f014_streaming_commercial_v1_flag_seed.down.sql
```

Caveat: removes the `platform_settings` seed row for
`featureflag.streaming.commercial_v1`. After this step the flag defaults to
off via code; no data loss.

### 5b. Revert 093 — streams pin_code drop

File: `093_f014_streams_pin_code_drop.down.sql`.

Caveat: re-introduces the legacy `pin_code` column on the `streams` table.
Any streams created after migration 093 will have `NULL` pin codes. If the
application code expects non-null pin codes, you must also roll the API
image back to the pre-093 SHA.

### 5c. Revert 092 — stream_chats archive + drop

File: `092_f014_stream_chats_archive_and_drop.down.sql`.

Caveat: **archived chat data is restored from the archive table, but
messages deleted by retention after migration 092 are lost.** Verify
archive table presence before running:

```sql
SELECT to_regclass('public.stream_chats_archive') IS NOT NULL AS ok;
```

### 5d. Revert 091 — retention audit

File: `091_f014_retention_audit.down.sql`.

Caveat: **drops the `streaming_retention_audit` table.** If DPDP audit
evidence is required, `pg_dump` the table first:

```bash
pg_dump "$DATABASE_URL" -t streaming_retention_audit \
  --data-only --file=retention_audit_$(date +%Y%m%d%H%M).sql
```

### 5e. Revert 090 and 089 (only if the shortlinks + preflight surface must be removed)

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/internal/database/migrations/090_f014_streaming_preflight_sessions.down.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f backend/internal/database/migrations/089_f014_streaming_shortlinks.down.sql
```

Caveat: any active short-link becomes permanently invalid. Chat tables,
credit ledger, invoices, and rate cards remain untouched.

## Step 6: Cloudflare Stream Cleanup

Expected duration: 10 minutes.

### 6a. Pause all live inputs

```bash
# Requires CF_API_TOKEN with Stream:Edit.
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/live_inputs" \
  | jq -r '.result[] | .uid' \
  | while read -r uid; do
      curl -s -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"meta":{"paused":true}}' \
        "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/live_inputs/$uid" \
        > /dev/null
      echo "paused $uid"
    done
```

### 6b. Mark replays as protected

Replays must remain signed-only so residual links stop resolving when the
app is offline. Toggle `requireSignedURLs: true` on each VOD created
within the incident window:

```bash
curl -s -H "Authorization: Bearer $CF_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream?after=$INCIDENT_START" \
  | jq -r '.result[].uid' \
  | while read -r uid; do
      curl -s -X POST -H "Authorization: Bearer $CF_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"requireSignedURLs": true}' \
        "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/$uid" \
        > /dev/null
    done
```

### 6c. Do NOT delete replays during rollback

Replays are the customer's paid deliverable. Deletion must go through the
standard retention cron (see `streaming_retention_audit`), not the
rollback runbook.

## Step 7: Post-Rollback Verification Checklist

- [ ] Public stream endpoints return 404 for 15 consecutive minutes.
- [ ] `/metrics` shows zero `streaming_shortlink_hits_total` delta for
      15 minutes.
- [ ] Payment webhooks show paused in both PhonePe and Razorpay dashboards.
- [ ] Super-admin streaming console hidden; billing console still shows
      historical invoices.
- [ ] Credit ledger queries succeed; recharges still refundable via
      provider APIs.
- [ ] If full rollback: `psql` shows expected tables dropped; no
      constraint violations in application logs.
- [ ] Customer comms sent; acknowledgement tracker opened.
- [ ] Incident timeline posted in #inc-streaming.
- [ ] RCA owner assigned; due date within 48h.

## Customer Communication Template

**Subject:** Streaming feature temporarily unavailable — credits preserved

**Body:**

```
Hi {workspace_owner_name},

We have temporarily disabled the RawDrive live streaming feature for
{workspace_name} while we investigate an issue first observed at
{incident_start_ist} IST. Your workspace data, galleries, galleries,
invoices, and credit balance ({credit_balance} credits) are unaffected
and remain in your account.

- Live streams in progress at the time of the incident have been saved as
  protected replays and will be re-enabled as soon as the service returns.
- New recharges are paused. If you attempted a recharge during the
  incident and were debited without receiving credits, our finance team
  will issue a full refund within 7 business days — no action needed on
  your side.
- Expected restoration: {eta}.

We will email again the moment the service is back. If your shoot is
time-critical, reply to this message and our support team will work with
you directly.

Thank you for your patience.

— RawDrive Platform Team
Incident reference: {incident_id}
```

Send from `support@rawdrive.live`. CC legal@ and finance@ if the
workspace has an outstanding invoice for the incident window.

## Quarterly Drill Appendix

A dry-run of this runbook is scheduled once per quarter in staging. The
drill must exercise Step 1, Step 2, Step 5a–b (non-destructive parts),
and Step 7. Full data rollback (Step 5c–e) is exercised against a
restored snapshot, never the live staging DB.

### Drill checklist

- [ ] Snapshot staging DB and name it `rollback-drill-<YYYYQn>`.
- [ ] Execute Steps 1–2 on staging; record elapsed time.
- [ ] Execute Step 5 against the snapshot clone only.
- [ ] Validate Step 7 checklist.
- [ ] File drill report under `docs/runbooks/drills/` with timing,
      deviations, and proposed runbook edits.
- [ ] Update the **Last drill** field in this runbook header.

### Drill success criteria

| Metric | Target |
| --- | --- |
| Flag flip to first 404 | <= 90 seconds |
| Full Step 1–2 runtime | <= 5 minutes |
| Full Step 1–7 runtime (no DB rollback) | <= 15 minutes |
| Full rollback including Step 5 | <= 45 minutes |
| Runbook edits filed post-drill | >= 0 (and tracked) |

## Decision Matrix

| Symptom | Action | Rationale |
| --- | --- | --- |
| Public playback 5xx spike, backend healthy | Disable-only (Step 1) | Provider issue; preserve data. |
| Credit ledger shows negative balances | Disable + investigate (Steps 1, 4) | Flag-off stops further debits; DBA triages data. |
| Migration 094 shipped with wrong default | Patch forward | Re-apply corrected seed; no rollback needed. |
| Migration 091 corrupts retention audit inserts | Full rollback (Steps 1–7 including 5) | Schema defect — safest to revert. |
| Cloudflare Stream provider outage >30m | Disable-only + customer comms | Nothing to roll back; wait for provider. |
| DPDP breach suspected | Disable-only + legal escalation | Preserve evidence; never drop audit tables. |
| Payment webhook duplicate recharge bug | Disable-only + Step 3 + finance refund | Ledger correct after refund; no schema revert. |
| Rate-card change caused over-billing | Patch forward + Step 4 refund | Fix rate card in super-admin UI; refund diff. |

## References

- `backend/internal/featureflag/streaming.go`
- `backend/internal/streaming/handlers/`
- `backend/internal/streaming/shortlink/`
- `backend/internal/streaming/preflight/`
- Migrations 089–094 under `backend/internal/database/migrations/`
- `docs/compliance/streaming-dpdp.md`
- `docs/compliance/streaming-gst.md`
- `docs/runbooks/incident-response.md`
