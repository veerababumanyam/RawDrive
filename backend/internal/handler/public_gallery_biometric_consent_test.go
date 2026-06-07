package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// fakeBiometricAuditor is the test double for biometricSearchAuditor. It records
// every row passed to RecordSearch and can be primed to fail, so the handler's
// fail-closed contract (no unaudited match) is exercised without a database.
type fakeBiometricAuditor struct {
	mu      sync.Mutex
	rows    []repository.BiometricSearchAudit
	failErr error
}

func (f *fakeBiometricAuditor) RecordSearch(_ context.Context, a *repository.BiometricSearchAudit) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failErr != nil {
		return f.failErr
	}
	f.rows = append(f.rows, *a)
	return nil
}

func (f *fakeBiometricAuditor) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.rows)
}

// photoSearchMultipartRequest builds a multipart POST to the photo-search
// endpoint with the given consent value and (optional) image bytes, with the
// chi {slug} route param populated so PhotoSearch runs handler-direct.
func photoSearchMultipartRequest(t *testing.T, consent string, withImage bool) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if consent != "" {
		if err := mw.WriteField("consent_given", consent); err != nil {
			t.Fatalf("write consent field: %v", err)
		}
	}
	if withImage {
		fw, err := mw.CreateFormFile("image", "selfie.jpg")
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		_, _ = fw.Write([]byte{0xFF, 0xD8, 0xFF, 0xD9}) // tiny JPEG-ish blob
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/public/galleries/wedding/photo-search", &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	routeCtx := chi.NewRouteContext()
	routeCtx.URLParams.Add("slug", "wedding")
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, routeCtx))
}

// newPhotoSearchHandler wires a public handler against a published public
// gallery with a fake auditor. faceRepo/faceClient are intentionally nil so a
// CONSENTED request stops at the deterministic 503 "photo search not available"
// — that is after the consent gate, which is what these tests pin.
func newPhotoSearchHandler(auditor biometricSearchAuditor) *PublicGalleryHandler {
	g := publishedPublicGallery()
	h := NewPublicGalleryHandler(&fakePublicGalleryResolver{gallery: g}, nil, nil)
	if auditor != nil {
		h = h.WithBiometricConsentRepo(auditor)
	}
	return h
}

// TestPhotoSearch_ConsentlessRejected403 is the headline 3b guard: PhotoSearch
// now rejects a request without consent_given:true using the SAME 403
// biometric_consent_required contract FaceMatch already enforces — and it does
// so BEFORE any biometric processing (no faceRepo/faceClient wired here).
func TestPhotoSearch_ConsentlessRejected403(t *testing.T) {
	for _, tc := range []struct {
		name    string
		consent string
	}{
		{"absent", ""},
		{"false", "false"},
		{"empty_string", ""},
		{"garbage", "maybe"},
		{"zero", "0"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			auditor := &fakeBiometricAuditor{}
			h := newPhotoSearchHandler(auditor)
			rec := httptest.NewRecorder()
			h.PhotoSearch(rec, photoSearchMultipartRequest(t, tc.consent, true))

			if rec.Code != http.StatusForbidden {
				t.Fatalf("consent=%q: want 403, got %d body=%s", tc.consent, rec.Code, rec.Body.String())
			}
			if !strings.Contains(rec.Body.String(), "biometric_consent_required") {
				t.Fatalf("consent=%q: want biometric_consent_required, got body=%s", tc.consent, rec.Body.String())
			}
			// A rejected (consent-less) request must NOT write an audit row — the
			// row is the record of a PROCESSING event, and no processing happened.
			if n := auditor.count(); n != 0 {
				t.Fatalf("consent=%q: a rejected request must write 0 audit rows, got %d", tc.consent, n)
			}
		})
	}
}

// TestPhotoSearch_ConsentedPassesGate proves an affirmative consent clears the
// consent gate and reaches the (here intentionally-unwired) biometric pipeline,
// returning 503 rather than the 403 consent rejection.
func TestPhotoSearch_ConsentedPassesGate(t *testing.T) {
	for _, consent := range []string{"true", "1", "yes", "on", "TRUE"} {
		t.Run(consent, func(t *testing.T) {
			h := newPhotoSearchHandler(&fakeBiometricAuditor{})
			rec := httptest.NewRecorder()
			h.PhotoSearch(rec, photoSearchMultipartRequest(t, consent, true))

			if strings.Contains(rec.Body.String(), "biometric_consent_required") {
				t.Fatalf("consent=%q must pass the consent gate, got body=%s", consent, rec.Body.String())
			}
			if rec.Code != http.StatusServiceUnavailable {
				t.Fatalf("consent=%q should clear the gate and reach the unwired faceRepo (503); got %d body=%s",
					consent, rec.Code, rec.Body.String())
			}
		})
	}
}

