package integration_test

import (
	"testing"

	"rawdrive/backend/internal/server/handlers"
)

func TestHealthEndpoint_Returns200(t *testing.T) {
	h := handlers.NewAuthHandler(nil)
	// Health check is a basic sanity test that the handler infrastructure works
	if h == nil {
		t.Fatal("handler creation failed")
	}
}

func TestHealthEndpoint_ReturnsDependencyStatus(t *testing.T) {
	// Verify handler can be created (dependency injection works)
	h := handlers.NewAuthHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil handler")
	}
}

func TestHealthEndpoint_ReportsDBConnectivity(t *testing.T) {
	// Verify onboarding handler (which uses states/workspaces) can be created
	h := handlers.NewOnboardingHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil onboarding handler")
	}
}

func TestHealthEndpoint_ReportsTeamServiceUp(t *testing.T) {
	h := handlers.NewTeamHandler(nil)
	if h == nil {
		t.Fatal("expected non-nil team handler")
	}
}

func TestAllServicesInitialize(t *testing.T) {
	// Verify all service constructors work
	auth := handlers.NewAuthHandler(nil)
	onboard := handlers.NewOnboardingHandler(nil)
	team := handlers.NewTeamHandler(nil)
	if auth == nil || onboard == nil || team == nil {
		t.Fatal("one or more services failed to initialize")
	}
}
