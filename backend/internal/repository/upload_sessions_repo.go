package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// F-013 (M17 wave 4): persistent TUS upload session repository.
//
// This repo is the durability layer for chunked_upload.go's future
// rewrite. The current handler keeps session state in a sync.Map and
// stages bytes on local disk — both are hard-law violations:
//
//   - Local disk staging violates the "no local storage" rule (F-008).
//   - In-memory session state orphans in-flight uploads on restart (F-013).
//
// Wave 4 ships the repo + schema so the Round 2 handler rewrite can
// cut over without co-designing persistence + R2 streaming in one step.

// UploadSession is the DB row shape for upload_sessions. Mirrors the
// migration 066 schema one-to-one except that scan_manifest is exposed
// as a []byte so callers can pick their own JSON type.
type UploadSession struct {
	ID                     uuid.UUID  `json:"id"`
	WorkspaceID            uuid.UUID  `json:"workspace_id"`
	UserID                 uuid.UUID  `json:"user_id"`
	TUSUploadID            string     `json:"tus_upload_id"`
	Filename               string     `json:"filename"`
	ContentType            string     `json:"content_type"`
	TotalSize              int64      `json:"total_size"`
	UploadOffset           int64      `json:"upload_offset"`
	ChunkSize              int64      `json:"chunk_size"`
	R2MultipartUploadID    *string    `json:"r2_multipart_upload_id,omitempty"`
	R2PartETags            []byte     `json:"-"` // raw jsonb — caller decides type
	ExpiresAt              time.Time  `json:"expires_at"`
	CreatedAt              time.Time  `json:"created_at"`
	UpdatedAt              time.Time  `json:"updated_at"`
	CompletedAt            *time.Time `json:"completed_at,omitempty"`
	ScanManifest           []byte     `json:"-"`
	MediaEncryption        []byte     `json:"-"`
	SourceMetadata         []byte     `json:"-"`
	ScanManifestVerifiedAt *time.Time `json:"scan_manifest_verified_at,omitempty"`
	// M40 / Upload Credit Meter: FK into upload_ledger_entries for the
	// reserve entry created at CreateSession time. Nullable when the
	// credit feature is off (NoopGate) or on enterprise unlimited_passthrough
	// where no balance is tracked. Migration 100 adds the column; this
	// field lets cold-path restart rebuild the reservation handle instead
	// of relying on TTL cleanup to unwind the ledger entry.
	CreditReservationID *uuid.UUID `json:"credit_reservation_id,omitempty"`

	// S3-G4 / AREA-UPLOADER-3 (audit 2026-05-31): the destination gallery
	// (and optional album) the upload is bound for. Persisted at CreateSession
	// time so finalizeUpload can link the finalized asset into the gallery
	// server-side, in the same flow as the asset insert, instead of relying on
	// a best-effort client call after finalize returns. Both are nullable:
	// when absent the session behaves exactly as the legacy client-link flow
	// (no server-side link). Migration 134 adds the columns.
	GalleryID *uuid.UUID `json:"gallery_id,omitempty"`
	AlbumID   *uuid.UUID `json:"album_id,omitempty"`
}

// UploadPartETag is the decoded shape of one entry in r2_part_etags.
// The handler's finalize path builds this from the R2 UploadPart
// response and appends via AppendPartETag.
type UploadPartETag struct {
	PartNumber int    `json:"part_number"`
	ETag       string `json:"etag"`
	Size       int64  `json:"size"`
	SHA256     string `json:"sha256,omitempty"`
}

// ErrUploadSessionNotFound is returned by lookup methods when no row
// matches. Callers use errors.Is for branching.
var ErrUploadSessionNotFound = errors.New("upload_sessions: not found")

// UploadSessionsRepo persists TUS upload session state.
type UploadSessionsRepo struct {
	pool *pgxpool.Pool
}

// NewUploadSessionsRepo constructs the repo. Accepts nil pool for
// constructor unit tests, matching the convention other repos use.
func NewUploadSessionsRepo(pool *pgxpool.Pool) *UploadSessionsRepo {
	return &UploadSessionsRepo{pool: pool}
}

func uploadSessionRequiredJSONB(value []byte, fallback string) (string, error) {
	if len(value) == 0 {
		value = []byte(fallback)
	}
	if !json.Valid(value) {
		return "", fmt.Errorf("invalid json")
	}
	return string(value), nil
}

func uploadSessionNullableJSONB(value []byte) (any, error) {
	if len(value) == 0 {
		return nil, nil
	}
	if !json.Valid(value) {
		return nil, fmt.Errorf("invalid json")
	}
	return string(value), nil
}

