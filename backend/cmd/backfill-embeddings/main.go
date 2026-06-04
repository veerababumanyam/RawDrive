// Command backfill-embeddings generates the pgvector semantic-search embedding
// (assets.embedding) for image assets that are missing one. It backfills
// historical assets that were ingested before the AI search pipeline ran, or
// whose embedding step failed, so that semantic search covers the full library.
//
// It is the offline twin of the live path: ai.SearchService.IndexAsset reads an
// asset's ai_caption + ai_tags, composes the embedding input text, calls the
// Gemini text-embedding model, and writes assets.embedding. This command
// reuses the SAME text derivation (ai.deriveEmbeddingInput → buildEmbeddingText)
// and the SAME persistence SQL so a backfilled vector is indistinguishable from
// one produced by the worker.
//
// Idempotent + resumable: it only touches rows with embedding IS NULL, ordered
// deterministically, so re-running fills remaining gaps. --dry-run counts only;
// --limit caps total processed (smoke tests); --batch sizes each DB page.
//
// Config (platform_settings → env, never hardcoded):
//
//	DATABASE_URL                Postgres DSN                       (required)
//	platform_settings ai.gemini_api_key → env GEMINI_API_KEY      Gemini key (required)
//	PLATFORM_SETTINGS_KEK       hex KEK to decrypt the secret row  (required only to read the DB key)
//	platform_settings ai.embedding_model → env AI_EMBEDDING_MODEL  model (default text-embedding-004)
//
// Exit codes:
//
//	0 = success (counts printed)
//	1 = config error (missing DATABASE_URL / Gemini key, or DB unreachable)
//	2 = partial failure (some assets failed to embed; safe to re-run)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"

	"github.com/rawdrive/backend/internal/ai"
	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/repository"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "count eligible assets only, no Gemini calls or DB writes")
	limit := flag.Int("limit", 0, "stop after processing N assets (0 = no limit)")
	batch := flag.Int("batch", 50, "rows fetched per DB page (>0)")
	flag.Parse()

	if *batch <= 0 {
		fmt.Fprintln(os.Stderr, "ERROR: --batch must be > 0")
		os.Exit(1)
	}

	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "ERROR: DATABASE_URL is not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Minute)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: open pool: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: ping DB: %v\n", err)
		os.Exit(1)
	}

	// Resolve the embedding model: platform_settings(ai.embedding_model) →
	// env(AI_EMBEDDING_MODEL) → default. Unset ⇒ ai.DefaultEmbeddingModel.
	settingsRepo := newSettingsRepo(pool)
	embeddingModel := ai.ResolveEmbeddingModel(
		platformSetting(ctx, settingsRepo, "ai", "embedding_model", os.Getenv("AI_EMBEDDING_MODEL")),
	)

	// Resolve the Gemini API key the same way the rest of the app does:
	// platform_settings(ai.gemini_api_key) first, then GEMINI_API_KEY env.
	// Never hardcode; fail (exit 1) if neither supplies a key — except in
	// --dry-run, which performs no Gemini calls and so does not need one.
	apiKey := platformSetting(ctx, settingsRepo, "ai", "gemini_api_key", os.Getenv("GEMINI_API_KEY"))
	if apiKey == "" && !*dryRun {
		fmt.Fprintln(os.Stderr, "ERROR: no Gemini API key (set platform_settings ai.gemini_api_key with PLATFORM_SETTINGS_KEK, or GEMINI_API_KEY env)")
		os.Exit(1)
	}

	client := ai.NewGeminiClient("").WithEmbeddingModel(embeddingModel)

	log.Printf("backfill-embeddings: model=%s dry-run=%v limit=%d batch=%d",
		client.EmbeddingModel(), *dryRun, *limit, *batch)

	var processed, embedded, skippedNoText, failed int
	startTime := time.Now()

	// Keyset cursor over (created_at, id) ascending. The first page omits the
	// cursor; subsequent pages fetch strictly after it. This walks the
	// remaining NULL-embedding rows deterministically in both live and
	// --dry-run modes (no OFFSET, no re-reading the same page).
	var (
		cursorTime time.Time
		cursorID   uuid.UUID
		haveCursor bool
		firstPageQ = ai.SelectEmbeddingBackfillSQL()
		nextPagesQ = ai.SelectEmbeddingBackfillSQLAfter()
	)

	for *limit <= 0 || processed < *limit {
		pageSize := *batch
		if *limit > 0 && *limit-processed < pageSize {
			pageSize = *limit - processed
		}

		var page []assetRow
		var err error
		if haveCursor {
			page, err = fetchPage(ctx, pool, nextPagesQ, pageSize, cursorTime, cursorID)
		} else {
			page, err = fetchPage(ctx, pool, firstPageQ, pageSize)
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: fetch page: %v\n", err)
			os.Exit(2)
		}
		if len(page) == 0 {
			break
		}
		// Advance the cursor to the last row of this page.
		last := page[len(page)-1]
		cursorTime, cursorID, haveCursor = last.createdAt, last.id, true

		for _, a := range page {
			processed++
			text, ok := ai.DeriveEmbeddingInput(a.id, a.caption, a.tagsJSON)
			if !ok {
				skippedNoText++
				continue
			}
			if *dryRun {
				embedded++ // "would embed"
				continue
			}
			vec, _, embErr := client.GenerateEmbedding(ctx, apiKey, text)
			if embErr != nil {
				if embErr == ai.ErrQuotaExceeded {
					// Rate limited: stop cleanly; remaining NULLs are picked
					// up on the next run (idempotent).
					log.Printf("backfill-embeddings: quota exceeded after %d processed; stopping (re-run to continue)", processed)
					goto DONE
				}
				log.Printf("asset %s: embed failed: %v", a.id, embErr)
				failed++
				continue
			}
			if _, upErr := pool.Exec(ctx,
				`UPDATE assets SET embedding = $2, updated_at = now() WHERE id = $1 AND embedding IS NULL`,
				a.id, pgvector.NewVector(vec),
			); upErr != nil {
				log.Printf("asset %s: update failed: %v", a.id, upErr)
				failed++
				continue
			}
			embedded++
		}

		// A short page means the source is exhausted (page < requested).
		if len(page) < pageSize {
			break
		}
	}

