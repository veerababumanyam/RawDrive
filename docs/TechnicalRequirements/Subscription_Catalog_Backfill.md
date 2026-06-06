# Subscription Catalog Backfill

Status: Implemented for the existing-subscription backfill slice  
Last verified: 2026-06-06  
Primary command: `go run ./backend/cmd/backfill-subscription-catalog-versions`

## Purpose

RawDrive is moving toward a dynamic, versioned pricing catalog. Before dynamic
pricing and entitlement resolution can become authoritative, every existing
subscription must be linked to an approved catalog version and must carry an
immutable billing snapshot.

This backfill prevents historical subscriptions, invoices, and future
entitlement logic from changing when an admin later edits plan names, prices,
quotas, features, or billing terms.

## Implementation Status

The existing-subscription backfill mechanism is in place:

- A baseline approved plan-version table exists.
- Current `subscription_plans` rows are seeded into approved version `1` rows.
- `subscriptions` has nullable catalog linkage and snapshot metadata.
- A dry-run-first CLI command exists.
- Apply mode uses locked batches and writes audit-log events.
- The matching logic handles exact tiers, legacy aliases, earliest-version
  fallback, and archived legacy versions for removed tiers.
- Historical paid amounts are preserved in the snapshot.
- The backend test suite and migration-number guard passed on 2026-06-06.

This does not mean the full future pricing/admin approval/billing overhaul is
complete. This document covers the backfill foundation required before that
larger rollout.

## Scope

In scope:

- Backfill existing rows in `subscriptions`.
- Seed approved baseline plan versions from `subscription_plans`.
- Link each subscription to `subscription_plan_versions.id`.
- Write immutable `subscriptions.catalog_snapshot`.
- Record how the row was matched in `catalog_backfill_source`.
- Record when the row was backfilled in `catalog_backfilled_at`.
- Create archived `legacy_backfill_*` plan identities only for removed or
  unknown historical tiers.
- Write one immutable `audit_log` event per applied batch.

Out of scope for this slice:

- Admin plan approval workflow.
- Public pricing preview mode.
- Storage booster checkout.
- Gallery expiry extension checkout.
- Unified billing orders.
- Automatic renewal and dunning.
- Dynamic entitlement resolver rollout.
- Invoice/payment snapshot migration.

## Database Changes

Migration:

- `backend/internal/database/migrations/171_subscription_catalog_backfill_foundation.up.sql`
- `backend/internal/database/migrations/171_subscription_catalog_backfill_foundation.down.sql`

### `subscription_plan_versions`

New table used as the approved version anchor for subscription history.

Important fields:

- `id`
- `tier`
- `version`
- `status`
- `name`
- `description`
- `currency`
- `monthly_price_paise`
- `annual_price_paise`
- `quota_bytes`
- `gallery_limit`
- `client_limit`
- `features`
- `popular`
- `paid`
- `active`
- `self_serve`
- `trial_days`
- `rank`
- `effective_from`
- `effective_to`
- `approved_at`
- `archived_at`
- `created_at`
- `updated_at`

The migration seeds one approved baseline version for every current
`subscription_plans` row:

```sql
INSERT INTO subscription_plan_versions (...)
SELECT ... FROM subscription_plans
ON CONFLICT (tier, version) DO NOTHING;
```

This makes the migration idempotent and safe to reapply in environments where
the baseline version already exists.

### `subscriptions`

Added nullable columns:

- `plan_version_id UUID REFERENCES subscription_plan_versions(id)`
- `catalog_snapshot JSONB`
- `catalog_backfilled_at TIMESTAMPTZ`
- `catalog_backfill_source TEXT`

Allowed `catalog_backfill_source` values:

- `exact_tier_effective_match`
- `alias_tier_effective_match`
- `earliest_version_fallback`
- `alias_earliest_version_fallback`
- `legacy_backfill_version`

Indexes:

- `idx_subscriptions_plan_version`
- `idx_subscriptions_catalog_backfill_pending`
- `idx_subscription_plan_versions_tier_effective`
- `idx_subscription_plan_versions_public_rank`

