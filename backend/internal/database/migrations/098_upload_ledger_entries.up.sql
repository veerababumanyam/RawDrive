-- M40 / Upload Credit Meter — 098: upload_ledger_entries
--
-- Append-only signed ledger. Every credit movement (purchase, monthly grant,
-- admin grant, reserve, consume, refund, TTL expire, enterprise unlimited
-- passthrough) posts exactly one row. The balance view (099) sums
-- amount_credits per workspace to derive the current balance.
--
-- Append-only posture is enforced at the application layer. The migration
-- ships no UPDATE/DELETE helpers — any agent that wants to mutate ledger
-- rows is doing something wrong (typically writing a new compensating entry
-- is the correct pattern).

CREATE TABLE IF NOT EXISTS upload_ledger_entries (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entry_type            TEXT NOT NULL
        CHECK (entry_type IN (
            'purchase',
            'grant_monthly',
            'grant_admin',
            'reserve',
            'consume',
            'refund',
            'expire',
            'unlimited_passthrough'
        )),
    amount_credits        BIGINT NOT NULL,
    idempotency_key       TEXT,
    reservation_ref_id    UUID REFERENCES upload_ledger_entries(id),
    purchase_id           UUID REFERENCES upload_purchases(id) ON DELETE SET NULL,
    upload_session_id     UUID,
    reason                TEXT,
    metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID REFERENCES users(id) ON DELETE SET NULL
);

-- (workspace_id, created_at DESC) is the hot path for Balance() sums and
-- recent-activity queries. Called out in feature-architecture-delta.md §Risks
-- as the mitigation for unbounded ledger growth — without it, Balance becomes
-- O(n) per workspace.
CREATE INDEX IF NOT EXISTS idx_upload_ledger_workspace_created
    ON upload_ledger_entries (workspace_id, created_at DESC);

-- Active reservations need a fast lookup by reservation id for Consume/Refund.
CREATE INDEX IF NOT EXISTS idx_upload_ledger_reservation_ref
    ON upload_ledger_entries (reservation_ref_id)
    WHERE reservation_ref_id IS NOT NULL;

-- Idempotency replay defence: if the same key shows up twice for the same
-- workspace, the second insert must fail.
CREATE UNIQUE INDEX IF NOT EXISTS idx_upload_ledger_workspace_idem_key
    ON upload_ledger_entries (workspace_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
