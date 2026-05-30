package database

import (
	"sort"
	"testing"
)

// TestF024_MigrationOrderingNoZeroPaddingInterleave is a pure unit-level
// regression for finding F-024: the four M5 migrations are committed with a
// 6-digit zero-padded prefix (000014..000017) while the surrounding core
// M2/M3 migrations use a 3-digit prefix (014..017). Both prefixes parse to the
// same numeric value, so the old comparator fell back to a raw lexicographic
// string compare in which "000014" < "014" — sorting each 6-digit M5 file
// BEFORE its 3-digit core counterpart and interleaving the two groups at
// logical orders 14-17.
//
// lessMigration must instead keep each zero-padding family contiguous: the
// 3-digit core numbering runs as one block in numeric order, then the 6-digit
// M5 group (000014..000017) runs as a trailing block. This test fails against
// the previous `return files[i] < files[j]` tie-break and passes after the
// width-first fix.
func TestF024_MigrationOrderingNoZeroPaddingInterleave(t *testing.T) {
	// Deliberately shuffled, reproducing the real on-disk filenames around
	// the collision plus a couple of neighbours on either side.
	files := []string{
		"000016_create_m5_messaging_tables.up.sql",
		"014_create_share_links.up.sql",
		"000014_create_m5_marketplace_tables.up.sql",
		"017_pgvector_face_clusters.up.sql",
		"013_create_gallery_assets.up.sql",
		"000017_create_m5_moderation_tables.up.sql",
		"015_create_proofing_selections.up.sql",
		"000015_create_m5_gear_tables.up.sql",
		"016_create_invitations.up.sql",
		"018_ai_configs_jobs.up.sql",
	}

	sort.Slice(files, func(i, j int) bool {
		return lessMigration(files[i], files[j])
	})

	want := []string{
		// The entire 3-digit core family sorts first, in numeric order,
		// as one contiguous block — no 6-digit M5 file interleaved among them.
		"013_create_gallery_assets.up.sql",
		"014_create_share_links.up.sql",
		"015_create_proofing_selections.up.sql",
		"016_create_invitations.up.sql",
		"017_pgvector_face_clusters.up.sql",
		"018_ai_configs_jobs.up.sql",
		// Then the 6-digit M5 family runs as a trailing contiguous block,
		// after every core dependency (users/workspaces/states/galleries) it
		// references is already in place.
		"000014_create_m5_marketplace_tables.up.sql",
		"000015_create_m5_gear_tables.up.sql",
		"000016_create_m5_messaging_tables.up.sql",
		"000017_create_m5_moderation_tables.up.sql",
	}

	if len(files) != len(want) {
		t.Fatalf("length mismatch: got %d, want %d", len(files), len(want))
	}
	for i := range want {
		if files[i] != want[i] {
			t.Fatalf("migration ordering interleaved at index %d:\n got:  %v\n want: %v", i, files, want)
		}
	}

	// Guard the precise invariant the finding cares about: every 3-digit core
	// file must sort strictly before every 6-digit M5 file. 018 is the
	// numerically-last core file in this sample, so it bounds the core block.
	lastCore := indexOf(files, "018_ai_configs_jobs.up.sql")
	firstM5 := indexOf(files, "000014_create_m5_marketplace_tables.up.sql")
	if lastCore == -1 || firstM5 == -1 {
		t.Fatalf("expected files missing from sorted slice: %v", files)
	}
	if lastCore >= firstM5 {
		t.Fatalf("last core migration 018 (idx %d) must sort before M5 migration 000014 (idx %d): %v",
			lastCore, firstM5, files)
	}
}

// TestF024_MigrationOrderPrefixWidth pins migrationOrder's contract: the
// returned width is what disambiguates same-value, differently-zero-padded
// prefixes.
func TestF024_MigrationOrderPrefixWidth(t *testing.T) {
	cases := []struct {
		name      string
		wantOrder int
		wantWidth int
	}{
		{"014_create_share_links.up.sql", 14, 3},
		{"000014_create_m5_marketplace_tables.up.sql", 14, 6},
		{"001_create_states.up.sql", 1, 3},
		{"122_drop_galleries_subdomain_slug.up.sql", 122, 3},
		{"no_numeric_prefix.up.sql", 0, 0},
	}
	for _, tc := range cases {
		order, width := migrationOrder(tc.name)
		if order != tc.wantOrder || width != tc.wantWidth {
			t.Errorf("migrationOrder(%q) = (%d, %d), want (%d, %d)",
				tc.name, order, width, tc.wantOrder, tc.wantWidth)
		}
	}

	// Same numeric value, different padding: 3-digit must precede 6-digit.
	if !lessMigration("014_a.up.sql", "000014_b.up.sql") {
		t.Errorf("lessMigration: 3-digit 014 must sort before 6-digit 000014")
	}
	if lessMigration("000014_b.up.sql", "014_a.up.sql") {
		t.Errorf("lessMigration: 6-digit 000014 must NOT sort before 3-digit 014")
	}
}

func indexOf(s []string, target string) int {
	for i, v := range s {
		if v == target {
			return i
		}
	}
	return -1
}
