-- M31 / F-014 · Rollback packages + rate cards

DROP POLICY IF EXISTS streaming_rate_cards_insert ON streaming_rate_cards;
DROP POLICY IF EXISTS streaming_rate_cards_read   ON streaming_rate_cards;
DROP TABLE IF EXISTS streaming_rate_cards;

DROP POLICY IF EXISTS streaming_packages_write ON streaming_packages;
DROP POLICY IF EXISTS streaming_packages_read  ON streaming_packages;
DROP TABLE IF EXISTS streaming_packages;
