package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// Migration 144 — upload terms gate + /api/v1/legal/terms endpoint tests.
//
// The gate is the hard server-side enforcement of "no uploads until the
// photographer has accepted the Terms of Service". CreateSession must reject
// with 403 TERMS_NOT_ACCEPTED before any credit/storage reservation when the
// gate reports the user has not accepted the active version.
// ─────────────────────────────────────────────────────────────────────────────

// stubTermsGate is a hand-rolled handler.TermsGate for the CreateSession tests.
type stubTermsGate struct {
	accepted bool
	version  string
	err      error
}

func (s *stubTermsGate) HasAcceptedActive(_ context.Context, _ uuid.UUID) (bool, string, error) {
	return s.accepted, s.version, s.err
}

func newCreateSessionRequest(t *testing.T, workspaceID, userID uuid.UUID, body any) *http.Request {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(t, json.NewEncoder(&buf).Encode(body))
	} else {
		buf.WriteString("{}")
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/uploads", &buf)
	req.Header.Set("Content-Type", "application/json")
	claims := map[string]interface{}{
		"sub":           userID.String(),
		"workspace_id":  workspaceID.String(),
		"platform_role": "photographer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	ctx = middleware.WithWorkspaceID(ctx, workspaceID.String())
	return req.WithContext(ctx)
}

func TestCreateSession_TermsNotAccepted_Blocks(t *testing.T) {
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithTermsGate(&stubTermsGate{accepted: false, version: "tos-privacy/2026-04"})

	req := newCreateSessionRequest(t, uuid.New(), uuid.New(), nil)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code,
		"unaccepted terms must block upload session creation; body: %s", rr.Body.String())
	assert.Contains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
	// The active version is surfaced so the client modal shows the right one.
	assert.Contains(t, rr.Body.String(), "tos-privacy/2026-04")
}

func TestCreateSession_TermsAccepted_PassesGate(t *testing.T) {
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithTermsGate(&stubTermsGate{accepted: true, version: "tos-privacy/2026-04"})

	// Valid JSON but an unsupported content type — proves we got PAST the terms
	// gate (the request fails later for an unrelated, non-terms reason).
	body := map[string]any{"filename": "x.txt", "content_type": "text/plain", "total_size": 10}
	req := newCreateSessionRequest(t, uuid.New(), uuid.New(), body)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)

	assert.NotContains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED",
		"accepted user must pass the terms gate; body: %s", rr.Body.String())
}

func TestCreateSession_TermsGateError_FailsClosed(t *testing.T) {
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil).
		WithTermsGate(&stubTermsGate{err: termsGateBoomErr{}})

	req := newCreateSessionRequest(t, uuid.New(), uuid.New(), nil)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)

	// Fail closed on a lookup error — but as a 500 retry, NOT a 403 that would
	// wrongly tell the client to show the acceptance modal.
	assert.Equal(t, http.StatusInternalServerError, rr.Code, "body: %s", rr.Body.String())
	assert.NotContains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
}

type termsGateBoomErr struct{}

func (termsGateBoomErr) Error() string { return "boom" }

func TestCreateSession_NoTermsGate_IsNoop(t *testing.T) {
	// Legacy/test wiring without a gate must behave exactly as before (no terms
	// enforcement) — proves WithTermsGate is purely opt-in.
	h := handler.NewChunkedUploadHandler(nil, nil, nil, nil)
	body := map[string]any{"filename": "x.txt", "content_type": "text/plain", "total_size": 10}
	req := newCreateSessionRequest(t, uuid.New(), uuid.New(), body)
	rr := httptest.NewRecorder()
	h.CreateSession(rr, req)
	assert.NotContains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
}

func TestAssetUpload_TermsNotAccepted_Blocks(t *testing.T) {
	h := handler.NewAssetHandler(nil, nil).
		WithTermsGate(&stubTermsGate{accepted: false, version: "tos-privacy/2026-04"})

	req := newAssetUploadRequest(t, nil, uuid.New(), uuid.New())
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.Equal(t, http.StatusForbidden, rr.Code,
		"unaccepted terms must block direct asset upload; body: %s", rr.Body.String())
	assert.Contains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
	assert.Contains(t, rr.Body.String(), "tos-privacy/2026-04")
}

func TestAssetUpload_TermsAccepted_PassesGate(t *testing.T) {
	h := handler.NewAssetHandler(nil, nil).
		WithTermsGate(&stubTermsGate{accepted: true, version: "tos-privacy/2026-04"})

	req := newCreateSessionRequest(t, uuid.New(), uuid.New(), nil)
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.NotEqual(t, http.StatusForbidden, rr.Code,
		"accepted user must pass the direct upload terms gate; body: %s", rr.Body.String())
	assert.NotContains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
}

