package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
)

func TestGalleryCreateRejectsMissingUserClaimBeforeInsert(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/galleries", strings.NewReader(`{"title":"Wedding"}`))
	req = req.WithContext(middleware.WithWorkspaceID(req.Context(), uuid.NewString()))

	rr := httptest.NewRecorder()
	NewGalleryHandler(nil).Create(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body=%s", rr.Code, http.StatusUnauthorized, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "missing user_id") {
		t.Fatalf("body = %q, want missing user_id error", rr.Body.String())
	}
}

func TestNormalizeGalleryDownloadQualityAllowsOnlyDerivativeFormats(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		want    string
		wantErr bool
	}{
		{name: "webp", value: "webp", want: "webp"},
		{name: "thumbnail", value: "thumbnail", want: "thumbnail"},
		{name: "original", value: "original", want: "original"},
		{name: "trims and lowercases", value: " Thumbnail ", want: "thumbnail"},
		{name: "rejects both", value: "both", wantErr: true},
		{name: "rejects empty", value: "", wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeGalleryDownloadQuality(tc.value)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got %q", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("quality mismatch: got %q want %q", got, tc.want)
			}
		})
	}
}
