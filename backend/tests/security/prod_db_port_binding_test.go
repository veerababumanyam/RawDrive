package security_test

// Regression test for F-037: Postgres (5432) and Valkey (6379) published
// ports on the production DB node must NOT be bound to 0.0.0.0.
//
// Docker publishes ports through its own iptables chain (DOCKER), evaluated
// before UFW's INPUT rules, so a "0.0.0.0:PORT" publish is reachable on every
// host interface and silently bypasses UFW. The multi-tenant Postgres primary
// and the Valkey cache must therefore be scoped to a specific host IP (the DB
// node's own address) rather than the 0.0.0.0 wildcard. App nodes still reach
// them cross-host via that explicit IP, and pg_hba.conf / requirepass remain
// defense-in-depth.
//
// This is a pure file-parsing test — no DB, no network, no Docker required.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gopkg.in/yaml.v3"
)

// composeFile is the minimal shape we need from the prod-db compose file.
type composeFile struct {
	Services map[string]struct {
		Ports []string `yaml:"ports"`
	} `yaml:"services"`
}

// findProdDBCompose walks up from the test's working directory to locate
// deploy/docker-compose.prod-db.yml at the repo root. The backend Go module
// is rooted at backend/, so the deploy/ tree lives one or two levels above the
// package directory depending on where `go test` is invoked from.
func findProdDBCompose(t *testing.T) string {
	t.Helper()
	candidates := []string{
		filepath.Join("..", "..", "..", "deploy", "docker-compose.prod-db.yml"),
		filepath.Join("..", "..", "..", "..", "deploy", "docker-compose.prod-db.yml"),
		filepath.Join("..", "..", "deploy", "docker-compose.prod-db.yml"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			return c
		}
	}
	return ""
}

// hostScoped reports whether a Docker port-publish mapping is bound to a
// specific host IP (e.g. "187.127.142.46:5432:5432" or
// "${DB_NODE_IP:-187.127.142.46}:5432:5432") rather than the 0.0.0.0 wildcard.
//
// Docker port spec forms:
//
//	"PORT:PORT"                -> binds 0.0.0.0 (UNSAFE)
//	"0.0.0.0:PORT:PORT"        -> binds 0.0.0.0 (UNSAFE)
//	"HOSTIP:PORT:PORT"         -> binds HOSTIP   (safe)
//
// A mapping is host-scoped iff it has three colon-separated segments AND the
// first segment is neither empty nor the 0.0.0.0 wildcard.
func hostScoped(mapping string) bool {
	parts := strings.Split(mapping, ":")
	if len(parts) < 3 {
		return false // "PORT:PORT" form — wildcard 0.0.0.0
	}
	host := strings.TrimSpace(parts[0])
	if host == "" || host == "0.0.0.0" {
		return false
	}
	return true
}

func TestF037_ProdDBPortsNotBoundToWildcard(t *testing.T) {
	path := findProdDBCompose(t)
	if path == "" {
		t.Skip("deploy/docker-compose.prod-db.yml not reachable from this package; skipping")
	}

	raw, err := os.ReadFile(path)
	require.NoError(t, err, "reading prod-db compose file")

	var compose composeFile
	require.NoError(t, yaml.Unmarshal(raw, &compose), "parsing prod-db compose YAML")

	// services in scope for F-037 (NATS cluster routing legitimately needs
	// cross-host wildcard binding and is out of scope).
	want := map[string]string{
		"postgres": "5432",
		"valkey":   "6379",
	}

	for svc, port := range want {
		s, ok := compose.Services[svc]
		require.True(t, ok, "service %q missing from prod-db compose", svc)

		var found bool
		for _, mapping := range s.Ports {
			if !strings.Contains(mapping, ":"+port+":"+port) &&
				!strings.HasSuffix(mapping, ":"+port) &&
				mapping != port+":"+port {
				continue
			}
			found = true
			assert.Truef(t, hostScoped(mapping),
				"F-037: %s port %s is published as %q which binds 0.0.0.0 and bypasses UFW; "+
					"scope it to the DB node host IP (e.g. \"${DB_NODE_IP:-187.127.142.46}:%s:%s\")",
				svc, port, mapping, port, port)
		}
		assert.Truef(t, found, "no published mapping for %s port %s found in prod-db compose", svc, port)
	}
}
