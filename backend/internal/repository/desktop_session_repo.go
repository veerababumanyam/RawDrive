package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DesktopSession represents a desktop companion app session.
type DesktopSession struct {
	ID          uuid.UUID `json:"id"`
	UserID      uuid.UUID `json:"user_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	DeviceName  string    `json:"device_name"`
	OS          string    `json:"os"`
	AppVersion  string    `json:"app_version"`
	LastSeenAt  time.Time `json:"last_seen_at"`
	IsActive    bool      `json:"is_active"`
	UploadStats string    `json:"upload_stats"`
	CreatedAt   time.Time `json:"created_at"`
}

// DesktopSessionRepo handles desktop session database operations.
type DesktopSessionRepo struct {
	DB *pgxpool.Pool
}

func NewDesktopSessionRepo(db *pgxpool.Pool) *DesktopSessionRepo {
	return &DesktopSessionRepo{DB: db}
}

const desktopSessionCols = `id, user_id, workspace_id, device_name, os, app_version, last_seen_at, is_active, upload_stats, created_at`

func scanDesktopSession(row pgx.Row) (DesktopSession, error) {
	var s DesktopSession
	err := row.Scan(&s.ID, &s.UserID, &s.WorkspaceID, &s.DeviceName, &s.OS,
		&s.AppVersion, &s.LastSeenAt, &s.IsActive, &s.UploadStats, &s.CreatedAt)
	return s, err
}

func (r *DesktopSessionRepo) Create(ctx context.Context, s *DesktopSession) error {
	s.ID = uuid.New()
	s.LastSeenAt = time.Now()
	s.IsActive = true
	s.CreatedAt = time.Now()

	_, err := r.DB.Exec(ctx,
		`INSERT INTO desktop_sessions (id, user_id, workspace_id, device_name, os, app_version,
			last_seen_at, is_active, upload_stats, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		s.ID, s.UserID, s.WorkspaceID, s.DeviceName, s.OS, s.AppVersion,
		s.LastSeenAt, s.IsActive, s.UploadStats, s.CreatedAt)
	return err
}

func (r *DesktopSessionRepo) GetByID(ctx context.Context, id uuid.UUID) (DesktopSession, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+desktopSessionCols+` FROM desktop_sessions WHERE id = $1`, id)
	return scanDesktopSession(row)
}

func (r *DesktopSessionRepo) ListByUser(ctx context.Context, userID uuid.UUID) ([]DesktopSession, error) {
	rows, err := r.DB.Query(ctx,
		`SELECT `+desktopSessionCols+` FROM desktop_sessions
		 WHERE user_id = $1 AND is_active = true
		 ORDER BY last_seen_at DESC`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []DesktopSession
	for rows.Next() {
		s, err := scanDesktopSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, rows.Err()
}

func (r *DesktopSessionRepo) Heartbeat(ctx context.Context, id uuid.UUID, appVersion string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE desktop_sessions SET last_seen_at = now(), app_version = $1 WHERE id = $2`,
		appVersion, id)
	return err
}

func (r *DesktopSessionRepo) UpdateUploadStats(ctx context.Context, id uuid.UUID, stats string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE desktop_sessions SET upload_stats = $1, last_seen_at = now() WHERE id = $2`,
		stats, id)
	return err
}

func (r *DesktopSessionRepo) Deactivate(ctx context.Context, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE desktop_sessions SET is_active = false WHERE id = $1`, id)
	return err
}
