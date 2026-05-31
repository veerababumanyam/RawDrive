package repository

// banner_repo.go — M14 GAL-FR-157: gallery sale banner persistence.
//
// Banners are promotional strips that appear on a public gallery page.
// The schema is defined in migration 051_gallery_banners.up.sql and
// supports scheduling via active_from/active_until so studios can
// prepare campaigns in advance. A soft is_active flag lets studios
// pause a banner without losing its content.
//
// The repo exposes CRUD plus a `ListLive` method that returns banners
// that are currently within their active window — this is the method
// public gallery rendering should use.

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GalleryBanner is a row in gallery_banners.
type GalleryBanner struct {
	ID              uuid.UUID  `json:"id"`
	GalleryID       uuid.UUID  `json:"gallery_id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	Title           string     `json:"title"`
	Body            string     `json:"body,omitempty"`
	CTALabel        string     `json:"cta_label,omitempty"`
	CTAURL          string     `json:"cta_url,omitempty"`
	CouponCode      string     `json:"coupon_code,omitempty"`
	BackgroundColor string     `json:"background_color,omitempty"`
	TextColor       string     `json:"text_color,omitempty"`
	ActiveFrom      *time.Time `json:"active_from,omitempty"`
	ActiveUntil     *time.Time `json:"active_until,omitempty"`
	IsActive        bool       `json:"is_active"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// BannerRepo handles gallery_banners persistence.
type BannerRepo struct {
	pool *pgxpool.Pool
}

// NewBannerRepo creates a new BannerRepo.
func NewBannerRepo(pool *pgxpool.Pool) *BannerRepo {
	return &BannerRepo{pool: pool}
}

// Create inserts a new banner. ID and timestamps are set if blank.
func (r *BannerRepo) Create(ctx context.Context, b *GalleryBanner) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	now := time.Now().UTC()
	if b.CreatedAt.IsZero() {
		b.CreatedAt = now
	}
	b.UpdatedAt = now
	_, err := r.pool.Exec(ctx,
		`INSERT INTO gallery_banners
		   (id, gallery_id, workspace_id, title, body, cta_label, cta_url,
		    coupon_code, background_color, text_color, active_from,
		    active_until, is_active, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		b.ID, b.GalleryID, b.WorkspaceID, b.Title, b.Body, b.CTALabel, b.CTAURL,
		b.CouponCode, b.BackgroundColor, b.TextColor, b.ActiveFrom,
		b.ActiveUntil, b.IsActive, b.CreatedAt, b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("banner repo create: %w", err)
	}
	return nil
}

// GetByID returns one banner or (nil, nil).
func (r *BannerRepo) GetByID(ctx context.Context, id uuid.UUID) (*GalleryBanner, error) {
	row := r.pool.QueryRow(ctx, bannerSelectCols+` FROM gallery_banners WHERE id=$1`, id)
	return scanBanner(row)
}

// ListByGallery returns every banner (live or not) for a gallery.
func (r *BannerRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]GalleryBanner, error) {
	rows, err := r.pool.Query(ctx,
		bannerSelectCols+` FROM gallery_banners
		 WHERE gallery_id=$1
		 ORDER BY created_at DESC`, galleryID)
	if err != nil {
		return nil, fmt.Errorf("banner repo list: %w", err)
	}
	defer rows.Close()
	return scanBanners(rows)
}

// ListLive returns banners that should render right now: is_active=true,
// active_from NULL or in the past, active_until NULL or in the future.
// This is the method public gallery rendering should call.
func (r *BannerRepo) ListLive(ctx context.Context, galleryID uuid.UUID) ([]GalleryBanner, error) {
	now := time.Now().UTC()
	rows, err := r.pool.Query(ctx,
		bannerSelectCols+` FROM gallery_banners
		 WHERE gallery_id=$1
		   AND is_active=true
		   AND (active_from IS NULL OR active_from <= $2)
		   AND (active_until IS NULL OR active_until >= $2)
		 ORDER BY created_at DESC`, galleryID, now)
	if err != nil {
		return nil, fmt.Errorf("banner repo list live: %w", err)
	}
	defer rows.Close()
	return scanBanners(rows)
}

// Update overwrites title, body, CTA fields, scheduling, and active flag.
func (r *BannerRepo) Update(ctx context.Context, b *GalleryBanner) error {
	b.UpdatedAt = time.Now().UTC()
	_, err := r.pool.Exec(ctx,
		`UPDATE gallery_banners SET
		   title=$2, body=$3, cta_label=$4, cta_url=$5, coupon_code=$6,
		   background_color=$7, text_color=$8, active_from=$9,
		   active_until=$10, is_active=$11, updated_at=$12
		 WHERE id=$1`,
		b.ID, b.Title, b.Body, b.CTALabel, b.CTAURL, b.CouponCode,
		b.BackgroundColor, b.TextColor, b.ActiveFrom, b.ActiveUntil,
		b.IsActive, b.UpdatedAt)
	if err != nil {
		return fmt.Errorf("banner repo update: %w", err)
	}
	return nil
}

// UpdateInWorkspace overwrites a banner atomically scoped to its owning
// workspace. The workspace_id predicate makes the ownership check and the
// write a single statement (no TOCTOU). Returns the number of rows affected;
// 0 means the banner does not exist OR belongs to another workspace — callers
// treat both as not-found so cross-tenant existence is never disclosed.
func (r *BannerRepo) UpdateInWorkspace(ctx context.Context, b *GalleryBanner, workspaceID uuid.UUID) (int64, error) {
	b.UpdatedAt = time.Now().UTC()
	tag, err := r.pool.Exec(ctx,
		`UPDATE gallery_banners SET
		   title=$2, body=$3, cta_label=$4, cta_url=$5, coupon_code=$6,
		   background_color=$7, text_color=$8, active_from=$9,
		   active_until=$10, is_active=$11, updated_at=$12
		 WHERE id=$1 AND workspace_id=$13`,
		b.ID, b.Title, b.Body, b.CTALabel, b.CTAURL, b.CouponCode,
		b.BackgroundColor, b.TextColor, b.ActiveFrom, b.ActiveUntil,
		b.IsActive, b.UpdatedAt, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("banner repo update in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
}

// Delete removes a banner row outright. This is a hard delete; the soft
// variant is UPDATE ... SET is_active=false.
func (r *BannerRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM gallery_banners WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("banner repo delete: %w", err)
	}
	return nil
}

// DeleteInWorkspace hard-deletes a banner atomically scoped to its owning
// workspace. The workspace_id predicate fuses the ownership check with the
// delete (no TOCTOU). Returns the number of rows affected; 0 means the banner
// does not exist OR belongs to another workspace — callers treat both as
// not-found so cross-tenant existence is never disclosed.
func (r *BannerRepo) DeleteInWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`DELETE FROM gallery_banners WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	if err != nil {
		return 0, fmt.Errorf("banner repo delete in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
}

// bannerSelectCols is the shared SELECT prefix to keep Scan in sync.
const bannerSelectCols = `SELECT id, gallery_id, workspace_id, title, body, cta_label, cta_url,
	coupon_code, background_color, text_color, active_from, active_until,
	is_active, created_at, updated_at`

// scanBanner scans a single row into a GalleryBanner.
func scanBanner(row pgx.Row) (*GalleryBanner, error) {
	b := &GalleryBanner{}
	err := row.Scan(&b.ID, &b.GalleryID, &b.WorkspaceID, &b.Title, &b.Body,
		&b.CTALabel, &b.CTAURL, &b.CouponCode, &b.BackgroundColor, &b.TextColor,
		&b.ActiveFrom, &b.ActiveUntil, &b.IsActive, &b.CreatedAt, &b.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("banner repo scan: %w", err)
	}
	return b, nil
}

// scanBanners scans a Rows set into a slice.
func scanBanners(rows pgx.Rows) ([]GalleryBanner, error) {
	banners := make([]GalleryBanner, 0)
	for rows.Next() {
		b := GalleryBanner{}
		if err := rows.Scan(&b.ID, &b.GalleryID, &b.WorkspaceID, &b.Title,
			&b.Body, &b.CTALabel, &b.CTAURL, &b.CouponCode, &b.BackgroundColor,
			&b.TextColor, &b.ActiveFrom, &b.ActiveUntil, &b.IsActive,
			&b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, fmt.Errorf("banner repo scan: %w", err)
		}
		banners = append(banners, b)
	}
	return banners, rows.Err()
}
