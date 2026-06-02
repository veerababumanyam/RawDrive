// Package deployconfig_test contains config-guard regression tests for
// committed infrastructure config files under deploy/. These are pure
// unit tests: they read the committed file from disk and assert on its
// security-relevant structure. No broker, DB, or network is touched.
//
// F-036 (high): the NATS client port 4222 and cluster port 6222 shipped
// with NO authorization block at all, so any host that could reach 4222
// could publish/subscribe JetStream subjects, and the cluster port 6222
// was likewise unauthenticated. The fix adds a client `authorization`
// block and a `cluster.authorization` block, both interpolating their
// secret from the nats-server process environment ($NATS_AUTH_TOKEN
// and $NATS_CLUSTER_SEED) so no credential is hardcoded in the committed
// file. These tests fail if either auth block is removed or if a literal
// secret is hardcoded back in. NATS cluster authorization uses
// user/password auth; `token` is only valid for the client authorization
// block.
package deployconfig_test

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// natsServerConf locates and reads deploy/nats/nats-server.conf relative
// to this test file, walking up to the repo root. Using runtime.Caller
// makes the lookup independent of the test's working directory.
func natsServerConf(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	require.True(t, ok, "runtime.Caller failed")

	// thisFile = <repo>/backend/internal/deployconfig/nats_server_conf_test.go
	// repo root is four levels up from this file's directory.
	dir := filepath.Dir(thisFile)
	repoRoot := filepath.Join(dir, "..", "..", "..")
	confPath := filepath.Join(repoRoot, "deploy", "nats", "nats-server.conf")

	body, err := os.ReadFile(confPath)
	require.NoError(t, err, "reading %s", confPath)
	return string(body)
}

// TestF036_NATSClientAuthorizationBlockPresent asserts the client port
// has an authorization block that takes its token from the environment.
// Before the fix the file contained no `authorization {` block at all,
// so this test fails on the pre-fix config.
func TestF036_NATSClientAuthorizationBlockPresent(t *testing.T) {
	conf := natsServerConf(t)

	// A top-level (client) authorization block must exist. The cluster
	// block has its OWN nested authorization block; we assert on both
	// occurrences below, but here we require at least one token-based
	// authorization block bound to the same env var the Go client uses.
	clientAuth := regexp.MustCompile(`(?s)authorization\s*\{[^}]*token:\s*\$NATS_AUTH_TOKEN[^}]*\}`)
	assert.Regexp(t, clientAuth, conf,
		"client port must have an authorization{ token: $NATS_AUTH_TOKEN } block (F-036)")
}

// TestF036_NATSClusterAuthorizationConsumesSeed asserts the cluster block
// finally consumes NATS_CLUSTER_SEED (the audit noted the variable was
// referenced only in a comment and .env.example, never in any config
// directive). Cluster authorization must use the seed as a route password,
// and explicit routes must carry the same env reference for outbound auth.
func TestF036_NATSClusterAuthorizationConsumesSeed(t *testing.T) {
	conf := natsServerConf(t)

	loc := braceBlock(conf, "cluster")
	require.NotEmpty(t, loc, "a cluster { ... } block must exist")

	assert.Contains(t, loc, "authorization",
		"cluster block must contain an authorization block (F-036)")
	assert.Contains(t, loc, "$NATS_CLUSTER_SEED",
		"cluster authorization must interpolate $NATS_CLUSTER_SEED — the seed must actually be consumed, not just documented (F-036)")
	assert.Regexp(t, regexp.MustCompile(`(?s)authorization\s*\{[^}]*user:\s*rawdrive_route[^}]*password:\s*\$NATS_CLUSTER_SEED[^}]*\}`), loc,
		"cluster authorization must use supported user/password auth, not unsupported token auth")
	assert.Regexp(t, regexp.MustCompile(`nats-route://rawdrive_route:\$NATS_CLUSTER_SEED@`), loc,
		"explicit cluster routes must include route credentials for outbound route auth")
	assert.NotRegexp(t, regexp.MustCompile(`(?s)cluster\s*\{[^}]*token:`), loc,
		"cluster.authorization must not use token auth; NATS route auth supports user/password here")
}

// braceBlock returns the substring spanning the brace-balanced block that
// follows `keyword {` (e.g. keyword="cluster"). It counts nesting depth so
// the inner authorization{...} block does not prematurely close the match,
// making the assertion robust against reformatting. Returns "" if no such
// block exists.
func braceBlock(conf, keyword string) string {
	header := regexp.MustCompile(keyword + `\s*\{`)
	hloc := header.FindStringIndex(conf)
	if hloc == nil {
		return ""
	}
	// Start at the opening brace of the keyword block.
	open := hloc[1] - 1
	depth := 0
	for i := open; i < len(conf); i++ {
		switch conf[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return conf[hloc[0] : i+1]
			}
		}
	}
	return ""
}

// TestF036_NATSConfHasNoHardcodedSecret guards the credentials invariant:
// the committed conf must never carry a literal token value. Both secrets
// must be env-interpolated ($VAR), never assigned a quoted/hex literal.
func TestF036_NATSConfHasNoHardcodedSecret(t *testing.T) {
	conf := natsServerConf(t)

	// Any secret-bearing directive must be followed by a $-prefixed env
	// reference, never a quoted string or bare literal. Catches an
	// accidental `token: "abc123"` or `password: deadbeef` regression.
	tokenLines := regexp.MustCompile(`(?m)^\s*(token|password):\s*(\S+)`)
	matches := tokenLines.FindAllStringSubmatch(conf, -1)
	require.NotEmpty(t, matches, "expected at least one secret-bearing directive")

	for _, m := range matches {
		val := m[2]
		assert.True(t, len(val) > 0 && val[0] == '$',
			"token value %q must be an env-var reference ($VAR), never a hardcoded secret (credentials invariant)", val)
	}
}
