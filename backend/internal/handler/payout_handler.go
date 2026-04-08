package handler

import (
	"net/http"

	"github.com/rawdrive/backend/internal/repository"
)

type PayoutHandler struct {
	repo *repository.PayoutRepo
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
	// In real impl, look up dealer by userID
	_ = userID
	respondJSON(w, http.StatusOK, []repository.Payout{})
}

func (h *PayoutHandler) ListStatements(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, []map[string]any{})
}

func (h *PayoutHandler) DownloadStatementPDF(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `attachment; filename="statement.pdf"`)
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("%PDF-1.4 placeholder"))
}
