-- Migration 050: DSR eraser audit-log redaction functions
--
-- M10 E27-S3 closes the DPDPA/GDPR erasure flow. Audit logs in this
-- database are immutable by design — see migrations 009 and 034 which
-- install triggers (audit_log) and rules (audit_logs) that block UPDATE
-- and DELETE. That immutability is important for compliance and forensic
-- replay, but it collides head-on with the data subject's right to
-- erasure under DPDPA §12 and GDPR Article 17.
--
-- The accepted compromise is "redaction, not deletion": the row stays
-- (so audit trail integrity is preserved), but personal data in
-- actor_id, metadata, before_state, after_state is scrubbed. This file
-- installs two SECURITY DEFINER functions that can perform the scrub
-- from the dsr_purge_worker context without loosening the general
-- prohibition on audit log mutation.
--
-- SECURITY DEFINER means these functions execute with the privileges of
-- the role that OWNS them (normally the migration/superuser), not the
-- caller. Inside the function body we disable the triggers/rules for
-- the current transaction only, perform the redaction, and re-enable
-- them before returning. Any other call path that tries to update/delete
-- audit rows will still be blocked.
--
-- The functions accept both a user UUID (for workspace members with a
-- users row) and an email string (for gallery visitors who only exist
-- in consent/proofing/access tables) so a single call handles both
-- subject cohorts.

BEGIN;

-- ─── redact_audit_log_for_subject ─────────────────────────────────────
--
-- Scrubs the legacy audit_log table (migration 009). That table has a
-- limited schema — only actor_id + metadata can hold PII — so the
-- redaction sets actor_id = NULL and metadata = '{"redacted":true}'::jsonb
-- for any row where actor_id matches the given user_id. Email is not
-- stored in this table so the p_email parameter is accepted but unused
-- here; it is used by the sibling function below.
CREATE OR REPLACE FUNCTION redact_audit_log_for_subject(
    p_user_id UUID,
    p_email TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rows_affected INTEGER := 0;
BEGIN
    -- Nothing to do if we have no user_id. audit_log is keyed on UUID,
    -- not email, so visitor-only erasures are a no-op here.
    IF p_user_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Disable the blocking triggers for the current transaction only.
    -- ALTER TABLE ... DISABLE TRIGGER is transactional in Postgres when
    -- wrapped in a function with SET LOCAL semantics — the triggers
    -- re-enable automatically at COMMIT/ROLLBACK.
    EXECUTE 'ALTER TABLE audit_log DISABLE TRIGGER audit_log_prevent_update';
    EXECUTE 'ALTER TABLE audit_log DISABLE TRIGGER audit_log_prevent_delete';

    UPDATE audit_log
    SET actor_id = NULL,
        metadata = jsonb_build_object('redacted', true, 'redacted_at', now())
    WHERE actor_id = p_user_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Re-enable immediately so the immutability guard is only relaxed
    -- for the smallest possible window.
    EXECUTE 'ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_update';
    EXECUTE 'ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_delete';

    RETURN v_rows_affected;
END;
$$;

COMMENT ON FUNCTION redact_audit_log_for_subject(UUID, TEXT) IS
'DSR erasure helper. Scrubs actor_id/metadata in legacy audit_log for the given user. Bypasses immutability triggers via SECURITY DEFINER. Called from dsr_eraser service only.';

-- ─── redact_audit_logs_for_subject ────────────────────────────────────
--
-- Scrubs the M7 audit_logs table (migration 034). This table has more
-- columns that may contain PII: actor_id, metadata, before_state,
-- after_state. It is protected by rewrite rules (not triggers), so we
-- drop them for the transaction, UPDATE, and reinstate them.
CREATE OR REPLACE FUNCTION redact_audit_logs_for_subject(
    p_user_id UUID,
    p_email TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rows_affected INTEGER := 0;
    v_redacted_meta JSONB;
BEGIN
    v_redacted_meta := jsonb_build_object('redacted', true, 'redacted_at', now());

    -- Drop the rewrite rules for this transaction. DROP RULE is
    -- transactional so the rules are restored automatically on rollback;
    -- we reinstate them explicitly below for the commit path.
    DROP RULE IF EXISTS audit_logs_no_update ON audit_logs;
    DROP RULE IF EXISTS audit_logs_no_delete ON audit_logs;

    UPDATE audit_logs
    SET actor_id = NULL,
        metadata = v_redacted_meta,
        before_state = NULL,
        after_state = NULL,
        ip_address = NULL,
        user_agent = NULL
    WHERE (p_user_id IS NOT NULL AND actor_id = p_user_id)
       OR (p_email IS NOT NULL AND p_email <> ''
           AND (metadata->>'email' = p_email
                OR metadata->>'subject_email' = p_email));

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Re-install the rules so no other caller can mutate the table.
    CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
    CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

    RETURN v_rows_affected;
END;
$$;

COMMENT ON FUNCTION redact_audit_logs_for_subject(UUID, TEXT) IS
'DSR erasure helper. Scrubs PII from M7 audit_logs for the given user or email. Bypasses immutability rules via SECURITY DEFINER. Called from dsr_eraser service only.';

-- Lock these functions down: only the application role (or whichever
-- role runs migrations) should be allowed to execute them.
REVOKE ALL ON FUNCTION redact_audit_log_for_subject(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION redact_audit_logs_for_subject(UUID, TEXT) FROM PUBLIC;

COMMIT;
