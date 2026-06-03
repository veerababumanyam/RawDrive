package repository

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ShareLink represents a shareable gallery link.
type ShareLink struct {
	ID              uuid.UUID              `json:"id"`
	GalleryID       uuid.UUID              `json:"gallery_id"`
	Token           string                 `json:"token"`
	PinHash         *string                `json:"-"`
	ExpiresAt       *time.Time             `json:"expires_at,omitempty"`
	Permissions     map[string]interface{} `json:"permissions"`
	DownloadAllowed bool                   `json:"download_allowed"`
	MaxAccessCount  *int                   `json:"max_access_count,omitempty"`
	AccessCount     int                    `json:"access_count"`
	CreatedAt       time.Time              `json:"created_at"`
	RevokedAt       *time.Time             `json:"revoked_at,omitempty"`
}

// ShareLinkRepo handles share link persistence.
type ShareLinkRepo struct {
	pool *pgxpool.Pool
}

// NewShareLinkRepo creates a new ShareLinkRepo.
func NewShareLinkRepo(pool *pgxpool.Pool) *ShareLinkRepo {
	return &ShareLinkRepo{pool: pool}
}

func generateToken() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func shareLinkPermissionsJSONB(value map[string]interface{}) (string, error) {
	if value == nil {
		value = map[string]interface{}{}
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func shareLinkPermissionsFromJSONB(value []byte) (map[string]interface{}, error) {
	if len(value) == 0 || string(value) == "null" {
		return map[string]interface{}{}, nil
	}
	if !json.Valid(value) {
		return nil, fmt.Errorf("invalid json")
	}
	var permissions map[string]interface{}
	if err := json.Unmarshal(value, &permissions); err != nil {
		return nil, err
	}
	if permissions == nil {
		permissions = map[string]interface{}{}
	}
	return permissions, nil
}

// Create inserts a new share link.
func (r *ShareLinkRepo) Create(ctx context.Context, sl *ShareLink) error {
	if sl.ID == uuid.Nil {
		sl.ID = uuid.New()
	}
	if sl.Token == "" {
		sl.Token = generateToken()
	}
	sl.CreatedAt = time.Now()
	permissionsJSON, err := shareLinkPermissionsJSONB(sl.Permissions)
	if err != nil {
		return fmt.Errorf("share link permissions: %w", err)
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO share_links (id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed, max_access_count, access_count, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)`,
		sl.ID, sl.GalleryID, sl.Token, sl.PinHash, sl.ExpiresAt, permissionsJSON, sl.DownloadAllowed, sl.MaxAccessCount, sl.AccessCount, sl.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("share link create: %w", err)
	}
	return nil
}

// GetByToken retrieves an active share link by token.
func (r *ShareLinkRepo) GetByToken(ctx context.Context, token string) (*ShareLink, error) {
	sl := &ShareLink{}
	var permissionsJSON []byte
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed,
		        max_access_count, access_count, created_at, revoked_at
		 FROM share_links WHERE token = $1 AND revoked_at IS NULL`, token,
	).Scan(&sl.ID, &sl.GalleryID, &sl.Token, &sl.PinHash, &sl.ExpiresAt, &permissionsJSON,
		&sl.DownloadAllowed, &sl.MaxAccessCount, &sl.AccessCount, &sl.CreatedAt, &sl.RevokedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("share link get: %w", err)
	}
	sl.Permissions, err = shareLinkPermissionsFromJSONB(permissionsJSON)
	if err != nil {
		return nil, fmt.Errorf("share link permissions: %w", err)
	}
	return sl, nil
}

// ListByGallery returns all active share links for a gallery.
func (r *ShareLinkRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]ShareLink, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, token, pin_hash, expires_at, permissions, download_allowed,
		        max_access_count, access_count, created_at, revoked_at
		 FROM share_links WHERE gallery_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("share link list: %w", err)
	}
	defer rows.Close()

	var links []ShareLink
	for rows.Next() {
		var sl ShareLink
		var permissionsJSON []byte
		if err := rows.Scan(&sl.ID, &sl.GalleryID, &sl.Token, &sl.PinHash, &sl.ExpiresAt,
			&permissionsJSON, &sl.DownloadAllowed, &sl.MaxAccessCount, &sl.AccessCount,
			&sl.CreatedAt, &sl.RevokedAt); err != nil {
			return nil, fmt.Errorf("share link scan: %w", err)
		}
		permissions, err := shareLinkPermissionsFromJSONB(permissionsJSON)
		if err != nil {
			return nil, fmt.Errorf("share link permissions: %w", err)
		}
		sl.Permissions = permissions
		links = append(links, sl)
	}
	return links, rows.Err()
}