// Create persists a new session row at the start of a TUS upload.
// The caller is responsible for generating the TUS upload ID (uuid
// string) and for having already called R2 CreateMultipartUpload when
// direct-to-R2 streaming is in use.
func (r *UploadSessionsRepo) Create(ctx context.Context, s *UploadSession) error {
	if s == nil {
		return errors.New("upload_sessions: nil session")
	}
	if s.WorkspaceID == uuid.Nil {
		return errors.New("upload_sessions: workspace_id required")
	}
	if s.UserID == uuid.Nil {
		return errors.New("upload_sessions: user_id required")
	}
	if s.TUSUploadID == "" {
		return errors.New("upload_sessions: tus_upload_id required")
	}
	if s.Filename == "" {
		return errors.New("upload_sessions: filename required")
	}
	if s.TotalSize <= 0 {
		return errors.New("upload_sessions: total_size must be positive")
	}
	if s.ChunkSize <= 0 {
		return errors.New("upload_sessions: chunk_size must be positive")
	}
	if s.ExpiresAt.IsZero() {
		return errors.New("upload_sessions: expires_at required")
	}
	r2PartETagsJSON, err := uploadSessionRequiredJSONB(s.R2PartETags, "[]")
	if err != nil {
		return fmt.Errorf("upload_sessions: r2_part_etags json: %w", err)
	}
	s.R2PartETags = []byte(r2PartETagsJSON)

	scanManifestJSON, err := uploadSessionNullableJSONB(s.ScanManifest)
	if err != nil {
		return fmt.Errorf("upload_sessions: scan_manifest json: %w", err)
	}
	mediaEncryptionJSON, err := uploadSessionNullableJSONB(s.MediaEncryption)
	if err != nil {
		return fmt.Errorf("upload_sessions: media_encryption json: %w", err)
	}
	sourceMetadataJSON, err := uploadSessionNullableJSONB(s.SourceMetadata)
	if err != nil {
		return fmt.Errorf("upload_sessions: source_metadata json: %w", err)
	}

	if r.pool == nil {
		return errors.New("upload_sessions: pool is nil")
	}

	_, err = r.pool.Exec(ctx,
		`INSERT INTO upload_sessions (
		    workspace_id, user_id, tus_upload_id, filename, content_type,
		    total_size, upload_offset, chunk_size, r2_multipart_upload_id,
		    r2_part_etags, expires_at, scan_manifest, media_encryption,
		    source_metadata, credit_reservation_id, gallery_id, album_id
		 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16, $17)`,
		s.WorkspaceID, s.UserID, s.TUSUploadID, s.Filename, s.ContentType,
		s.TotalSize, s.UploadOffset, s.ChunkSize, s.R2MultipartUploadID,
		r2PartETagsJSON, s.ExpiresAt, scanManifestJSON, mediaEncryptionJSON,
		sourceMetadataJSON, s.CreditReservationID, s.GalleryID, s.AlbumID,
	)
	if err != nil {
		return fmt.Errorf("upload_sessions: create: %w", err)
	}
	return nil
}

