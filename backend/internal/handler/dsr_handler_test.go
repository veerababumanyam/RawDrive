package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ─── Fakes ────────────────────────────────────────────────────────────────
//
// dsrTestStore is an in-memory service.DSRPersister so these stay pure unit
// tests (no Postgres). dsrTestExporter returns a fixed PII bundle so we can
// assert export_payload exposure.

type dsrTestStore struct {
	byID map[uuid.UUID]*service.DSRRequest
}

func newDSRTestStore() *dsrTestStore {
	return &dsrTestStore{byID: map[uuid.UUID]*service.DSRRequest{}}
}

func (s *dsrTestStore) Create(_ context.Context, req *service.DSRRequest) error {
	s.byID[req.ID] = req
	return nil
}

func (s *dsrTestStore) GetByID(_ context.Context, id uuid.UUID) (*service.DSRRequest, error) {
	r, ok := s.byID[id]
	if !ok {
		return nil, nil
	}
	// Return a copy so handler-side mutation (payload stripping) can't leak
	// back into the store and affect later assertions.
	cp := *r
	return &cp, nil
}

func (s *dsrTestStore) UpdateStatus(_ context.Context, id uuid.UUID, status service.DSRStatus, payload json.RawMessage, failureReason string) error {
	r, ok := s.byID[id]
	if !ok {
		return nil
	}
	r.Status = status
	r.ExportPayload = payload
	r.FailureReason = failureReason
	if status == service.DSRStatusCompleted {
		now := time.Now()
		r.CompletedAt = &now
	}
	return nil
}

func (s *dsrTestStore) FindRecentBySubject(_ context.Context, _ string, _ time.Time) ([]*service.DSRRequest, error) {
	return nil, nil
}

type dsrTestExporter struct{ called int }

func (e *dsrTestExporter) ExportSubjectData(_ context.Context, _ string, _ *uuid.UUID) (map[string]any, error) {
	e.called++
	return map[string]any{"email": "subject@example.com", "secret": "pii"}, nil
}

// dsrReq builds an httptest request with the chi {id} route param and the
// given JWT claims injected (nil claims => unauthenticated).
func dsrReq(method, path, id string, claims map[string]interface{}) *http.Request {
	r := httptest.NewRequest(method, path, nil)
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", id)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, rctx)
	if claims != nil {
		ctx = middleware.WithJWTClaims(ctx, claims)
	}
	return r.WithContext(ctx)
}

func seedDSR(store *dsrTestStore, subjectUserID *uuid.UUID, status service.DSRStatus, payload json.RawMessage) *service.DSRRequest {
	req := &service.DSRRequest{
		ID:            uuid.New(),
		SubjectEmail:  "subject@example.com",
		SubjectUserID: subjectUserID,
		RequestType:   service.DSRTypeAccess,
		Status:        status,
		RequestedAt:   time.Now(),
		ExportPayload: payload,
	}
	store.byID[req.ID] = req
	return req
}

// ─── F-019: Get must be ownership/admin scoped ─────────────────────────────

func TestDSRGet_Unauthenticated_401(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusCompleted, json.RawMessage(`{"secret":"pii"}`))
	h := handler.NewDSRHandler(service.NewDSRService(store))

	rr := httptest.NewRecorder()
	h.Get(rr, dsrReq(http.MethodGet, "/api/v1/dsr/"+req.ID.String(), req.ID.String(), nil))

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

// The core regression: a different authenticated, non-admin user must NOT be
// able to read another subject's DSR (full PII export). Pre-fix this returned
// 200 with the export_payload.
func TestDSRGet_OtherUser_NotFound(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusCompleted, json.RawMessage(`{"secret":"pii"}`))
	h := handler.NewDSRHandler(service.NewDSRService(store))

	attacker := uuid.New()
	rr := httptest.NewRecorder()
	h.Get(rr, dsrReq(http.MethodGet, "/api/v1/dsr/"+req.ID.String(), req.ID.String(),
		map[string]interface{}{"sub": attacker.String(), "platform_role": ""}))

	require.Equal(t, http.StatusNotFound, rr.Code)
	assert.NotContains(t, rr.Body.String(), "pii", "must not leak another subject's export payload")
}

