package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/service"
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

	r.Route("/api/v1/admin", func(r chi.Router) {
		r.Use(middleware.RequireAuth)
		r.Use(middleware.RequirePlatformRole("super_admin", "admin"))

		r.Get("/users", users.List)
		r.Get("/users/{id}", users.GetByID)
		r.Post("/users/{id}/suspend", users.Suspend)
		r.Post("/users/{id}/reactivate", users.Reactivate)
		r.Post("/users/{id}/impersonate", users.Impersonate)
		r.Put("/users/{id}/role", users.ChangeRole)
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
		r.Get("/audit-logs/{id}", auditLogs.GetDetail)
	})
}