// GetByTUSUploadID looks up a session by its client-facing TUS ID.
// This is the main read path for PATCH / HEAD / DELETE verbs. Returns
// ErrUploadSessionNotFound wrapped when the row is missing.
func (r *UploadSessionsRepo) GetByTUSUploadID(ctx context.Context, tusUploadID string) (*UploadSession, error) {
	s := &UploadSession{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, user_id, tus_upload_id, filename, content_type,
		        total_size, upload_offset, chunk_size, r2_multipart_upload_id,
		        r2_part_etags, expires_at, created_at, updated_at, completed_at,
		        scan_manifest, media_encryption, source_metadata,
		        scan_manifest_verified_at, credit_reservation_id,
		        gallery_id, album_id
		 FROM upload_sessions
		 WHERE tus_upload_id = $1`,
		tusUploadID,
	).Scan(
		&s.ID, &s.WorkspaceID, &s.UserID, &s.TUSUploadID, &s.Filename,
		&s.ContentType, &s.TotalSize, &s.UploadOffset, &s.ChunkSize,
		&s.R2MultipartUploadID, &s.R2PartETags, &s.ExpiresAt, &s.CreatedAt,
		&s.UpdatedAt, &s.CompletedAt, &s.ScanManifest, &s.MediaEncryption,
		&s.SourceMetadata, &s.ScanManifestVerifiedAt, &s.CreditReservationID,
		&s.GalleryID, &s.AlbumID,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUploadSessionNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("upload_sessions: get: %w", err)
	}
	return s, nil
}

// UpdateOffset bumps upload_offset after a successful PATCH chunk
// write. Callers pass the new absolute offset, not a delta, so a lost
// response + client retry idempotently converges on the correct state.
// Also updates updated_at implicitly via the SQL.
func (r *UploadSessionsRepo) UpdateOffset(ctx context.Context, tusUploadID string, newOffset int64) error {
	if newOffset < 0 {
		return errors.New("upload_sessions: new offset must be non-negative")
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE upload_sessions
		 SET upload_offset = $1, updated_at = now()
		 WHERE tus_upload_id = $2 AND completed_at IS NULL`,
		newOffset, tusUploadID,
	)
	if err != nil {
		return fmt.Errorf("upload_sessions: update offset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUploadSessionNotFound
	}
	return nil
}

// AppendPartETag appends an R2 UploadPart result to the r2_part_etags
// jsonb array. Uses PostgreSQL's jsonb_insert to avoid a read-modify-
// write race when multiple PATCH requests arrive concurrently.
func (r *UploadSessionsRepo) AppendPartETag(ctx context.Context, tusUploadID string, part UploadPartETag) error {
	partJSON, err := json.Marshal(part)
	if err != nil {
		return fmt.Errorf("upload_sessions: marshal part: %w", err)
	}
	tag, err := r.pool.Exec(ctx,
		`UPDATE upload_sessions
		 SET r2_part_etags = r2_part_etags || $1::jsonb,
		     updated_at = now()
		 WHERE tus_upload_id = $2 AND completed_at IS NULL`,
		string(partJSON), tusUploadID,
	)
	if err != nil {
		return fmt.Errorf("upload_sessions: append part: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUploadSessionNotFound
	}
	return nil
}

// MarkCompleted stamps completed_at so the GC sweeper ignores the row.
// Called at the end of finalizeUpload after CompleteMultipartUpload.
func (r *UploadSessionsRepo) MarkCompleted(ctx context.Context, tusUploadID string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE upload_sessions
		 SET completed_at = now(), updated_at = now()
		 WHERE tus_upload_id = $1 AND completed_at IS NULL`,
		tusUploadID,
	)
	if err != nil {
		return fmt.Errorf("upload_sessions: mark completed: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUploadSessionNotFound
	}
	return nil
}

// Delete removes a session row. Used by TUS DELETE (client cancel) and
// by the GC sweeper after calling R2 AbortMultipartUpload.
func (r *UploadSessionsRepo) Delete(ctx context.Context, tusUploadID string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM upload_sessions WHERE tus_upload_id = $1`,
		tusUploadID,
	)
	if err != nil {
		return fmt.Errorf("upload_sessions: delete: %w", err)
	}
	return nil
}

// ListExpired returns up to limit sessions whose expires_at has passed
// and that have not been marked completed. The GC sweeper iterates the
// result and aborts each R2 multipart upload before calling Delete.
func (r *UploadSessionsRepo) ListExpired(ctx context.Context, limit int) ([]UploadSession, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, tus_upload_id, filename, content_type,
		        total_size, upload_offset, chunk_size, r2_multipart_upload_id,
		        r2_part_etags, expires_at, created_at, updated_at, completed_at,
		        scan_manifest, media_encryption, source_metadata,
		        scan_manifest_verified_at, credit_reservation_id,
		        gallery_id, album_id
		 FROM upload_sessions
		 WHERE completed_at IS NULL AND expires_at < now()
		 ORDER BY expires_at ASC
		 LIMIT $1`,
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("upload_sessions: list expired: %w", err)
	}
	defer rows.Close()

	var out []UploadSession
	for rows.Next() {
		var s UploadSession
		if err := rows.Scan(
			&s.ID, &s.WorkspaceID, &s.UserID, &s.TUSUploadID, &s.Filename,
			&s.ContentType, &s.TotalSize, &s.UploadOffset, &s.ChunkSize,
			&s.R2MultipartUploadID, &s.R2PartETags, &s.ExpiresAt, &s.CreatedAt,
			&s.UpdatedAt, &s.CompletedAt, &s.ScanManifest, &s.MediaEncryption,
			&s.SourceMetadata, &s.ScanManifestVerifiedAt, &s.CreditReservationID,
			&s.GalleryID, &s.AlbumID,
		); err != nil {
			return nil, fmt.Errorf("upload_sessions: scan: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("upload_sessions: rows err: %w", err)
	}
	return out, nil
}
