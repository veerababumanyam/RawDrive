package handler

import (
	"strings"
	"testing"
)

func TestPublicStudioSafeGalleryPredicate_ExcludesProtectedGalleries(t *testing.T) {
	required := []string{
		"g.password_hash IS NULL OR g.password_hash = ''",
		"g.access_mode",
		"= 'public'",
	}
	for _, fragment := range required {
		if !strings.Contains(publicStudioSafeGalleryPredicate, fragment) {
			t.Fatalf("studio landing predicate must contain %q; got %s", fragment, publicStudioSafeGalleryPredicate)
		}
	}
	if strings.Contains(publicStudioSafeGalleryPredicate, "= 'private'") {
		t.Fatal("studio landing predicate must not list private galleries")
	}
	for _, forbidden := range []string{"invite-only", "unlisted"} {
		if strings.Contains(publicStudioSafeGalleryPredicate, forbidden) {
			t.Fatalf("studio landing predicate must not list %s galleries", forbidden)
		}
	}
}
