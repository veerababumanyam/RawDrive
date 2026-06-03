package service

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// M39 E9-S1 (FR-F06): photo-trail service.
//
// The service layer is the hard enforcement surface for identity and the
// action whitelist — the handler passes in the caller's UUID (from the JWT
// subject claim, not from a query param) and the service guarantees:
//   - events.actor_id == caller (SEC-F07)
//   - events.created_at >= now() - 30d
//   - events.action ∈ PhotoTrailWhitelist
//   - limit clamped at 100

// PhotoTrailWhitelist enumerates the audit log actions that are surfaced to
// the photographer dashboard's activity feed. All other actions (admin
// mutations, password resets, logins) remain invisible.
var PhotoTrailWhitelist = []string{
	"upload_batch",
	"gallery_create",
	"gallery_share",
	"proof_select",
	"proof_approve",
	"proof_reject",
}

// PhotoTrailEvent is the wire shape returned to the client.
type PhotoTrailEvent struct {
	ID         uuid.UUID `json:"id"`
	Action     string    `json:"action"`
	ResourceID string    `json:"resource_id"`
	CreatedAt  time.Time `json:"created_at"`
}

// PhotoTrailResult is the paginated response envelope.
type PhotoTrailResult struct {
	Events     []PhotoTrailEvent `json:"events"`
	NextCursor *uuid.UUID        `json:"next_cursor"`
}

type PhotoTrailService struct {
	audit *repository.AuditLogRepo
}

func NewPhotoTrailService(audit *repository.AuditLogRepo) *PhotoTrailService {
	return &PhotoTrailService{audit: audit}
}

// List returns the caller's recent photo-trail events.
//
//   - caller: the UUID of the authenticated user (from JWT sub). Must not
//     be uuid.Nil; callers are responsible for enforcing authentication
//     before reaching this service.
//   - cursor: optional id cursor for pagination.
//   - limit: clamps to [1, 100]; default 20.
func (s *PhotoTrailService) List(ctx context.Context, caller uuid.UUID, cursor *uuid.UUID, limit int) (*PhotoTrailResult, error) {
	if caller == uuid.Nil {
		return &PhotoTrailResult{Events: []PhotoTrailEvent{}}, nil
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)
	// Fetch with a slight over-fetch so downstream whitelist filtering can
	// still return up to `limit` events.
	filter := repository.AuditLogFilter{
		ActorID:  &caller,
		DateFrom: &thirtyDaysAgo,
		Cursor:   cursor,
		Limit:    limit * 3, // action-whitelist filter may prune; over-fetch to compensate
	}
	raw, err := s.audit.List(ctx, filter)
	if err != nil {
		return nil, err
	}
	out := &PhotoTrailResult{Events: []PhotoTrailEvent{}}
	for _, r := range raw.Items {
		if !isWhitelistedAction(r.Action) {
			continue
		}
		out.Events = append(out.Events, PhotoTrailEvent{
			ID:         r.ID,
			Action:     r.Action,
			ResourceID: r.ResourceID,
			CreatedAt:  r.CreatedAt,
		})
		if len(out.Events) >= limit {
			lastID := r.ID
			out.NextCursor = &lastID
			break
		}
	}
	return out, nil
}

func isWhitelistedAction(a string) bool {
	a = strings.ToLower(strings.TrimSpace(a))
	for _, w := range PhotoTrailWhitelist {
		if a == w {
			return true
		}
	}
	return false
}
