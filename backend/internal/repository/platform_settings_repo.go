package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/crypto"
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
//
// F-005 (audit 2026-04-10): secret rows (is_secret = true) are encrypted at
// rest via envelope encryption when an Envelope is wired via WithEnvelope.
// Rows written before F-005 landed — and rows written in environments
// without a KEK — continue to use the plaintext `value` column, and reads
// transparently fall back to that column when the encrypted pair is absent.
// This keeps the existing call sites working without any API change.
type PlatformSettingsRepo struct {
	pool     *pgxpool.Pool
	envelope *crypto.Envelope // nil = legacy plaintext mode
}

// NewPlatformSettingsRepo creates a new PlatformSettingsRepo in legacy
// (plaintext) mode. Call WithEnvelope to enable at-rest encryption.
func NewPlatformSettingsRepo(pool *pgxpool.Pool) *PlatformSettingsRepo {
	return &PlatformSettingsRepo{pool: pool}
}

// WithEnvelope wires at-rest encryption. main.go calls this during bootstrap
// after loading PLATFORM_SETTINGS_KEK. Returns the same repo pointer so the
// call chains. Passing nil puts the repo back into legacy mode.
func (r *PlatformSettingsRepo) WithEnvelope(e *crypto.Envelope) *PlatformSettingsRepo {
	r.envelope = e
	return r
}

// decryptIfNeeded returns the plaintext value for a row, preferring the
// encrypted pair when available and the envelope is wired. Legacy rows that
// only have the plaintext column are returned as-is.
func (r *PlatformSettingsRepo) decryptIfNeeded(encrypted, dekWrapped []byte, legacy string) (string, error) {
	if r.envelope != nil && len(encrypted) > 0 && len(dekWrapped) > 0 {
		pt, err := r.envelope.Decrypt(encrypted, dekWrapped)
		if err != nil {
			return "", fmt.Errorf("decrypt platform setting: %w", err)
		}
		return string(pt), nil
	}
	return legacy, nil
}

// GetByKey retrieves a setting by category and key.
func (r *PlatformSettingsRepo) GetByKey(ctx context.Context, category, key string) (*PlatformSetting, error) {
	s := &PlatformSetting{}
	var legacyValue string
	var encryptedValue, dekWrapped []byte
	err := r.pool.QueryRow(ctx,
		`SELECT id, category, key, COALESCE(value, ''), encrypted_value, dek_wrapped,
		        is_secret, description, updated_by, created_at, updated_at
		 FROM platform_settings WHERE category = $1 AND key = $2`,
		category, key,
	).Scan(&s.ID, &s.Category, &s.Key, &legacyValue, &encryptedValue, &dekWrapped,
		&s.IsSecret, &s.Description, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("platform settings get: %w", err)
	}
	plaintext, err := r.decryptIfNeeded(encryptedValue, dekWrapped, legacyValue)
	if err != nil {
		return nil, err
	}
	s.Value = plaintext
	return s, nil
}

// ListByCategory retrieves all settings for a category.
func (r *PlatformSettingsRepo) ListByCategory(ctx context.Context, category string) ([]PlatformSetting, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, category, key, COALESCE(value, ''), encrypted_value, dek_wrapped,
		        is_secret, description, updated_by, created_at, updated_at
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
		var legacyValue string
		var encryptedValue, dekWrapped []byte
		if err := rows.Scan(&s.ID, &s.Category, &s.Key, &legacyValue, &encryptedValue, &dekWrapped,
			&s.IsSecret, &s.Description, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt); err != nil {
			return nil, fmt.Errorf("platform settings scan: %w", err)
		}
		plaintext, err := r.decryptIfNeeded(encryptedValue, dekWrapped, legacyValue)
		if err != nil {
			return nil, err
		}
		s.Value = plaintext
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
//
// F-005: when the envelope is wired AND the row is marked secret, the
// plaintext value is encrypted into the (encrypted_value, dek_wrapped) pair
// and the legacy `value` column is stored empty so the secret never touches
// disk in plaintext. Non-secret rows stay in the plaintext column for
// readability in DB dumps and operational queries. Legacy mode (no envelope)
// behaves exactly like the pre-F-005 implementation.
func (r *PlatformSettingsRepo) Upsert(ctx context.Context, category, key, value string, isSecret bool, description string, updatedBy *uuid.UUID) error {
	plaintextCol := value
	var encryptedValue, dekWrapped []byte

	if r.envelope != nil && isSecret {
		ct, dek, err := r.envelope.Encrypt([]byte(value))
		if err != nil {
			return fmt.Errorf("platform settings encrypt: %w", err)
		}
		encryptedValue = ct
		dekWrapped = dek
		plaintextCol = "" // never write plaintext for encrypted secrets
	}

	_, err := r.pool.Exec(ctx,
		`INSERT INTO platform_settings (category, key, value, encrypted_value, dek_wrapped,
		                                 is_secret, description, updated_by, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
		 ON CONFLICT (category, key) DO UPDATE
		 SET value = $3, encrypted_value = $4, dek_wrapped = $5, is_secret = $6,
		     description = COALESCE(NULLIF($7, ''), platform_settings.description),
		     updated_by = $8, updated_at = now()`,
		category, key, plaintextCol, encryptedValue, dekWrapped, isSecret, description, updatedBy,
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