DONE:
	elapsed := time.Since(startTime).Seconds()
	if *dryRun {
		log.Printf("backfill-embeddings: dry-run done processed=%d would_embed=%d skipped_no_text=%d (%.1fs)",
			processed, embedded, skippedNoText, elapsed)
		os.Exit(0)
	}
	log.Printf("backfill-embeddings: done processed=%d embedded=%d skipped_no_text=%d failed=%d (%.1fs)",
		processed, embedded, skippedNoText, failed, elapsed)
	if failed > 0 {
		os.Exit(2)
	}
}

// assetRow is one selected asset to consider for embedding.
type assetRow struct {
	id          uuid.UUID
	workspaceID uuid.UUID
	createdAt   time.Time
	caption     *string
	tagsJSON    []byte
}

// fetchPage runs the selection query for one page. The first page passes only
// the limit ($1); subsequent pages also pass the keyset cursor ($2 created_at,
// $3 id) via cursorArgs so pagination is deterministic and crash-safe even when
// no row is mutated (--dry-run).
func fetchPage(ctx context.Context, pool *pgxpool.Pool, sql string, limit int, cursorArgs ...any) ([]assetRow, error) {
	args := append([]any{limit}, cursorArgs...)
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []assetRow
	for rows.Next() {
		var a assetRow
		if err := rows.Scan(&a.id, &a.workspaceID, &a.createdAt, &a.caption, &a.tagsJSON); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// newSettingsRepo builds a PlatformSettingsRepo and, when PLATFORM_SETTINGS_KEK
// is present, wires the envelope so encrypted secret rows (ai.gemini_api_key)
// decrypt. Without the KEK the repo runs in legacy/plaintext mode; the caller
// then relies on the env fallback for the key. A bad KEK is fatal config error.
func newSettingsRepo(pool *pgxpool.Pool) *repository.PlatformSettingsRepo {
	repo := repository.NewPlatformSettingsRepo(pool)
	kekHex := strings.TrimSpace(os.Getenv("PLATFORM_SETTINGS_KEK"))
	if kekHex == "" {
		return repo
	}
	envelope, err := backendcrypto.NewEnvelopeFromHex(kekHex)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: invalid PLATFORM_SETTINGS_KEK: %v\n", err)
		os.Exit(1)
	}
	return repo.WithEnvelope(envelope)
}

// platformSetting reads platform_settings(category.key); on miss/empty/error it
// falls back to the supplied env value. This preserves the
// platform_settings → env → default resolution order used across the app.
func platformSetting(ctx context.Context, repo *repository.PlatformSettingsRepo, category, key, envFallback string) string {
	if repo != nil {
		if row, err := repo.GetByKey(ctx, category, key); err != nil {
			log.Printf("platform_settings: read %s.%s failed: %v (falling back to env)", category, key, err)
		} else if row != nil && strings.TrimSpace(row.Value) != "" {
			return strings.TrimSpace(row.Value)
		}
	}
	return strings.TrimSpace(envFallback)
}
