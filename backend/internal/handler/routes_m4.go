package handler

import (
	"github.com/go-chi/chi/v5"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"

	"github.com/jackc/pgx/v5/pgxpool"
)

// M4Dependencies holds all dependencies needed for M4 route registration.
type M4Dependencies struct {
	DB               *pgxpool.Pool
	LeadRepo         *repository.LeadRepo
	ContactRepo      *repository.ContactRepo
	DealRepo         *repository.DealRepo
	InvoiceRepo      *repository.InvoiceRepo
	PaymentRepo      *repository.PaymentRepo
	ContractRepo     *repository.ContractRepo
	EventRepo        *repository.EventRepo
	NotificationRepo *repository.NotificationRepo
	// Optional: shared infrastructure wired in main.go. Nil-safe — handlers
	// degrade gracefully when these are not provided.
	PDFService             *service.PDFService
	NotificationDispatcher *NotificationDispatcher
}

// RegisterM4Routes registers all M4 (Business Operations) routes.
func RegisterM4Routes(r chi.Router, deps M4Dependencies) {
	leadHandler := NewLeadHandler(deps.LeadRepo).WithNotificationDispatcher(deps.NotificationDispatcher)
	contactHandler := NewContactHandler(deps.ContactRepo)
	dealHandler := NewDealHandler(deps.DealRepo)
	invoiceHandler := NewInvoiceHandler(deps.InvoiceRepo).WithPDFService(deps.PDFService)
	paymentHandler := NewPaymentHandler(deps.PaymentRepo, deps.InvoiceRepo)
	contractHandler := NewContractHandler(deps.ContractRepo).WithPDFService(deps.PDFService)
	calendarHandler := NewCalendarHandler(deps.EventRepo)
	notifHandler := NewNotificationHandler(deps.NotificationRepo)
	gstReportSvc := service.NewGSTReportService(deps.DB)
	gstReportHandler := NewGSTReportHandler(gstReportSvc)

	// CRM routes
	r.Route("/api/v1/crm", func(r chi.Router) {
		// Leads
		r.Route("/leads", func(r chi.Router) {
			r.Post("/", leadHandler.Create)
			r.Get("/", leadHandler.List)
			r.Get("/{id}", leadHandler.GetByID)
			r.Put("/{id}", leadHandler.Update)
			r.Patch("/{id}/stage", leadHandler.UpdateStage)
		})

		// Contacts
		r.Route("/contacts", func(r chi.Router) {
			r.Post("/", contactHandler.Create)
			r.Get("/", contactHandler.List)
			r.Get("/{id}", contactHandler.GetByID)
			r.Put("/{id}", contactHandler.Update)
			r.Post("/merge", contactHandler.Merge)
			r.Post("/import", contactHandler.ImportCSV)
		})

		// Deals
		r.Route("/deals", func(r chi.Router) {
			r.Post("/", dealHandler.Create)
			r.Get("/", dealHandler.List)
			r.Get("/{id}", dealHandler.GetByID)
			r.Put("/{id}", dealHandler.Update)
		})

		// Follow-ups
		r.Route("/follow-ups", func(r chi.Router) {
			r.Post("/", dealHandler.CreateFollowUp)
			r.Get("/", dealHandler.ListFollowUps)
			r.Patch("/{id}/complete", dealHandler.CompleteFollowUp)
		})
	})

	// Billing routes
	r.Route("/api/v1/billing", func(r chi.Router) {
		r.Route("/invoices", func(r chi.Router) {
			r.Post("/", invoiceHandler.Create)
			r.Get("/", invoiceHandler.List)
			r.Get("/{id}", invoiceHandler.GetByID)
			r.Get("/{id}/pdf", invoiceHandler.DownloadPDF)
			// Payment recording and listing per invoice
			r.Post("/{id}/payments", paymentHandler.RecordPayment)
			r.Get("/{id}/payments", paymentHandler.ListByInvoice)
			r.Post("/{id}/payment-link", paymentHandler.GeneratePaymentLink)
		})

		// GST Reports
		r.Route("/reports", func(r chi.Router) {
			r.Get("/gstr1", gstReportHandler.GSTR1)
			r.Get("/gstr3b", gstReportHandler.GSTR3B)
			r.Get("/revenue", gstReportHandler.Revenue)
		})
	})

	// Contract routes
	r.Route("/api/v1/contracts", func(r chi.Router) {
		r.Route("/templates", func(r chi.Router) {
			r.Post("/", contractHandler.CreateTemplate)
			r.Get("/", contractHandler.ListTemplates)
		})
		r.Post("/", contractHandler.Create)
		r.Get("/", contractHandler.List)
		r.Get("/{id}", contractHandler.GetByID)
		r.Get("/{id}/pdf", contractHandler.DownloadPDF)
	})

	// Shared alias under /api/v1/invoices/{id}/pdf (in addition to the
	// billing path) for callers that prefer the resource-level URL scheme.
	r.Get("/api/v1/invoices/{id}/pdf", invoiceHandler.DownloadPDF)

	// Calendar routes
	r.Route("/api/v1/calendar", func(r chi.Router) {
		r.Route("/events", func(r chi.Router) {
			r.Post("/", calendarHandler.CreateEvent)
			r.Get("/", calendarHandler.ListEvents)
			r.Get("/{id}", calendarHandler.GetEvent)
			r.Put("/{id}", calendarHandler.UpdateEvent)
			r.Delete("/{id}", calendarHandler.DeleteEvent)
		})
		r.Get("/export.ics", calendarHandler.ExportICS)
	})

	// Notification routes
	r.Route("/api/v1/notifications", func(r chi.Router) {
		r.Get("/", notifHandler.List)
		r.Put("/{id}/read", notifHandler.MarkRead)
		r.Put("/read-all", notifHandler.MarkAllRead)
		r.Get("/preferences", notifHandler.GetPreferences)
		r.Put("/preferences", notifHandler.UpdatePreference)
	})
}
