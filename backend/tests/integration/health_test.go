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

// Why not a plain net.DialTimeout? Docker Desktop's port-forwarder on
// Windows keeps compose-mapped ports bound even when the backing
// container is stopped or unhealthy, so a bare TCP dial succeeds against
// a black hole. All three helpers below therefore go one step further
// and speak enough of the protocol to confirm a real server is on the
// other end — identical to the pattern in tests/brownfield/*.

// natsResponsive dials NATS and waits for the server's "INFO " line
// within timeout. Returns true iff a real NATS server answered.
func natsResponsive(addr string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 5)
	n, err := conn.Read(buf)
	if err != nil || n < 5 {
		return false
	}
	return string(buf[:5]) == "INFO "
}

// smtpResponsive dials SMTP and waits for the "220" greeting within
// timeout. Returns true iff a real SMTP server answered.
func smtpResponsive(addr string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 3)
	n, err := conn.Read(buf)
	if err != nil || n < 3 {
		return false
	}
	return string(buf[:3]) == "220"
}

// valkeyResponsive dials Valkey/Redis, sends a RESP inline PING, and
// expects "+PONG" within timeout. Returns true iff a real Redis-speaking
// server answered (Valkey is wire-compatible).
func valkeyResponsive(addr string, timeout time.Duration) bool {
	conn, err := net.DialTimeout("tcp", addr, timeout)
	if err != nil {
		return false
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(timeout))
	if _, err := conn.Write([]byte("PING\r\n")); err != nil {
		return false
	}
	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 5)
	n, err := conn.Read(buf)
	if err != nil || n < 5 {
		return false
	}
	return string(buf[:5]) == "+PONG"
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
	// Skip cleanly when the testcontainer backend is unavailable (rootless
	// Docker on Windows, Docker daemon stopped, CI without a Docker socket).
	// Matches the skip-on-unreachable convention in tests/brownfield/*.
	if _, err := testsupport.EnsureDSN(); err != nil {
		t.Skipf("pgvector testcontainer unavailable — skipping: %v", err)
	}

	pool := testsupport.PgvectorPool(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

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
	const addr = "localhost:64089"
	if !valkeyResponsive(addr, 2*time.Second) {
		t.Skipf("valkey not responsive at %s (compose not up or container unhealthy) — skipping", addr)
	}

	rdb := redis.NewClient(&redis.Options{
		Addr: addr,
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
	const addr = "localhost:4222"
	if !natsResponsive(addr, 2*time.Second) {
		t.Skipf("nats not responsive at %s (compose not up or container unhealthy) — skipping", addr)
	}

	nc, err := nats.Connect("nats://"+addr,
		nats.Timeout(5*time.Second),
	)
	require.NoError(t, err, "failed to connect to NATS")
	defer nc.Close()

	assert.True(t, nc.IsConnected(), "NATS connection should be active")
}

// ──────────────────────────── Mailpit Connectivity ────────────────────────────

func TestMailpitConnectivity(t *testing.T) {
	const addr = "localhost:1025"
	if !smtpResponsive(addr, 2*time.Second) {
		t.Skipf("mailpit SMTP not responsive at %s (compose not up or container unhealthy) — skipping", addr)
	}

	conn, err := net.DialTimeout("tcp", addr, 5*time.Second)
	require.NoError(t, err, "failed to connect to Mailpit SMTP")
	defer conn.Close()

	// Read the SMTP greeting
	buf := make([]byte, 256)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Read(buf)
	require.NoError(t, err, "failed to read SMTP greeting")
	assert.Contains(t, string(buf[:n]), "220", "expected SMTP 220 greeting")
}
