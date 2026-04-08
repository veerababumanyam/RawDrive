package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ConfigRepo handles ai_configs table operations for BYOK key management.
type ConfigRepo struct {
	pool   *pgxpool.Pool
	encKey []byte // 32-byte AES-256 encryption key
}

// NewConfigRepo creates a ConfigRepo with the given encryption key.
func NewConfigRepo(pool *pgxpool.Pool, encKey []byte) *ConfigRepo {
	return &ConfigRepo{pool: pool, encKey: encKey}
}

// Save stores an encrypted API key for a workspace.
func (r *ConfigRepo) Save(ctx context.Context, workspaceID uuid.UUID, provider, apiKey, model string) error {
	encrypted, err := Encrypt([]byte(apiKey), r.encKey)
	if err != nil {
		return fmt.Errorf("config repo: encrypt key: %w", err)
	}

	if model == "" {
		model = "gemini-2.0-flash"
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO ai_configs (workspace_id, provider, encrypted_key, model_preference, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $5)
		 ON CONFLICT (workspace_id, provider) DO UPDATE
		 SET encrypted_key = $3, model_preference = $4, updated_at = $5`,
		workspaceID, provider, encrypted, model, time.Now())
	if err != nil {
		return fmt.Errorf("config repo: save: %w", err)
	}
	return nil
}

// GetByWorkspace returns the AI config for a workspace (key is encrypted, not decrypted).
func (r *ConfigRepo) GetByWorkspace(ctx context.Context, workspaceID uuid.UUID) (*AIConfig, error) {
	var cfg AIConfig
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, provider, encrypted_key, model_preference,
		 monthly_cap_paisa, alert_80_sent, alert_100_sent, enabled, created_at, updated_at
		 FROM ai_configs WHERE workspace_id = $1 LIMIT 1`, workspaceID,
	).Scan(&cfg.ID, &cfg.WorkspaceID, &cfg.Provider, &cfg.EncryptedKey,
		&cfg.ModelPreference, &cfg.MonthlyCapPaisa, &cfg.Alert80Sent,
		&cfg.Alert100Sent, &cfg.Enabled, &cfg.CreatedAt, &cfg.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("config repo: get: %w", err)
	}
	return &cfg, nil
}

// GetDecryptedKey retrieves and decrypts the API key for a workspace.
func (r *ConfigRepo) GetDecryptedKey(ctx context.Context, workspaceID uuid.UUID) (string, string, error) {
	var encrypted, model string
	err := r.pool.QueryRow(ctx,
		`SELECT encrypted_key, model_preference FROM ai_configs
		 WHERE workspace_id = $1 AND enabled = TRUE LIMIT 1`, workspaceID,
	).Scan(&encrypted, &model)
	if err == pgx.ErrNoRows {
		return "", "", ErrNoAPIKey
	}
	if err != nil {
		return "", "", fmt.Errorf("config repo: get key: %w", err)
	}

	plaintext, err := Decrypt(encrypted, r.encKey)
	if err != nil {
		return "", "", fmt.Errorf("config repo: decrypt: %w", err)
	}
	return string(plaintext), model, nil
}

// Delete removes the AI config for a workspace.
func (r *ConfigRepo) Delete(ctx context.Context, workspaceID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM ai_configs WHERE workspace_id = $1`, workspaceID)
	return err
}

// UpsertCap sets the monthly spend cap for a workspace.
func (r *ConfigRepo) UpsertCap(ctx context.Context, workspaceID uuid.UUID, capPaisa int64) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO ai_configs (workspace_id, provider, encrypted_key, monthly_cap_paisa, updated_at)
		 VALUES ($1, 'gemini', '', $2, now())
		 ON CONFLICT (workspace_id, provider) DO UPDATE
		 SET monthly_cap_paisa = $2, updated_at = now()`,
		workspaceID, capPaisa)
	return err
}

// MarkAlert80Sent sets the 80% alert flag.
func (r *ConfigRepo) MarkAlert80Sent(ctx context.Context, workspaceID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_configs SET alert_80_sent = TRUE, updated_at = now() WHERE workspace_id = $1`,
		workspaceID)
	return err
}

// MarkAlert100Sent sets the 100% alert flag.
func (r *ConfigRepo) MarkAlert100Sent(ctx context.Context, workspaceID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_configs SET alert_100_sent = TRUE, updated_at = now() WHERE workspace_id = $1`,
		workspaceID)
	return err
}

// ResetAlertFlags clears both alert flags (called at month boundary).
func (r *ConfigRepo) ResetAlertFlags(ctx context.Context, workspaceID uuid.UUID) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_configs SET alert_80_sent = FALSE, alert_100_sent = FALSE, updated_at = now()
		 WHERE workspace_id = $1`, workspaceID)
	return err
}
