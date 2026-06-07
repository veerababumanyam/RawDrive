package handler

import (
	"testing"

	"github.com/rawdrive/backend/internal/ai"
)

// Slice 3h (B-D1): FaceMatch used a HARDCODED threshold (0.6) while PhotoSearch
// resolved its threshold from the configurable faceThresholds source
// (platform_settings(ai.face_*) → env → defaults). These tests pin the
// unification: FaceMatch's default threshold is now drawn from the SAME injected
// faceThresholds.RetrievalFloor that PhotoSearch reads, so a studio that tunes
// the gate via platform_settings/env moves BOTH public biometric endpoints in
// lockstep — and an explicit per-request override is still honoured + clamped.

// TestFaceMatchThreshold_DefaultsToConfiguredRetrievalFloor proves the FaceMatch
// default threshold tracks the injected faceThresholds source rather than a
// hardcoded constant: a non-default configured RetrievalFloor is honoured.
func TestFaceMatchThreshold_DefaultsToConfiguredRetrievalFloor(t *testing.T) {
	cfg := ai.DefaultFaceThresholds()
	cfg.RetrievalFloor = 0.42 // a deliberately non-default configured value
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: faceIDEnabledGallery()}, nil, nil).
		WithFaceThresholds(cfg)

	if got := h.resolveFaceMatchThreshold(nil); got != cfg.RetrievalFloor {
		t.Fatalf("FaceMatch default threshold must equal configured RetrievalFloor %v, got %v",
			cfg.RetrievalFloor, got)
	}
	// And it must NOT be the old hardcoded constant.
	if got := h.resolveFaceMatchThreshold(nil); got == 0.6 {
		t.Fatalf("FaceMatch must not fall back to the old hardcoded 0.6 threshold")
	}
}

// TestFaceMatchThreshold_SharesPhotoSearchSource asserts both public biometric
// endpoints resolve their threshold from the SAME field of the SAME injected
// faceThresholds value, so they can never silently drift.
func TestFaceMatchThreshold_SharesPhotoSearchSource(t *testing.T) {
	cfg := ai.DefaultFaceThresholds()
	cfg.RetrievalFloor = 0.37
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: faceIDEnabledGallery()}, nil, nil).
		WithFaceThresholds(cfg)

	faceMatchThreshold := h.resolveFaceMatchThreshold(nil)
	// PhotoSearch reads h.faceThresholds.RetrievalFloor directly (see PhotoSearch
	// in public_gallery_handler.go). The two must be identical.
	photoSearchThreshold := h.faceThresholds.RetrievalFloor

	if faceMatchThreshold != photoSearchThreshold {
		t.Fatalf("FaceMatch (%v) and PhotoSearch (%v) must resolve the same threshold source",
			faceMatchThreshold, photoSearchThreshold)
	}
}

// TestFaceMatchThreshold_OverrideClampedToSafetyBand preserves the per-request
// override path: an explicit threshold is honoured but clamped to [0.3, 0.95]
// so a caller can neither match-everything (0) nor match-nothing (1).
func TestFaceMatchThreshold_OverrideClampedToSafetyBand(t *testing.T) {
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: faceIDEnabledGallery()}, nil, nil).
		WithFaceThresholds(ai.DefaultFaceThresholds())

	cases := []struct {
		name     string
		override float64
		want     float64
	}{
		{"below_band_clamped_to_min", 0.0, 0.3},
		{"way_below_clamped_to_min", -1.0, 0.3},
		{"in_band_honoured", 0.7, 0.7},
		{"above_band_clamped_to_max", 1.5, 0.95},
		{"at_max_edge", 0.95, 0.95},
		{"at_min_edge", 0.3, 0.3},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ov := tc.override
			if got := h.resolveFaceMatchThreshold(&ov); got != tc.want {
				t.Fatalf("override %v: want %v, got %v", tc.override, tc.want, got)
			}
		})
	}
}
