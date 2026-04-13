-- M31 / F-014 · Rollback live events / viewer sessions / ingest audit

DROP TRIGGER  IF EXISTS ingest_reveal_audit_no_update ON ingest_reveal_audit;
DROP FUNCTION IF EXISTS ingest_reveal_audit_immutable_guard();
DROP POLICY IF EXISTS ingest_reveal_audit_insert ON ingest_reveal_audit;
DROP POLICY IF EXISTS ingest_reveal_audit_read   ON ingest_reveal_audit;
DROP TABLE  IF EXISTS ingest_reveal_audit;

DROP POLICY IF EXISTS viewer_sessions_write ON viewer_sessions;
DROP POLICY IF EXISTS viewer_sessions_read  ON viewer_sessions;
DROP TABLE  IF EXISTS viewer_sessions;

DROP POLICY IF EXISTS live_event_delivery_all ON live_event_delivery;
DROP TABLE  IF EXISTS live_event_delivery;

DROP POLICY IF EXISTS live_events_all ON live_events;
DROP TABLE  IF EXISTS live_events;
