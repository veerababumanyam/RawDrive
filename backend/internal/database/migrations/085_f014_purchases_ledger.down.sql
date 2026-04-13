-- M31 / F-014 · Rollback purchases + ledger

DROP VIEW  IF EXISTS streaming_credit_balances;

DROP TRIGGER IF EXISTS streaming_ledger_entries_no_update ON streaming_ledger_entries;
DROP FUNCTION IF EXISTS streaming_ledger_immutable_guard();

DROP POLICY IF EXISTS streaming_ledger_entries_insert ON streaming_ledger_entries;
DROP POLICY IF EXISTS streaming_ledger_entries_read   ON streaming_ledger_entries;
DROP TABLE  IF EXISTS streaming_ledger_entries;

DROP POLICY IF EXISTS streaming_purchases_insert ON streaming_purchases;
DROP POLICY IF EXISTS streaming_purchases_read   ON streaming_purchases;
DROP TABLE  IF EXISTS streaming_purchases;
