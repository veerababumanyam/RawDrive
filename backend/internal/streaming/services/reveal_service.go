// Package services holds M33 business-logic services that sit between
// HTTP handlers and repositories. RevealService enforces the T-30 ingest-
// key reveal window (FR-014-UX-04) and writes the append-only audit trail
// (FR-014-CF-04) on every successful reveal and rotation.
package services

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

// IngestStream is the minimal stream record RevealService reads.
type IngestStream struct {
	ID                uuid.UUID
	WorkspaceID       uuid.UUID
	ScheduledStartAt  time.Time
	CFLiveInputUID    string
	RTMPSURL          string
	SRTURL            string
	IngestKeyPlain    string // resolved after envelope-decrypt
	IngestKeySRTPlain string
}

// StreamLookup returns the stream the caller is trying to reveal.
type StreamLookup interface {
	GetIngestStream(ctx context.Context, streamID uuid.UUID) (*IngestStream, error)
}

// KeyRotator rotates the live input key via the CF API and returns the
// new plaintext values. Implementations are responsible for persisting
// the envelope-encrypted version of the new key on the streams row.
type KeyRotator interface {
	RotateKey(ctx context.Context, streamID uuid.UUID, cfLiveInputUID string) (*IngestStream, error)
}

// RevealService enforces the T-30 window and writes audit entries.
type RevealService struct {
	streams      StreamLookup
	rotator      KeyRotator
	audit        repository.IngestAuditRepo
	clock        func() time.Time
	revealWindow time.Duration // how early before ScheduledStartAt reveal is allowed
}

// Options tunes the service defaults.
type Options struct {
	Clock        func() time.Time
	RevealWindow time.Duration
}

// NewRevealService builds a service. Default reveal window is 30 minutes
// per FR-014-UX-04.
func NewRevealService(streams StreamLookup, rotator KeyRotator, audit repository.IngestAuditRepo, opts Options) *RevealService {
	if opts.Clock == nil {
		opts.Clock = time.Now
	}
	if opts.RevealWindow <= 0 {
		opts.RevealWindow = 30 * time.Minute
	}
	return &RevealService{
		streams:      streams,
		rotator:      rotator,
		audit:        audit,
		clock:        opts.Clock,
		revealWindow: opts.RevealWindow,
	}
}

// RevealRequest is the input to Reveal.
type RevealRequest struct {
	StreamID  uuid.UUID
	ActorID   uuid.UUID
	ActorIP   string
	UserAgent string
	Override  bool // super-admin-only bypass of T-30 gate
}

// RevealResponse carries the plaintext ingest credentials.
type RevealResponse struct {
	RTMPSURL   string
	StreamKey  string
	SRTURL     string
	SRTPasskey string
	RevealedAt time.Time
}

// ErrRevealTooEarly is returned when the caller tries to reveal before
// the T-30 window opens and Override is false. Handlers map this to 425.
var ErrRevealTooEarly = errors.New("reveal: outside T-30 window")

// Reveal resolves the stream, enforces the T-30 gate, writes an audit
// entry, and returns the plaintext credentials. Denied attempts (outside
// the window, no override) DO NOT write to ingest_reveal_audit — the DB
// CHECK constraint forbids custom reasons. They are instead returned as
// ErrRevealTooEarly so the handler can structured-log them.
func (s *RevealService) Reveal(ctx context.Context, req RevealRequest) (*RevealResponse, error) {
	st, err := s.streams.GetIngestStream(ctx, req.StreamID)
	if err != nil {
		return nil, err
	}
	now := s.clock()
	windowOpen := !st.ScheduledStartAt.IsZero() && now.After(st.ScheduledStartAt.Add(-s.revealWindow))

	if !windowOpen && !req.Override {
		return nil, ErrRevealTooEarly
	}

	reason := repository.RevealReasonAPI
	if req.Override && !windowOpen {
		reason = repository.RevealReasonManualOverride
	} else if windowOpen {
		reason = repository.RevealReasonScheduledT30
	}

	actor := req.ActorID
	entry := repository.IngestRevealAuditEntry{
		WorkspaceID: st.WorkspaceID,
		StreamID:    st.ID,
		RevealedBy:  &actor,
		Reason:      reason,
		RevealedAt:  now,
		ClientIP:    req.ActorIP,
		UserAgent:   req.UserAgent,
	}
	if _, err := s.audit.Insert(ctx, entry); err != nil {
		return nil, err
	}
	return &RevealResponse{
		RTMPSURL:   st.RTMPSURL,
		StreamKey:  st.IngestKeyPlain,
		SRTURL:     st.SRTURL,
		SRTPasskey: st.IngestKeySRTPlain,
		RevealedAt: now,
	}, nil
}

// RotateRequest is the input to Rotate.
type RotateRequest struct {
	StreamID  uuid.UUID
	ActorID   uuid.UUID
	ActorIP   string
	UserAgent string
}

// Rotate regenerates the ingest key via CF, updates the streams row
// (delegated to KeyRotator), and writes a rotation audit entry. Returns
// 200 OK with no key in response — the caller must separately call
// Reveal if they want the new key.
func (s *RevealService) Rotate(ctx context.Context, req RotateRequest) error {
	st, err := s.streams.GetIngestStream(ctx, req.StreamID)
	if err != nil {
		return err
	}
	if _, err := s.rotator.RotateKey(ctx, st.ID, st.CFLiveInputUID); err != nil {
		return err
	}
	actor := req.ActorID
	_, err = s.audit.Insert(ctx, repository.IngestRevealAuditEntry{
		WorkspaceID: st.WorkspaceID,
		StreamID:    st.ID,
		RevealedBy:  &actor,
		Reason:      repository.RevealReasonRotation,
		RevealedAt:  s.clock(),
		ClientIP:    req.ActorIP,
		UserAgent:   req.UserAgent,
	})
	return err
}
