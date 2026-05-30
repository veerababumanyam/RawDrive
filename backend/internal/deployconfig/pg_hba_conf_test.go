// Config-guard regression tests for deploy/postgres/pg_hba.conf.
//
// These are pure unit tests in the same spirit as nats_server_conf_test.go:
// they read the committed pg_hba.conf from disk and assert on its
// security-relevant structure. No Postgres instance, DB, or network is
// touched.
//
// F-077 (medium): pg_hba.conf shipped with `local all all trust`, granting
// ANY OS user inside the Postgres container passwordless access to EVERY
// database over the Unix socket. A foothold in any in-container process
// therefore yielded full DB access (all tenant data, MFA secrets, payment
// records). The fix scopes passwordless local access to the postgres
// superuser via `peer` (entrypoint/init scripts run as postgres) and forces
// every other local connection through `scram-sha-256`. These tests fail if
// any `trust` method is reintroduced on a local rule, if the postgres peer
// rule is dropped, or if the local catch-all stops requiring scram-sha-256.
package deployconfig_test

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pgHBAConf locates and reads deploy/postgres/pg_hba.conf relative to this
// test file, walking up to the repo root. Using runtime.Caller makes the
// lookup independent of the test's working directory.
func pgHBAConf(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	require.True(t, ok, "runtime.Caller failed")

	// thisFile = <repo>/backend/internal/deployconfig/pg_hba_conf_test.go
	// repo root is four levels up from this file's directory.
	dir := filepath.Dir(thisFile)
	repoRoot := filepath.Join(dir, "..", "..", "..")
	confPath := filepath.Join(repoRoot, "deploy", "postgres", "pg_hba.conf")

	body, err := os.ReadFile(confPath)
	require.NoError(t, err, "reading %s", confPath)
	return string(body)
}

// pgHBARule is a parsed, non-comment pg_hba.conf record. Field order is the
// canonical pg_hba layout: TYPE DATABASE USER [ADDRESS] METHOD. For local
// records there is no ADDRESS column, so the method is the 4th field; for
// host records the method is the 5th field.
type pgHBARule struct {
	connType string
	database string
	user     string
	method   string
	raw      string
}

// parsePGHBA returns the active (non-comment, non-blank) rules from a
// pg_hba.conf body. It is deliberately small: enough to assert on the
// security-relevant TYPE/USER/METHOD columns without pulling in a full
// pg_hba parser.
func parsePGHBA(t *testing.T, conf string) []pgHBARule {
	t.Helper()
	var rules []pgHBARule
	for _, line := range strings.Split(conf, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		fields := strings.Fields(trimmed)
		require.GreaterOrEqual(t, len(fields), 4,
			"pg_hba rule %q has too few columns", trimmed)

		r := pgHBARule{connType: fields[0], database: fields[1], user: fields[2], raw: trimmed}
		switch fields[0] {
		case "local":
			// local TYPE DATABASE USER METHOD — no ADDRESS column.
			r.method = fields[3]
		default:
			// host/hostssl/hostnossl: TYPE DATABASE USER ADDRESS METHOD.
			require.GreaterOrEqual(t, len(fields), 5,
				"host pg_hba rule %q missing METHOD column", trimmed)
			r.method = fields[4]
		}
		rules = append(rules, r)
	}
	require.NotEmpty(t, rules, "pg_hba.conf must contain at least one active rule")
	return rules
}

// TestF077_NoTrustAuthMethodAnywhere is the core guard: no active rule may
// use the `trust` method. Before the fix the `local all all trust` rule
// tripped this; it fails if trust is reintroduced on any line.
func TestF077_NoTrustAuthMethodAnywhere(t *testing.T) {
	rules := parsePGHBA(t, pgHBAConf(t))
	for _, r := range rules {
		assert.NotEqual(t, "trust", r.method,
			"pg_hba rule must not use passwordless trust auth: %q (F-077)", r.raw)
	}
}

// TestF077_PostgresSuperuserUsesPeer asserts the postgres superuser keeps
// passwordless LOCAL maintenance via peer auth — entrypoint/init scripts run
// as the postgres OS user, so peer suffices and no password is needed.
func TestF077_PostgresSuperuserUsesPeer(t *testing.T) {
	rules := parsePGHBA(t, pgHBAConf(t))

	var found bool
	for _, r := range rules {
		if r.connType == "local" && r.user == "postgres" {
			found = true
			assert.Equal(t, "peer", r.method,
				"local postgres rule must use peer auth, got %q (F-077)", r.raw)
		}
	}
	assert.True(t, found,
		"a `local all postgres peer` rule must exist so init scripts can run passwordless as the postgres OS user (F-077)")
}

// TestF077_LocalCatchAllRequiresScram asserts the local catch-all (USER=all)
// forces credentialed auth via scram-sha-256. This is what stops an arbitrary
// in-container process from reaching every database without credentials.
func TestF077_LocalCatchAllRequiresScram(t *testing.T) {
	rules := parsePGHBA(t, pgHBAConf(t))

	var found bool
	for _, r := range rules {
		if r.connType == "local" && r.user == "all" {
			found = true
			assert.Equal(t, "scram-sha-256", r.method,
				"local all catch-all must require scram-sha-256, got %q (F-077)", r.raw)
		}
	}
	assert.True(t, found,
		"a `local all all scram-sha-256` catch-all must exist so non-postgres local users present credentials (F-077)")
}

// TestF077_NoHardcodedSecret guards the credentials invariant: pg_hba.conf
// declares auth methods only and must never embed a literal password/secret.
// The only tokens permitted on a rule are pg_hba keywords (types, the special
// DATABASE/USER keyword `all`, replication, and the method names). A quoted
// string or hex blob would signal an accidental secret regression.
func TestF077_NoHardcodedSecret(t *testing.T) {
	conf := pgHBAConf(t)
	// No quoted literals anywhere in the active config — pg_hba uses bare
	// keywords/CIDRs, so a quote almost certainly means an embedded secret.
	for _, line := range strings.Split(conf, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		assert.NotContains(t, trimmed, "\"",
			"pg_hba rule must not contain quoted literals/secrets: %q (credentials invariant)", trimmed)
	}

	// Defensively reject a long hex/base64-looking blob on any active rule,
	// which would indicate a hardcoded credential slipped in.
	secretish := regexp.MustCompile(`[A-Za-z0-9+/=]{24,}`)
	rules := parsePGHBA(t, conf)
	for _, r := range rules {
		assert.NotRegexp(t, secretish, r.raw,
			"pg_hba rule looks like it carries an embedded secret: %q (credentials invariant)", r.raw)
	}
}
