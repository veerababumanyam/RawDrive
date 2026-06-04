package repository

import (
	"os"
	"strings"
	"testing"
)

func TestPhotographerProfileUpsertCastsArrayParameters(t *testing.T) {
	source, err := os.ReadFile("photographer_profile_repo.go")
	if err != nil {
		t.Fatalf("read photographer_profile_repo.go: %v", err)
	}
	query := strings.Join(strings.Fields(string(source)), " ")

	for _, cast := range []string{
		"$28::text[]",
		"$31::text[]",
		"$32::text[]",
		"$33::text[]",
		"$42::uuid[]",
		"$44::text[]",
		"$54::text[]",
		"$58::text[]",
		"$63::text[]",
	} {
		if !strings.Contains(query, cast) {
			t.Fatalf("expected profile upsert to cast %s for empty slice binds", cast)
		}
	}
}

func TestLinkedWorkspaceBusinessNamePrefersBrandName(t *testing.T) {
	got := linkedWorkspaceBusinessName("Workspace Studio", "Public Brand", "Old Profile Name")
	if got != "Public Brand" {
		t.Fatalf("expected brand name to win, got %q", got)
	}
}

func TestLinkedWorkspaceBusinessAddressComposesWorkspaceFields(t *testing.T) {
	got := linkedWorkspaceBusinessAddress(
		"Old profile address",
		" Road No. 12 ",
		"",
		"Hyderabad, Telangana",
		"500034",
	)
	want := "Road No. 12\nHyderabad, Telangana\n500034"
	if got != want {
		t.Fatalf("unexpected address:\nwant %q\ngot  %q", want, got)
	}
}

func TestLinkedWorkspaceBusinessAddressFallsBackToProfile(t *testing.T) {
	got := linkedWorkspaceBusinessAddress(" Old profile address ")
	if got != "Old profile address" {
		t.Fatalf("expected fallback address, got %q", got)
	}
}

func TestLinkedWorkspacePriceRangeUsesActivePackageBounds(t *testing.T) {
	start, max := linkedWorkspacePriceRange(nil, nil, 5000000, 15000000)
	if start == nil || *start != 50000 {
		t.Fatalf("expected starting price 50000, got %#v", start)
	}
	if max == nil || *max != 150000 {
		t.Fatalf("expected max price 150000, got %#v", max)
	}
}

func TestLinkedWorkspacePriceRangeSinglePackageClearsMax(t *testing.T) {
	fallbackMax := 200000
	start, max := linkedWorkspacePriceRange(nil, &fallbackMax, 7500000, 7500000)
	if start == nil || *start != 75000 {
		t.Fatalf("expected starting price 75000, got %#v", start)
	}
	if max != nil {
		t.Fatalf("expected max price to clear for one package, got %#v", max)
	}
}
