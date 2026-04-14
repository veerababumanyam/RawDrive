package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/middleware"
)

// stubFlag satisfies the InviteFlag interface for unit tests.
type stubFlag struct{ on bool }

func (s stubFlag) IsEnabled(_ context.Context, _ uuid.UUID) (bool, string) {
	return s.on, "test"
}

// stubGenerator implements InviteGenerator for unit tests.
type stubGenerator struct {
	code    string
	err     error
	ownerWS string // ?owner= value to match for success; empty means always allow
}

func (g *stubGenerator) Generate(_ context.Context, _ uuid.UUID, _ uuid.UUID) (string, error) {
	return g.code, g.err
}

func newInviteHandler(flagOn bool, code string) *InviteHandler {
	return NewInviteHandler(&stubGenerator{code: code}, stubFlag{on: flagOn}, nil, "https://app.example.com")
}

func mountInvite(h *InviteHandler) http.Handler {
	r := chi.NewRouter()
	r.Post("/streams/{id}/invites", h.CreateInvite)
	return r
}

func TestCreateInvite_Unauthenticated_401(t *testing.T) {
	h := newInviteHandler(true, "ABCDEFGH")
	r := mountInvite(h)
	streamID := uuid.New()
	req := httptest.NewRequest(http.MethodPost, "/streams/"+streamID.String()+"/invites", nil)
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("want 401 got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestCreateInvite_NonOwner_404(t *testing.T) {
	h := newInviteHandler(true, "ABCDEFGH")
	r := mountInvite(h)
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	otherWS := uuid.New().String()
	req := httptest.NewRequest(http.MethodPost, "/streams/"+streamID.String()+"/invites?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(otherWS, "photographer")))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("want 404 got %d", rr.Code)
	}
}

func TestCreateInvite_Success_201_ReturnsCodeAndQR(t *testing.T) {
	h := newInviteHandler(true, "ABCDEFGH")
	r := mountInvite(h)
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	req := httptest.NewRequest(http.MethodPost, "/streams/"+streamID.String()+"/invites?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ownerWS, "photographer")))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("want 201 got %d body=%s", rr.Code, rr.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v body=%s", err, rr.Body.String())
	}
	if resp["code"] != "ABCDEFGH" {
		t.Errorf("code: want ABCDEFGH got %v", resp["code"])
	}
	su, _ := resp["short_url"].(string)
	if !strings.Contains(su, "ABCDEFGH") {
		t.Errorf("short_url missing code: %q", su)
	}
	qp, _ := resp["qr_payload"].(string)
	if qp != su {
		t.Errorf("qr_payload should equal short_url, got %q vs %q", qp, su)
	}
}

func TestCreateInvite_FeatureFlagOff_404(t *testing.T) {
	h := newInviteHandler(false, "ABCDEFGH")
	r := mountInvite(h)
	streamID := uuid.New()
	ownerWS := uuid.New().String()
	req := httptest.NewRequest(http.MethodPost, "/streams/"+streamID.String()+"/invites?owner="+ownerWS, nil)
	req = req.WithContext(middleware.WithJWTClaims(req.Context(), claimsFor(ownerWS, "photographer")))
	rr := httptest.NewRecorder()
	r.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("flag off: want 404 got %d", rr.Code)
	}
}
