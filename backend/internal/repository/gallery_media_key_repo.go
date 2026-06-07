package repository

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/crypto"
)

// GalleryMediaKey stores the exportable raw media key needed to decrypt
// browser-encrypted gallery derivatives. Production wires an Envelope so the
// secret is encrypted at rest; local/test without a KEK falls back to the
// plaintext column to preserve Docker development ergonomics.
type GalleryMediaKey struct {
	ID          uuid.UUID  `json:"id"`
	GalleryID   uuid.UUID  `json:"gallery_id"`
	KeyID       string     `json:"key_id"`
	ExportedKey string     `json:"exported_key"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	UpdatedBy   *uuid.UUID `json:"updated_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type GalleryMediaKeyRepo struct {
	pool     *pgxpool.Pool
	envelope *crypto.Envelope
}

func NewGalleryMediaKeyRepo(pool *pgxpool.Pool) *GalleryMediaKeyRepo {
	return &GalleryMediaKeyRepo{pool: pool}
}

func (r *GalleryMediaKeyRepo) WithEnvelope(e *crypto.Envelope) *GalleryMediaKeyRepo {
	r.envelope = e
	return r
}

func (r *GalleryMediaKeyRepo) Upsert(ctx context.Context, key GalleryMediaKey) (*GalleryMediaKey, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("gallery media key repo: pool is nil")
	}
	key.KeyID = strings.TrimSpace(key.KeyID)
	key.ExportedKey = strings.TrimSpace(key.ExportedKey)
	if key.GalleryID == uuid.Nil {
		return nil, fmt.Errorf("gallery media key repo: gallery_id required")
	}
	if key.KeyID == "" {
		return nil, fmt.Errorf("gallery media key repo: key_id required")
	}
	if key.ExportedKey == "" {
		return nil, fmt.Errorf("gallery media key repo: exported_key required")
	}

	plaintextCol := key.ExportedKey
	var encryptedKey, dekWrapped []byte
	if r.envelope != nil {
		ct, dek, err := r.envelope.Encrypt([]byte(key.ExportedKey))
		if err != nil {
			return nil, fmt.Errorf("gallery media key encrypt: %w", err)
		}
		encryptedKey = ct
		dekWrapped = dek
		plaintextCol = ""
	}

	row := r.pool.QueryRow(ctx,
		`INSERT INTO gallery_media_keys (gallery_id, key_id, exported_key, encrypted_key, dek_wrapped,
		                                created_by, updated_by, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $6, now())
		 ON CONFLICT (gallery_id, key_id) DO UPDATE
		 SET exported_key = $3,
		     encrypted_key = $4,
		     dek_wrapped = $5,
		     updated_by = $6,
		     updated_at = now()
		 RETURNING id, gallery_id, key_id, COALESCE(exported_key, ''), encrypted_key, dek_wrapped,
		           created_by, updated_by, created_at, updated_at`,
		key.GalleryID, key.KeyID, plaintextCol, encryptedKey, dekWrapped, key.UpdatedBy,
	)
	return r.scan(row)
}

func (r *GalleryMediaKeyRepo) ListByGallery(ctx context.Context, galleryID uuid.UUID) ([]GalleryMediaKey, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("gallery media key repo: pool is nil")
	}
	if galleryID == uuid.Nil {
		return nil, fmt.Errorf("gallery media key repo: gallery_id required")
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, key_id, COALESCE(exported_key, ''), encrypted_key, dek_wrapped,
		        created_by, updated_by, created_at, updated_at
		 FROM gallery_media_keys
		 WHERE gallery_id = $1
		 ORDER BY updated_at DESC, created_at DESC`,
		galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("gallery media keys list: %w", err)
	}
	defer rows.Close()

	keys := make([]GalleryMediaKey, 0)
	for rows.Next() {
		key, err := r.scan(rows)
		if err != nil {
			return nil, err
		}
		keys = append(keys, *key)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("gallery media keys rows: %w", err)
	}
	return keys, nil
}

type galleryMediaKeyScanner interface {
	Scan(dest ...any) error
}

func (r *GalleryMediaKeyRepo) scan(row galleryMediaKeyScanner) (*GalleryMediaKey, error) {
	key := &GalleryMediaKey{}
	var legacyValue string
	var encryptedKey, dekWrapped []byte
	err := row.Scan(
		&key.ID,
		&key.GalleryID,
		&key.KeyID,
		&legacyValue,
		&encryptedKey,
		&dekWrapped,
		&key.CreatedBy,
		&key.UpdatedBy,
		&key.CreatedAt,
		&key.UpdatedAt,
	)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("gallery media key scan: %w", err)
	}
	exported, err := r.decryptIfNeeded(encryptedKey, dekWrapped, legacyValue)
	if err != nil {
		return nil, err
	}
	key.ExportedKey = exported
	return key, nil
}

func (r *GalleryMediaKeyRepo) decryptIfNeeded(encryptedKey, dekWrapped []byte, legacy string) (string, error) {
	if r.envelope != nil && len(encryptedKey) > 0 && len(dekWrapped) > 0 {
		plaintext, err := r.envelope.Decrypt(encryptedKey, dekWrapped)
		if err != nil {
			return "", fmt.Errorf("decrypt gallery media key: %w", err)
		}
		return string(plaintext), nil
	}
	return legacy, nil
}