## Tier Matching Rules

The backfill uses the same exported normalizer as the runtime plan catalog:

- `standard` maps to `free`
- `starter` maps to `creator`
- `pro` maps to `pro_photographer`
- `professional` maps to `pro_photographer`
- `business` maps to `elite_studio`
- `enterprise` maps to `elite_studio`

For each subscription:

1. Use `subscriptions.tier_slug` when present.
2. Fall back to `workspaces.plan_tier` when `tier_slug` is empty.
3. Normalize legacy aliases.
4. Find approved versions for the normalized tier.
5. Choose the latest approved version where `effective_from <= started_at`.
6. If no earlier version exists, choose the earliest approved version for that
   tier.
7. If the tier does not exist in approved versions, create an archived
   `legacy_backfill_*` plan identity and version.
8. If no tier can be determined, mark the row unresolved.

Apply mode refuses to run when the dry-run preflight reports unresolved rows.

## Catalog Snapshot

Each backfilled subscription receives a JSON snapshot with schema:

```json
{
  "snapshot_schema": "subscription_catalog_snapshot.v1",
  "source": "subscription_catalog_backfill",
  "match": {
    "source": "exact_tier_effective_match",
    "raw_tier": "creator",
    "normalized_tier": "creator",
    "legacy_tier": ""
  },
  "subscription": {
    "id": "...",
    "workspace_id": "...",
    "tier_slug": "creator",
    "workspace_tier": "creator",
    "amount_paisa": 49900,
    "billing_interval": "monthly",
    "status": "active",
    "started_at": "...",
    "expires_at": "..."
  },
  "billing": {
    "preserved_amount_paisa": 49900,
    "billing_interval": "monthly"
  },
  "plan": {
    "id": "...",
    "tier": "creator",
    "version": 1,
    "status": "approved",
    "name": "Creator",
    "monthly_price_paise": 49900,
    "annual_price_paise": 499000,
    "quota_bytes": 107374182400
  }
}
```

Important invariant:

- The historical `subscriptions.amount_paisa` is preserved in
  `billing.preserved_amount_paisa`.
- The backfill does not recompute old paid amounts from current catalog prices.

## Command

Command path:

```bash
backend/cmd/backfill-subscription-catalog-versions
```

Required configuration:

```bash
DATABASE_URL=postgres://...
```

Dry run, default:

```bash
go run ./backend/cmd/backfill-subscription-catalog-versions
```

Apply:

```bash
go run ./backend/cmd/backfill-subscription-catalog-versions --apply
```

Optional flags:

```bash
--force
--batch-size 500
--timeout 10m
```

Behavior:

- Dry run prints a JSON report and performs no writes.
- `--apply` first performs a dry-run preflight.
- Apply mode refuses to mutate if unresolved rows exist.
- Already-backfilled rows are skipped unless `--force` is passed.
- Rows are processed in batches.
- Apply mode uses `FOR UPDATE SKIP LOCKED` to avoid long blocking and duplicate
  worker claims.
- One `audit_log` row is written for each applied batch.

## Dry-Run Report

The command prints JSON with:

- `scanned`
- `would_backfill`
- `backfilled`
- `skipped_already_backfilled`
- `exact_tier_date_matches`
- `alias_matches`
- `earliest_version_fallbacks`
- `legacy_version_matches`
- `legacy_versions_to_create`
- `legacy_versions_created`
- `legacy_version_tiers`
- `audit_events_written`
- `unresolved_rows`

Operators must inspect `unresolved_rows` before applying. Production apply must
not proceed when unresolved rows are present.

## Audit Trail

Apply mode writes immutable rows to `audit_log`:

- `action`: `subscriptions.catalog_backfill_batch`
- `resource_type`: `subscription_catalog_backfill`
- `resource_id`: backfill run UUID
- `metadata`: batch number, force flag, batch size, match counts, backfilled
  count, and legacy tier creation summary

This follows the existing service-layer audit pattern used elsewhere in the
backend.

## Idempotency

