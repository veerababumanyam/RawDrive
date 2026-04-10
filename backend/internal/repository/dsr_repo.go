package repository

// dsr_repo.go — Postgres-backed implementation of the DSRPersister
// interface declared in service/dsr_service.go (M10 E27-S3).

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

// DSRRequest mirrors the service-layer struct one-for-one. We re-declare it
// in the repository package to avoid an import cycle (service depends on
// repository, not the other way around).
type DSRRequest struct {
	ID            uuid.UUID
	SubjectEmail  string
	SubjectUserID *uuid.UUID
	RequestType   string
	Status        string
	RequestedAt   time.Time
	CompletedAt   *time.Time
	ExportPayload json.RawMessage
	FailureReason string
}

// DSRRepo persists DSR requests.
type DSRRepo struct {
	pool *pgxpool.Pool
}

// NewDSRRepo creates a new DSRRepo.
func NewDSRRepo(pool *pgxpool.Pool) *DSRRepo {
	return &DSRRepo{pool: pool}
}

// Create inserts a new DSR row. ID and RequestedAt must be set by the
// caller (the service generates them so it can return the row immediately
// without a re-fetch).
func (r *DSRRepo) Create(ctx context.Context, req *DSRRequest) error {
	if req.ID == uuid.Nil {
		req.ID = uuid.New()
	}
	if req.RequestedAt.IsZero() {
		req.RequestedAt = time.Now().UTC()
	}
	_, err := r.pool.Exec(ctx,
		`INSERT INTO dsr_requests (id, subject_email, subject_user_id, request_type, status, requested_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		req.ID, req.SubjectEmail, req.SubjectUserID, req.RequestType, req.Status, req.RequestedAt)
	if err != nil {
		return fmt.Errorf("dsr repo create: %w", err)
	}
	return nil
}

// GetByID returns the request or (nil, nil) when not found. The (nil, nil)
// convention matches the rest of this package and lets the service surface
// a clean ErrDSRNotFound.
func (r *DSRRepo) GetByID(ctx context.Context, id uuid.UUID) (*DSRRequest, error) {
	row := r.pool.QueryRow(ctx,
		`SELECT id, subject_email, subject_user_id, request_type, status,
		        requested_at, completed_at, export_payload, COALESCE(failure_reason, '')
		 FROM dsr_requests WHERE id = $1`, id)

	var req DSRRequest
	err := row.Scan(&req.ID, &req.SubjectEmail, &req.SubjectUserID, &req.RequestType,
		&req.Status, &req.RequestedAt, &req.CompletedAt, &req.ExportPayload, &req.FailureReason)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("dsr repo get: %w", err)
	}
	return &req, nil
}

// UpdateStatus moves the request to a new status. When status is
// "completed", completed_at is set to now(). Payload and failureReason
// are written verbatim — pass nil/"" to leave them unchanged.
func (r *DSRRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, payload json.RawMessage, failureReason string) error {
	completedAt := "NULL"
	args := []any{status, payload, failureReason, id}
	if status == "completed" {
		completedAt = "now()"
	}
	query := fmt.Sprintf(`
		UPDATE dsr_requests
		SET status = $1,
		    export_payload = COALESCE($2, export_payload),
		    failure_reason = NULLIF($3, ''),
		    completed_at = %s
		WHERE id = $4`, completedAt)
	tag, err := r.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("dsr repo update status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("dsr repo: request %s not found", id)
	}
	return nil
}

// FindRecentBySubject returns DSR rows for an email submitted after the
// cutoff. Used by the service for the 24h dedup gate.
func (r *DSRRepo) FindRecentBySubject(ctx context.Context, email string, since time.Time) ([]*DSRRequest, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, subject_email, subject_user_id, request_type, status,
		        requested_at, completed_at, export_payload, COALESCE(failure_reason, '')
		 FROM dsr_requests
		 WHERE subject_email = $1 AND requested_at > $2
		 ORDER BY requested_at DESC`,
		email, since)
	if err != nil {
		return nil, fmt.Errorf("dsr repo find recent: %w", err)
	}
	defer rows.Close()

	var out []*DSRRequest
	for rows.Next() {
		var req DSRRequest
		if err := rows.Scan(&req.ID, &req.SubjectEmail, &req.SubjectUserID, &req.RequestType,
			&req.Status, &req.RequestedAt, &req.CompletedAt, &req.ExportPayload, &req.FailureReason); err != nil {
			return nil, fmt.Errorf("dsr repo scan: %w", err)
		}
		out = append(out, &req)
	}
	return out, rows.Err()
}
