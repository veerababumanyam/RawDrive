// Package preflight implements the ephemeral Cloudflare live-input session
// used for desktop preflight / test-broadcast (M34 / E109-C2).
//
// CRITICAL INVARIANT: a preflight session MUST NOT write to the credit
// ledger. Tests lock this at both the migration layer (090 comment) and the
// service layer (this package's Start returns without any ledger call).
package preflight

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionTTL is the default ephemeral lifetime for a preflight input.
const SessionTTL = 60 * time.Second

// CFInputFactory is the minimum surface we need from the Cloudflare client.
// Injected so tests can substitute a fake without touching the network.
type CFInputFactory interface {
	CreateEphemeralInput(ctx context.Context, parentStreamID uuid.UUID) (cfID, rtmpsURL, rtmpsKey string, err error)
}

// PermissionChecker returns true if the actor holds streams:control on the
// given stream. Injected for testability.
type PermissionChecker interface {
	HasStreamControl(ctx context.Context, userID, streamID uuid.UUID) (bool, error)
}

// Service persists preflight sessions.
type Service struct {
	db   *pgxpool.Pool
	cf   CFInputFactory
	perm PermissionChecker
	// recommended upstream bitrate returned to the client (kbps).
	RecommendedBitrateKbps int
}

// New wires the service.
func New(db *pgxpool.Pool, cf CFInputFactory, perm PermissionChecker) *Service {
	return &Service{db: db, cf: cf, perm: perm, RecommendedBitrateKbps: 4500}
}

// StartResponse mirrors the public API contract.
type StartResponse struct {
	TestBroadcastID        string    `json:"testBroadcastId"`
	RTMPSUrl               string    `json:"rtmpsUrl"`
	RTMPSKey               string    `json:"rtmpsKey"`
	ExpiresAt              time.Time `json:"expiresAt"`
	RecommendedBitrateKbps int       `json:"recommendedBitrateKbps"`
}

// Start issues a new ephemeral CF input, persists a preflight-session row,
// and returns the streaming credentials. It NEVER writes to streaming_ledger.
func (s *Service) Start(ctx context.Context, actorID, streamID uuid.UUID) (StartResponse, int, error) {
	ok, err := s.perm.HasStreamControl(ctx, actorID, streamID)
	if err != nil {
		return StartResponse{}, http.StatusInternalServerError, err
	}
	if !ok {
		return StartResponse{}, http.StatusForbidden, ErrForbidden
	}

	cfID, url, key, err := s.cf.CreateEphemeralInput(ctx, streamID)
	if err != nil {
		return StartResponse{}, http.StatusBadGateway, err
	}

	expires := time.Now().UTC().Add(SessionTTL)

	// Fetch workspace for the stream (single read, no ledger touch).
	var wsID uuid.UUID
	if s.db != nil {
		_ = s.db.QueryRow(ctx,
			`SELECT workspace_id FROM streams WHERE id = $1`, streamID,
		).Scan(&wsID)

		_, _ = s.db.Exec(ctx,
			`INSERT INTO streaming_preflight_sessions
			   (stream_id, workspace_id, cf_input_id, rtmps_url, rtmps_key_enc, expires_at)
			 VALUES ($1,$2,$3,$4,$5,$6)`,
			streamID, wsID, cfID, url, []byte(key), expires,
		)
	}

	return StartResponse{
		TestBroadcastID:        cfID,
		RTMPSUrl:               url,
		RTMPSKey:               key,
		ExpiresAt:              expires,
		RecommendedBitrateKbps: s.RecommendedBitrateKbps,
	}, http.StatusOK, nil
}

// ErrForbidden is returned when the actor lacks streams:control.
var ErrForbidden = &preflightError{msg: "preflight: forbidden"}

// ErrSessionNotFound is returned when a preflight session cannot be found
// OR when an actor is not the owner of the given session — the handler layer
// must NOT distinguish between the two to avoid leaking existence.
var ErrSessionNotFound = &preflightError{msg: "preflight: session not found"}

type preflightError struct{ msg string }

func (e *preflightError) Error() string { return e.msg }

// Session is the handler-facing projection of a preflight session row.
type Session struct {
	ID                     uuid.UUID
	WorkspaceID            uuid.UUID
	TestBroadcastID        string
	RTMPSUrl               string
	RTMPSKey               string
	ExpiresAt              time.Time
	RecommendedBitrateKbps int
}

// BandwidthResult is a single client-measured sample.
type BandwidthResult struct {
	UplinkKbps   int     `json:"uplinkKbps"`
	DownlinkKbps int     `json:"downlinkKbps"`
	JitterMs     float64 `json:"jitterMs"`
	LossPct      float64 `json:"lossPct"`
	Source       string  `json:"source"`
}

// Tier is a qualitative encoder preset tier.
type Tier string

const (
	Tier720p30  Tier = "720p30"
	Tier1080p30 Tier = "1080p30"
	Tier1080p60 Tier = "1080p60"
)

// Verdict is the preflight outcome returned from CompleteSession.
type Verdict struct {
	Status          string   `json:"status"`
	RecommendedTier Tier     `json:"recommendedTier"`
	RecommendedKbps int      `json:"recommendedBitrateKbps"`
	Reasons         []string `json:"reasons"`
}

// EncodeJSON is a tiny helper used by handler adapters.
func EncodeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
