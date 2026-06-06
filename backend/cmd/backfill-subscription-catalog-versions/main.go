// Command backfill-subscription-catalog-versions links historical
// subscriptions to approved subscription_plan_versions and writes immutable
// catalog snapshots.
//
// Default mode is a dry run:
//
//	DATABASE_URL=postgres://... go run ./backend/cmd/backfill-subscription-catalog-versions
//
// Apply mode first prints the same dry-run report, refuses to mutate when any
// unresolved rows remain, then performs the backfill in locked batches:
//
//	DATABASE_URL=postgres://... go run ./backend/cmd/backfill-subscription-catalog-versions --apply
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/service"
)

type commandOptions struct {
	apply     bool
	force     bool
	batchSize int
	timeout   time.Duration
}

func main() {
	opts, err := parseOptions(os.Args[1:], os.Stderr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: %v\n", err)
		os.Exit(1)
	}
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "ERROR: DATABASE_URL is not set")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), opts.timeout)
	defer cancel()

	pool, err := openPool(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: open database: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	backfill := service.NewSubscriptionCatalogBackfillService(pool)
	if !opts.apply {
		report, err := backfill.Run(ctx, service.SubscriptionCatalogBackfillOptions{
			DryRun:    true,
			Force:     opts.force,
			BatchSize: opts.batchSize,
		})
		writeReport(os.Stdout, "dry_run", report)
		if err != nil {
			fmt.Fprintf(os.Stderr, "ERROR: dry run failed: %v\n", err)
			os.Exit(2)
		}
		return
	}

	dryRun, err := backfill.Run(ctx, service.SubscriptionCatalogBackfillOptions{
		DryRun:    true,
		Force:     opts.force,
		BatchSize: opts.batchSize,
	})
	writeReport(os.Stdout, "preflight_dry_run", dryRun)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: preflight dry run failed: %v\n", err)
		os.Exit(2)
	}
	if err := service.ValidateSubscriptionCatalogBackfillPreflight(dryRun); err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: apply refused: %v\n", err)
		os.Exit(2)
	}

	applied, err := backfill.Run(ctx, service.SubscriptionCatalogBackfillOptions{
		DryRun:    false,
		Force:     opts.force,
		BatchSize: opts.batchSize,
	})
	writeReport(os.Stdout, "apply", applied)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ERROR: apply failed: %v\n", err)
		os.Exit(2)
	}
}

func parseOptions(args []string, output io.Writer) (commandOptions, error) {
	fs := flag.NewFlagSet("backfill-subscription-catalog-versions", flag.ContinueOnError)
	fs.SetOutput(output)
	apply := fs.Bool("apply", false, "mutate subscriptions after a successful dry-run preflight")
	force := fs.Bool("force", false, "rebuild snapshots even for rows already backfilled")
	batchSize := fs.Int("batch-size", service.DefaultSubscriptionCatalogBackfillBatchSize, "number of subscriptions to process per locked batch")
	timeout := fs.Duration("timeout", 10*time.Minute, "overall command timeout")
	if err := fs.Parse(args); err != nil {
		return commandOptions{}, err
	}
	if *batchSize <= 0 {
		return commandOptions{}, fmt.Errorf("--batch-size must be positive")
	}
	if *timeout <= 0 {
		return commandOptions{}, fmt.Errorf("--timeout must be positive")
	}
	return commandOptions{
		apply:     *apply,
		force:     *force,
		batchSize: *batchSize,
		timeout:   *timeout,
	}, nil
}

func openPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeExec
	cfg.MaxConns = 2
	cfg.MinConns = 0
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

func writeReport(w io.Writer, phase string, report service.SubscriptionCatalogBackfillReport) {
	payload := map[string]any{
		"phase":  phase,
		"report": report,
	}
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(payload)
}
