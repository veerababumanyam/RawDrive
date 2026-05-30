-- Down for migration 125.
--
-- Drop only the index. We intentionally do NOT drop the
-- face_recognition_enabled column: it predates this migration's ownership
-- (it is consulted by migrations 111/112 and by FaceService /
-- PublicGalleryHandler / workspace_face_recognition_handler), so dropping it
-- here would break a rollback to any version at or after migration 111.
DROP INDEX IF EXISTS idx_workspaces_face_recognition_enabled;
