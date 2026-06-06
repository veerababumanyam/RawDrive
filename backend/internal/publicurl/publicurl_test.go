package publicurl

import "testing"

func TestGalleryUsesApexForRawDriveSubdomains(t *testing.T) {
	got := Gallery("https://legacy-studio-bf998927.rawdrive.in", "davidrajkumar-9734ec4c")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c"
	if got != want {
		t.Fatalf("Gallery() = %q, want %q", got, want)
	}
}

func TestGalleryPreservesLocalhost(t *testing.T) {
	got := Gallery("http://localhost:3000", "davidrajkumar-9734ec4c")
	want := "http://localhost:3000/g/davidrajkumar-9734ec4c"
	if got != want {
		t.Fatalf("Gallery() = %q, want %q", got, want)
	}
}

func TestGalleryUsesApexForWww(t *testing.T) {
	got := Gallery("https://www.rawdrive.in", "davidrajkumar-9734ec4c")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c"
	if got != want {
		t.Fatalf("Gallery() = %q, want %q", got, want)
	}
}

func TestGalleryForcesHttpsApexForRawDriveApex(t *testing.T) {
	got := Gallery("http://rawdrive.in", "davidrajkumar-9734ec4c")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c"
	if got != want {
		t.Fatalf("Gallery() = %q, want %q", got, want)
	}
}

func TestGalleryDoesNotUseApiRawDriveAsPublicOrigin(t *testing.T) {
	got := Gallery("https://api.rawdrive.in", "davidrajkumar-9734ec4c")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c"
	if got != want {
		t.Fatalf("Gallery() = %q, want %q", got, want)
	}
}

func TestGallerySharePreservesShareToken(t *testing.T) {
	got := GalleryShare("https://app.rawdrive.in", "davidrajkumar-9734ec4c", "31582713cfae684725c70f6ede402a25")
	want := "https://rawdrive.in/g/davidrajkumar-9734ec4c?share=31582713cfae684725c70f6ede402a25"
	if got != want {
		t.Fatalf("GalleryShare() = %q, want %q", got, want)
	}
}
