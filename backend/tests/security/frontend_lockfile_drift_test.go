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
	"regexp"
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

// dockerfilePnpmPin matches the version in the deps stage's
//
//	corepack prepare pnpm@<version> --activate
//
// line of frontend/Dockerfile.
var dockerfilePnpmPin = regexp.MustCompile(`corepack\s+prepare\s+pnpm@([0-9]+\.[0-9]+\.[0-9]+)`)

// pnpmMajor returns the leading major-version segment of a "pnpm@X.Y.Z" or
// "X.Y.Z" string (e.g. "9" from "pnpm@9.15.9"). Empty if it can't be parsed.
func pnpmMajor(version string) string {
	version = strings.TrimPrefix(version, "pnpm@")
	parts := strings.SplitN(version, ".", 2)
	if len(parts) == 0 || parts[0] == "" {
		return ""
	}
	return parts[0]
}

// TestF118_PnpmVersionPinConsistency guards F-118: the pnpm version must be
// pinned identically in frontend/Dockerfile (corepack prepare) and
// frontend/package.json (packageManager), and must stay on the pnpm 9.x major
// so it remains compatible with frontend/pnpm-lock.yaml's lockfileVersion 9.0.
//
// Before the fix the Dockerfile pinned pnpm@9.4.0 — an outdated 9.x patch that
// missed 9.5.x-9.15.x fixes. A drift between the two pins (or a bump to a
// different major) silently breaks CI: a developer on pnpm 10/11 would
// regenerate a lockfileVersion 10 lockfile that the pinned 9.x build rejects.
//
// Pure file-parsing test — no DB, no network, no Docker required.
func TestF118_PnpmVersionPinConsistency(t *testing.T) {
	root := findRepoRoot(t)
	if root == "" {
		t.Skip("repo root (frontend/package.json) not reachable from this package; skipping")
	}
	frontend := filepath.Join(root, "frontend")

	// Extract the pnpm pin from the Dockerfile's corepack prepare line.
	dockerRaw, err := os.ReadFile(filepath.Join(frontend, "Dockerfile"))
	require.NoErrorf(t, err, "F-118: reading frontend/Dockerfile")
	m := dockerfilePnpmPin.FindStringSubmatch(string(dockerRaw))
	require.Lenf(t, m, 2,
		"F-118: frontend/Dockerfile must pin pnpm via "+
			"\"corepack prepare pnpm@<X.Y.Z> --activate\"")
	dockerVer := m[1]

	// Extract the packageManager pin from package.json.
	pjRaw, err := os.ReadFile(filepath.Join(frontend, "package.json"))
	require.NoErrorf(t, err, "F-118: reading frontend/package.json")
	var pj struct {
		PackageManager string `json:"packageManager"`
	}
	require.NoErrorf(t, json.Unmarshal(pjRaw, &pj),
		"F-118: parsing frontend/package.json")
	require.Truef(t, strings.HasPrefix(pj.PackageManager, "pnpm@"),
		"F-118: frontend/package.json packageManager must be a pnpm pin (got %q)",
		pj.PackageManager)
	pkgVer := strings.TrimPrefix(pj.PackageManager, "pnpm@")

	// 1. The two pins must be byte-identical.
	assert.Equalf(t, pkgVer, dockerVer,
		"F-118: pnpm pin drift — frontend/Dockerfile pins pnpm@%s but "+
			"frontend/package.json packageManager pins pnpm@%s; they must match",
		dockerVer, pkgVer)

	// 2. Both must stay on the pnpm 9.x major (lockfileVersion 9.0 compat).
	//    Bumping to 10+ requires regenerating frontend/pnpm-lock.yaml.
	assert.Equalf(t, "9", pnpmMajor(dockerVer),
		"F-118: pnpm must stay on the 9.x major to match "+
			"frontend/pnpm-lock.yaml lockfileVersion 9.0 (Dockerfile pins %s); "+
			"bumping to 10+ requires regenerating the lockfile", dockerVer)

	// 3. Must not be the stale 9.4.0 the finding flagged — pin a later 9.x
	//    patch so 9.5.x-9.15.x fixes are picked up.
	assert.NotEqualf(t, "9.4.0", dockerVer,
		"F-118: pnpm@9.4.0 is the stale pin flagged by the audit; bump to a "+
			"later 9.x patch (e.g. 9.15.9) for upstream fixes")
}