func TestDSRGet_Subject_SeesOwnCompletedPayload(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusCompleted, json.RawMessage(`{"secret":"pii"}`))
	h := handler.NewDSRHandler(service.NewDSRService(store))

	rr := httptest.NewRecorder()
	h.Get(rr, dsrReq(http.MethodGet, "/api/v1/dsr/"+req.ID.String(), req.ID.String(),
		map[string]interface{}{"sub": subject.String(), "platform_role": ""}))

	require.Equal(t, http.StatusOK, rr.Code)
	var out service.DSRRequest
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &out))
	assert.Equal(t, req.ID, out.ID)
	assert.JSONEq(t, `{"secret":"pii"}`, string(out.ExportPayload), "owner sees their completed export")
}

func TestDSRGet_Subject_PendingOmitsPayload(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	// Pending request that (defensively) still carries a payload in storage.
	req := seedDSR(store, &subject, service.DSRStatusPending, json.RawMessage(`{"secret":"pii"}`))
	h := handler.NewDSRHandler(service.NewDSRService(store))

	rr := httptest.NewRecorder()
	h.Get(rr, dsrReq(http.MethodGet, "/api/v1/dsr/"+req.ID.String(), req.ID.String(),
		map[string]interface{}{"sub": subject.String(), "platform_role": ""}))

	require.Equal(t, http.StatusOK, rr.Code)
	assert.NotContains(t, rr.Body.String(), "pii", "non-completed self-read must omit export payload")
	assert.NotContains(t, rr.Body.String(), "export_payload")
}

func TestDSRGet_Admin_SeesAnyPayload(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusCompleted, json.RawMessage(`{"secret":"pii"}`))
	h := handler.NewDSRHandler(service.NewDSRService(store))

	rr := httptest.NewRecorder()
	h.Get(rr, dsrReq(http.MethodGet, "/api/v1/dsr/"+req.ID.String(), req.ID.String(),
		map[string]interface{}{"sub": uuid.New().String(), "platform_role": "admin"}))

	require.Equal(t, http.StatusOK, rr.Code)
	assert.Contains(t, rr.Body.String(), "pii", "admin may read any subject's export")
}

// ─── F-018: ProcessAccess must be admin-only ───────────────────────────────

func TestDSRProcessAccess_Unauthenticated_401(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusPending, nil)
	exp := &dsrTestExporter{}
	h := handler.NewDSRHandler(service.NewDSRService(store).WithExporter(exp))

	rr := httptest.NewRecorder()
	h.ProcessAccess(rr, dsrReq(http.MethodPost, "/api/v1/dsr/"+req.ID.String()+"/process-access", req.ID.String(), nil))

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
	assert.Equal(t, 0, exp.called, "exporter must not run for unauthenticated callers")
}

// Core regression: a non-admin authenticated user must NOT be able to trigger
// synchronous processing (which collects + persists PII and can be hammered).
// Pre-fix this returned 200 and ran the exporter.
func TestDSRProcessAccess_NonAdmin_Forbidden(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusPending, nil)
	exp := &dsrTestExporter{}
	h := handler.NewDSRHandler(service.NewDSRService(store).WithExporter(exp))

	// Even the subject themselves cannot drive the synchronous admin route.
	rr := httptest.NewRecorder()
	h.ProcessAccess(rr, dsrReq(http.MethodPost, "/api/v1/dsr/"+req.ID.String()+"/process-access", req.ID.String(),
		map[string]interface{}{"sub": subject.String(), "platform_role": ""}))

	require.Equal(t, http.StatusForbidden, rr.Code)
	assert.Equal(t, 0, exp.called, "exporter must not run for non-admin callers")
	assert.Equal(t, service.DSRStatusPending, store.byID[req.ID].Status, "status must be untouched")
}

func TestDSRProcessAccess_Admin_OK(t *testing.T) {
	store := newDSRTestStore()
	subject := uuid.New()
	req := seedDSR(store, &subject, service.DSRStatusPending, nil)
	exp := &dsrTestExporter{}
	h := handler.NewDSRHandler(service.NewDSRService(store).WithExporter(exp))

	rr := httptest.NewRecorder()
	h.ProcessAccess(rr, dsrReq(http.MethodPost, "/api/v1/dsr/"+req.ID.String()+"/process-access", req.ID.String(),
		map[string]interface{}{"sub": uuid.New().String(), "platform_role": "super_admin"}))

	require.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, 1, exp.called, "admin call runs the exporter")
	assert.Equal(t, service.DSRStatusCompleted, store.byID[req.ID].Status)
}
