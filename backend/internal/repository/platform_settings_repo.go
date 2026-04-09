package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PlatformSetting represents a single configuration setting.
type PlatformSetting struct {
	ID          uuid.UUID  `json:"id"`
	Category    string     `json:"category"`
	Key         string     `json:"key"`
	Value       string     `json:"value"`
	IsSecret    bool       `json:"is_secret"`
	Description string     `json:"description,omitempty"`
	UpdatedBy   *uuid.UUID `json:"updated_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// PlatformSettingsRepo handles platform settings persistence.
type PlatformSettingsRepo struct {
	pool *pgxpool.Pool
}

// NewPlatformSettingsRepo creates a new PlatformSettingsRepo.
func NewPlatformSettingsRepo(pool *pgxpool.Pool) *PlatformSettingsRepo {
	return &PlatformSettingsRepo{pool: pool}
}

// GetByKey retrieves a setting by category and key.
func (r *PlatformSettingsRepo) GetByKey(ctx context.Context, category, key string) (*PlatformSetting, error) {
	s := &PlatformSetting{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, category, key, value, is_secret, description, updated_by, created_at, updated_at
		 FROM platform_settings WHERE category = $1 AND key = $2`,
		category, key,
	).Scan(&s.ID, &s.Category, &s.Key, &s.Value, &s.IsSecret, &s.Description, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("platform settings get: %w", err)
	}
	return s, nil
}

// ListByCategory retrieves all settings for a category.
func (r *PlatformSettingsRepo) ListByCategory(ctx context.Context, category string) ([]PlatformSetting, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, category, key, value, is_secret, description, updated_by, created_at, updated_at
		 FROM platform_settings WHERE category = $1 ORDER BY key`,
		category,
	)
	if err != nil {
		return nil, fmt.Errorf("platform settings list: %w", err)
	}
	defer rows.Close()

	var settings []PlatformSetting
	for rows.Next() {
		var s PlatformSetting
		if err := rows.Scan(&s.ID, &s.Category, &s.Key, &s.Value, &s.IsSecret, &s.Description, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("platform settings scan: %w", err)
		}
		settings = append(settings, s)
	}
	return settings, rows.Err()
}

// ListCategories returns distinct categories.
func (r *PlatformSettingsRepo) ListCategories(ctx context.Context) ([]string, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT category FROM platform_settings ORDER BY category`)
	if err != nil {
		return nil, fmt.Errorf("platform settings categories: %w", err)
	}
	defer rows.Close()

	var cats []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

// Upsert creates or updates a setting.
func (r *PlatformSettingsRepo) Upsert(ctx context.Context, category, key, value string, isSecret bool, description string, updatedBy *uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO platform_settings (category, key, value, is_secret, description, updated_by, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, now())
		 ON CONFLICT (category, key) DO UPDATE
		 SET value = $3, is_secret = $4, description = COALESCE(NULLIF($5, ''), platform_settings.description),
		     updated_by = $6, updated_at = now()`,
		category, key, value, isSecret, description, updatedBy,
	)
	if err != nil {
		return fmt.Errorf("platform settings upsert: %w", err)
	}
	return nil
}

// Delete removes a setting.
func (r *PlatformSettingsRepo) Delete(ctx context.Context, category, key string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM platform_settings WHERE category = $1 AND key = $2`,
		category, key,
	)
	if err != nil {
		return fmt.Errorf("platform settings delete: %w", err)
	}
	return nil
}