The mechanism is safe to rerun:

- Migration seed uses `ON CONFLICT (tier, version) DO NOTHING`.
- Default command mode skips rows with all three fields populated:
  `plan_version_id`, `catalog_snapshot`, and `catalog_backfilled_at`.
- Legacy plan identities use deterministic slugs:
  `legacy_backfill_<sanitized_original_tier>`.
- Legacy versions use `(tier, version) = (<legacy_tier>, 1)`.
- `--force` intentionally rebuilds snapshots for all matching rows.

## Failure Modes

Missing `DATABASE_URL`:

- Command exits with config error.

Unresolved rows in dry run:

- Report includes `unresolved_rows`.
- Dry run exits successfully so operators can inspect the report.

Unresolved rows in apply preflight:

- Apply is refused before any mutation.

Runtime unresolved row during apply:

- The current transaction rolls back.
- The command exits with an error.

Database error:

- The current transaction rolls back.
- The command exits non-zero.

## Verification

Verified on 2026-06-06:

```bash
cd /Users/apple/merupuai/RawDrive/backend
go test ./... -count=1 -timeout 120s
```

Result:

- Passed.

Migration-number guard:

```bash
cd /Users/apple/merupuai/RawDrive
node scripts/check-migration-numbers.mjs
```

Result:

- Passed.
- Migration `171` is unique.

## Test Coverage

Service tests cover:

- Exact current tier backfill.
- Legacy alias backfill.
- Earliest-version fallback.
- Removed or unknown tier creating a legacy backfill plan.
- Unresolved row detection.
- Historical amount preservation in snapshot.
- Dry-run legacy tier de-duplication.
- Apply preflight failure when unresolved rows exist.

Migration tests cover:

- Migration files exist.
- `subscription_plan_versions` is created.
- Baseline approved versions are seeded.
- Subscription backfill columns are added.
- Allowed source values are constrained.
- Pending backfill index exists.
- Down migration removes the foundation cleanly.

Command package:

- Builds as part of the full backend test run.

## Operational Runbook

1. Deploy migration `171`.
2. Confirm the app is still using the old entitlement path or the future dynamic
   entitlement feature flag remains disabled.
3. Run dry run:

   ```bash
   DATABASE_URL=postgres://... go run ./backend/cmd/backfill-subscription-catalog-versions
   ```

4. Review report:

   - `unresolved_rows` must be empty.
   - Check legacy tiers to be created.
   - Check match counts against expected subscription volume.

5. Apply:

   ```bash
   DATABASE_URL=postgres://... go run ./backend/cmd/backfill-subscription-catalog-versions --apply
   ```

6. Confirm:

   ```sql
   SELECT COUNT(*)
   FROM subscriptions
   WHERE plan_version_id IS NULL
      OR catalog_snapshot IS NULL
      OR catalog_backfilled_at IS NULL;
   ```

   Expected result:

   ```text
   0
   ```

7. Confirm audit rows:

   ```sql
   SELECT COUNT(*)
   FROM audit_log
   WHERE action = 'subscriptions.catalog_backfill_batch';
   ```

8. Only after the backfill is complete should future slices enable dynamic
   entitlement resolution.

## Acceptance Criteria

This requirement is complete when:

- Migration `171` has run.
- Dry-run report shows zero unresolved rows.
- Apply mode completes successfully.
- Every subscription has `plan_version_id`, `catalog_snapshot`, and
  `catalog_backfilled_at`.
- Historical subscription amount is preserved in each snapshot.
- Audit-log batch records exist.
- Backend tests and migration-number guard pass.

## Related Files

- `backend/internal/database/migrations/171_subscription_catalog_backfill_foundation.up.sql`
- `backend/internal/database/migrations/171_subscription_catalog_backfill_foundation.down.sql`
- `backend/internal/service/subscription_catalog_backfill.go`
- `backend/internal/service/subscription_catalog_backfill_test.go`
- `backend/cmd/backfill-subscription-catalog-versions/main.go`
- `backend/internal/service/plan_catalog.go`
