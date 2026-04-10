package integration_test

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/tests/testsupport"
)

// TestMain owns the package-wide lifecycle for the shared pgvector container.
// It calls testsupport.Shutdown after all tests run so the container is
// terminated cleanly instead of being reaped by Ryuk at process exit.
func TestMain(m *testing.M) {
	code := m.Run()
	testsupport.Shutdown()
	os.Exit(code)
}

// ──────────────────────────── Health Endpoint ────────────────────────────

func TestHealthEndpoint(t *testing.T) {
	r := chi.NewRouter()
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	require.NoError(t, err)
	defer resp.Body.Close()

	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]string
	err = json.NewDecoder(resp.Body).Decode(&body)
	require.NoError(t, err)
	assert.Equal(t, "ok", body["status"])
}

// ──────────────────────────── PostgreSQL Connectivity ────────────────────────────

// TestPostgresConnectivity verifies that the shared pgvector container is
// reachable and that the production migrations ran successfully against it.
//
// Before testcontainers-go this test connected to a hardcoded localhost:55070
// URL with a committed dev password, and only asserted SELECT 1 — which
// silently passed whether migrations were applied or not. The new version
// provisions its own container via testsupport.PgvectorPool, proving:
//
//  1. The container boots and accepts connections.
//  2. The canonical Migrator (internal/database) ran end-to-end.
//  3. The pgvector extension is installed and queryable.
func TestPostgresConnectivity(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool := testsupport.PgvectorPool(t)

	// Basic liveness: plain SQL.
	var one int
	require.NoError(t, pool.QueryRow(ctx, "SELECT 1").Scan(&one))
	assert.Equal(t, 1, one)

	// Migrations ran: the schema_migrations table exists and is non-empty.
	// If this assertion fails, it means the helper's Migrator.Up() did not
	// execute — which would make every other integration test meaningless.
	var appliedCount int
	require.NoError(t, pool.QueryRow(ctx, "SELECT COUNT(*) FROM schema_migrations").Scan(&appliedCount))
	assert.Greater(t, appliedCount, 0, "no migrations were applied to the container")

	// pgvector is available: the extension is queryable via pg_extension.
	// This is what distinguishes pgvector/pgvector:pg16 from a plain postgres
	// image and is the whole reason we pinned that specific image.
	var hasVector bool
	require.NoError(t, pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')",
	).Scan(&hasVector))
	assert.True(t, hasVector, "pgvector extension missing — wrong container image?")
}

// ──────────────────────────── Valkey Connectivity ────────────────────────────

func TestValkeyConnectivity(t *testing.T) {
	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:64089",
	})
	defer rdb.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := rdb.Ping(ctx).Result()
	require.NoError(t, err, "failed to ping Valkey")
	assert.Equal(t, "PONG", result)
}

// ──────────────────────────── NATS Connectivity ────────────────────────────

func TestNATSConnectivity(t *testing.T) {
	nc, err := nats.Connect("nats://localhost:4222",
		nats.Timeout(5*time.Second),
	)
	require.NoError(t, err, "failed to connect to NATS")
	defer nc.Close()

	assert.True(t, nc.IsConnected(), "NATS connection should be active")
}

// ──────────────────────────── Mailpit Connectivity ────────────────────────────

func TestMailpitConnectivity(t *testing.T) {
	conn, err := net.DialTimeout("tcp", "localhost:1025", 5*time.Second)
	require.NoError(t, err, "failed to connect to Mailpit SMTP")
	defer conn.Close()

	// Read the SMTP greeting
	buf := make([]byte, 256)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Read(buf)
	require.NoError(t, err, "failed to read SMTP greeting")
	assert.Contains(t, string(buf[:n]), "220", "expected SMTP 220 greeting")
}
