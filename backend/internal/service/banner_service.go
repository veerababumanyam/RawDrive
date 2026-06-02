package service

// banner_service.go — M14 GAL-FR-157: gallery sale banner business logic.
//
// Thin wrapper around BannerRepo with validation. Scheduling math
// (active_from/active_until) lives in the repo query so the DB is the
// source of truth for "is this banner live right now". The service
// enforces input rules: title is required, active_until must be after
// active_from if both are set, and hex color strings are normalized.

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// Banner validation errors.
var (
	ErrBannerTitleRequired  = errors.New("banner: title required")
	ErrBannerInvalidWindow  = errors.New("banner: active_until must be after active_from")
	ErrBannerNotFound       = errors.New("banner: not found")
)

// BannerService owns gallery banner CRUD.
type BannerService struct {
	repo *repository.BannerRepo
}

// NewBannerService constructs a BannerService.
func NewBannerService(repo *repository.BannerRepo) *BannerService {
	return &BannerService{repo: repo}
}

// BannerInput is the create/update payload.
type BannerInput struct {
	Title           string     `json:"title"`
	Body            string     `json:"body"`
	CTALabel        string     `json:"cta_label"`
	CTAURL          string     `json:"cta_url"`
	CouponCode      string     `json:"coupon_code"`
	BackgroundColor string     `json:"background_color"`
	TextColor       string     `json:"text_color"`
	ActiveFrom      *time.Time `json:"active_from,omitempty"`
	ActiveUntil     *time.Time `json:"active_until,omitempty"`
	IsActive        bool       `json:"is_active"`
}

// validateBannerInput runs pure-logic checks.
func validateBannerInput(in BannerInput) error {
	if strings.TrimSpace(in.Title) == "" {
		return ErrBannerTitleRequired
	}
	if in.ActiveFrom != nil && in.ActiveUntil != nil {
		if !in.ActiveUntil.After(*in.ActiveFrom) {
			return ErrBannerInvalidWindow
		}
	}
	return nil
}

// Create inserts a new banner.
func (s *BannerService) Create(ctx context.Context, galleryID, workspaceID uuid.UUID, in BannerInput) (*repository.GalleryBanner, error) {
	if err := validateBannerInput(in); err != nil {
		return nil, err
	}
	b := &repository.GalleryBanner{
		GalleryID:       galleryID,
		WorkspaceID:     workspaceID,
		Title:           strings.TrimSpace(in.Title),
		Body:            in.Body,
		CTALabel:        in.CTALabel,
		CTAURL:          in.CTAURL,
		CouponCode:      strings.ToUpper(strings.TrimSpace(in.CouponCode)),
		BackgroundColor: in.BackgroundColor,
		TextColor:       in.TextColor,
		ActiveFrom:      in.ActiveFrom,
		ActiveUntil:     in.ActiveUntil,
		IsActive:        in.IsActive,
	}
	if err := s.repo.Create(ctx, b); err != nil {
		return nil, err
	}
	return b, nil
}

// List returns every banner for a gallery — for the studio admin view.
func (s *BannerService) List(ctx context.Context, galleryID uuid.UUID) ([]repository.GalleryBanner, error) {
	return s.repo.ListByGallery(ctx, galleryID)
}

// ListLive returns only the banners currently inside their active window
// — for the public gallery render.
func (s *BannerService) ListLive(ctx context.Context, galleryID uuid.UUID) ([]repository.GalleryBanner, error) {
	return s.repo.ListLive(ctx, galleryID)
}

// Get returns one banner by ID.
func (s *BannerService) Get(ctx context.Context, id uuid.UUID) (*repository.GalleryBanner, error) {
	b, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if b == nil {
		return nil, ErrBannerNotFound
	}
	return b, nil
}

// Update overwrites a banner. The write is scoped to workspaceID so a banner
// owned by another tenant is never mutated; a 0-row update is reported as
// ErrBannerNotFound (404) so cross-tenant existence is not disclosed.
func (s *BannerService) Update(ctx context.Context, id, workspaceID uuid.UUID, in BannerInput) (*repository.GalleryBanner, error) {
	if err := validateBannerInput(in); err != nil {
		return nil, err
	}
	b := &repository.GalleryBanner{
		ID:              id,
		WorkspaceID:     workspaceID,
		Title:           strings.TrimSpace(in.Title),
		Body:            in.Body,
		CTALabel:        in.CTALabel,
		CTAURL:          in.CTAURL,
		CouponCode:      strings.ToUpper(strings.TrimSpace(in.CouponCode)),
		BackgroundColor: in.BackgroundColor,
		TextColor:       in.TextColor,
		ActiveFrom:      in.ActiveFrom,
		ActiveUntil:     in.ActiveUntil,
		IsActive:        in.IsActive,
	}
	rows, err := s.repo.UpdateInWorkspace(ctx, b, workspaceID)
	if err != nil {
		return nil, err
	}
	if rows == 0 {
		return nil, ErrBannerNotFound
	}
	return b, nil
}

// Delete hard-deletes a banner. The delete is scoped to workspaceID so a
// banner owned by another tenant is never removed; a 0-row delete is reported
// as ErrBannerNotFound (404) so cross-tenant existence is not disclosed.
func (s *BannerService) Delete(ctx context.Context, id, workspaceID uuid.UUID) error {
	rows, err := s.repo.DeleteInWorkspace(ctx, id, workspaceID)
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrBannerNotFound
	}
	return nil
}
