-- 069_soc2_audit_log_index.down.sql
DROP VIEW IF EXISTS audit_log_retention_check;
DROP INDEX IF EXISTS idx_audit_log_actor_created;
DROP INDEX IF EXISTS idx_audit_log_created_at;
