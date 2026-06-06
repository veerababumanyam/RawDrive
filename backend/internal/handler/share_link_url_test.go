package handler

import "testing"

func TestShareLinkHandlerGalleryShareURLUsesApexGalleryRoute(t *testing.T) {
	h := &ShareLinkHandler{publicBaseURL: "https://api.rawdrive.in"}

	got := h.galleryShareURL(nil, "davidrajkumar-9734ec4c", "31582713cfae684725c70f6ede402a25")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c?share=31582713cfae684725c70f6ede402a25"
	if got != want {
		t.Fatalf("galleryShareURL() = %q, want %q", got, want)
	}
}
