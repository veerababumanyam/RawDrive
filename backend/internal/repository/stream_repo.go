package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Stream represents a live stream event.
type Stream struct {
	ID                uuid.UUID  `json:"id"`
	WorkspaceID       uuid.UUID  `json:"workspace_id"`
	GalleryID         *uuid.UUID `json:"gallery_id"`
	CreatedBy         uuid.UUID  `json:"created_by"`
	Title             string     `json:"title"`
	Description       *string    `json:"description"`
	Status            string     `json:"status"`
	ScheduledAt       *time.Time `json:"scheduled_at"`
	StartedAt         *time.Time `json:"started_at"`
	EndedAt           *time.Time `json:"ended_at"`
	CFStreamUID       *string    `json:"cf_stream_uid"`
	CFRtmpsURL        *string    `json:"cf_rtmps_url"`
	CFRtmpsKey        *string    `json:"cf_rtmps_key"`
	CFPlaybackURL     *string    `json:"cf_playback_url"`
	CFVodUID          *string    `json:"cf_vod_uid"`
	// PinHash is the argon2id PHC string for the stream's PIN gate
	// (replaces the plaintext pin_code column dropped in migration 093).
	// Never returned to unauthenticated viewers — GetPublic strips it via
	// the explicit map projection and only exposes `pin_required` boolean.
	PinHash           *string    `json:"-"`
	MaxQuality        string     `json:"max_quality"`
	ChatEnabled       bool       `json:"chat_enabled"`
	ChatSlowModeSecs  int        `json:"chat_slow_mode_seconds"`
	PeakViewers       int        `json:"peak_viewers"`
	TotalViews        int        `json:"total_views"`
	DurationSeconds   int        `json:"duration_seconds"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// StreamFilter defines list filtering options.
type StreamFilter struct {
	WorkspaceID uuid.UUID
	Status      string
	Limit       int
	Offset      int
}

// StreamRepo handles stream database operations.
type StreamRepo struct {
	DB *pgxpool.Pool
}

func NewStreamRepo(db *pgxpool.Pool) *StreamRepo {
	return &StreamRepo{DB: db}
}

// streamCols lists every column selected from the streams table. Must be
// kept in lock-step with the migration sequence — migration 093 (M35 /
// F-014 security stabilization) dropped the plaintext `pin_code` column
// and migration 082 introduced `pin_hash` (argon2id PHC), so every read
// path selects pin_hash instead. scanStream below matches this order.
const streamCols = `id, workspace_id, gallery_id, created_by, title, description, status,
	scheduled_at, started_at, ended_at, cf_stream_uid, cf_rtmps_url, cf_rtmps_key,
	cf_playback_url, cf_vod_uid, pin_hash, max_quality, chat_enabled, chat_slow_mode_seconds,
	peak_viewers, total_views, duration_seconds, created_at, updated_at`

func scanStream(row pgx.Row) (Stream, error) {
	var s Stream
	err := row.Scan(&s.ID, &s.WorkspaceID, &s.GalleryID, &s.CreatedBy, &s.Title,
		&s.Description, &s.Status, &s.ScheduledAt, &s.StartedAt, &s.EndedAt,
		&s.CFStreamUID, &s.CFRtmpsURL, &s.CFRtmpsKey, &s.CFPlaybackURL, &s.CFVodUID,
		&s.PinHash, &s.MaxQuality, &s.ChatEnabled, &s.ChatSlowModeSecs,
		&s.PeakViewers, &s.TotalViews, &s.DurationSeconds, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

func (r *StreamRepo) Create(ctx context.Context, s *Stream) error {
	s.ID = uuid.New()
	s.Status = "created"
	s.CreatedAt = time.Now()
	s.UpdatedAt = s.CreatedAt

	_, err := r.DB.Exec(ctx,
		`INSERT INTO streams (id, workspace_id, gallery_id, created_by, title, description,
			status, scheduled_at, cf_stream_uid, cf_rtmps_url, cf_rtmps_key, cf_playback_url,
			pin_hash, max_quality, chat_enabled, chat_slow_mode_seconds, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
		s.ID, s.WorkspaceID, s.GalleryID, s.CreatedBy, s.Title, s.Description,
		s.Status, s.ScheduledAt, s.CFStreamUID, s.CFRtmpsURL, s.CFRtmpsKey, s.CFPlaybackURL,
		s.PinHash, s.MaxQuality, s.ChatEnabled, s.ChatSlowModeSecs, s.CreatedAt, s.UpdatedAt)
	return err
}

func (r *StreamRepo) GetByID(ctx context.Context, id uuid.UUID) (Stream, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+streamCols+` FROM streams WHERE id = $1`, id)
	return scanStream(row)
}

func (r *StreamRepo) List(ctx context.Context, f StreamFilter) ([]Stream, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := r.DB.Query(ctx,
		`SELECT `+streamCols+` FROM streams
		 WHERE workspace_id = $1
		   AND ($2 = '' OR status = $2)
		 ORDER BY created_at DESC
		 LIMIT $3 OFFSET $4`,
		f.WorkspaceID, f.Status, limit, f.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var streams []Stream
	for rows.Next() {
		s, err := scanStream(rows)
		if err != nil {
			return nil, err
		}
		streams = append(streams, s)
	}
	return streams, rows.Err()
}

func (r *StreamRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET status = $1, updated_at = now() WHERE id = $2`,
		status, id)
	return err
}

func (r *StreamRepo) SetLive(ctx context.Context, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET status = 'live', started_at = now(), updated_at = now() WHERE id = $1`,
		id)
	return err
}

func (r *StreamRepo) SetEnded(ctx context.Context, id uuid.UUID, durationSecs int) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET status = 'ended', ended_at = now(), duration_seconds = $1, updated_at = now()
		 WHERE id = $2`, durationSecs, id)
	return err
}

func (r *StreamRepo) UpdateViewerCount(ctx context.Context, id uuid.UUID, current, peak int) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET total_views = $1, peak_viewers = GREATEST(peak_viewers, $2), updated_at = now()
		 WHERE id = $3`, current, peak, id)
	return err
}

func (r *StreamRepo) UpdateCloudflareFields(ctx context.Context, id uuid.UUID, cfUID, rtmpsURL, rtmpsKey, playbackURL string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET cf_stream_uid = $1, cf_rtmps_url = $2, cf_rtmps_key = $3,
			cf_playback_url = $4, updated_at = now()
		 WHERE id = $5`,
		cfUID, rtmpsURL, rtmpsKey, playbackURL, id)
	return err
}

func (r *StreamRepo) SetVODReady(ctx context.Context, id uuid.UUID, vodUID string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET status = 'vod_ready', cf_vod_uid = $1, updated_at = now()
		 WHERE id = $2`, vodUID, id)
	return err
}

func (r *StreamRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `DELETE FROM streams WHERE id = $1`, id)
	return err
}

func (r *StreamRepo) UpdateChatSettings(ctx context.Context, id uuid.UUID, enabled bool, slowModeSecs int) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE streams SET chat_enabled = $1, chat_slow_mode_seconds = $2, updated_at = now()
		 WHERE id = $3`, enabled, slowModeSecs, id)
	return err
}
