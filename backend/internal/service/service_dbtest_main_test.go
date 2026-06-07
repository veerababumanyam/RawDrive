package service

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/tests/testsupport"
)

var (
	serviceTestDSN     string
	serviceDSNInitErr  error
	serviceMainStarted bool
)

func TestMain(m *testing.M) {
	serviceMainStarted = true
	if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		serviceTestDSN = envDSN
	} else {
		dsn, err := testsupport.EnsureDSN()
		if err != nil {
			serviceDSNInitErr = err
			fmt.Fprintf(os.Stderr, "service_test: no DB available: %v (db-backed tests will skip)\n", err)
		} else {
			serviceTestDSN = dsn
		}
	}
	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

func getServiceTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if !serviceMainStarted {
		t.Skip("service_test: TestMain did not run; DSN unresolved")
	}
	if serviceDSNInitErr != nil {
		t.Skipf("service_test: no database available: %v", serviceDSNInitErr)
	}
	if serviceTestDSN == "" {
		t.Skip("service_test: DATABASE_URL unset and testcontainers unavailable")
	}
	cfg, err := pgxpool.ParseConfig(serviceTestDSN)
	if err != nil {
		t.Skipf("service_test: invalid DSN: %v", err)
	}
	cfg.ConnConfig.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Skipf("service_test: opening pool: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Skipf("service_test: postgres ping failed (container may be hung): %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}
