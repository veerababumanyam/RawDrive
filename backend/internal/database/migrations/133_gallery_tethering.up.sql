-- M23: Camera tethering support on galleries.
--
-- tethering_enabled: when true the desktop companion app watches
--   tether_directory and auto-uploads every new file into this gallery.
-- tether_directory: filesystem path the desktop app monitors (web API stores
--   it as opaque text; actual FS access lives in the desktop app only).
--
-- No local disk storage at the API level — this is metadata only.
ALTER TABLE galleries
  ADD COLUMN tethering_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN tether_directory  text;

-- Partial index: desktop polling query filters on this flag.
CREATE INDEX idx_galleries_tethering_enabled
  ON galleries (workspace_id, tethering_enabled)
  WHERE tethering_enabled = true;
