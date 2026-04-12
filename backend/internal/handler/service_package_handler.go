package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

type ServicePackageHandler struct {
	repo *repository.ServicePackageRepo
}

func NewServicePackageHandler(repo *repository.ServicePackageRepo) *ServicePackageHandler {
	return &ServicePackageHandler{repo: repo}
}

func (h *ServicePackageHandler) Create(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	var pkg repository.ServicePackage
	if err := json.NewDecoder(r.Body).Decode(&pkg); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	pkg.WorkspaceID = workspaceID
	if pkg.Name == "" {
		http.Error(w, `{"error":"name required"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.Create(r.Context(), &pkg); err != nil {
		http.Error(w, `{"error":"create package failed"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusCreated, pkg)
}

func (h *ServicePackageHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	includeInactive := r.URL.Query().Get("include_inactive") == "true"
	packages, err := h.repo.List(r.Context(), workspaceID, includeInactive)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, packages)
}

func (h *ServicePackageHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid package id"}`, http.StatusBadRequest)
		return
	}
	pkg, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	respondJSON(w, http.StatusOK, pkg)
}

func (h *ServicePackageHandler) Update(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid package id"}`, http.StatusBadRequest)
		return
	}
	var pkg repository.ServicePackage
	if err := json.NewDecoder(r.Body).Decode(&pkg); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	pkg.ID = id
	pkg.WorkspaceID = workspaceID
	if err := h.repo.Update(r.Context(), &pkg); err != nil {
		status := http.StatusInternalServerError
		if err == pgx.ErrNoRows {
			status = http.StatusNotFound
		}
		http.Error(w, `{"error":"update package failed"}`, status)
		return
	}
	respondJSON(w, http.StatusOK, pkg)
}

func (h *ServicePackageHandler) Delete(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid package id"}`, http.StatusBadRequest)
		return
	}
	if err := h.repo.Deactivate(r.Context(), workspaceID, id); err != nil {
		status := http.StatusInternalServerError
		if err == pgx.ErrNoRows {
			status = http.StatusNotFound
		}
		http.Error(w, `{"error":"delete package failed"}`, status)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *ServicePackageHandler) ExpandLineItems(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid package id"}`, http.StatusBadRequest)
		return
	}
	pkg, err := h.repo.GetByID(r.Context(), workspaceID, id)
	if err == pgx.ErrNoRows {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	addons := make([]service.PackageAddon, 0, len(pkg.Addons))
	for _, addon := range pkg.Addons {
		addons = append(addons, service.PackageAddon{
			Name:        addon.Name,
			PricePaisa:  addon.PricePaisa,
			Description: addon.Description,
		})
	}
	items := service.ExpandServicePackageLineItems(service.ServicePackage{
		Name:           pkg.Name,
		Description:    pkg.Description,
		Inclusions:     pkg.Inclusions,
		BasePricePaisa: pkg.BasePricePaisa,
		GSTRate:        pkg.GSTRate,
		SACCode:        pkg.SACCode,
		SelectedAddons: addons,
	})
	respondJSON(w, http.StatusOK, map[string]any{"line_items": items})
}
