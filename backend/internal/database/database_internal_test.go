package database

import (
	"sort"
	"testing"
)

// TestMigrationOrderingValueFirstDependencySafe pins the corrected migration
// ordering. The four M5 migrations are committed with a 6-digit zero-padded
// prefix (000014..000017) while the surrounding core migrations use a 3-digit
// prefix; both "014_..." and "000014_..." parse to the numeric value 14.
//
// The original F-024 fix sorted by prefix *width* first, which ran the 6-digit
// M5 block as a trailing group after every 3-digit migration. That regressed
// once migrations 114 (marketplace_inquiry_reply) and 115 (inquiry_messages) —
// both 3-digit — began depending on marketplace_inquiries, a table created in
// the 6-digit 000014 block: under width-first ordering 000014 ran last, so a
// fresh DB failed at 114 with "relation marketplace_inquiries does not exist".
//
// lessMigration now sorts by numeric *value* first (width only breaks ties), so
// the M5 block runs at its logical slots 14-17 — after the foundation tables it
// references and before its 114/115 consumers. This test fails against the
// width-first comparator and passes after the value-first fix.
func TestMigrationOrderingValueFirstDependencySafe(t *testing.T) {
	// Deliberately shuffled, reproducing the real on-disk filenames around the
	// collision, plus the 114 consumer that depends on the 000014 M5 block.
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
		"114_marketplace_inquiry_reply.up.sql",
	}

	sort.Slice(files, func(i, j int) bool {
		return lessMigration(files[i], files[j])
	})

	want := []string{
		// True numeric order. At each tied value the 3-digit core file precedes
		// its 6-digit M5 neighbour (the retained width tie-break), and the M5
		// block is interleaved at slots 14-17 rather than dumped at the end.
		"013_create_gallery_assets.up.sql",
		"014_create_share_links.up.sql",
		"000014_create_m5_marketplace_tables.up.sql",
		"015_create_proofing_selections.up.sql",
		"000015_create_m5_gear_tables.up.sql",
		"016_create_invitations.up.sql",
		"000016_create_m5_messaging_tables.up.sql",
		"017_pgvector_face_clusters.up.sql",
		"000017_create_m5_moderation_tables.up.sql",
		"018_ai_configs_jobs.up.sql",
		"114_marketplace_inquiry_reply.up.sql",
	}

	if len(files) != len(want) {
		t.Fatalf("length mismatch: got %d, want %d", len(files), len(want))
	}
	for i := range want {
		if files[i] != want[i] {
			t.Fatalf("migration ordering wrong at index %d:\n got:  %v\n want: %v", i, files, want)
		}
	}

	// The precise invariant the fresh-DB failure cares about: the 000014 M5
	// block (which CREATEs marketplace_inquiries) must sort strictly before the
	// 114 migration that references that table.
	m5Create := indexOf(files, "000014_create_m5_marketplace_tables.up.sql")
	consumer := indexOf(files, "114_marketplace_inquiry_reply.up.sql")
	if m5Create == -1 || consumer == -1 {
		t.Fatalf("expected files missing from sorted slice: %v", files)
	}
	if m5Create >= consumer {
		t.Fatalf("000014 M5 marketplace block (idx %d) must sort before its 114 consumer (idx %d): %v",
			m5Create, consumer, files)
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
