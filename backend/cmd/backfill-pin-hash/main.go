// Command backfill-pin-hash converts every streams.pin_code plaintext value
// to streams.pin_hash (argon2id) for M30 / F-014 security stabilization.
//
// Usage:
//
//	export DATABASE_URL=postgres://...
//	go run ./cmd/backfill-pin-hash/
//
// Idempotent: skips rows that already have pin_hash set. Run once per
// environment after migration 082 has been applied. The legacy
// streams.pin_code column is dropped in a later milestone (M35 / E108-S4)
// once every environment has a non-null pin_hash for every PIN-protected
// stream.
//
// Exit codes:
//
//	0 = success (count printed to stdout)
//	1 = config error (missing DATABASE_URL or DB unreachable)
//	2 = backfill error (some rows failed; count of failures printed)
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/auth"
)

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "ERROR: DATABASE_URL is not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
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

	rows, err := pool.Query(ctx, `
		SELECT id::text, pin_code
		FROM streams
		WHERE pin_code IS NOT NULL
		  AND pin_code <> ''
		  AND (pin_hash IS NULL OR pin_hash = '')
	`)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: query: %v\n", err)
		os.Exit(2)
	}

	type job struct {
		id       string
		plainPIN string
	}
	var jobs []job
	for rows.Next() {
		var j job
		if err := rows.Scan(&j.id, &j.plainPIN); err != nil {
			rows.Close()
			fmt.Fprintf(os.Stderr, "ERROR: scan: %v\n", err)
			os.Exit(2)
		}
		jobs = append(jobs, j)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: rows iteration: %v\n", err)
		os.Exit(2)
	}

	if len(jobs) == 0 {
		fmt.Println("backfill-pin-hash: nothing to do — every PIN-protected stream already has pin_hash")
		return
	}
	log.Printf("backfill-pin-hash: %d row(s) to process", len(jobs))

	var done, failed int
	for _, j := range jobs {
		hash, hashErr := auth.HashPIN(strings.TrimSpace(j.plainPIN))
		if hashErr != nil {
			log.Printf("  stream %s: HashPIN failed: %v", j.id, hashErr)
			failed++
			continue
		}
		if _, upErr := pool.Exec(ctx,
			`UPDATE streams SET pin_hash = $2 WHERE id = $1::uuid AND (pin_hash IS NULL OR pin_hash = '')`,
			j.id, hash,
		); upErr != nil {
			log.Printf("  stream %s: UPDATE failed: %v", j.id, upErr)
			failed++
			continue
		}
		done++
	}

	fmt.Printf("backfill-pin-hash: backfilled=%d failed=%d total=%d\n", done, failed, len(jobs))
	if failed > 0 {
		os.Exit(2)
	}
}
