package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type StudioProjectHandler struct {
	projectRepo  *repository.StudioProjectRepo
	eventRepo    *repository.EventRepo
	invoiceRepo  *repository.InvoiceRepo
	contractRepo *repository.ContractRepo
}

func NewStudioProjectHandler(projectRepo *repository.StudioProjectRepo, eventRepo *repository.EventRepo, invoiceRepo *repository.InvoiceRepo, contractRepo *repository.ContractRepo) *StudioProjectHandler {
	return &StudioProjectHandler{projectRepo: projectRepo, eventRepo: eventRepo, invoiceRepo: invoiceRepo, contractRepo: contractRepo}
}

func (h *StudioProjectHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var project repository.StudioProject
	if err := json.NewDecoder(r.Body).Decode(&project); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	project.WorkspaceID = workspaceID
	if strings.TrimSpace(project.Name) == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	if project.ContactID == uuid.Nil {
		http.Error(w, `{"error":"contact_id required"}`, http.StatusBadRequest)
		return
	}
	if err := h.projectRepo.Create(r.Context(), &project); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create project failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, project)
}

func (h *StudioProjectHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	filter := repository.StudioProjectFilter{
		WorkspaceID: workspaceID,
		Status:      r.URL.Query().Get("status"),
		Search:      r.URL.Query().Get("search"),
		Limit:       50,
	}
	if contactIDRaw := r.URL.Query().Get("contact_id"); contactIDRaw != "" {
		id, err := uuid.Parse(contactIDRaw)
		if err != nil {
			http.Error(w, `{"error":"invalid contact_id"}`, http.StatusBadRequest)
			return
		}
		filter.ContactID = &id
	}
	projects, err := h.projectRepo.List(r.Context(), filter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"projects": projects})
}

func (h *StudioProjectHandler) GetAggregate(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	agg, err := h.projectRepo.GetAggregate(r.Context(), workspaceID, projectID)
	if err != nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	respondJSON(w, http.StatusOK, agg)
}

func (h *StudioProjectHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	current, err := h.projectRepo.GetByID(r.Context(), workspaceID, projectID)
	if err != nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	input := current
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	input.ID = projectID
	input.WorkspaceID = workspaceID
	input.SourceDealID = current.SourceDealID
	if input.ContactID == uuid.Nil {
		input.ContactID = current.ContactID
	}
	if strings.TrimSpace(input.Name) == "" {
		input.Name = current.Name
	}
	if err := h.projectRepo.Update(r.Context(), &input); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"update project failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, input)
}

func (h *StudioProjectHandler) CreateBooking(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	project, err := h.projectRepo.GetByID(r.Context(), workspaceID, projectID)
	if err != nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	var event repository.Event
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if event.StartAt.IsZero() || event.EndAt.IsZero() {
		http.Error(w, `{"error":"start_at and end_at required"}`, http.StatusBadRequest)
		return
	}
	if event.Title == "" {
		event.Title = project.Name
	}
	if event.EventType == "" {
		event.EventType = "shoot"
	}
	if event.Status == "" {
		event.Status = "confirmed"
	}
	event.WorkspaceID = workspaceID
	event.ContactID = &project.ContactID
	event.ProjectID = &project.ID
	if event.Status == "confirmed" {
		conflict, err := h.eventRepo.CheckConflict(r.Context(), workspaceID, event.StartAt, event.EndAt, nil)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if conflict {
			http.Error(w, `{"error":"time slot conflict with existing confirmed event"}`, http.StatusConflict)
			return
		}
	}
	if err := h.eventRepo.Create(r.Context(), &event); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create booking failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, event)
}

func (h *StudioProjectHandler) CreateInvoice(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	project, err := h.projectRepo.GetByID(r.Context(), workspaceID, projectID)
	if err != nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	var inv repository.Invoice
	if err := json.NewDecoder(r.Body).Decode(&inv); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	inv.WorkspaceID = workspaceID
	inv.ContactID = &project.ContactID
	inv.ProjectID = &project.ID
	if inv.Status == "" {
		inv.Status = "draft"
	}
	if inv.Currency == "" {
		inv.Currency = "INR"
	}
	inv.InvoiceType = service.NormalizeInvoiceDocumentType(inv.InvoiceType).DBValue()
	if len(inv.LineItems) == 0 {
		inv.LineItems = json.RawMessage(`[]`)
	}
	if inv.StateID == 0 {
		if sid := middleware.StateIDFromContext(r.Context()); sid != "" {
			if n, convErr := strconv.Atoi(sid); convErr == nil && n > 0 {
				inv.StateID = n
			}
		}
	}
	if inv.StateID == 0 {
		http.Error(w, `{"error":"state_id required: complete onboarding or send explicit state_id"}`, http.StatusBadRequest)
		return
	}
	if inv.TotalPaisa > 0 {
		inv.AmountInWords = service.AmountInWords(inv.TotalPaisa)
	}
	num, err := h.invoiceRepo.GetNextInvoiceNumber(r.Context(), workspaceID)
	if err != nil {
		http.Error(w, `{"error":"failed to generate invoice number"}`, http.StatusInternalServerError)
		return
	}
	inv.InvoiceNumber = num
	if err := h.invoiceRepo.Create(r.Context(), &inv); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create invoice failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, inv)
}

func (h *StudioProjectHandler) CreateContract(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	project, err := h.projectRepo.GetByID(r.Context(), workspaceID, projectID)
	if err != nil {
		http.Error(w, `{"error":"project not found"}`, http.StatusNotFound)
		return
	}
	var contract repository.Contract
	if err := json.NewDecoder(r.Body).Decode(&contract); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	contract.WorkspaceID = workspaceID
	contract.ContactID = project.ContactID
	contract.ProjectID = &project.ID
	if contract.Title == "" {
		contract.Title = project.Name + " Contract"
	}
	if contract.Status == "" {
		contract.Status = "draft"
	}
	if contract.ContentHTML == "" {
		contract.ContentHTML = ""
	}
	if err := h.contractRepo.Create(r.Context(), &contract); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create contract failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, contract)
}

func (h *StudioProjectHandler) LinkGallery(w http.ResponseWriter, r *http.Request) {
	workspaceID, projectID, ok := h.workspaceAndProjectID(w, r)
	if !ok {
		return
	}
	var body struct {
		GalleryID string `json:"gallery_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	galleryID, err := uuid.Parse(body.GalleryID)
	if err != nil {
		http.Error(w, `{"error":"invalid gallery_id"}`, http.StatusBadRequest)
		return
	}
	if err := h.projectRepo.LinkGallery(r.Context(), workspaceID, projectID, galleryID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"link gallery failed: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"status": "linked"})
}

func (h *StudioProjectHandler) workspaceAndProjectID(w http.ResponseWriter, r *http.Request) (uuid.UUID, uuid.UUID, bool) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return uuid.Nil, uuid.Nil, false
	}
	projectID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid project id"}`, http.StatusBadRequest)
		return uuid.Nil, uuid.Nil, false
	}
	return workspaceID, projectID, true
}
