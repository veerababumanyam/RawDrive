package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/rawdrive/backend/internal/repository"
)

type SubDealerHandler struct {
	subDealerRepo *repository.SubDealerRepo
	dealerRepo    *repository.DealerRepo
}

func NewSubDealerHandler(subDealerRepo *repository.SubDealerRepo, dealerRepo *repository.DealerRepo) *SubDealerHandler {
	return &SubDealerHandler{subDealerRepo: subDealerRepo, dealerRepo: dealerRepo}
}

// List returns all sub-dealers registered under the authenticated dealer.
// GET /api/v1/dealer/sub-dealers
func (h *SubDealerHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}
	subs, err := h.subDealerRepo.ListByDealerID(r.Context(), dealer.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if subs == nil {
		subs = []repository.SubDealer{}
	}
	respondJSON(w, http.StatusOK, subs)
}

// Create registers a new sub-dealer under the authenticated dealer.
// POST /api/v1/dealer/sub-dealers
func (h *SubDealerHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := getUserID(r)
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	dealer, err := h.dealerRepo.GetByUserID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"not a registered dealer"}`, http.StatusNotFound)
		return
	}

	var body struct {
		Name         string `json:"name"`
		Email        string `json:"email"`
		Phone        string `json:"phone"`
		CityDistrict string `json:"city_district"`
		Notes        string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.CityDistrict) == "" {
		http.Error(w, `{"error":"city_district is required"}`, http.StatusBadRequest)
		return
	}

	sd, err := h.subDealerRepo.Create(r.Context(), repository.CreateSubDealerInput{
		DealerID:     dealer.ID,
		StateID:      dealer.StateID,
		Name:         strings.TrimSpace(body.Name),
		Email:        strings.TrimSpace(body.Email),
		Phone:        strings.TrimSpace(body.Phone),
		CityDistrict: strings.TrimSpace(body.CityDistrict),
		Notes:        strings.TrimSpace(body.Notes),
	})
	if err != nil {
		http.Error(w, `{"error":"failed to register sub-dealer"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, sd)
}
