-- M8: Rollback Live Streaming & Desktop Companion

ALTER TABLE assets DROP COLUMN IF EXISTS video_duration_seconds;
ALTER TABLE assets DROP COLUMN IF EXISTS is_video;
DROP TABLE IF EXISTS desktop_sessions;
DROP TABLE IF EXISTS video_assets;
DROP TABLE IF EXISTS stream_chats;
DROP TABLE IF EXISTS streams;
