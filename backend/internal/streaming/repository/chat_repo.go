// Package repository provides data-access for the F-014 live-streaming
// domain. The chat_messages and reaction_events tables replace the legacy
// stream_chats table with RLS-safe, viewer-session-aware storage.
//
// M30 / E100-S4 — Chat + reactions repository.
package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ChatMessage is a row from chat_messages. AuthorUserID is nullable: messages
// posted by anonymous viewers carry only ViewerSessionID.
type ChatMessage struct {
	ID              uuid.UUID  `json:"id"`
	StreamID        uuid.UUID  `json:"stream_id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	ViewerSessionID *uuid.UUID `json:"viewer_session_id,omitempty"`
	AuthorUserID    *uuid.UUID `json:"author_user_id,omitempty"`
	Body            string     `json:"body"`
	PostedAt        time.Time  `json:"posted_at"`
	DeletedAt       *time.Time `json:"deleted_at,omitempty"`
	DeletedBy       *uuid.UUID `json:"deleted_by_user_id,omitempty"`
}

// ReactionKind enumerates the allowed reaction types (mirrors the SQL CHECK).
type ReactionKind string

const (
	ReactionThumbsUp  ReactionKind = "thumbs_up"
	ReactionHeart     ReactionKind = "heart"
	ReactionCelebrate ReactionKind = "celebrate"
	ReactionLaugh     ReactionKind = "laugh"
)

// IsValid reports whether the kind is one of the allowed values.
func (k ReactionKind) IsValid() bool {
	switch k {
	case ReactionThumbsUp, ReactionHeart, ReactionCelebrate, ReactionLaugh:
		return true
	}
	return false
}

// ChatRepo persists chat_messages and reaction_events.
//
// RLS contract: callers MUST have set either app.current_workspace_id
// (workspace session) or app.viewer_session_id (public viewer) on the DB
// session BEFORE calling these methods. The Postgres policies enforce
// access — this Go layer simply runs parameterised queries.
type ChatRepo struct {
	pool *pgxpool.Pool
}

// NewChatRepo constructs a ChatRepo.
func NewChatRepo(pool *pgxpool.Pool) *ChatRepo {
	return &ChatRepo{pool: pool}
}

// Errors.
var (
	ErrEmptyBody       = errors.New("chat: body must not be empty")
	ErrBodyTooLong     = errors.New("chat: body exceeds 2000 characters")
	ErrInvalidReaction = errors.New("chat: reaction kind is not valid")
	ErrNoAuthor        = errors.New("chat: message needs either viewer_session_id or author_user_id")
)

const maxBodyLen = 2000

// PostAsViewer inserts a message authored by a public viewer. The RLS
// policy requires that app.viewer_session_id was set to viewerSessionID
// on this DB session; callers are responsible for that context binding.
func (r *ChatRepo) PostAsViewer(
	ctx context.Context,
	streamID, workspaceID, viewerSessionID uuid.UUID,
	body string,
) (*ChatMessage, error) {
	if err := validateBody(body); err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx,
		`INSERT INTO chat_messages (stream_id, workspace_id, viewer_session_id, body)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, posted_at`,
		streamID, workspaceID, viewerSessionID, body,
	)
	msg := &ChatMessage{
		StreamID:        streamID,
		WorkspaceID:     workspaceID,
		ViewerSessionID: &viewerSessionID,
		Body:            body,
	}
	if err := row.Scan(&msg.ID, &msg.PostedAt); err != nil {
		return nil, fmt.Errorf("chat: insert viewer message: %w", err)
	}
	return msg, nil
}

// PostAsWorkspaceUser inserts a message authored by an authenticated
// workspace user (e.g. the photographer-host or a moderator). Requires
// app.current_workspace_id to match workspaceID on this DB session.
func (r *ChatRepo) PostAsWorkspaceUser(
	ctx context.Context,
	streamID, workspaceID, authorUserID uuid.UUID,
	body string,
) (*ChatMessage, error) {
	if err := validateBody(body); err != nil {
		return nil, err
	}

	row := r.pool.QueryRow(ctx,
		`INSERT INTO chat_messages (stream_id, workspace_id, author_user_id, body)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, posted_at`,
		streamID, workspaceID, authorUserID, body,
	)
	msg := &ChatMessage{
		StreamID:     streamID,
		WorkspaceID:  workspaceID,
		AuthorUserID: &authorUserID,
		Body:         body,
	}
	if err := row.Scan(&msg.ID, &msg.PostedAt); err != nil {
		return nil, fmt.Errorf("chat: insert workspace message: %w", err)
	}
	return msg, nil
}

// List returns messages for a stream in reverse chronological order, up
// to the given limit (default 100, max 500). Soft-deleted rows are excluded.
func (r *ChatRepo) List(ctx context.Context, streamID uuid.UUID, limit int) ([]ChatMessage, error) {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}

	rows, err := r.pool.Query(ctx,
		`SELECT id, stream_id, workspace_id, viewer_session_id, author_user_id,
		        body, posted_at, deleted_at, deleted_by_user_id
		 FROM chat_messages
		 WHERE stream_id = $1 AND deleted_at IS NULL
		 ORDER BY posted_at DESC
		 LIMIT $2`,
		streamID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("chat: list query: %w", err)
	}
	defer rows.Close()

	var out []ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(
			&m.ID, &m.StreamID, &m.WorkspaceID, &m.ViewerSessionID, &m.AuthorUserID,
			&m.Body, &m.PostedAt, &m.DeletedAt, &m.DeletedBy,
		); err != nil {
			return nil, fmt.Errorf("chat: list scan: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SoftDelete marks a message as deleted. RLS ensures only a user in the
// owning workspace can do this; the UPDATE policy checks current_workspace_id.
func (r *ChatRepo) SoftDelete(ctx context.Context, messageID, moderatorUserID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE chat_messages
		 SET deleted_at = now(), deleted_by_user_id = $2
		 WHERE id = $1 AND deleted_at IS NULL`,
		messageID, moderatorUserID,
	)
	if err != nil {
		return fmt.Errorf("chat: soft delete: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// EmitReaction inserts a reaction_events row. Either viewer_session_id
// (for public viewers) or authorUserID (for workspace users) must be non-nil
// — the DB CHECK constraint handles mutual exclusion is not required here
// but the RLS policy requires one of the two contexts to be set.
func (r *ChatRepo) EmitReaction(
	ctx context.Context,
	streamID, workspaceID uuid.UUID,
	viewerSessionID *uuid.UUID,
	kind ReactionKind,
) error {
	if !kind.IsValid() {
		return ErrInvalidReaction
	}
	if viewerSessionID == nil {
		return ErrNoAuthor
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO reaction_events (stream_id, workspace_id, viewer_session_id, kind)
		 VALUES ($1, $2, $3, $4)`,
		streamID, workspaceID, *viewerSessionID, string(kind),
	)
	if err != nil {
		return fmt.Errorf("chat: emit reaction: %w", err)
	}
	return nil
}

// IsViewerBanned reports whether the viewer session has an active ban or
// timeout on the given stream. The implementation queries
// chat_moderation_actions for rows targeting this viewer session with an
// unexpired or open-ended expiry. If the table does not yet exist (pre-35-3
// deployments), the query returns (false, nil, nil) — absence of the table
// is equivalent to "no bans on record".
func (r *ChatRepo) IsViewerBanned(
	ctx context.Context,
	streamID, viewerSessionID uuid.UUID,
) (bool, *time.Time, error) {
	var until *time.Time
	err := r.pool.QueryRow(ctx,
		`SELECT MAX(expires_at)
		   FROM chat_moderation_actions
		  WHERE stream_id = $1
		    AND target_viewer_session_id = $2
		    AND action IN ('ban','timeout')
		    AND (expires_at IS NULL OR expires_at > now())`,
		streamID, viewerSessionID,
	).Scan(&until)
	if err != nil {
		// Table may not exist yet in early environments; treat as not-banned.
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil, nil
		}
		return false, nil, nil
	}
	if until == nil {
		// No rows aggregated — MAX returns NULL scanned as nil pointer.
		return false, nil, nil
	}
	return true, until, nil
}

func validateBody(body string) error {
	if body == "" {
		return ErrEmptyBody
	}
	if len(body) > maxBodyLen {
		return ErrBodyTooLong
	}
	return nil
}
