-- M3 E8-S1 #6: gallery-level face detection opt-out
--
-- Distinct from faceid_enabled (added in 041), which controls whether gallery
-- VIEWERS can search by their face. face_detection_enabled controls whether
-- the face-detection ML pipeline runs on assets in this gallery AT ALL.
--
-- Privacy-critical: studios hosting sensitive content (medical events, private
-- ceremonies) can opt out of automated face extraction entirely. Default is
-- true to preserve existing behavior for galleries created before this column.

ALTER TABLE galleries
    ADD COLUMN IF NOT EXISTS face_detection_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN galleries.face_detection_enabled IS
    'When false, the face detection worker skips all assets in this gallery. Privacy opt-out (M3 E8-S1 #6).';
