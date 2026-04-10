# Upload Screening Alerts — Runbook

M16 Tier D (upload manifest validation) has four Grafana alerts defined in
`infra/grafana/alerts/upload-screening.yaml`. This runbook is the response
playbook for on-call.

**Scope:** `/api/v1/uploads` (chunked), `POST /api/v1/assets` (direct multipart),
`/api/v1/admin/upload-moderation/*`, `service.UploadManifestValidation`,
`service.WorkspacePolicyService`, `service.UploadAllowlistService`.

## block-rate-high

**Alert:** Upload scan block rate above 5% for 10 minutes.

**What it means:** One of:
1. A real attack campaign is in progress (legitimate — let it continue blocking)
2. The browser screener regressed and is flagging legitimate files
3. A new policy version was published with tighter thresholds than expected

**First actions:**
1. Check the `/api/v1/admin/upload-moderation/analytics` dashboard for the
   affected workspace and read the top Tier D causes.
2. Cross-reference against the `upload_policy_versions` table:
   `SELECT policy_version, published_at, max_age_days FROM upload_policy_versions ORDER BY published_at DESC LIMIT 5;`
3. If a new policy shipped in the last hour and the spike started after it,
   that is the most likely cause.

**Rollback:** Revoke the bad policy version:
```sql
UPDATE upload_policy_versions SET revoked_at = NOW()
WHERE policy_version = 'upload-screening/<bad-version>';
```
Cache TTL is 5 minutes — new sessions start using the next-newest version
within 5 minutes. No deploy required.

**Long-term:** If the screener regressed, add a regression test under
`frontend/src/lib/upload-screening/__tests__/` that catches the false-positive
file.

---

## tier-d-spike

**Alert:** Tier D rejects are 3x the 6-hour baseline.

**What it means:** A specific class of files is being rejected at a much
higher rate than normal. Usually an attack campaign against a specific
workspace, or a customer who just enabled `strict_client_scan` and is
uploading old RAW/TIFF files that need the desktop companion.

**First actions:**
1. Check which workspaces are producing the spike:
   `/api/v1/admin/upload-moderation/analytics?workspace_id=<id>`
2. Look at the `tier_d_causes` breakdown — is it `desktop_required` (benign)
   or `appended_payload` / `archive_signature` (attack)?

**If desktop_required:** Contact the customer and explain M17 timing. Offer
to temporarily downgrade them to `standard` mode if they need to ship.

**If attack:** Review the `assets` rows with `upload_scan_status = 'blocked'`
in the affected workspace. If the same user id shows up repeatedly, suspend
the user via the admin UI.

---

## engine-errors

**Alert:** Upload validator is erroring on requests (5xx).

**What it means:** `UploadManifestValidation.ValidateForSessionCreate` is
returning non-sentinel errors — usually a DB connection issue, a nil-pointer
panic in the validator, or the `upload_policy_versions` table being empty.

**First actions:**
1. `kubectl logs -l app=rawdrive-api --tail=500 | grep SCAN_`
2. If you see `policy catalog not configured` errors: the `UploadPolicyCatalog`
   was wired with a nil `*sql.DB`. This is a config issue in `cmd/api/main.go`.
3. If you see `reading workspace policy mode` errors: the `workspaces` table
   is missing the `upload_policy_mode` column. Check migration 055 ran.

**Rollback:** Set `TIER_D_ENFORCE_MODE=0` in the API deployment (env var) and
restart — the validator moves to telemetry-only mode and stops rejecting
requests. This is the safe posture for an active outage.

```bash
kubectl set env deployment/rawdrive-api TIER_D_ENFORCE_MODE=0
kubectl rollout restart deployment/rawdrive-api
```

**Long-term:** Add a Go test covering the specific failure mode.

---

## allowlist-abuse

**Alert:** Admin issuing > 10 allowlist tokens per hour.

**What it means:** Either (a) a legitimate support spike (e.g., a customer
sent a batch of files that all triggered a false positive), or (b) admin
account takeover.

**First actions:**
1. Who is the actor? `SELECT id, email, platform_role FROM users WHERE id = '<actor_id>';`
2. Review recent `audit_logs` for that actor:
   `SELECT action, resource_id, created_at FROM audit_logs WHERE actor_id = '<id>' ORDER BY created_at DESC LIMIT 50;`
3. Is every override justified with a real reason, or do they look templated?

**If takeover suspected:** Rotate the admin's session token (force logout),
disable their account, and run a full audit of every asset id they touched
in the last 24 hours.

**If legitimate:** Contact the customer to understand why so many files are
being blocked and either (a) tune their policy mode or (b) ship a targeted
screener improvement.

---

## Useful queries

```sql
-- Blocked uploads in the last hour
SELECT workspace_id, filename, upload_scan_status, upload_scan_risk_score, created_at
FROM assets
WHERE upload_scan_status = 'blocked'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Active policy versions
SELECT policy_version, published_at, revoked_at, max_age_days
FROM upload_policy_versions
WHERE revoked_at IS NULL
ORDER BY published_at DESC;

-- Unused allowlist tokens (should be a small number at any time)
SELECT workspace_id, COUNT(*)
FROM upload_allowlist_tokens
WHERE used_at IS NULL AND expires_at > NOW()
GROUP BY workspace_id
ORDER BY COUNT(*) DESC
LIMIT 20;
```

## Escalation

- On-call primary: `#oncall-platform` in Slack
- Security escalation (for allowlist-abuse + engine-errors with panic): `#security-incident`
- M16 tech lead: Manyam Prasad (`@manyam.prasad` in Slack)
