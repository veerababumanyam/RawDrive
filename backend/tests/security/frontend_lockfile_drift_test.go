package security_test

// Regression test for F-039: the frontend/ package must be governed by a
// single, authoritative lockfile (pnpm-lock.yaml).
//
// Both frontend/pnpm-lock.yaml (authoritative for pnpm) and a stale
// frontend/package-lock.json (npm-generated, pinned at an older version) were
// committed. Running `npm install` instead of `pnpm install` resolves from the
// stale npm lockfile and can pull a divergent transitive dependency tree than
// the one that was tested — a reproducible-build / supply-chain hazard.
//
// The fix has three parts, all asserted here:
//  1. frontend/package-lock.json is deleted (no longer tracked / present).
//  2. frontend/.gitignore ignores package-lock.json so it cannot be
//     re-committed if a stray `npm install` regenerates it.
//  3. frontend/package.json declares a "packageManager": "pnpm@..." field so
//     corepack enforces pnpm and rejects npm/yarn.
//
// This is a pure file-parsing test — no DB, no network, no Docker required.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// findRepoRoot walks up from the test's working directory to locate the repo
// root, identified by the frontend/ directory sitting next to backend/. The
// backend Go module is rooted at backend/, so `go test` may be invoked from a
// few different depths depending on the package path.
func findRepoRoot(t *testing.T) string {
	t.Helper()
	candidates := []string{
		filepath.Join("..", "..", ".."),       // backend/tests/security -> repo root
		filepath.Join("..", "..", "..", ".."), // one level deeper, just in case
		filepath.Join("..", ".."),
		".",
	}
	for _, c := range candidates {
		fe := filepath.Join(c, "frontend")
		pj := filepath.Join(fe, "package.json")
		if fi, err := os.Stat(fe); err == nil && fi.IsDir() {
			if _, err := os.Stat(pj); err == nil {
				return c
			}
		}
	}
	return ""
}

func TestF039_NoNpmLockfileInFrontend(t *testing.T) {
	root := findRepoRoot(t)
	if root == "" {
		t.Skip("repo root (frontend/package.json) not reachable from this package; skipping")
	}

	frontend := filepath.Join(root, "frontend")

	// 1. The pnpm lockfile must exist — it is the authoritative one.
	pnpmLock := filepath.Join(frontend, "pnpm-lock.yaml")
	_, err := os.Stat(pnpmLock)
	require.NoErrorf(t, err,
		"F-039: frontend/pnpm-lock.yaml must exist as the authoritative lockfile")

	// 2. The stale npm lockfile must NOT exist.
	npmLock := filepath.Join(frontend, "package-lock.json")
	if _, err := os.Stat(npmLock); err == nil {
		t.Errorf("F-039: frontend/package-lock.json still present; delete it and " +
			"track only pnpm-lock.yaml to avoid npm/pnpm resolution drift")
	}

	// 3. .gitignore must ignore package-lock.json so a stray `npm install`
	//    can never re-commit it.
	gitignore := filepath.Join(frontend, ".gitignore")
	raw, err := os.ReadFile(gitignore)
	require.NoErrorf(t, err, "F-039: reading frontend/.gitignore")
	var ignoresNpmLock bool
	for _, line := range strings.Split(string(raw), "\n") {
		entry := strings.TrimSpace(line)
		if strings.HasPrefix(entry, "#") || entry == "" {
			continue
		}
		// Match "package-lock.json", "/package-lock.json", "**/package-lock.json".
		if entry == "package-lock.json" ||
			strings.HasSuffix(entry, "/package-lock.json") {
			ignoresNpmLock = true
			break
		}
	}
	assert.Truef(t, ignoresNpmLock,
		"F-039: frontend/.gitignore must ignore package-lock.json so npm cannot "+
			"reintroduce a stale lockfile")

	// 4. package.json must declare a pnpm packageManager so corepack enforces pnpm.
	pjRaw, err := os.ReadFile(filepath.Join(frontend, "package.json"))
	require.NoErrorf(t, err, "F-039: reading frontend/package.json")

	var pj struct {
		PackageManager string `json:"packageManager"`
	}
	require.NoErrorf(t, json.Unmarshal(pjRaw, &pj),
		"F-039: parsing frontend/package.json")

	assert.Truef(t, strings.HasPrefix(pj.PackageManager, "pnpm@"),
		"F-039: frontend/package.json must set \"packageManager\": \"pnpm@<version>\" "+
			"so corepack enforces pnpm (got %q)", pj.PackageManager)
}
