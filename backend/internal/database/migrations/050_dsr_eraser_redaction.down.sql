-- Migration 050 rollback: drop DSR redaction helper functions.
BEGIN;

DROP FUNCTION IF EXISTS redact_audit_log_for_subject(UUID, TEXT);
DROP FUNCTION IF EXISTS redact_audit_logs_for_subject(UUID, TEXT);

COMMIT;
