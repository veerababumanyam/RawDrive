package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

type PayoutHandler struct {
	repo      *repository.PayoutRepo
	dealerRepo *repository.DealerRepo
}

func NewPayoutHandler(repo *repository.PayoutRepo) *PayoutHandler {
	return &PayoutHandler{repo: repo}
}

func (h *PayoutHandler) ListPayouts(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Look up dealer by userID
	if h.dealerRepo == nil {
		http.Error(w, `{"error":"internal error: dealer repo not configured"}`, http.StatusInternalServerError)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	filter := repository.PayoutFilter{
		DealerID: dealer.ID,
		Limit:    20,
	}
	if s := r.URL.Query().Get("status"); s != "" {
		filter.Status = &s
	}
	if l := r.URL.Query().Get("limit"); l != "" {
		if lv, err := strconv.Atoi(l); err == nil && lv > 0 && lv <= 100 {
			filter.Limit = lv
		}
	}

	payouts, err := h.repo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, payouts)
}

func (h *PayoutHandler) ListStatements(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	if h.dealerRepo == nil {
		http.Error(w, `{"error":"internal error: dealer repo not configured"}`, http.StatusInternalServerError)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	yearStr := r.URL.Query().Get("year")
	if yearStr == "" {
		http.Error(w, `{"error":"year parameter required"}`, http.StatusBadRequest)
		return
	}
	year, err := strconv.Atoi(yearStr)
	if err != nil {
		http.Error(w, `{"error":"invalid year"}`, http.StatusBadRequest)
		return
	}

	// Get payouts for this dealer filtered by year in SQL
	yearStart := time.Date(year, 1, 1, 0, 0, 0, 0, time.UTC)
	yearEnd := time.Date(year+1, 1, 1, 0, 0, 0, 0, time.UTC)
	filter := repository.PayoutFilter{
		DealerID: dealer.ID,
		FromDate: &yearStart,
		ToDate:   &yearEnd,
		Limit:    12,
	}
	payouts, err := h.repo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	type StatementSummary struct {
		Month              string `json:"month"`
		GrossRevenuePaisa  int64  `json:"gross_revenue_paisa"`
		DealerSharePaisa   int64  `json:"dealer_share_paisa"`
		PlatformSharePaisa int64  `json:"platform_share_paisa"`
		PayoutStatus       string `json:"payout_status"`
		StatementPDFURL    string `json:"statement_pdf_url"`
	}

	statements := []StatementSummary{}
	for _, p := range payouts {
		month := p.PeriodStart.Format("2006-01")
		statements = append(statements, StatementSummary{
			Month:              month,
			GrossRevenuePaisa:  p.GrossAttributedRevenue,
			DealerSharePaisa:   p.CommissionEarned,
			PlatformSharePaisa: p.GrossAttributedRevenue - p.CommissionEarned,
			PayoutStatus:       p.Status,
			StatementPDFURL:    "/api/v1/dealers/statements/" + month + "/pdf",
		})
	}
	respondJSON(w, http.StatusOK, statements)
}

func (h *PayoutHandler) DownloadStatementPDF(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	// Verify the requesting user is a registered dealer
	if h.dealerRepo == nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	_, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusForbidden)
		return
	}

	month := chi.URLParam(r, "month")
	if month == "" {
		http.Error(w, `{"error":"month parameter required"}`, http.StatusBadRequest)
		return
	}

	// Generate a minimal PDF statement
	// In production, use a PDF library (e.g., jung-kurt/gofpdf)
	pdfContent := generateStatementPDF(month)

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="statement-`+month+`.pdf"`)
	w.WriteHeader(http.StatusOK)
	w.Write(pdfContent)
}

// generateStatementPDF creates a minimal valid PDF for the given month.
func generateStatementPDF(month string) []byte {
	// Minimal valid PDF structure
	title := "RawDrive Dealer Statement - " + month
	content := "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
		"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
		"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
		"4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 720 Td (" + title + ") Tj ET\nendstream\nendobj\n" +
		"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
		"xref\n0 6\n0000000000 65535 f \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF"
	return []byte(content)
}

func (h *PayoutHandler) ApprovePayout(w http.ResponseWriter, r *http.Request) {
	adminID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	payoutID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid payout id"}`, http.StatusBadRequest)
		return
	}
	// Validate status transition: only "pending" -> "approved"
	payout, err := h.repo.GetByID(r.Context(), payoutID)
	if err != nil {
		http.Error(w, `{"error":"payout not found"}`, http.StatusNotFound)
		return
	}
	if payout.Status != "pending" {
		http.Error(w, `{"error":"payout must be in pending status to approve"}`, http.StatusConflict)
		return
	}
	if err := h.repo.UpdateStatus(r.Context(), payoutID, "approved", &adminID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *PayoutHandler) ConfirmPayment(w http.ResponseWriter, r *http.Request) {
	payoutID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid payout id"}`, http.StatusBadRequest)
		return
	}
	var body struct {
		PaymentReference string `json:"payment_reference"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.PaymentReference == "" {
		http.Error(w, `{"error":"payment_reference required"}`, http.StatusBadRequest)
		return
	}
	// Validate status transition: only "processing" -> "paid"
	payout, err := h.repo.GetByID(r.Context(), payoutID)
	if err != nil {
		http.Error(w, `{"error":"payout not found"}`, http.StatusNotFound)
		return
	}
	if payout.Status != "processing" {
		http.Error(w, `{"error":"payout must be in processing status to confirm payment"}`, http.StatusConflict)
		return
	}
	if err := h.repo.MarkPaid(r.Context(), payoutID, body.PaymentReference); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
