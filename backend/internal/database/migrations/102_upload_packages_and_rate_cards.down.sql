-- M41 / Upload Credit Top-up — 102 down
--
-- Drop order: rate_cards (child) before packages (parent). The FK from
-- upload_rate_cards.package_code → upload_packages(code) uses ON DELETE
-- RESTRICT, so dropping packages first would fail while any rate card row
-- still references it.
--
-- Indexes and constraints drop with their tables — no separate DROP INDEX
-- statements are required.

DROP TABLE IF EXISTS upload_rate_cards;
DROP TABLE IF EXISTS upload_packages;