func TestAssetUpload_TermsGateError_FailsClosed(t *testing.T) {
	h := handler.NewAssetHandler(nil, nil).
		WithTermsGate(&stubTermsGate{err: termsGateBoomErr{}})

	req := newAssetUploadRequest(t, nil, uuid.New(), uuid.New())
	rr := httptest.NewRecorder()
	h.Upload(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code, "body: %s", rr.Body.String())
	assert.NotContains(t, rr.Body.String(), "TERMS_NOT_ACCEPTED")
}

// ─── Terms endpoint (real service + in-memory store) ───────────────────────────

type fakeHandlerTermsStore struct {
	active   *repository.TermsVersion
	pointers map[uuid.UUID]string
	recorded []*repository.TermsAcceptance
}

func (f *fakeHandlerTermsStore) GetActiveVersion(context.Context) (*repository.TermsVersion, error) {
	return f.active, nil
}
func (f *fakeHandlerTermsStore) GetUserTermsPointer(_ context.Context, u uuid.UUID) (string, *time.Time, error) {
	return f.pointers[u], nil, nil
}
func (f *fakeHandlerTermsStore) RecordAcceptance(_ context.Context, a *repository.TermsAcceptance) error {
	f.recorded = append(f.recorded, a)
	f.pointers[a.UserID] = a.TermsVersion
	return nil
}

func newTermsHandler(store *fakeHandlerTermsStore) *handler.TermsHandler {
	return handler.NewTermsHandler(service.NewTermsService(store, nil))
}

func TestTermsHandler_Accept_RecordsWithIPAndUA(t *testing.T) {
	store := &fakeHandlerTermsStore{
		active:   &repository.TermsVersion{Version: "tos-privacy/2026-04", TermsText: "terms body", DocumentTypes: []string{"terms_of_service", "privacy_policy"}},
		pointers: map[uuid.UUID]string{},
	}
	h := newTermsHandler(store)
	uid := uuid.New()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/legal/terms/accept", bytes.NewBufferString("{}"))
	req.Header.Set("X-Forwarded-For", "203.0.113.7")
	req.Header.Set("User-Agent", "TestBrowser/9")
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": uid.String()}))
	rr := httptest.NewRecorder()
	h.Accept(rr, req)

	require.Equal(t, http.StatusCreated, rr.Code, "body: %s", rr.Body.String())
	require.Len(t, store.recorded, 1)
	rec := store.recorded[0]
	assert.Equal(t, "203.0.113.7", rec.IPAddress, "proxy-aware client IP must be captured for audit")
	assert.Equal(t, "TestBrowser/9", rec.UserAgent)
	assert.Equal(t, "tos-privacy/2026-04", rec.TermsVersion)
	assert.NotEmpty(t, rec.VersionHash, "SHA-256 of the shown text must be recorded")
}

func TestTermsHandler_Accept_StaleVersion_Conflicts(t *testing.T) {
	store := &fakeHandlerTermsStore{
		active:   &repository.TermsVersion{Version: "tos-privacy/2026-04", TermsText: "terms body"},
		pointers: map[uuid.UUID]string{},
	}
	h := newTermsHandler(store)
	uid := uuid.New()

	body, _ := json.Marshal(map[string]string{"version": "tos-privacy/2025-01"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/legal/terms/accept", bytes.NewBuffer(body))
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": uid.String()}))
	rr := httptest.NewRecorder()
	h.Accept(rr, req)

	assert.Equal(t, http.StatusConflict, rr.Code, "body: %s", rr.Body.String())
	assert.Contains(t, rr.Body.String(), "TERMS_VERSION_STALE")
	assert.Empty(t, store.recorded, "a stale-version accept must not record anything")
}

func TestTermsHandler_GetCurrent_ReturnsActiveTextAndHash(t *testing.T) {
	store := &fakeHandlerTermsStore{
		active: &repository.TermsVersion{
			Version: "tos-privacy/2026-04", TermsText: "operative terms text", TextSHA256: "abc123",
			DocumentTypes: []string{"terms_of_service", "privacy_policy"},
		},
		pointers: map[uuid.UUID]string{},
	}
	h := newTermsHandler(store)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/legal/terms/current", nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), map[string]interface{}{"sub": uuid.New().String()}))
	rr := httptest.NewRecorder()
	h.GetCurrent(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())
	assert.Contains(t, rr.Body.String(), "operative terms text")
	assert.Contains(t, rr.Body.String(), "tos-privacy/2026-04")
}
