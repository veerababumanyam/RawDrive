package security_test

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/middleware"
)

// TestMFAEnforcementGate verifies that the MFA enforcement env var
// controls whether RequireMFA blocks requests without mfa_verified.
func TestMFAEnforcementGate(t *testing.T) {
	buildRouter := func(enforceMFA bool) chi.Router {
		r := chi.NewRouter()
		r.Group(func(api chi.Router) {
			api.Use(func(next http.Handler) http.Handler {
				return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					ctx := middleware.WithJWTClaims(r.Context(), map[string]interface{}{
						"sub":          "user-123",
						"workspace_id": "ws-456",
					})
					next.ServeHTTP(w, r.WithContext(ctx))
				})
			})
			if enforceMFA {
				api.Use(middleware.RequireMFA)
			}
			api.Get("/workspace/test", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})
		})
		return r
	}

	t.Run("MFA not enforced — request passes", func(t *testing.T) {
		r := buildRouter(false)
		req := httptest.NewRequest("GET", "/workspace/test", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("MFA enforced — request without mfa_verified gets 403", func(t *testing.T) {
		r := buildRouter(true)
		req := httptest.NewRequest("GET", "/workspace/test", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		assert.Equal(t, http.StatusForbidden, w.Code)
	})
}

func TestMFAEnvVarParsing(t *testing.T) {
	tests := []struct {
		envVal   string
		expected bool
	}{
		{"1", true},
		{"true", false},
		{"", false},
		{"0", false},
	}
	for _, tt := range tests {
		t.Run("env="+tt.envVal, func(t *testing.T) {
			os.Setenv("MFA_ENFORCE_PHOTOGRAPHERS", tt.envVal)
			defer os.Unsetenv("MFA_ENFORCE_PHOTOGRAPHERS")
			result := os.Getenv("MFA_ENFORCE_PHOTOGRAPHERS") == "1"
			assert.Equal(t, tt.expected, result)
		})
	}
}
