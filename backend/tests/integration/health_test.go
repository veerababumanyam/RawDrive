package integration_test

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

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

func TestPostgresConnectivity(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	conn, err := pgx.Connect(ctx, "postgres://rawdrive_user:e706fbd6b28d036aa80379447729737b@localhost:55070/rawdrive_db?sslmode=disable")
	require.NoError(t, err, "failed to connect to PostgreSQL")
	defer conn.Close(ctx)

	var result int
	err = conn.QueryRow(ctx, "SELECT 1").Scan(&result)
	require.NoError(t, err, "failed to query PostgreSQL")
	assert.Equal(t, 1, result)
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
