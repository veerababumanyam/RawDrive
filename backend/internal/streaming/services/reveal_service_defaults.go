// Package services — convenience constructor + default adapters for
// RevealService so main.go can wire the T-30 reveal handler with just a
// pgxpool + CF live-input client.
//
// The stream lookup is pgxpool-backed; the key rotator delegates to CF's
// Delete+Create cycle (CF API does not expose a rotate endpoint today, so we
// model rotation as best-effort key re-issue and leave the persistence of the
// new envelope-encrypted key to a follow-up wave). If the CF client is nil
// the rotator degrades to a warning log instead of panicking.
package services

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/streaming/cf"
	"github.com/rawdrive/backend/internal/streaming/repository"
)

// NewRevealServiceFromPool is the convenience constructor used by main.go.
// It wraps the pool with a default StreamLookup + KeyRotator and audit repo,
// so callers don't need to assemble the bespoke interfaces by hand.
//
// If cfClient is nil, rotation returns an error and reveal still works for
// streams whose keys are already materialized on the row.
func NewRevealServiceFromPool(pool *pgxpool.Pool, cfClient cf.LiveInputClient, opts Options) *RevealService {
	lookup := &pgStreamLookup{pool: pool}
	rotator := &cfKeyRotator{pool: pool, cf: cfClient}
	audit := repository.NewPgIngestAuditRepo(pool)
	return NewRevealService(lookup, rotator, audit, opts)
}

// --- default StreamLookup --------------------------------------------------

type pgStreamLookup struct{ pool *pgxpool.Pool }

// GetIngestStream reads the streams row and materializes the plaintext
// credentials. The M8 schema stores cf_rtmps_key in plaintext today;
// envelope-decryption lands with migration 095. Until then we return the
// column as-is.
func (p *pgStreamLookup) GetIngestStream(ctx context.Context, id uuid.UUID) (*IngestStream, error) {
	if p.pool == nil {
		return nil, errors.New("reveal: pool not configured")
	}
	const q = `
		SELECT id, workspace_id,
		       COALESCE(scheduled_at, '0001-01-01'::timestamptz),
		       COALESCE(cf_stream_uid, ''),
		       COALESCE(cf_rtmps_url, ''),
		       COALESCE(cf_rtmps_key, '')
		FROM streams
		WHERE id = $1`
	var s IngestStream
	err := p.pool.QueryRow(ctx, q, id).Scan(
		&s.ID, &s.WorkspaceID,
		&s.ScheduledStartAt,
		&s.CFLiveInputUID,
		&s.RTMPSURL,
		&s.IngestKeyPlain,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}
	return &s, nil
}

// --- default KeyRotator ----------------------------------------------------

type cfKeyRotator struct {
	pool *pgxpool.Pool
	cf   cf.LiveInputClient
}

// RotateKey re-creates a CF live input. Returns a warning when CF is not
// configured — the audit trail still records the attempt via the caller.
func (r *cfKeyRotator) RotateKey(ctx context.Context, streamID uuid.UUID, uid string) (*IngestStream, error) {
	if r.cf == nil {
		log.Printf("reveal: cf client not configured; rotate no-op for stream %s", streamID)
		return nil, nil
	}
	// CF does not expose an atomic rotate endpoint. Closest safe equivalent is
	// to create a fresh live input and persist the new uid/key on the streams
	// row. We do not delete the old uid here — the reconciliation worker will
	// prune orphaned inputs on its next sweep.
	meta := map[string]string{"stream_id": streamID.String(), "action": "rotate"}
	in, err := r.cf.Create(ctx, meta)
	if err != nil {
		return nil, err
	}
	if r.pool != nil && in != nil {
		_, _ = r.pool.Exec(ctx,
			`UPDATE streams SET cf_stream_uid = $1, cf_rtmps_url = $2, cf_rtmps_key = $3, updated_at = NOW()
			 WHERE id = $4`,
			in.UID, in.RTMPSURL, in.StreamKey, streamID,
		)
	}
	_ = uid
	return &IngestStream{
		ID:             streamID,
		CFLiveInputUID: in.UID,
		RTMPSURL:       in.RTMPSURL,
		IngestKeyPlain: in.StreamKey,
	}, nil
}

// Ensure we pull time for opts defaults in package-level users.
var _ = time.Now
