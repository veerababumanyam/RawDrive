package integration_test

import (
	"testing"

	"rawdrive/backend/internal/rbac"
	"rawdrive/backend/internal/tenancy"
)

func TestSecurityRBAC_AllEndpointsCovered(t *testing.T) {
	engine := rbac.NewEngine()
	// Verify all critical resources have permission entries
	resources := []string{"galleries", "assets", "clients", "invoices", "team", "settings", "billing", "workspace"}
	for _, r := range resources {
		if !engine.Can("owner", r, "read") {
			t.Errorf("owner should have read access to %s", r)
		}
	}
}

func TestSecurityTenancy_RequiresValidContext(t *testing.T) {
	tctx := tenancy.NewContext("", "", "", "")
	if err := tctx.Validate(); err == nil {
		t.Fatal("empty tenancy context should fail validation")
	}
}

func TestSecurityTenancy_RLSParamsComplete(t *testing.T) {
	tctx := tenancy.NewContext("ws-1", "user-1", "admin", "MH")
	params := tctx.RLSParams()
	required := []string{"app.current_workspace_id", "app.current_user_id", "app.current_user_role", "app.current_state_id"}
	for _, key := range required {
		if params[key] == "" {
			t.Errorf("RLS param %q is empty", key)
		}
	}
}

func TestSecurityRBAC_NoEscalation(t *testing.T) {
	engine := rbac.NewEngine()
	// No role should be able to assign a role higher than itself
	pairs := []struct{ from, to string }{
		{"viewer", "editor"},
		{"editor", "admin"},
		{"admin", "owner"},
	}
	for _, p := range pairs {
		if engine.CanAssignRole(p.from, p.to) {
			t.Errorf("%s should not be able to assign %s role", p.from, p.to)
		}
	}
}
