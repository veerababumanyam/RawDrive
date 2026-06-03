package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
)

// These tests exercise the KYC handler without touching the database.
// They cover the input-validation branches that run before any repo call:
//   - unauthenticated requests
//   - missing/invalid JSON body
//   - invalid document_type
//   - admin review with missing rejection_reason on status=rejected
//   - chi route registration (PATCH /admin/kyc-documents/{id})
// Handlers with `dealer_repo=nil` panic on repo access, but the validation
// branches we test return earlier, so nil is acceptable.

func newKycHandlerForTest() *KycHandler {
	// Repos are nil — tests only exercise validation branches that return
	// before any repo access.
	return NewKycHandler(nil, nil)
}

func withAuthContext(req *http.Request, userID uuid.UUID) *http.Request {
	claims := map[string]interface{}{
		"sub":  userID.String(),
		"role": "Dealer",
	}
	ctx := middleware.WithJWTClaims(req.Context(), claims)
	return req.WithContext(ctx)
}

func TestKycHandler_Create_Unauthorized(t *testing.T) {
	h := newKycHandlerForTest()
	req := httptest.NewRequest("POST", "/api/v1/dealer/kyc-documents", strings.NewReader(`{}`))
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestKycHandler_Create_InvalidBody(t *testing.T) {
	h := newKycHandlerForTest()
	req := httptest.NewRequest("POST", "/api/v1/dealer/kyc-documents", strings.NewReader(`not json`))
	req = withAuthContext(req, uuid.New())
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid request body")
}

func TestKycHandler_Create_MissingStorageKey(t *testing.T) {
	h := newKycHandlerForTest()
	body := `{"document_type":"pan","filename":"pan.jpg"}`
	req := httptest.NewRequest("POST", "/api/v1/dealer/kyc-documents", strings.NewReader(body))
	req = withAuthContext(req, uuid.New())
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "storage_key and filename required")
}

func TestKycHandler_Create_InvalidDocType(t *testing.T) {
	h := newKycHandlerForTest()
	body := `{"document_type":"aadhaar","storage_key":"k","filename":"f"}`
	req := httptest.NewRequest("POST", "/api/v1/dealer/kyc-documents", strings.NewReader(body))
	req = withAuthContext(req, uuid.New())
	rr := httptest.NewRecorder()
	h.Create(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "invalid document_type")
}

func TestKycHandler_AdminReview_MissingRejectionReason(t *testing.T) {
	h := newKycHandlerForTest()
	body := `{"status":"rejected"}`
	req := httptest.NewRequest("PATCH", "/api/v1/admin/kyc-documents/"+uuid.New().String(), bytes.NewBufferString(body))
	req = withAuthContext(req, uuid.New())

	// Inject chi URL param via a routing context.
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rr := httptest.NewRecorder()
	h.AdminReview(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "rejection_reason required")
}

func TestKycHandler_AdminReview_InvalidStatus(t *testing.T) {
	h := newKycHandlerForTest()
	body := `{"status":"paid"}`
	req := httptest.NewRequest("PATCH", "/api/v1/admin/kyc-documents/x", strings.NewReader(body))
	req = withAuthContext(req, uuid.New())

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", uuid.New().String())
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	rr := httptest.NewRecorder()
	h.AdminReview(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "status must be")
}

// TestM6Routes_KycRoutesRegistered verifies the routes are wired when the
// KycDocumentRepo is provided. We pass a non-nil pointer (zero-value is fine
// since handlers panic on access, which our routeExists helper recovers).
func TestM6Routes_KycRoutesRegistered(t *testing.T) {
	r := chi.NewRouter()
	RegisterM6Routes(r, M6Dependencies{
		KycDocumentRepo: &repository.KycDocumentRepo{},
	})
	assert.True(t, routeExists(r, "POST", "/api/v1/dealer/kyc-documents/"), "POST /api/v1/dealer/kyc-documents")
	assert.True(t, routeExists(r, "GET", "/api/v1/dealer/kyc-documents/"), "GET /api/v1/dealer/kyc-documents")
	assert.True(t, routeExists(r, "PATCH", "/api/v1/admin/kyc-documents/"+uuid.New().String()), "PATCH /api/v1/admin/kyc-documents/{id}")
}
