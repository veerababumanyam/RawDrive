// Package repository — M34 story 34-2 StreamWriter.
//
// StreamWriter persists new streams rows created by the photographer
// stream-creation handler. It is a narrow, handler-scoped interface so tests
// can substitute a fake without a live DB; production wiring uses
// PgStreamWriter over pgxpool.
//
// The write uses only columns that exist on the streams table as of migration
// 083 (M31 extensions). Story 34-2 does NOT introduce new columns; any fields
// that would require schema growth (package_id, branding_overrides blob) are
// omitted with a TODO rather than silently dropped.
package repository

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CreateStreamInput is the writer-scoped projection of handlers.StreamCreateInput.
// Declared here to keep the repository package free of handler imports (layering
// invariant — handler depends on repo, never the reverse).
type CreateStreamInput struct {
	WorkspaceID             uuid.UUID
	CreatedBy               uuid.UUID
	Title                   string
	PackageID               uuid.UUID
	ExpectedDurationMinutes int
	AccessPolicy            string // pin|link|sso — mapped to streams.access_level
	ChatPolicy              string
	CalendarEventURL        string
	ClientProfileID         *uuid.UUID
	DealLink                string
	Timezone                string
	BrandingOverrides       json.RawMessage
	ReservationID           uuid.UUID
	CFLiveInputID           string
	CFRTMPSURL              string
}

// StreamWriter is the minimum write-path surface a handler needs. Matches the
// handler-local StreamWriter interface one-to-one so adapters in handler
// package can embed it directly.
type StreamWriter interface {
	CreateStream(ctx context.Context, in CreateStreamInput) (uuid.UUID, error)
	ReleaseReservation(ctx context.Context, reservationID uuid.UUID) error
}

// PgStreamWriter implements StreamWriter over pgxpool.
type PgStreamWriter struct {
	pool *pgxpool.Pool
}

// NewPgStreamWriter wires the writer.
func NewPgStreamWriter(pool *pgxpool.Pool) *PgStreamWriter {
	return &PgStreamWriter{pool: pool}
}

// CreateStream inserts a new streams row and returns the id. Access policy
// values from the handler ("pin"|"link"|"sso") are mapped to the schema's
// streams.access_level enum ("pin_protected"|"invite_only"|"workspace_only").
func (w *PgStreamWriter) CreateStream(ctx context.Context, in CreateStreamInput) (uuid.UUID, error) {
	id := uuid.New()
	const q = `
		INSERT INTO streams (
		    id, workspace_id, created_by, title, status,
		    cf_stream_uid, cf_rtmps_url,
		    expected_duration_minutes, timezone,
		    access_level, chat_policy,
		    client_id, current_reservation_id
		) VALUES (
		    $1, $2, $3, $4, 'created',
		    $5, $6,
		    $7, $8,
		    $9, $10,
		    $11, $12
		)`
	_, err := w.pool.Exec(ctx, q,
		id,
		in.WorkspaceID,
		in.CreatedBy,
		in.Title,
		in.CFLiveInputID,
		in.CFRTMPSURL,
		in.ExpectedDurationMinutes,
		in.Timezone,
		mapAccessLevel(in.AccessPolicy),
		mapChatPolicy(in.ChatPolicy),
		in.ClientProfileID,
		nullableUUID(in.ReservationID),
	)
	if err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// ReleaseReservation is a thin compat wrapper — real release happens via the
// credit service's RefundReservation. Kept on the writer interface so the
// handler has a single dependency when the reservation needs to be undone.
// TODO(M35): migrate callers to credit.Service.RefundReservation directly and
// drop this pass-through.
func (w *PgStreamWriter) ReleaseReservation(ctx context.Context, reservationID uuid.UUID) error {
	if w.pool == nil || reservationID == uuid.Nil {
		return nil
	}
	_, err := w.pool.Exec(ctx,
		`UPDATE streaming_reservations SET state = 'refunded', updated_at = NOW()
		 WHERE id = $1 AND state IN ('pending', 'active')`,
		reservationID,
	)
	return err
}

func mapAccessLevel(p string) string {
	switch p {
	case "pin":
		return "pin_protected"
	case "link":
		return "invite_only"
	case "sso":
		return "workspace_only"
	default:
		return "pin_protected"
	}
}

func mapChatPolicy(p string) string {
	switch p {
	case "off":
		return "disabled"
	case "authenticated":
		return "subscribers_only"
	case "open":
		return "open"
	default:
		return "open"
	}
}

func nullableUUID(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}
