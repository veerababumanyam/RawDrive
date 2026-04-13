-- M31 / F-014 · Rollback reservations

DROP POLICY IF EXISTS streaming_reservations_write ON streaming_reservations;
DROP POLICY IF EXISTS streaming_reservations_read  ON streaming_reservations;
DROP TABLE  IF EXISTS streaming_reservations;