// TestFaceMatch_ConsentlessRejected403 re-asserts FaceMatch keeps its prior
// consent gate (the shared contract 3b standardises on).
func TestFaceMatch_ConsentlessRejected403(t *testing.T) {
	h := newFaceMatchHandler().WithBiometricConsentRepo(&fakeBiometricAuditor{})
	rec := httptest.NewRecorder()
	h.FaceMatch(rec, faceMatchRequestWithBody(t, faceMatchRequest{
		Embedding:    embeddingOfDim(512),
		ConsentGiven: false,
	}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("want 403, got %d body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "biometric_consent_required") {
		t.Fatalf("want biometric_consent_required, got body=%s", rec.Body.String())
	}
}

// TestRecordBiometricSearchAudit_WritesExactlyOneRow exercises the shared audit
// write seam both endpoints call: on success it writes exactly one row carrying
// the gallery, workspace, endpoint, consent flag, match-count, and the hashed
// session subject — never a raw token, selfie, or embedding.
func TestRecordBiometricSearchAudit_WritesExactlyOneRow(t *testing.T) {
	auditor := &fakeBiometricAuditor{}
	h := NewPublicGalleryHandler(nil, nil, nil).WithBiometricConsentRepo(auditor)

	g := publishedPublicGallery()
	g.WorkspaceID = uuid.New()

	const token = "durable-gallery-session-token"
	req := httptest.NewRequest(http.MethodPost, "/x/photo-search", nil)
	req.Header.Set("X-Gallery-Session", token)
	rec := httptest.NewRecorder()

	if ok := h.recordBiometricSearchAudit(rec, req, g, repository.BiometricEndpointPhotoSearch, true, 7); !ok {
		t.Fatalf("recordBiometricSearchAudit returned false on a healthy auditor; body=%s", rec.Body.String())
	}
	if auditor.count() != 1 {
		t.Fatalf("want exactly 1 audit row, got %d", auditor.count())
	}
	row := auditor.rows[0]
	if row.WorkspaceID != g.WorkspaceID {
		t.Fatalf("workspace mismatch: got %s want %s", row.WorkspaceID, g.WorkspaceID)
	}
	if row.GalleryID != g.ID {
		t.Fatalf("gallery mismatch: got %s want %s", row.GalleryID, g.ID)
	}
	if row.Endpoint != repository.BiometricEndpointPhotoSearch {
		t.Fatalf("endpoint mismatch: got %s", row.Endpoint)
	}
	if !row.ConsentGiven {
		t.Fatalf("consent_given must be recorded true")
	}
	if row.MatchCount != 7 {
		t.Fatalf("match_count mismatch: got %d want 7", row.MatchCount)
	}
	// Subject must be the SHA-256 hex of the session token — never the raw token.
	wantSum := sha256.Sum256([]byte(token))
	wantHex := hex.EncodeToString(wantSum[:])
	if row.SessionSubject == nil || *row.SessionSubject != wantHex {
		t.Fatalf("session_subject must be sha256 hex of the token; got %v want %s", row.SessionSubject, wantHex)
	}
	if row.SessionSubject != nil && strings.Contains(*row.SessionSubject, token) {
		t.Fatalf("session_subject must NOT contain the raw token")
	}
}

// TestRecordBiometricSearchAudit_FailsClosed proves the two fail-closed paths:
// a missing auditor → 503, and a write error → 500. In both cases the helper
// returns false so the caller never returns matches without an audit row.
func TestRecordBiometricSearchAudit_FailsClosed(t *testing.T) {
	g := publishedPublicGallery()

	t.Run("nil_auditor_503", func(t *testing.T) {
		h := NewPublicGalleryHandler(nil, nil, nil) // no auditor wired
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		rec := httptest.NewRecorder()
		if ok := h.recordBiometricSearchAudit(rec, req, g, repository.BiometricEndpointFaceMatch, true, 0); ok {
			t.Fatal("a nil auditor must fail closed (return false)")
		}
		if rec.Code != http.StatusServiceUnavailable {
			t.Fatalf("nil auditor should answer 503, got %d", rec.Code)
		}
	})

	t.Run("write_error_500", func(t *testing.T) {
		auditor := &fakeBiometricAuditor{failErr: context.DeadlineExceeded}
		h := NewPublicGalleryHandler(nil, nil, nil).WithBiometricConsentRepo(auditor)
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		rec := httptest.NewRecorder()
		if ok := h.recordBiometricSearchAudit(rec, req, g, repository.BiometricEndpointFaceMatch, true, 3); ok {
			t.Fatal("a failed audit write must fail closed (return false)")
		}
		if rec.Code != http.StatusInternalServerError {
			t.Fatalf("write error should answer 500 (retryable), got %d", rec.Code)
		}
	})
}

// TestGallerySessionSubject pins the subject derivation: nil when no session
// token is present (fully-public gallery), and a stable SHA-256 hex digest of
// the token otherwise.
func TestGallerySessionSubject(t *testing.T) {
	t.Run("no_token_nil", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		if subj := gallerySessionSubject(req); subj != nil {
			t.Fatalf("no token must yield nil subject, got %v", *subj)
		}
	})
	t.Run("header_token_hashed", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		req.Header.Set("X-Gallery-Session", "abc123")
		subj := gallerySessionSubject(req)
		sum := sha256.Sum256([]byte("abc123"))
		want := hex.EncodeToString(sum[:])
		if subj == nil || *subj != want {
			t.Fatalf("want %s, got %v", want, subj)
		}
	})
}

// TestParseConsentGiven pins the affirmative-value matrix for the multipart
// consent field.
func TestParseConsentGiven(t *testing.T) {
	affirmative := []string{"true", "1", "yes", "on", "TRUE", " true ", "Yes"}
	negative := []string{"", "false", "0", "no", "off", "maybe", "  "}
	for _, v := range affirmative {
		if !parseConsentGiven(v) {
			t.Errorf("parseConsentGiven(%q) should be true", v)
		}
	}
	for _, v := range negative {
		if parseConsentGiven(v) {
			t.Errorf("parseConsentGiven(%q) should be false", v)
		}
	}
}
