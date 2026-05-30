-- F-025: galleries.GetBySlug performs a full table scan — no standalone index on slug.
--
-- GalleryRepo.GetBySlug (gallery_repo.go) runs:
--     SELECT ... FROM galleries WHERE slug = $1 AND deleted_at IS NULL
-- keyed on slug ALONE, with no workspace_id in the predicate. This is a public hot
-- path: public_gallery_handler.go, proofing_handler.go and cart_handler.go all resolve
-- a gallery from its slug without a workspace filter.
--
-- The only pre-existing slug index is the composite UNIQUE
-- idx_galleries_workspace_slug ON galleries(workspace_id, slug) (migration 012).
-- Postgres cannot use a composite index whose LEADING column (workspace_id) is absent
-- from the predicate, so every slug-only lookup degrades to a sequential scan whose cost
-- grows linearly with the gallery count.
--
-- Add a standalone partial index whose predicate matches the query exactly. The partial
-- WHERE deleted_at IS NULL clause keeps the index lean (soft-deleted rows are excluded)
-- and lets the planner use an index-only / index scan for the public lookup.
--
-- Append-only follow-up: committed migration 012 is never edited; this is a new pair.
CREATE INDEX IF NOT EXISTS idx_galleries_slug
    ON galleries (slug)
    WHERE deleted_at IS NULL;