// IncrementAccessCount atomically bumps access_count and returns the new value.
// Returns ErrAccessLimitExceeded if max_access_count is set and already reached.
func (r *ShareLinkRepo) IncrementAccessCount(ctx context.Context, token string) (int, error) {
	var newCount int
	err := r.pool.QueryRow(ctx,
		`UPDATE share_links
		   SET access_count = access_count + 1
		 WHERE token = $1
		   AND revoked_at IS NULL
		   AND (max_access_count IS NULL OR access_count < max_access_count)
		 RETURNING access_count`,
		token,
	).Scan(&newCount)
	if err == pgx.ErrNoRows {
		return 0, ErrAccessLimitExceeded
	}
	if err != nil {
		return 0, fmt.Errorf("share link increment access: %w", err)
	}
	return newCount, nil
}

// ErrAccessLimitExceeded is returned when a share link has reached its max_access_count.
var ErrAccessLimitExceeded = fmt.Errorf("share link access limit exceeded")

// Revoke marks a share link as revoked.
func (r *ShareLinkRepo) Revoke(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`,
		now, id,
	)
	if err != nil {
		return fmt.Errorf("share link revoke: %w", err)
	}
	return nil
}

// RevokeInWorkspace marks a share link as revoked only when it belongs to a
// gallery owned by the given workspace. The ownership predicate is applied
// inside the same UPDATE so the check is atomic and TOCTOU-free (integration
// audit 2026-05-31). Returns the number of rows affected; 0 means the link
// either does not exist, is already revoked, or belongs to another tenant —
// callers must treat 0 as 404 so cross-tenant existence is not disclosed.
func (r *ShareLinkRepo) RevokeInWorkspace(ctx context.Context, linkID, workspaceID uuid.UUID) (int64, error) {
	now := time.Now()
	tag, err := r.pool.Exec(ctx,
		`UPDATE share_links SET revoked_at = $1
		 WHERE id = $2 AND revoked_at IS NULL
		   AND gallery_id IN (SELECT id FROM galleries WHERE workspace_id = $3)`,
		now, linkID, workspaceID,
	)
	if err != nil {
		return 0, fmt.Errorf("share link revoke in workspace: %w", err)
	}
	return tag.RowsAffected(), nil
}

// IncrementViewCount atomically increments the view counter for a share link.
func (r *ShareLinkRepo) IncrementViewCount(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET permissions = jsonb_set(
			COALESCE(permissions, '{}'::jsonb),
			'{view_count}',
			to_jsonb(COALESCE((permissions->>'view_count')::int, 0) + 1)
		) WHERE token = $1 AND revoked_at IS NULL`,
		token,
	)
	if err != nil {
		return fmt.Errorf("share link increment views: %w", err)
	}
	return nil
}

// IncrementDownloadCount atomically increments the download counter for a share link.
func (r *ShareLinkRepo) IncrementDownloadCount(ctx context.Context, token string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE share_links SET permissions = jsonb_set(
			COALESCE(permissions, '{}'::jsonb),
			'{download_count}',
			to_jsonb(COALESCE((permissions->>'download_count')::int, 0) + 1)
		) WHERE token = $1 AND revoked_at IS NULL`,
		token,
	)
	if err != nil {
		return fmt.Errorf("share link increment downloads: %w", err)
	}
	return nil
}
