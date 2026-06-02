package handler

import (
	"testing"

	"github.com/rawdrive/backend/internal/repository"
)

func TestPublicDownloadVariantSelectsWebPAndThumbnail(t *testing.T) {
	asset := &repository.Asset{
		Filename:    "Wedding (42).NEF",
		ContentType: "image/x-nikon-nef",
		StorageKey:  "originals/wedding.nef",
		SizeBytes:   100,
		ThumbnailURLs: map[string]string{
			"display_webp":  "derivatives/display.webp",
			"thumb_lg_webp": "thumbnails/thumb-lg.webp",
		},
	}

	webp, err := publicDownloadVariant(asset, "webp")
	if err != nil {
		t.Fatalf("webp variant returned error: %v", err)
	}
	if webp.StorageKey != "derivatives/display.webp" || webp.ContentType != "image/webp" || webp.Filename != "Wedding (42).webp" {
		t.Fatalf("unexpected webp variant: %+v", webp)
	}

	thumb, err := publicDownloadVariant(asset, "thumbnail")
	if err != nil {
		t.Fatalf("thumbnail variant returned error: %v", err)
	}
	if thumb.StorageKey != "thumbnails/thumb-lg.webp" || thumb.ContentType != "image/webp" || thumb.Filename != "thumb_Wedding (42).webp" {
		t.Fatalf("unexpected thumbnail variant: %+v", thumb)
	}
}

func TestPublicDownloadVariantDefaultsToOriginal(t *testing.T) {
	asset := &repository.Asset{
		Filename:    "photo.jpg",
		ContentType: "image/jpeg",
		StorageKey:  "originals/photo.jpg",
		SizeBytes:   42,
	}

	original, err := publicDownloadVariant(asset, "")
	if err != nil {
		t.Fatalf("original variant returned error: %v", err)
	}
	if original.StorageKey != asset.StorageKey || original.ContentType != asset.ContentType || original.Filename != asset.Filename || original.SizeBytes != asset.SizeBytes {
		t.Fatalf("unexpected original variant: %+v", original)
	}
}

func TestPublicDownloadFormatForPolicy(t *testing.T) {
	tests := []struct {
		name      string
		requested string
		policy    string
		want      string
		wantErr   bool
	}{
		{name: "missing policy defaults to webp", requested: "", policy: "", want: "webp"},
		{name: "original policy defaults to original", requested: "", policy: "original", want: "original"},
		{name: "original policy rejects webp", requested: "webp", policy: "original", wantErr: true},
		{name: "webp policy defaults to webp", requested: "", policy: "webp", want: "webp"},
		{name: "webp policy rejects original", requested: "original", policy: "webp", wantErr: true},
		{name: "both policy accepts original", requested: "original", policy: "both", want: "original"},
		{name: "both policy accepts webp", requested: "webp", policy: "both", want: "webp"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := publicDownloadFormatForPolicy(tc.requested, tc.policy)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got format %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("format mismatch: got %q want %q", got, tc.want)
			}
		})
	}
}
