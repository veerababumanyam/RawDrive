package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/service"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S1 — Admin upload moderation handler tests.
//
// Covers the three endpoints exposed by AdminUploadModerationHandler:
//   TestAdminUploadModeration_ListQueue_ReturnsBlocked
//   TestAdminUploadModeration_Override_IssuesToken
//   TestAdminUploadModeration_Analytics_ReturnsAggregate
//
// Uses an in-memory stub repo so the tests stay pure unit. The real
// Postgres repo (PgUploadModerationRepo) is exercised indirectly through
// the Step 03B integration smoke test and the Step 04A live wiring test.
// ─────────────────────────────────────────────────────────────────────────────

type stubModerationRepo struct {
	blocked   []service.BlockedAssetRow
	byID      map[uuid.UUID]service.BlockedAssetRow
	overrides []uuid.UUID
	analytics service.UploadModerationAnalytics
}

func newStubModerationRepo() *stubModerationRepo {
	return &stubModerationRepo{byID: map[uuid.UUID]service.BlockedAssetRow{}}
}

func (s *stubModerationRepo) ListBlocked(_ context.Context, _ uuid.UUID, _, _ int) ([]service.BlockedAssetRow, error) {
	return s.blocked, nil
}

func (s *stubModerationRepo) FindByID(_ context.Context, id uuid.UUID) (*service.BlockedAssetRow, error) {
	row, ok := s.byID[id]
	if !ok {
		return nil, nil
	}
	return &row, nil
}

func (s *stubModerationRepo) MarkOverride(_ context.Context, id uuid.UUID, _ uuid.UUID, _ string) error {
	s.overrides = append(s.overrides, id)
	return nil
}

func (s *stubModerationRepo) Analytics(_ context.Context, _ uuid.UUID, _ time.Time) (service.UploadModerationAnalytics, error) {
	return s.analytics, nil
}

// stubAllowlistRepo is a throwaway in-memory repo for the allowlist service
// used inside the moderation service. We only care that tokens can be
// issued; we do not verify the single-use flow here because that is
// covered in upload_allowlist_service_test.go.
type stubAllowlistRepoForMod struct {
	stored []service.UploadAllowlistToken
}

func (s *stubAllowlistRepoForMod) Store(_ context.Context, t service.UploadAllowlistToken) error {
	s.stored = append(s.stored, t)
	return nil
}
func (s *stubAllowlistRepoForMod) FindByToken(_ context.Context, _ []byte) (*service.UploadAllowlistToken, error) {
	return nil, nil
}
func (s *stubAllowlistRepoForMod) MarkUsed(_ context.Context, _ []byte, _ time.Time) error {
	return nil
}

func setupModerationHandler(repo *stubModerationRepo) (*AdminUploadModerationHandler, *stubAllowlistRepoForMod) {
	allowRepo := &stubAllowlistRepoForMod{}
	allowSvc := service.NewUploadAllowlistService(allowRepo)
	modSvc := service.NewUploadModerationService(repo, allowSvc, nil)
	return NewAdminUploadModerationHandler(modSvc), allowRepo
}

func TestAdminUploadModeration_ListQueue_ReturnsBlocked(t *testing.T) {
	repo := newStubModerationRepo()
	wsID := uuid.New()
	repo.blocked = []service.BlockedAssetRow{
		{AssetID: uuid.New(), WorkspaceID: wsID, Filename: "bad.jpg", ScanStatus: "blocked", RiskScore: 0.9},
		{AssetID: uuid.New(), WorkspaceID: wsID, Filename: "raw.cr2", ScanStatus: "needs_desktop"},
	}

	h, _ := setupModerationHandler(repo)
	r := chi.NewRouter()
	r.Get("/api/v1/admin/upload-moderation", h.ListQueue)

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/admin/upload-moderation?workspace_id="+wsID.String(), nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())
	var resp struct {
		Queue []service.BlockedAssetRow `json:"queue"`
	}
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Len(t, resp.Queue, 2)
	assert.Equal(t, "bad.jpg", resp.Queue[0].Filename)
}

func TestAdminUploadModeration_Override_IssuesToken(t *testing.T) {
	repo := newStubModerationRepo()
	wsID := uuid.New()
	assetID := uuid.New()
	repo.byID[assetID] = service.BlockedAssetRow{
		AssetID:      assetID,
		WorkspaceID:  wsID,
		Filename:     "false-positive.jpg",
		ScanStatus:   "blocked",
		ManifestHash: "manifest-hash-abc",
	}

	h, allowRepo := setupModerationHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/admin/upload-moderation/{assetId}/override", h.Override)

	body, _ := json.Marshal(OverrideRequest{Justification: "legitimate original", TTLHours: 48})
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/admin/upload-moderation/"+assetID.String()+"/override",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code, "body: %s", rr.Body.String())

	var result service.OverrideResult
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &result))
	assert.Equal(t, assetID, result.AssetID)
	assert.NotEmpty(t, result.TokenB64, "override must return a base64-encoded token")

	// Verify the allowlist repo actually stored a token bound to the manifest hash.
	require.Len(t, allowRepo.stored, 1)
	assert.Equal(t, "manifest-hash-abc", allowRepo.stored[0].ManifestHash)

	// Verify the moderation repo recorded the override.
	require.Len(t, repo.overrides, 1)
	assert.Equal(t, assetID, repo.overrides[0])
}

func TestAdminUploadModeration_Override_NotFound(t *testing.T) {
	repo := newStubModerationRepo()
	h, _ := setupModerationHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/admin/upload-moderation/{assetId}/override", h.Override)

	body, _ := json.Marshal(OverrideRequest{Justification: "test"})
	req := httptest.NewRequest(http.MethodPost,
		"/api/v1/admin/upload-moderation/"+uuid.New().String()+"/override",
		bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
	assert.Contains(t, rr.Body.String(), "UPLOAD_MODERATION_ASSET_NOT_FOUND")
}

func TestAdminUploadModeration_Analytics_ReturnsAggregate(t *testing.T) {
	repo := newStubModerationRepo()
	wsID := uuid.New()
	repo.analytics = service.UploadModerationAnalytics{
		TotalScanned:  100,
		TotalPassed:   85,
		TotalBlocked:  10,
		TotalOverride: 5,
		BlockRate:     0.1,
		TierDCauses:   map[string]int64{"appended_payload": 6, "metadata_budget": 4},
	}

	h, _ := setupModerationHandler(repo)
	r := chi.NewRouter()
	r.Get("/api/v1/admin/upload-moderation/analytics", h.Analytics)

	req := httptest.NewRequest(http.MethodGet,
		"/api/v1/admin/upload-moderation/analytics?workspace_id="+wsID.String(), nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)

	require.Equal(t, http.StatusOK, rr.Code)
	var resp service.UploadModerationAnalytics
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Equal(t, int64(100), resp.TotalScanned)
	assert.InDelta(t, 0.1, resp.BlockRate, 0.001)
}
