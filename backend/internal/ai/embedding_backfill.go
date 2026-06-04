package ai

import (
	"github.com/google/uuid"
)

// selectEmbeddingBackfillSQL returns the query used by cmd/backfill-embeddings
// to page through assets that still need a semantic-search embedding. It is
// kept here (next to the live search path) so the predicate and ordering stay
// in lock-step with SearchService and so it is unit-testable without a DB.
//
// Predicate rationale:
//   - embedding IS NULL      → idempotent / re-runnable; only fills gaps.
//   - deleted_at IS NULL     → never resurrect soft-deleted assets.
//   - content_type LIKE      → embeddings are image-only (matches the live
//     SearchWorker claim filter).
//
// Ordering by (created_at, id) is deterministic so a --limit smoke run and a
// crash-and-resume both make forward progress. $1 bounds the batch size.
// selectEmbeddingBackfillSQL is the first-page form; selectEmbeddingBackfillSQLAfter
// adds a keyset cursor for subsequent pages so the walk works even when no row
// is mutated (e.g. --dry-run), avoiding both OFFSET drift and re-reading the
// same page forever.
func selectEmbeddingBackfillSQL() string {
	return `SELECT id, workspace_id, created_at, ai_caption, ai_tags
	        FROM assets
	        WHERE embedding IS NULL
	          AND deleted_at IS NULL
	          AND content_type LIKE 'image/%'
	        ORDER BY created_at ASC, id ASC
	        LIMIT $1`
}

// selectEmbeddingBackfillSQLAfter is the keyset-paginated form: it returns rows
// strictly after the (created_at, id) cursor passed as $2, $3. Same predicate
// and ordering as the first-page query so pages stitch together gap-free.
func selectEmbeddingBackfillSQLAfter() string {
	return `SELECT id, workspace_id, created_at, ai_caption, ai_tags
	        FROM assets
	        WHERE embedding IS NULL
	          AND deleted_at IS NULL
	          AND content_type LIKE 'image/%'
	          AND (created_at, id) > ($2, $3)
	        ORDER BY created_at ASC, id ASC
	        LIMIT $1`
}

// deriveEmbeddingInput is the backfill entry point. It delegates to the shared
// embeddingSourceText seam so cmd/backfill-embeddings derives the embedding
// input text — and the skip decision — from the EXACT same logic as the live
// SearchService.IndexAsset path. ok=false ⇒ skip and count as skipped_no_text.
func deriveEmbeddingInput(assetID uuid.UUID, caption *string, tagsJSON []byte) (string, bool) {
	return embeddingSourceText(assetID, caption, tagsJSON)
}

// SelectEmbeddingBackfillSQL is the exported entry point for
// cmd/backfill-embeddings: the first-page selection query for assets missing a
// semantic-search embedding. Logic and tests live on the unexported
// selectEmbeddingBackfillSQL.
func SelectEmbeddingBackfillSQL() string {
	return selectEmbeddingBackfillSQL()
}

// SelectEmbeddingBackfillSQLAfter is the keyset-paginated counterpart used for
// every page after the first. Cursor params are $2 (created_at) and $3 (id).
func SelectEmbeddingBackfillSQLAfter() string {
	return selectEmbeddingBackfillSQLAfter()
}

// DeriveEmbeddingInput is the exported entry point for cmd/backfill-embeddings.
// It returns the embedding input text for an asset (derived exactly as the live
// SearchService.IndexAsset path does) and whether the asset has a real text
// source. ok=false ⇒ skip and count as skipped_no_text. Logic and tests live on
// the unexported deriveEmbeddingInput.
func DeriveEmbeddingInput(assetID uuid.UUID, caption *string, tagsJSON []byte) (string, bool) {
	return deriveEmbeddingInput(assetID, caption, tagsJSON)
}
