package recharge

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func rechargeRequest(body string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/recharge", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-ID", uuid.New().String())
	req.Host = "app.rawdrive.test"
	return req
}

func TestCreateRechargeRejectsClientManagedCallbackURL(t *testing.T) {
	h := NewHandler(nil, nil)
	packageID := uuid.New()
	req := rechargeRequest(`{
		"package_id":"` + packageID.String() + `",
		"provider":"phonepe",
		"callback_url":"https://attacker.example/hooks/payment"
	}`)
	rr := httptest.NewRecorder()

	h.CreateRecharge(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400; body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "callback_url is server-managed") {
		t.Fatalf("expected server-managed callback error, got %s", rr.Body.String())
	}
}

func TestCreateRechargeRejectsCrossOriginRedirectURL(t *testing.T) {
	t.Setenv("FRONTEND_URL", "https://app.rawdrive.in")
	h := NewHandler(nil, nil)
	packageID := uuid.New()
	req := rechargeRequest(`{
		"package_id":"` + packageID.String() + `",
		"provider":"phonepe",
		"redirect_url":"https://evil.example/return"
	}`)
	rr := httptest.NewRecorder()

	h.CreateRecharge(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400; body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), "redirect_url must match the app origin") {
		t.Fatalf("expected same-origin redirect error, got %s", rr.Body.String())
	}
}

func TestDefaultRechargeReturnURLFallsBackToDockerFrontendPort(t *testing.T) {
	t.Setenv("FRONTEND_URL", "")
	t.Setenv("PUBLIC_BASE_URL", "")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/streaming/recharge", nil)
	req.Host = ""

	got := defaultRechargeReturnURL(req)
	want := "http://localhost:3000/dashboard?payment=streaming_recharge"
	if got != want {
		t.Fatalf("defaultRechargeReturnURL() = %q, want %q", got, want)
	}
}
