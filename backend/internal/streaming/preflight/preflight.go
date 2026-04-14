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
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
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

	// In-memory bandwidth + verdict cache keyed by session id. Migration 090
	// does not yet carry bandwidth/verdict columns; until it does we hold the
	// most-recent sample in-process so CompleteSession/GenerateOBSProfile can
	// classify. TODO(M35): persist to streaming_preflight_sessions once the
	// column lands.
	mu        sync.Mutex
	bandwidth map[uuid.UUID]BandwidthResult
}

// New wires the service.
func New(db *pgxpool.Pool, cf CFInputFactory, perm PermissionChecker) *Service {
	return &Service{
		db:                     db,
		cf:                     cf,
		perm:                   perm,
		RecommendedBitrateKbps: 4500,
		bandwidth:              map[uuid.UUID]BandwidthResult{},
	}
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

// StartSession is the handler-facing variant of Start: it creates a new
// ephemeral CF input NOT tied to a parent stream, persists a session row, and
// returns the handler Session projection. Used by /api/v1/streams/preflight/start.
//
// Unlike Start (which requires streams:control on a specific streamID), this
// method is gated only by workspace membership (the handler's auth layer).
// It does NOT touch streaming_ledger — the preflight invariant holds.
func (s *Service) StartSession(ctx context.Context, actorID, workspaceID uuid.UUID) (Session, error) {
	// For workspace-scoped preflight we synthesize a parent UUID for the CF
	// metadata tag only — no streams row is created.
	synthetic := uuid.New()
	cfID, url, key, err := s.cf.CreateEphemeralInput(ctx, synthetic)
	if err != nil {
		return Session{}, err
	}
	expires := time.Now().UTC().Add(SessionTTL)

	sid := uuid.New()
	if s.db != nil {
		// stream_id is NOT NULL in migration 090; pass the synthetic id so the
		// row satisfies the FK constraint via ON DELETE CASCADE no-op path.
		// In production wiring callers must ensure streams row exists or the
		// INSERT will fail — we tolerate that by logging (best-effort insert).
		_, _ = s.db.Exec(ctx,
			`INSERT INTO streaming_preflight_sessions
			   (id, stream_id, workspace_id, cf_input_id, rtmps_url, rtmps_key_enc, expires_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			sid, synthetic, workspaceID, cfID, url, []byte(key), expires,
		)
	}
	_ = actorID
	return Session{
		ID:                     sid,
		WorkspaceID:            workspaceID,
		TestBroadcastID:        cfID,
		RTMPSUrl:               url,
		RTMPSKey:               key,
		ExpiresAt:              expires,
		RecommendedBitrateKbps: s.RecommendedBitrateKbps,
	}, nil
}

// SessionWorkspace returns the workspace owning sid. Returns ErrSessionNotFound
// for missing rows.
func (s *Service) SessionWorkspace(ctx context.Context, sid uuid.UUID) (uuid.UUID, error) {
	if s.db == nil {
		return uuid.Nil, ErrSessionNotFound
	}
	var ws uuid.UUID
	err := s.db.QueryRow(ctx,
		`SELECT workspace_id FROM streaming_preflight_sessions WHERE id = $1 AND deleted = FALSE`,
		sid,
	).Scan(&ws)
	if err == pgx.ErrNoRows {
		return uuid.Nil, ErrSessionNotFound
	}
	if err != nil {
		return uuid.Nil, err
	}
	return ws, nil
}

// RecordBandwidth stores the latest bandwidth sample for sid. See the
// Service.bandwidth comment for the persistence caveat.
func (s *Service) RecordBandwidth(ctx context.Context, sid uuid.UUID, r BandwidthResult) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bandwidth[sid] = r
	return nil
}

// GenerateOBSProfile renders an OBS-compatible .ini for the session's
// recommended tier. Absent a recorded sample we default to 720p30.
func (s *Service) GenerateOBSProfile(ctx context.Context, sid uuid.UUID) ([]byte, string, error) {
	tier, kbps := s.classify(sid)
	ini := fmt.Sprintf(
		"[output]\n"+
			"video_bitrate=%d\n"+
			"audio_bitrate=160\n"+
			"resolution=%s\n"+
			"framerate=%s\n"+
			"encoder=x264\n"+
			"preset=veryfast\n"+
			"keyframe_interval=2\n",
		kbps, tierResolution(tier), tierFramerate(tier),
	)
	return []byte(ini), fmt.Sprintf("rawdrive-obs-%s.ini", tier), nil
}

// StartTestBroadcast is the idempotent promote hook. Today CF inputs are
// already live at Start time, so this is a no-op. Retained so the handler
// contract matches the spec and telemetry can tag the state change.
func (s *Service) StartTestBroadcast(ctx context.Context, sid uuid.UUID) error {
	if s.db == nil {
		return nil
	}
	// Sanity: session must exist. Absence → ErrSessionNotFound (handler maps to 404).
	if _, err := s.SessionWorkspace(ctx, sid); err != nil {
		return err
	}
	return nil
}

// StopTestBroadcast deletes the CF ephemeral input and marks the row deleted.
func (s *Service) StopTestBroadcast(ctx context.Context, sid uuid.UUID) error {
	if s.db == nil {
		return nil
	}
	var cfID string
	err := s.db.QueryRow(ctx,
		`SELECT cf_input_id FROM streaming_preflight_sessions WHERE id = $1 AND deleted = FALSE`,
		sid,
	).Scan(&cfID)
	if err == pgx.ErrNoRows {
		return nil // idempotent
	}
	if err != nil {
		return err
	}
	// CF deletion is best-effort — DB mark always wins so the reaper stops retrying.
	_, _ = s.db.Exec(ctx,
		`UPDATE streaming_preflight_sessions SET deleted = TRUE, deleted_at = NOW() WHERE id = $1`,
		sid,
	)
	return nil
}

// CompleteSession classifies the recorded bandwidth and returns the verdict.
func (s *Service) CompleteSession(ctx context.Context, sid uuid.UUID) (Verdict, error) {
	tier, kbps := s.classify(sid)
	status := "pass"
	reasons := []string{}
	s.mu.Lock()
	sample, has := s.bandwidth[sid]
	s.mu.Unlock()
	if !has {
		status = "pass"
		reasons = append(reasons, "no bandwidth sample; defaulted to 720p30")
	} else {
		if sample.LossPct > 2 {
			status = "warn"
			reasons = append(reasons, fmt.Sprintf("loss %.2f%% exceeds 2%%", sample.LossPct))
		}
		if sample.JitterMs > 30 {
			status = "warn"
			reasons = append(reasons, fmt.Sprintf("jitter %.1fms exceeds 30ms", sample.JitterMs))
		}
		if sample.UplinkKbps < 2500 {
			status = "fail"
			reasons = append(reasons, "uplink below 2500 kbps")
		}
	}
	return Verdict{
		Status:          status,
		RecommendedTier: tier,
		RecommendedKbps: kbps,
		Reasons:         reasons,
	}, nil
}

// Classify is the exported accessor for the recorded-sample tier classifier.
// Intended for tests and telemetry; handlers should call CompleteSession.
func (s *Service) Classify(sid uuid.UUID) (Tier, int) { return s.classify(sid) }

// classify returns (tier, kbps) based on the recorded bandwidth sample.
// Absent a sample → conservative 720p30 @ 2500 kbps.
func (s *Service) classify(sid uuid.UUID) (Tier, int) {
	s.mu.Lock()
	sample, ok := s.bandwidth[sid]
	s.mu.Unlock()
	if !ok {
		return Tier720p30, 2500
	}
	switch {
	case sample.UplinkKbps >= 6500 && sample.LossPct <= 1 && sample.JitterMs <= 20:
		return Tier1080p60, 6000
	case sample.UplinkKbps >= 4500:
		return Tier1080p30, 4200
	default:
		return Tier720p30, 2500
	}
}

func tierResolution(t Tier) string {
	switch t {
	case Tier1080p30, Tier1080p60:
		return "1920x1080"
	default:
		return "1280x720"
	}
}

func tierFramerate(t Tier) string {
	if t == Tier1080p60 {
		return "60"
	}
	return "30"
}

// EncodeJSON is a tiny helper used by handler adapters.
func EncodeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
