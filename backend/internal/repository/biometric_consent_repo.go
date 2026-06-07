package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Biometric search endpoints recorded in the audit ledger. These mirror the
// CHECK constraint in migration 188 (biometric_search_audit.endpoint) — keep
// them in sync; an out-of-set value is rejected at the DB layer.
const (
	BiometricEndpointPhotoSearch = "photo_search"
	BiometricEndpointFaceMatch   = "face_match"
)

// BiometricSearchAudit is one append-only processing-event record for a public
// biometric face-search (DPDP/GDPR Art 9). It records WHO searched (the gated
// session subject — a hash of the gallery-session token, never the raw token),
// in WHICH gallery, WHEN, whether consent was given, and the match-count
// outcome. It deliberately holds NO selfie image and NO selfie embedding — that
// would violate the E2EE law.
type BiometricSearchAudit struct {
	ID             uuid.UUID `json:"id"`
	WorkspaceID    uuid.UUID `json:"workspace_id"`
	GalleryID      uuid.UUID `json:"gallery_id"`
	SessionSubject *string   `json:"session_subject,omitempty"`
	Endpoint       string    `json:"endpoint"`
	ConsentGiven   bool      `json:"consent_given"`
	MatchCount     int       `json:"match_count"`
	CreatedAt      time.Time `json:"created_at"`
}

// BiometricConsentRepo persists biometric consent + search audit rows. The
// table (migration 188) is append-only and there is no read path on the public
// surface — the studio/DPO audit view reads it through the authed, workspace-
// scoped connection where RLS applies.
type BiometricConsentRepo struct {
	pool *pgxpool.Pool
}

// NewBiometricConsentRepo creates a new BiometricConsentRepo.
func NewBiometricConsentRepo(pool *pgxpool.Pool) *BiometricConsentRepo {
	return &BiometricConsentRepo{pool: pool}
}

// RecordSearch appends exactly one audit row for a biometric face-search
// request. It is the single write path for the table. The insert is fully
// parameterized and respects the workspace/gallery scoping carried on the row
// (RLS keys on workspace_id). Callers MUST treat a non-nil error as fail-closed
// — an unaudited match must never be returned to the guest.
//
// endpoint must be one of BiometricEndpointPhotoSearch / BiometricEndpointFaceMatch;
// an out-of-set value is rejected by the migration-188 CHECK constraint and
// surfaces here as an error (so a typo fails closed rather than silently logging
// the wrong endpoint).
func (r *BiometricConsentRepo) RecordSearch(ctx context.Context, a *BiometricSearchAudit) error {
	if r == nil || r.pool == nil {
		return fmt.Errorf("biometric consent repo: not wired")
	}
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	if a.CreatedAt.IsZero() {
		a.CreatedAt = time.Now().UTC()
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO biometric_search_audit
		   (id, workspace_id, gallery_id, session_subject, endpoint, consent_given, match_count, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		a.ID, a.WorkspaceID, a.GalleryID, a.SessionSubject, a.Endpoint, a.ConsentGiven, a.MatchCount, a.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("biometric search audit insert: %w", err)
	}
	return nil
}
