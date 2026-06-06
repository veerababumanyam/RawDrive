# Phone-reuse: user & operator guide

## What changed (for users)

RawDrive allows **one free account per phone number**. The number is now matched
on its *canonical* form, so `9876543210`, `+91 98765 43210`, and `098765 43210`
are treated as the **same** number — you can no longer create multiple free
accounts by reformatting it.

If you want a **second account on a phone that already has one**, you can — on a
**paid plan**. At signup, choose a paid plan; you'll complete payment before the
new workspace is created. (This paid-second-account funnel is gated by the
`phone_reuse.enforcement` flag and is enabled per the operator runbook below.)

If a paid second account's subscription **lapses**, it becomes `paid_expired` —
it does **not** silently turn into another free account. Renew it, or use a
different phone for free-tier use.

## Account states (`users.phone_reuse_state`)

| State | Meaning |
|---|---|
| `free` | The phone's single free slot. |
| `paid_pending` | A second+ account on a used phone, awaiting payment. No workspace/quota yet. |
| `paid_active` | Paid and current. |
| `paid_expired` | Was paid, lapsed/cancelled. Blocked from free-tier until renewed or moved to another phone. |

## Operator runbook

**Order of operations (per environment):**

1. Apply migrations `171` and `172` (add `phone_normalized`, `phone_reuse_state`,
   `paid_phone_verified_at`).
2. **Dry-run the backfill** and review collisions:
   ```bash
   DATABASE_URL=... go run ./backend/cmd/backfill-phone-reuse-state --dry-run
   ```
   The report lists every normalized-phone group with >1 account and how each
   would be resolved (oldest non-paid → `free`, later colliders → `paid_expired`,
   paid → `paid_active`).
3. **Apply the backfill:**
   ```bash
   DATABASE_URL=... go run ./backend/cmd/backfill-phone-reuse-state
   ```
4. Apply migration `173` (drops `users_phone_key`, adds the partial unique
   index). It **fails closed** if any unresolved free/free collision remains —
   re-run the backfill if so.
5. Apply migrations `174` (signup orders) and `175` (flag seed, disabled).
6. The enforcement flag stays **off** until the paid-signup payment funnel
   (slice-4 HTTP handler + provisioner + JWT refresh + frontend) is built and
   **runtime-verified**. Until then, signups behave as "one account per phone"
   (normalization-aware) — duplicates are rejected with a clear message.
7. **Enable** only after the funnel is verified:
   `PUT /api/v1/admin/settings/featureflag/phone_reuse.enforcement` →
   `{"enabled": true}` (or `FEATURE_PHONE_REUSE_ENFORCEMENT=true`).

**Rollback:** set the flag back to `{"enabled": false}`. Migration down scripts
exist for 171–175 (note: 173-down restores the global `users_phone_key`, which
can fail if raw-duplicate phones now exist — resolve them first).
