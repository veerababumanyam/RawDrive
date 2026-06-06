// Command backfill-phone-reuse-state populates users.phone_normalized and
// users.phone_reuse_state for every existing user, in Go, using the single
// canonical phone.Normalize (so there is no SQL/Go normalization drift) and the
// service paid-tier catalog as the source of "is this account paid".
//
// It is the authoritative backfill for the phone-reuse epic: migration 171/172
// only add the columns (state defaults to 'free'); this command sets
// paid_active / paid_expired correctly AND auto-resolves pre-existing
// normalized-phone collisions so migration 173's partial unique index
// (one free account per normalized phone) can be created safely.
//
// Collision auto-resolve (see ADR): paid accounts -> paid_active; among non-paid
// accounts sharing a normalized phone, the earliest-created keeps the free slot
// and every later collider -> paid_expired.
//
// Usage:
//
//	export DATABASE_URL=postgres://...
//	go run ./cmd/backfill-phone-reuse-state            # apply
//	go run ./cmd/backfill-phone-reuse-state --dry-run  # report only, no writes
//
// Idempotent: safe to re-run (states are recomputed from current data; existing
// paid_phone_verified_at timestamps are preserved). Run after migration 172 and
// BEFORE migration 173. Exit codes: 0 ok, 1 config error, 2 backfill error.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/phone"
	"github.com/rawdrive/backend/internal/service"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "report the plan (incl. collisions) without writing any changes")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "ERROR: DATABASE_URL is not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
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

	accts, err := loadAccounts(ctx, pool)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: load accounts: %v\n", err)
		os.Exit(2)
	}

	decisions := planBackfill(accts)
	report(decisions, *dryRun)

	if *dryRun {
		fmt.Println("\n(dry-run) no changes written.")
		return
	}

	if err := applyDecisions(ctx, pool, decisions); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: apply: %v\n", err)
		os.Exit(2)
	}
	fmt.Printf("\nApplied %d account states.\n", len(decisions))
}

// loadAccounts reads every user with the raw phone, created_at, and the set of
// plan tiers attached to the user (owned-workspace tiers + active-subscription
// tiers). "Paid" is computed in Go via service.IsPaidPlanTier so the paid-tier
// definition lives in exactly one place.
func loadAccounts(ctx context.Context, pool *pgxpool.Pool) ([]account, error) {
	rows, err := pool.Query(ctx, `
		SELECT u.id::text,
		       COALESCE(u.phone, ''),
		       u.created_at,
		       COALESCE((
		           SELECT string_agg(DISTINCT w.plan_tier, ',')
		           FROM workspaces w
		           WHERE w.owner_id = u.id AND w.plan_tier IS NOT NULL
		       ), '') AS ws_tiers,
		       COALESCE((
		           SELECT string_agg(DISTINCT s.tier_slug, ',')
		           FROM subscriptions s
		           WHERE s.status = 'active'
		             AND (s.expires_at IS NULL OR s.expires_at > now())
		             AND (s.user_id = u.id
		                  OR s.workspace_id IN (SELECT id FROM workspaces WHERE owner_id = u.id))
		       ), '') AS active_sub_tiers
		FROM users u
		ORDER BY u.created_at ASC, u.id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []account
	for rows.Next() {
		var id, rawPhone, wsTiers, subTiers string
		var createdAt time.Time
		if err := rows.Scan(&id, &rawPhone, &createdAt, &wsTiers, &subTiers); err != nil {
			return nil, err
		}
		out = append(out, account{
			ID:         id,
			Normalized: phone.Normalize(rawPhone),
			CreatedAt:  createdAt,
			Paid:       hasPaidTier(wsTiers) || hasPaidTier(subTiers),
		})
	}
	return out, rows.Err()
}

// hasPaidTier reports whether any comma-joined tier is a paid plan tier.
func hasPaidTier(csv string) bool {
	if csv == "" {
		return false
	}
	for _, t := range strings.Split(csv, ",") {
		if service.IsPaidPlanTier(strings.TrimSpace(t)) {
			return true
		}
	}
	return false
}

// applyDecisions writes phone_normalized + phone_reuse_state (+ a
// paid_phone_verified_at marker for paid_active) for every account in one
// transaction. paid_phone_verified_at is COALESCE'd so re-runs never reset an
// already-recorded verification time.
func applyDecisions(ctx context.Context, pool *pgxpool.Pool, decisions []decision) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	batch := &pgx.Batch{}
	for _, d := range decisions {
		batch.Queue(`
			UPDATE users
			   SET phone_normalized = NULLIF($2, ''),
			       phone_reuse_state = $3,
			       paid_phone_verified_at = CASE WHEN $3 = 'paid_active'
			                                     THEN COALESCE(paid_phone_verified_at, now())
			                                     ELSE NULL END,
			       updated_at = now()
			 WHERE id = $1`, d.ID, d.Normalized, d.State)
	}
	br := tx.SendBatch(ctx, batch)
	for range decisions {
		if _, err := br.Exec(); err != nil {
			br.Close()
			return err
		}
	}
	if err := br.Close(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// report prints state counts and every collision group (the auditable record of
// which real accounts were auto-resolved off the free slot).
func report(decisions []decision, dryRun bool) {
	counts := map[string]int{}
	collisions := map[string][]decision{}
	for _, d := range decisions {
		counts[d.State]++
		if d.Collision {
			collisions[d.Normalized] = append(collisions[d.Normalized], d)
		}
	}
	mode := "APPLY"
	if dryRun {
		mode = "DRY-RUN"
	}
	fmt.Printf("phone-reuse backfill [%s]\n", mode)
	fmt.Printf("  total accounts : %d\n", len(decisions))
	fmt.Printf("  free           : %d\n", counts[stateFree])
	fmt.Printf("  paid_active    : %d\n", counts[statePaidActive])
	fmt.Printf("  paid_expired   : %d\n", counts[statePaidExpired])
	fmt.Printf("  collision groups: %d\n", len(collisions))

	if len(collisions) == 0 {
		return
	}
	keys := make([]string, 0, len(collisions))
	for k := range collisions {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	fmt.Println("\n  COLLISIONS (normalized phone -> resolved states):")
	for _, k := range keys {
		fmt.Printf("    %s\n", maskPhone(k))
		for _, d := range collisions[k] {
			fmt.Printf("       %s -> %s\n", d.ID, d.State)
		}
	}
}

// maskPhone redacts the middle digits so the report can be shared/logged without
// exposing full PII (SCS-010: no PII in logs).
func maskPhone(p string) string {
	if len(p) <= 4 {
		return "****"
	}
	return p[:2] + strings.Repeat("*", len(p)-4) + p[len(p)-2:]
}
