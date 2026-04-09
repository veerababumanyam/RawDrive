package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// VideoAsset represents a video asset with transcoding metadata.
type VideoAsset struct {
	ID              uuid.UUID  `json:"id"`
	AssetID         uuid.UUID  `json:"asset_id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	Status          string     `json:"status"`
	DurationSeconds *int       `json:"duration_seconds"`
	Codec           *string    `json:"codec"`
	Resolution      *string    `json:"resolution"`
	FileSizeBytes   *int64     `json:"file_size_bytes"`
	Qualities       string     `json:"qualities"`
	ThumbnailURLs   string     `json:"thumbnail_urls"`
	CFVideoUID      *string    `json:"cf_video_uid"`
	CFPlaybackURL   *string    `json:"cf_playback_url"`
	ErrorMessage    *string    `json:"error_message"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// VideoRepo handles video asset database operations.
type VideoRepo struct {
	DB *pgxpool.Pool
}

func NewVideoRepo(db *pgxpool.Pool) *VideoRepo {
	return &VideoRepo{DB: db}
}

const videoCols = `id, asset_id, workspace_id, status, duration_seconds, codec, resolution,
	file_size_bytes, qualities, thumbnail_urls, cf_video_uid, cf_playback_url, error_message,
	created_at, updated_at`

func scanVideo(row pgx.Row) (VideoAsset, error) {
	var v VideoAsset
	err := row.Scan(&v.ID, &v.AssetID, &v.WorkspaceID, &v.Status, &v.DurationSeconds,
		&v.Codec, &v.Resolution, &v.FileSizeBytes, &v.Qualities, &v.ThumbnailURLs,
		&v.CFVideoUID, &v.CFPlaybackURL, &v.ErrorMessage, &v.CreatedAt, &v.UpdatedAt)
	return v, err
}

func (r *VideoRepo) Create(ctx context.Context, v *VideoAsset) error {
	v.ID = uuid.New()
	v.Status = "pending"
	v.CreatedAt = time.Now()
	v.UpdatedAt = v.CreatedAt

	_, err := r.DB.Exec(ctx,
		`INSERT INTO video_assets (id, asset_id, workspace_id, status, duration_seconds, codec,
			resolution, file_size_bytes, qualities, thumbnail_urls, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		v.ID, v.AssetID, v.WorkspaceID, v.Status, v.DurationSeconds, v.Codec,
		v.Resolution, v.FileSizeBytes, v.Qualities, v.ThumbnailURLs, v.CreatedAt, v.UpdatedAt)
	return err
}

func (r *VideoRepo) GetByID(ctx context.Context, id uuid.UUID) (VideoAsset, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+videoCols+` FROM video_assets WHERE id = $1`, id)
	return scanVideo(row)
}

func (r *VideoRepo) GetByAssetID(ctx context.Context, assetID uuid.UUID) (VideoAsset, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+videoCols+` FROM video_assets WHERE asset_id = $1`, assetID)
	return scanVideo(row)
}

func (r *VideoRepo) ListPending(ctx context.Context, limit int) ([]VideoAsset, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.DB.Query(ctx,
		`SELECT `+videoCols+` FROM video_assets WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []VideoAsset
	for rows.Next() {
		v, err := scanVideo(rows)
		if err != nil {
			return nil, err
		}
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

func (r *VideoRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]VideoAsset, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := r.DB.Query(ctx,
		`SELECT `+videoCols+` FROM video_assets WHERE workspace_id = $1
		 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
		workspaceID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var videos []VideoAsset
	for rows.Next() {
		v, err := scanVideo(rows)
		if err != nil {
			return nil, err
		}
		videos = append(videos, v)
	}
	return videos, rows.Err()
}

func (r *VideoRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, errMsg *string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE video_assets SET status = $1, error_message = $2, updated_at = now() WHERE id = $3`,
		status, errMsg, id)
	return err
}

func (r *VideoRepo) SetReady(ctx context.Context, id uuid.UUID, qualities, thumbnails string, cfUID, cfPlaybackURL *string, durationSecs *int, codec, resolution *string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE video_assets SET status = 'ready', qualities = $1, thumbnail_urls = $2,
			cf_video_uid = $3, cf_playback_url = $4, duration_seconds = $5, codec = $6,
			resolution = $7, updated_at = now()
		 WHERE id = $8`,
		qualities, thumbnails, cfUID, cfPlaybackURL, durationSecs, codec, resolution, id)
	return err
}

func (r *VideoRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `DELETE FROM video_assets WHERE id = $1`, id)
	return err
}
