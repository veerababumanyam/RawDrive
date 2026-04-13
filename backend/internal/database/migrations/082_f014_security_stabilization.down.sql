-- Rollback for 082_f014_security_stabilization.up.sql

-- Platform settings
DELETE FROM platform_settings WHERE category = 'streaming'
AND key IN ('cf_api_token', 'cf_account_id', 'cf_signing_key', 'cf_webhook_secret', 'allowed_origins');

-- Reaction events
DROP POLICY IF EXISTS reaction_events_insert ON reaction_events;
DROP POLICY IF EXISTS reaction_events_read   ON reaction_events;
DROP TABLE IF EXISTS reaction_events;

-- Chat messages (keep stream_chats intact — data is still there)
DROP POLICY IF EXISTS chat_messages_update ON chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON chat_messages;
DROP POLICY IF EXISTS chat_messages_read   ON chat_messages;
DROP TABLE IF EXISTS chat_messages;

-- Note: streams.pin_hash is NOT dropped here — production rows may have
-- already been backfilled. Rolling back that column requires operator
-- sign-off; use the E108-S4 migration's reverse path if you need to.
