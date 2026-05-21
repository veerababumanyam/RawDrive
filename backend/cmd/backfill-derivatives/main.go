// Command backfill-derivatives reconstructs asset_derivatives rows + the
// workspace_storage.derivative_bytes counter from objects that already
// exist in B2 under "thumbnails/<asset>/<variant>.webp" and
// "derivatives/<asset>/<variant>.webp".
//
// Why: the thumbnail pipeline historically wrote WebP variants to B2 but
// never persisted asset_derivatives rows and never incremented
// workspace_storage.derivative_bytes. Dashboard "storage by type" showed
// zero derivatives and the headline total understated real B2 footprint
// by 40-80% on image-heavy workspaces.
//
// ListObjectsV2 returns per-object Size in the listing, so we don't HEAD
// each object — one list-page round-trip per 1000 objects suffices. Width
// and height are left 0 for backfilled rows; the live thumbnail worker
// populates them correctly on future uploads.
//
// Env (same as cmd/api):
//
//	DATABASE_URL        Postgres DSN
//	B2_BUCKET_NAME      Bucket name
//	B2_KEY_ID           Maps to S3 AccessKeyID
//	B2_APPLICATION_KEY  Maps to S3 SecretAccessKey
//	B2_ENDPOINT
//	B2_REGION
//
// Usage:
//
//	set -a; source .env.backend; set +a
//	go run ./backend/cmd/backfill-derivatives                 # full backfill
//	go run ./backend/cmd/backfill-derivatives --dry-run       # count only
//	go run ./backend/cmd/backfill-derivatives --limit 50      # smoke test
//
// Exit codes:
//
//	0 = success (counts printed)
//	1 = config error
//	2 = partial failure (some objects skipped; safe to re-run)
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/repository"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "list + count only, no DB writes")
	limit := flag.Int("limit", 0, "stop after N objects (0 = no limit)")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "ERROR: DATABASE_URL is not set")
		os.Exit(1)
	}
	bucket := os.Getenv("B2_BUCKET_NAME")
	endpoint := os.Getenv("B2_ENDPOINT")
	region := os.Getenv("B2_REGION")
	keyID := os.Getenv("B2_KEY_ID")
	appKey := os.Getenv("B2_APPLICATION_KEY")
	for k, v := range map[string]string{
		"B2_BUCKET_NAME": bucket, "B2_ENDPOINT": endpoint, "B2_REGION": region,
		"B2_KEY_ID": keyID, "B2_APPLICATION_KEY": appKey,
	} {
		if v == "" {
			fmt.Fprintf(os.Stderr, "ERROR: %s is not set\n", k)
			os.Exit(1)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
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

	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(keyID, appKey, "")),
		awsconfig.WithRegion(region),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: aws config: %v\n", err)
		os.Exit(1)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
	})

	derivRepo := repository.NewAssetDerivativeRepo(pool)

	log.Printf("backfill-derivatives: bucket=%s endpoint=%s dry-run=%v limit=%d",
		bucket, endpoint, *dryRun, *limit)

	var scanned, inserted, skipped, errors int
	affectedWorkspaces := map[uuid.UUID]struct{}{}
	startTime := time.Now()

	for _, prefix := range []string{"thumbnails/", "derivatives/"} {
		var continuationToken *string
		for {
			listOut, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
				Bucket:            aws.String(bucket),
				Prefix:            aws.String(prefix),
				ContinuationToken: continuationToken,
			})
			if err != nil {
				fmt.Fprintf(os.Stderr, "ERROR: list %s: %v\n", prefix, err)
				os.Exit(2)
			}
			for _, obj := range listOut.Contents {
				if *limit > 0 && scanned >= *limit {
					goto DONE
				}
				scanned++
				key := aws.ToString(obj.Key)
				size := aws.ToInt64(obj.Size)
				if size <= 0 {
					skipped++
					continue
				}
				assetID, variant, ok := parseDerivativeKey(key)
				if !ok {
					skipped++
					continue
				}
				var workspaceID uuid.UUID
				err := pool.QueryRow(ctx, `SELECT workspace_id FROM assets WHERE id = $1`, assetID).Scan(&workspaceID)
				if err != nil {
					// Orphan B2 object — no asset row. Skip; safer than
					// inventing a row whose workspace we don't know.
					skipped++
					continue
				}
				affectedWorkspaces[workspaceID] = struct{}{}
				if *dryRun {
					inserted++
					continue
				}
				if err := derivRepo.Upsert(ctx, &repository.AssetDerivative{
					AssetID:    assetID,
					Variant:    variant,
					StorageKey: key,
					SizeBytes:  size,
					Format:     "webp",
				}); err != nil {
					log.Printf("upsert %s/%s: %v", assetID, variant, err)
					errors++
					continue
				}
				inserted++
			}
			if !aws.ToBool(listOut.IsTruncated) {
				break
			}
			continuationToken = listOut.NextContinuationToken
		}
	}

DONE:
	elapsed := time.Since(startTime).Seconds()
	log.Printf("walk done: scanned=%d inserted=%d skipped=%d errors=%d (%.1f obj/s)",
		scanned, inserted, skipped, errors, float64(scanned)/elapsed)

	if *dryRun {
		log.Printf("dry-run: would reconcile %d workspaces", len(affectedWorkspaces))
		os.Exit(0)
	}

	// Reconcile workspace_storage.derivative_bytes from the (now-current)
	// asset_derivatives totals for each affected workspace. Authoritative
	// reset rather than incremental delta — we know the exact value now.
	reconciled := 0
	for wsID := range affectedWorkspaces {
		var total int64
		err := pool.QueryRow(ctx,
			`SELECT COALESCE(SUM(ad.size_bytes), 0)
			 FROM asset_derivatives ad
			 JOIN assets a ON a.id = ad.asset_id
			 WHERE a.workspace_id = $1 AND a.deleted_at IS NULL`,
			wsID,
		).Scan(&total)
		if err != nil {
			log.Printf("reconcile %s sum: %v", wsID, err)
			errors++
			continue
		}
		_, err = pool.Exec(ctx,
			`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
			 VALUES ($1, 0, $2, 0)
			 ON CONFLICT (workspace_id) DO UPDATE SET derivative_bytes = $2`,
			wsID, total,
		)
		if err != nil {
			log.Printf("reconcile %s set: %v", wsID, err)
			errors++
			continue
		}
		log.Printf("reconcile workspace %s: derivative_bytes = %d", wsID, total)
		reconciled++
	}

	log.Printf("backfill-derivatives: done (workspaces_reconciled=%d errors=%d)", reconciled, errors)
	if errors > 0 {
		os.Exit(2)
	}
}

// parseDerivativeKey extracts the asset UUID + variant name from a B2 key
// of the form "thumbnails/<asset>/<variant>.webp" or
// "derivatives/<asset>/<variant>.webp". Returns ok=false for anything else
// (originals, legacy JPG thumbs, watermark previews, etc.) — callers
// should treat that as a skip, not an error.
func parseDerivativeKey(key string) (uuid.UUID, string, bool) {
	parts := strings.Split(key, "/")
	if len(parts) != 3 {
		return uuid.Nil, "", false
	}
	if parts[0] != "thumbnails" && parts[0] != "derivatives" {
		return uuid.Nil, "", false
	}
	assetID, err := uuid.Parse(parts[1])
	if err != nil {
		return uuid.Nil, "", false
	}
	if !strings.HasSuffix(parts[2], ".webp") {
		return uuid.Nil, "", false
	}
	variant := strings.TrimSuffix(parts[2], ".webp")
	return assetID, variant, true
}
