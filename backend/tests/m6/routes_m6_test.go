package m6_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM6RoutesRegistration(t *testing.T) {
	pool := getTestDB(t)

	r := chi.NewRouter()
	deps := handler.M6Dependencies{
		DB:         pool,
		DealerRepo: repository.NewDealerRepo(pool),
		CouponRepo: repository.NewCouponRepo(pool),
		MarginRepo: repository.NewMarginRepo(pool),
		PayoutRepo: repository.NewPayoutRepo(pool),
	}
	handler.RegisterM6Routes(r, deps)

	// Verify route registration by walking routes
	routes := []string{}
	chi.Walk(r, func(method, route string, handler http.Handler, middlewares ...func(http.Handler) http.Handler) error {
		routes = append(routes, method+" "+route)
		return nil
	})

	require.NotEmpty(t, routes, "should have registered routes")

	expectedRoutes := []string{
		"POST /api/v1/admin/dealers/",
		"GET /api/v1/admin/dealers/",
		"PUT /api/v1/admin/dealers/{id}/approve",
		"PUT /api/v1/admin/dealers/{id}/reject",
		"PUT /api/v1/admin/dealers/{id}/suspend",
		"GET /api/v1/dealers/dashboard",
		"GET /api/v1/dealers/coupons",
		"POST /api/v1/dealers/coupons",
		"GET /api/v1/dealers/payouts",
		"GET /api/v1/dealers/statements",
		"PUT /api/v1/admin/margins/",
		"GET /api/v1/admin/margins/",
		"POST /api/v1/admin/coupons/",
		"GET /api/v1/admin/coupons/",
		"POST /api/v1/onboarding/coupon",
	}

	for _, expected := range expectedRoutes {
		found := false
		for _, actual := range routes {
			if actual == expected {
				found = true
				break
			}
		}
		assert.True(t, found, "expected route not found: %s (registered: %v)", expected, routes)
	}
}

func TestDealerDashboard_Unauthorized(t *testing.T) {
	pool := getTestDB(t)

	r := chi.NewRouter()
	deps := handler.M6Dependencies{
		DB:         pool,
		DealerRepo: repository.NewDealerRepo(pool),
		CouponRepo: repository.NewCouponRepo(pool),
		MarginRepo: repository.NewMarginRepo(pool),
		PayoutRepo: repository.NewPayoutRepo(pool),
	}
	handler.RegisterM6Routes(r, deps)

	// Request without auth context
	req := httptest.NewRequest("GET", "/api/v1/dealers/dashboard", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Should return 401 (no user ID in context)
	assert.Equal(t, http.StatusUnauthorized, w.Code, "dashboard without auth should return 401")
}

func TestCouponValidation_EmptyCode(t *testing.T) {
	pool := getTestDB(t)

	r := chi.NewRouter()
	deps := handler.M6Dependencies{
		DB:         pool,
		DealerRepo: repository.NewDealerRepo(pool),
		CouponRepo: repository.NewCouponRepo(pool),
		MarginRepo: repository.NewMarginRepo(pool),
		PayoutRepo: repository.NewPayoutRepo(pool),
	}
	handler.RegisterM6Routes(r, deps)

	req := httptest.NewRequest("POST", "/api/v1/onboarding/coupon", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	// Should return 400 (no coupon code) or 401 (no auth)
	assert.True(t, w.Code == http.StatusBadRequest || w.Code == http.StatusUnauthorized,
		"empty coupon validation should return 400 or 401, got %d", w.Code)
}
