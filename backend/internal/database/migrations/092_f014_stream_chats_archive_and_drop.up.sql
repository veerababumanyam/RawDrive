-- M35 / F-014: retire legacy stream_chats table (E110-S2 / 35-9).
-- Phase 1: archive any orphan rows that never migrated into chat_messages
--          (rows live on stream_chats but no id-matching row in chat_messages).
-- Phase 2: DROP TABLE stream_chats.
-- Guarded by to_regclass so this migration is idempotent on fresh databases
-- where stream_chats was never created (dev / CI) and on DBs where a prior
-- partial run already dropped the table.

DO $$
BEGIN
    IF to_regclass('public.stream_chats') IS NOT NULL THEN
        -- Phase 1: archive orphans into chat_messages. stream_chats has no
        -- workspace_id, so derive it from the parent streams row.
        -- chat_messages(id, stream_id, workspace_id, viewer_session_id,
        --               author_user_id, body, posted_at, deleted_at,
        --               deleted_by_user_id).
        INSERT INTO chat_messages (
            id, stream_id, workspace_id, viewer_session_id,
            author_user_id, body, posted_at
        )
        SELECT sc.id,
               sc.stream_id,
               s.workspace_id,
               NULL,
               sc.user_id,
               sc.message,
               sc.created_at
          FROM stream_chats sc
          JOIN streams s ON s.id = sc.stream_id
          LEFT JOIN chat_messages cm ON cm.id = sc.id
         WHERE cm.id IS NULL;

        -- Phase 2: drop legacy table + indexes.
        DROP INDEX IF EXISTS idx_stream_chats_stream;
        DROP INDEX IF EXISTS idx_stream_chats_created;
    END IF;
END $$;

DROP TABLE IF EXISTS stream_chats;
