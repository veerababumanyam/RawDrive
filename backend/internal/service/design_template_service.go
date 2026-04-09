package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// DesignTemplateService manages gallery design templates.
type DesignTemplateService struct {
	templateRepo *repository.DesignTemplateRepo
	galleryRepo  *repository.GalleryRepo
}

// NewDesignTemplateService creates a new DesignTemplateService.
func NewDesignTemplateService(tr *repository.DesignTemplateRepo, gr *repository.GalleryRepo) *DesignTemplateService {
	return &DesignTemplateService{templateRepo: tr, galleryRepo: gr}
}

// CreateTemplate creates a new design template for a workspace.
func (s *DesignTemplateService) CreateTemplate(ctx context.Context, workspaceID uuid.UUID, name, description string, config map[string]interface{}, createdBy *uuid.UUID) (*repository.DesignTemplate, error) {
	if name == "" {
		return nil, fmt.Errorf("template name is required")
	}
	t := &repository.DesignTemplate{
		WorkspaceID: workspaceID,
		Name:        name,
		Description: description,
		Config:      config,
		CreatedBy:   createdBy,
	}
	if err := s.templateRepo.Create(ctx, t); err != nil {
		return nil, err
	}
	return t, nil
}

// GetTemplate retrieves a template by ID.
func (s *DesignTemplateService) GetTemplate(ctx context.Context, id uuid.UUID) (*repository.DesignTemplate, error) {
	return s.templateRepo.GetByID(ctx, id)
}

// ListTemplates retrieves all templates for a workspace.
func (s *DesignTemplateService) ListTemplates(ctx context.Context, workspaceID uuid.UUID) ([]repository.DesignTemplate, error) {
	return s.templateRepo.ListByWorkspace(ctx, workspaceID)
}

// UpdateTemplate modifies an existing template.
func (s *DesignTemplateService) UpdateTemplate(ctx context.Context, id uuid.UUID, name, description string, config map[string]interface{}) error {
	t, err := s.templateRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if t == nil {
		return fmt.Errorf("template not found: %s", id)
	}
	if name != "" {
		t.Name = name
	}
	t.Description = description
	if config != nil {
		t.Config = config
	}
	return s.templateRepo.Update(ctx, t)
}

// DeleteTemplate soft-deletes a template.
func (s *DesignTemplateService) DeleteTemplate(ctx context.Context, id uuid.UUID) error {
	return s.templateRepo.SoftDelete(ctx, id)
}

// RestoreTemplate recovers a soft-deleted template.
func (s *DesignTemplateService) RestoreTemplate(ctx context.Context, id uuid.UUID) error {
	return s.templateRepo.Restore(ctx, id)
}

// ApplyTemplate applies a template's config to a gallery's design_config.
func (s *DesignTemplateService) ApplyTemplate(ctx context.Context, galleryID, templateID uuid.UUID) error {
	t, err := s.templateRepo.GetByID(ctx, templateID)
	if err != nil {
		return err
	}
	if t == nil {
		return fmt.Errorf("template not found: %s", templateID)
	}

	configBytes, err := json.Marshal(t.Config)
	if err != nil {
		return fmt.Errorf("marshal template config: %w", err)
	}

	var designConfig GalleryDesignConfig
	if err := json.Unmarshal(configBytes, &designConfig); err != nil {
		return fmt.Errorf("unmarshal template config: %w", err)
	}

	designConfig.Template = &TemplateRef{
		ID:   templateID,
		Name: t.Name,
	}

	return updateGalleryDesignConfig(ctx, s.galleryRepo, galleryID, &designConfig)
}

func updateGalleryDesignConfig(ctx context.Context, repo *repository.GalleryRepo, galleryID uuid.UUID, config *GalleryDesignConfig) error {
	gallery, err := repo.GetByID(ctx, galleryID)
	if err != nil {
		return err
	}
	if gallery == nil {
		return fmt.Errorf("gallery not found: %s", galleryID)
	}

	configBytes, err := json.Marshal(config)
	if err != nil {
		return fmt.Errorf("marshal design config: %w", err)
	}

	var configMap map[string]interface{}
	if err := json.Unmarshal(configBytes, &configMap); err != nil {
		return fmt.Errorf("unmarshal design config map: %w", err)
	}

	if gallery.Settings == nil {
		gallery.Settings = make(map[string]interface{})
	}
	gallery.Settings["design_config"] = configMap

	return repo.Update(ctx, gallery)
}
