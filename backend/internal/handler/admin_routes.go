package handler

import (
	"github.com/go-chi/chi/v5"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
	uploadhandlers "github.com/rawdrive/backend/internal/upload/handlers"
)

type AdminDeps struct {
	UserSvc       *service.AdminUserService
	ModerationSvc *service.AdminModerationService
	WorkspaceSvc  *service.AdminWorkspaceService
	RevenueSvc    *service.AdminRevenueService
	AnalyticsSvc  *service.AdminAnalyticsService
	ExportSvc     *service.AdminExportService
	HealthSvc     *service.AdminHealthService
	AuditLogSvc   *service.AuditLogService
	// M16 E49-S1 / E49-S2: workspace upload-policy admin handlers.
	// Nil-safe: route registration succeeds even when the service is unset
	// (the handler returns 501 in that path), so existing AdminDeps{} call
	// sites in tests do not need to be updated for Round 3 RED.
	WorkspacePolicySvc *service.WorkspacePolicyService

	// M16 E50-S1 / E50-S3: upload moderation admin handler. Nil-safe: the
	// handler returns 501 when the service is unset so existing test call
	// sites continue to compile without modification.
	UploadModerationSvc *service.UploadModerationService

	// M41 E14-S3: upload credit admin grant handler. Nil-safe: the handler
	// returns 503 when the service is unset so existing test call sites
	// without a real upload/credit.Service still compile.
	UploadCreditGrantSvc UploadCreditGrantService

	// M41 FR-UCRT-10 follow-up: admin-facing balance reader for the
	// `/admin/upload-credits` page so admins see existing grants before
	// adding more. Reuses the same interface as the user-facing balance
	// endpoint; nil-safe (handler returns 503 when unset).
	UploadCreditBalanceReader uploadhandlers.BalanceProvider
}

func RegisterAdminRoutes(r chi.Router, deps AdminDeps) {
	users := NewAdminUsersHandler(deps.UserSvc)
	moderation := NewAdminModerationHandler(deps.ModerationSvc)
	workspaces := NewAdminWorkspacesHandler(deps.WorkspaceSvc)
	revenue := NewAdminRevenueHandler(deps.RevenueSvc)
	analytics := NewAdminAnalyticsHandler(deps.AnalyticsSvc)
	export := NewAdminExportHandler(deps.ExportSvc)
	health := NewAdminSystemHealthHandler(deps.HealthSvc)
	auditLogs := NewAdminAuditLogsHandler(deps.AuditLogSvc)
	// M16 E49-S1 / E49-S2: workspace upload-policy admin handler.
	uploadPolicy := NewAdminWorkspacePolicyHandler(deps.WorkspacePolicySvc)

	// M16 E50-S1 / E50-S3: upload moderation admin handler.
	uploadModeration := NewAdminUploadModerationHandler(deps.UploadModerationSvc)

	// M41 E14-S3: upload credit admin grant handler, plus balance reader
	// so the admin UI can show existing credit balances per workspace.
	uploadCreditGrant := NewAdminUploadCreditsHandler(deps.UploadCreditGrantSvc)
	uploadCreditGrant.BalanceReader = deps.UploadCreditBalanceReader

	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequirePlatformRole("super_admin", "admin"))

		// 2026-05-19: GET /admin/plans serves the canonical plan
		// catalog so the New User dialog renders the plan dropdown
		// dynamically instead of bundling the tier list into the
		// frontend at build time.
		plans := NewAdminPlansHandler()
		r.Get("/plans", plans.List)

		r.Get("/users", users.List)
		// M39 E5-S1: admin user create (POST /api/v1/admin/users).
		r.Post("/users", users.Create)
		r.Get("/users/{id}", users.GetByID)
		r.Post("/users/{id}/suspend", users.Suspend)
		r.Post("/users/{id}/reactivate", users.Reactivate)
		r.Post("/users/{id}/impersonate", users.Impersonate)
		r.Put("/users/{id}/role", users.ChangeRole)
		r.Put("/users/{id}/tier", users.ChangeTier)
		// M7 E20-S1: GDPR erasure + activity timeline
		r.Delete("/users/{id}", users.Delete)
		r.Get("/users/{id}/activity", users.Activity)

		r.Get("/moderation", moderation.ListQueue)
		r.Put("/moderation/{id}/approve", moderation.Approve)
		r.Put("/moderation/{id}/reject", moderation.Reject)
		r.Put("/moderation/{id}/escalate", moderation.Escalate)

		r.Get("/workspaces", workspaces.List)
		r.Get("/workspaces/{id}", workspaces.GetByID)
		// M7 E20-S3: workspace lifecycle management
		r.Post("/workspaces/{id}/suspend", workspaces.Suspend)
		r.Post("/workspaces/{id}/unsuspend", workspaces.Unsuspend)
		r.Delete("/workspaces/{id}", workspaces.Delete)

		r.Get("/revenue", revenue.GetDashboard)
		r.Get("/revenue/timeseries", revenue.GetTimeSeries)
		r.Get("/revenue/states", revenue.GetStateBreakdown)

		r.Get("/analytics/engagement", analytics.GetEngagement)
		r.Get("/analytics/growth", analytics.GetGrowth)
		r.Get("/analytics/features", analytics.GetFeatureAdoption)

		r.Get("/export/users", export.ExportUsers)
		r.Get("/export/revenue", export.ExportRevenue)

		r.Get("/system/metrics", health.GetMetrics)
		r.Get("/system/thresholds", health.GetThresholds)

		r.Get("/audit-logs", auditLogs.List)
		r.Get("/audit-logs/export", auditLogs.Export)
		r.Get("/audit-logs/{id}", auditLogs.GetDetail)

		// M16 E49-S1 / E49-S2: workspace upload-policy admin endpoints.
		// Read returns the active mode for a workspace.
		// Write updates the mode and emits an audit event with before/after.
		r.Get("/workspaces/{id}/upload-policy", uploadPolicy.GetWorkspacePolicy)
		r.Put("/workspaces/{id}/upload-policy", uploadPolicy.SetWorkspacePolicy)

		// M16 E50-S1 / E50-S3: upload moderation endpoints (queue/override/analytics).
		r.Get("/upload-moderation", uploadModeration.ListQueue)
		r.Post("/upload-moderation/{assetId}/override", uploadModeration.Override)
		r.Get("/upload-moderation/analytics", uploadModeration.Analytics)

		// M41 E14-S3: admin-initiated upload credit grant. Uses
		// credit.Service.GrantAdmin which writes both the ledger entry and
		// the audit_log row in one tx. Per-grant cap: GrantAdminHardCap
		// (100_000 credits). The RequirePlatformRole chain above ensures
		// only super_admin + admin can reach this handler; unauthenticated
		// and non-admin requests are blocked by middleware before arriving.
		r.Post("/workspaces/{id}/upload-credits/grant", uploadCreditGrant.Grant)

		// M41 FR-UCRT-10 follow-up: admin balance read for the
		// `/admin/upload-credits` page. Resolves the target workspace
		// from the URL (the user-facing `/api/v1/uploads/balance` uses
		// the caller's JWT workspace_id claim, which isn't the right
		// source here).
		r.Get("/workspaces/{id}/upload-credits/balance", uploadCreditGrant.Balance)
	})
}
