package migrations_test

// Hermetic contract test for the migration-number uniqueness invariant
// (MIG-160). No database required — it is a pure file-name scan, mirroring the
// CI guard scripts/check-migration-numbers.mjs.
//
// Background: RawDrive migrations are append-only paired files
// (NNN_feature.up.sql / NNN_feature.down.sql). The NNN numeric prefix is meant
// to be UNIQUE. The migrator keys on the FULL filename, so duplicate numbers
// "run fine" — which is exactly how four duplicate numbers reached `main`
// (006, 133, 160, 164) unnoticed. They are a latent ordering hazard.
//
// These four are already MERGED and APPLIED in every environment, so they are
// GRANDFATHERED (renumbering an applied migration changes its version key and
// breaks migrated DBs — forbidden). The grandfather list pins the EXACT slug
// SET per number, so adding a THIRD file onto a grandfathered number also fails.

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// grandfatheredDups is the frozen set of historical duplicate numbers and the
// EXACT feature slugs that legitimately share each. Must stay byte-identical to
// the GRANDFATHERED map in scripts/check-migration-numbers.mjs.
var grandfatheredDups = map[string][]string{
	"006": {"add_password_to_users", "create_profiles"},
	"133": {"gallery_tethering", "user_auth_methods_unique"},
	"160": {"ai_jobs_claimed_at", "role_session_timeouts"},
	"164": {"fix_ai_tags_index", "gallery_default_cover_backfill"},
}

// migrationFileRe captures (number, slug) from "NNN_slug.up.sql" / ".down.sql".
var migrationFileRe = regexp.MustCompile(`^(\d+)_(.+?)\.(?:up|down)\.sql$`)

// collisionResult is a number used by more than one slug that is NOT exactly a
// grandfathered set.
type collisionResult struct {
	Number string
	Slugs  []string
}

// findMigrationNumberCollisions is the reusable invariant: it reads the file
// names in dir, groups slugs by numeric prefix, and returns every number shared
// by >1 slug whose slug set is not exactly the frozen grandfathered set.
func findMigrationNumberCollisions(t *testing.T, dir string) []collisionResult {
	t.Helper()
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)

	slugsByNumber := map[string]map[string]struct{}{}
	for _, e := range entries {
		m := migrationFileRe.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		number, slug := m[1], m[2]
		if slugsByNumber[number] == nil {
			slugsByNumber[number] = map[string]struct{}{}
		}
		slugsByNumber[number][slug] = struct{}{}
	}

	var collisions []collisionResult
	for number, set := range slugsByNumber {
		if len(set) < 2 {
			continue // unique number — fine
		}
		slugs := make([]string, 0, len(set))
		for s := range set {
			slugs = append(slugs, s)
		}
		sort.Strings(slugs)
		if frozen, ok := grandfatheredDups[number]; ok && slugSetsEqual(slugs, frozen) {
			continue // grandfathered, exactly as recorded — allowed
		}
		collisions = append(collisions, collisionResult{Number: number, Slugs: slugs})
	}
	sort.Slice(collisions, func(i, j int) bool { return collisions[i].Number < collisions[j].Number })
	return collisions
}

func slugSetsEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	ac := append([]string(nil), a...)
	bc := append([]string(nil), b...)
	sort.Strings(ac)
	sort.Strings(bc)
	for i := range ac {
		if ac[i] != bc[i] {
			return false
		}
	}
	return true
}

// TestMigrationNumbers_NoNewDuplicates is the hard guard against the live
// migrations directory: the four grandfathered dups pass, and any NEW duplicate
// number would fail this test (proven by the fixture subtests below).
func TestMigrationNumbers_NoNewDuplicates(t *testing.T) {
	dir := migrationDir(t)
	collisions := findMigrationNumberCollisions(t, dir)
	assert.Empty(t, collisions,
		"migration numbers must be unique (grandfathered: 006/133/160/164). "+
			"A new collision means a migration reused an existing number; pick the "+
			"next free number — never renumber a committed migration. Collisions: %+v",
		collisions)
}

// TestMigrationNumbers_DetectsNewDuplicate proves the guard DETECTS a new
// duplicate: a temp fixture dir with two different slugs on a fresh number
// must yield a collision.
func TestMigrationNumbers_DetectsNewDuplicate(t *testing.T) {
	dir := t.TempDir()
	writeFixture(t, dir, "200_first_feature.up.sql")
	writeFixture(t, dir, "200_first_feature.down.sql")
	writeFixture(t, dir, "200_second_feature.up.sql") // <- duplicate number 200
	writeFixture(t, dir, "200_second_feature.down.sql")

	collisions := findMigrationNumberCollisions(t, dir)
	require.Len(t, collisions, 1, "a new duplicate number must be detected")
	assert.Equal(t, "200", collisions[0].Number)
	assert.Equal(t, []string{"first_feature", "second_feature"}, collisions[0].Slugs)
}

// TestMigrationNumbers_DetectsThirdFileOnGrandfathered proves the guard cannot
// be defeated by piling a THIRD file onto a grandfathered number: 164 with its
// two frozen slugs PLUS a new third slug is a collision.
func TestMigrationNumbers_DetectsThirdFileOnGrandfathered(t *testing.T) {
	dir := t.TempDir()
	for _, slug := range grandfatheredDups["164"] {
		writeFixture(t, dir, "164_"+slug+".up.sql")
		writeFixture(t, dir, "164_"+slug+".down.sql")
	}
	writeFixture(t, dir, "164_sneaky_third.up.sql") // <- third file on grandfathered 164
	writeFixture(t, dir, "164_sneaky_third.down.sql")

	collisions := findMigrationNumberCollisions(t, dir)
	require.Len(t, collisions, 1, "a third file on a grandfathered number must be detected")
	assert.Equal(t, "164", collisions[0].Number)
	assert.Contains(t, collisions[0].Slugs, "sneaky_third")
}

// TestMigrationNumbers_GrandfatheredSetPasses proves the exact frozen set is
// allowed: 164 with EXACTLY its two recorded slugs is not a collision.
func TestMigrationNumbers_GrandfatheredSetPasses(t *testing.T) {
	dir := t.TempDir()
	for _, slug := range grandfatheredDups["164"] {
		writeFixture(t, dir, "164_"+slug+".up.sql")
		writeFixture(t, dir, "164_"+slug+".down.sql")
	}
	collisions := findMigrationNumberCollisions(t, dir)
	assert.Empty(t, collisions, "the exact grandfathered slug set must be allowed")
}

func writeFixture(t *testing.T, dir, name string) {
	t.Helper()
	require.NoError(t, os.WriteFile(filepath.Join(dir, name), []byte("-- fixture\n"), 0o600))
}
