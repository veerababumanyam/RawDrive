package handler

import (
	"encoding/json"
	"testing"

	"github.com/rawdrive/backend/internal/repository"
)

func TestProfileSlugReservedPublicShareWords(t *testing.T) {
	reserved := []string{
		"avatar",
		"galleries",
		"publish",
		"qr",
		"seo",
		"theme",
		"unpublish",
		"vcard",
		"visibility",
	}

	for _, slug := range reserved {
		if !profileSlugReserved(slug) {
			t.Fatalf("expected %q to be reserved", slug)
		}
	}

	if profileSlugReserved("anjali-weddings") {
		t.Fatal("ordinary profile slug should not be reserved")
	}
}

func TestSlugifyProfileNormalizesIndianWeddingNames(t *testing.T) {
	got := slugifyProfile("  R.K. Studio & Weddings, Jaipur!  ")
	want := "r-k-studio-and-weddings-jaipur"
	if got != want {
		t.Fatalf("slugifyProfile() = %q, want %q", got, want)
	}
}

func TestReadProfileVisibilityDefaultsPublicProfileSections(t *testing.T) {
	visibility := readProfileVisibility(nil)

	if !visibility.ShowProfilePhoto || !visibility.ShowName || !visibility.ShowTagline ||
		!visibility.ShowBio || !visibility.ShowGalleries || !visibility.ShowWhatsapp ||
		!visibility.ShowCustomLinks {
		t.Fatalf("expected public-facing profile sections to default visible: %#v", visibility)
	}

	raw, _ := json.Marshal(map[string]bool{
		"show_whatsapp": false,
	})
	visibility = readProfileVisibility(raw)
	if visibility.ShowWhatsapp {
		t.Fatal("explicit visibility setting should override default")
	}
}

func TestProfileHasVisibleContactRequiresEnabledChannel(t *testing.T) {
	profile := &repository.PhotographerProfile{
		PrimaryEmail:   "studio@example.test",
		PrimaryPhone:   "+919999999999",
		WhatsappNumber: "+918888888888",
	}

	if !profileHasVisibleContact(profile, profileVisibility{ShowEmail: true}) {
		t.Fatal("visible email should satisfy public contact requirement")
	}
	if !profileHasVisibleContact(profile, profileVisibility{ShowWhatsapp: true}) {
		t.Fatal("visible WhatsApp should satisfy public contact requirement")
	}
	if profileHasVisibleContact(profile, profileVisibility{}) {
		t.Fatal("hidden contact channels should not satisfy public contact requirement")
	}
}
