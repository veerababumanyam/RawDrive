package ai

import (
	"strings"

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

// deriveEmbeddingInput reproduces the LIVE embedding input-text derivation used
// by SearchService.IndexAsset: it composes the source text from the asset's
// ai_caption and ai_tags via buildEmbeddingText (the exact same helper the
// running app uses). Malformed ai_tags JSONB degrades to no tags via
// decodeAITags, identical to the live path.
//
// Unlike the live path — which only runs after AutoTag has populated caption
// and tags — a backfilled asset may have neither. buildEmbeddingText would
// otherwise fall back to the generic literal "photograph", producing a
// meaningless, uniform vector. So this function returns ok=false when there is
// no real text source (no non-blank caption AND no tags); the command counts
// that as skipped_no_text rather than embedding the fallback.
func deriveEmbeddingInput(assetID uuid.UUID, caption *string, tagsJSON []byte) (string, bool) {
	tags := decodeAITags(assetID, tagsJSON)
	hasCaption := caption != nil && strings.TrimSpace(*caption) != ""
	if !hasCaption && len(tags) == 0 {
		return "", false
	}
	return buildEmbeddingText(caption, tags), true
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
