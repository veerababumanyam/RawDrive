package handler

import (
	"net/http"
	"time"

	"github.com/rawdrive/backend/internal/service"
)

type AdminAnalyticsHandler struct {
	svc *service.AdminAnalyticsService
}

func NewAdminAnalyticsHandler(svc *service.AdminAnalyticsService) *AdminAnalyticsHandler {
	return &AdminAnalyticsHandler{svc: svc}
}

func (h *AdminAnalyticsHandler) GetEngagement(w http.ResponseWriter, r *http.Request) {
	date := time.Now()
	result, err := h.svc.GetEngagement(r.Context(), date, nil)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminAnalyticsHandler) GetGrowth(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, _ := time.Parse(time.RFC3339, q.Get("from"))
	to, _ := time.Parse(time.RFC3339, q.Get("to"))
	if from.IsZero() {
		from = time.Now().AddDate(0, -1, 0)
	}
	if to.IsZero() {
		to = time.Now()
	}
	result, err := h.svc.GetGrowth(r.Context(), from, to)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}

func (h *AdminAnalyticsHandler) GetFeatureAdoption(w http.ResponseWriter, r *http.Request) {
	result, err := h.svc.GetFeatureAdoption(r.Context())
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, result)
}
