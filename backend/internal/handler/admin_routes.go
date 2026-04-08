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
		r.Use(middleware.RequireRole("super_admin"))

		r.Get("/users", users.List)
		r.Get("/users/{id}", users.GetByID)
		r.Post("/users/{id}/suspend", users.Suspend)
		r.Post("/users/{id}/reactivate", users.Reactivate)
		r.Post("/users/{id}/impersonate", users.Impersonate)
		r.Put("/users/{id}/role", users.ChangeRole)

		r.Get("/moderation", moderation.ListQueue)
		r.Put("/moderation/{id}/approve", moderation.Approve)
		r.Put("/moderation/{id}/reject", moderation.Reject)
		r.Put("/moderation/{id}/escalate", moderation.Escalate)

		r.Get("/workspaces", workspaces.List)
		r.Get("/workspaces/{id}", workspaces.GetByID)

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
