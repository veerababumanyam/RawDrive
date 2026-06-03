package m5_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
)

func TestRegisterM5Routes_MarketplaceEndpoints(t *testing.T) {
	pool := getTestDB(t)
	r := chi.NewRouter()
	deps := handler.M5Dependencies{
		DB:             pool,
		FreelancerRepo: repository.NewFreelancerRepo(pool),
		GearRepo:       repository.NewGearRepo(pool),
		MessagingRepo:  repository.NewMessagingRepo(pool),
		ModerationRepo: repository.NewModerationRepo(pool),
	}
	handler.RegisterM5PublicRoutes(r, deps)
	handler.RegisterM5Routes(r, deps)

	ts := httptest.NewServer(r)
	defer ts.Close()

	// Public freelancer list
	resp, err := http.Get(ts.URL + "/api/v1/marketplace/freelancers")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)

	var body map[string]interface{}
	err = json.NewDecoder(resp.Body).Decode(&body)
	require.NoError(t, err)
	assert.Contains(t, body, "data")
}

func TestRegisterM5Routes_GearEndpoints(t *testing.T) {
	pool := getTestDB(t)
	r := chi.NewRouter()
	deps := handler.M5Dependencies{
		DB:             pool,
		FreelancerRepo: repository.NewFreelancerRepo(pool),
		GearRepo:       repository.NewGearRepo(pool),
		MessagingRepo:  repository.NewMessagingRepo(pool),
		ModerationRepo: repository.NewModerationRepo(pool),
	}
	handler.RegisterM5PublicRoutes(r, deps)
	handler.RegisterM5Routes(r, deps)

	ts := httptest.NewServer(r)
	defer ts.Close()

	// Public gear list
	resp, err := http.Get(ts.URL + "/api/v1/marketplace/gear")
	require.NoError(t, err)
	defer resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestRegisterM5Routes_PublicEndpointsNoAuth(t *testing.T) {
	pool := getTestDB(t)
	r := chi.NewRouter()
	deps := handler.M5Dependencies{
		DB:             pool,
		FreelancerRepo: repository.NewFreelancerRepo(pool),
		GearRepo:       repository.NewGearRepo(pool),
		MessagingRepo:  repository.NewMessagingRepo(pool),
		ModerationRepo: repository.NewModerationRepo(pool),
	}
	handler.RegisterM5PublicRoutes(r, deps)
	handler.RegisterM5Routes(r, deps)

	ts := httptest.NewServer(r)
	defer ts.Close()

	publicEndpoints := []string{
		"/api/v1/marketplace/freelancers",
		"/api/v1/marketplace/gear",
	}
	for _, ep := range publicEndpoints {
		resp, err := http.Get(ts.URL + ep)
		require.NoError(t, err)
		resp.Body.Close()
		assert.Equal(t, http.StatusOK, resp.StatusCode, "Public endpoint %s should return 200", ep)
	}
}
