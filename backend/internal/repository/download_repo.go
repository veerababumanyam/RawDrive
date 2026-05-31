package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DownloadJob represents a bulk download job.
type DownloadJob struct {
	ID                uuid.UUID  `json:"id"`
	GalleryID         uuid.UUID  `json:"gallery_id"`
	WorkspaceID       uuid.UUID  `json:"workspace_id"`
	RequestedByName   *string    `json:"requested_by_name,omitempty"`
	RequestedByEmail  *string    `json:"requested_by_email,omitempty"`
	RequestedByUserID *uuid.UUID `json:"requested_by_user_id,omitempty"`
	AssetIDs          []uuid.UUID `json:"asset_ids"`
	Variant           string     `json:"variant"`
	Status            string     `json:"status"`
	Progress          int        `json:"progress"`
	TotalAssets       int        `json:"total_assets"`
	DownloadURL       *string    `json:"download_url,omitempty"`
	FileSizeBytes     *int64     `json:"file_size_bytes,omitempty"`
	ErrorMessage      *string    `json:"error_message,omitempty"`
	ExpiresAt         *time.Time `json:"expires_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
}

// DownloadEvent represents a download audit log entry.
type DownloadEvent struct {
	ID               uuid.UUID  `json:"id"`
	GalleryID        uuid.UUID  `json:"gallery_id"`
	AssetID          *uuid.UUID `json:"asset_id,omitempty"`
	DownloadJobID    *uuid.UUID `json:"download_job_id,omitempty"`
	DownloaderName   string     `json:"downloader_name,omitempty"`
	DownloaderEmail  string     `json:"downloader_email,omitempty"`
	DownloaderUserID *uuid.UUID `json:"downloader_user_id,omitempty"`
	DownloaderIP     string     `json:"downloader_ip,omitempty"`
	Variant          string     `json:"variant"`
	FileSizeBytes    int64      `json:"file_size_bytes,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
}

// DownloadRepo handles download job and event persistence.
type DownloadRepo struct {
	pool *pgxpool.Pool
}

// NewDownloadRepo creates a new DownloadRepo.
func NewDownloadRepo(pool *pgxpool.Pool) *DownloadRepo {
	return &DownloadRepo{pool: pool}
}

// CreateJob creates a new download job.
func (r *DownloadRepo) CreateJob(ctx context.Context, job *DownloadJob) error {
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}
	job.CreatedAt = time.Now()
	job.Status = "pending"

	_, err := r.pool.Exec(ctx,
		`INSERT INTO download_jobs (id, gallery_id, workspace_id, requested_by_name, requested_by_email, requested_by_user_id, asset_ids, variant, status, progress, total_assets, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		job.ID, job.GalleryID, job.WorkspaceID, job.RequestedByName, job.RequestedByEmail, job.RequestedByUserID, job.AssetIDs, job.Variant, job.Status, job.Progress, job.TotalAssets, job.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("download job create: %w", err)
	}
	return nil
}

// GetJob returns a download job by ID.
func (r *DownloadRepo) GetJob(ctx context.Context, id uuid.UUID) (*DownloadJob, error) {
	job := &DownloadJob{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, workspace_id, requested_by_name, requested_by_email, requested_by_user_id, asset_ids, variant, status, progress, total_assets, download_url, file_size_bytes, error_message, expires_at, created_at, completed_at
		 FROM download_jobs WHERE id = $1`, id,
	).Scan(&job.ID, &job.GalleryID, &job.WorkspaceID, &job.RequestedByName, &job.RequestedByEmail, &job.RequestedByUserID, &job.AssetIDs, &job.Variant, &job.Status, &job.Progress, &job.TotalAssets, &job.DownloadURL, &job.FileSizeBytes, &job.ErrorMessage, &job.ExpiresAt, &job.CreatedAt, &job.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("download job get: %w", err)
	}
	return job, nil
}

// GetJobInWorkspace returns a download job by ID only when it belongs to the
// given workspace. Scoping the lookup by workspace_id in the WHERE clause makes
// the ownership check atomic (TOCTOU-free) — a cross-tenant job_id simply
// matches no row and returns pgx.ErrNoRows, which the handler maps to 404.
func (r *DownloadRepo) GetJobInWorkspace(ctx context.Context, id, workspaceID uuid.UUID) (*DownloadJob, error) {
	job := &DownloadJob{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, gallery_id, workspace_id, requested_by_name, requested_by_email, requested_by_user_id, asset_ids, variant, status, progress, total_assets, download_url, file_size_bytes, error_message, expires_at, created_at, completed_at
		 FROM download_jobs WHERE id = $1 AND workspace_id = $2`, id, workspaceID,
	).Scan(&job.ID, &job.GalleryID, &job.WorkspaceID, &job.RequestedByName, &job.RequestedByEmail, &job.RequestedByUserID, &job.AssetIDs, &job.Variant, &job.Status, &job.Progress, &job.TotalAssets, &job.DownloadURL, &job.FileSizeBytes, &job.ErrorMessage, &job.ExpiresAt, &job.CreatedAt, &job.CompletedAt)
	if err != nil {
		return nil, fmt.Errorf("download job get: %w", err)
	}
	return job, nil
}

// UpdateJobStatus updates a download job's status and progress.
func (r *DownloadRepo) UpdateJobStatus(ctx context.Context, id uuid.UUID, status string, progress int, downloadURL string, fileSizeBytes int64) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE download_jobs SET status=$2, progress=$3, download_url=$4, file_size_bytes=$5, completed_at=CASE WHEN $2 IN ('completed','failed') THEN now() ELSE completed_at END WHERE id=$1`,
		id, status, progress, downloadURL, fileSizeBytes,
	)
	if err != nil {
		return fmt.Errorf("download job update: %w", err)
	}
	return nil
}

// ListPendingJobs returns download jobs in status "pending" ordered by
// oldest first. Used by the download worker to pick up backlog.
// SELECT … FOR UPDATE SKIP LOCKED means multiple worker instances are
// safe: each run claims a different set of jobs atomically.
func (r *DownloadRepo) ListPendingJobs(ctx context.Context, limit int) ([]DownloadJob, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, workspace_id, requested_by_name, requested_by_email,
		        requested_by_user_id, asset_ids, variant, status, progress, total_assets,
		        download_url, file_size_bytes, error_message, expires_at, created_at, completed_at
		 FROM download_jobs
		 WHERE status = 'pending'
		 ORDER BY created_at ASC
		 LIMIT $1
		 FOR UPDATE SKIP LOCKED`, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("download job list pending: %w", err)
	}
	defer rows.Close()

	var jobs []DownloadJob
	for rows.Next() {
		var j DownloadJob
		if err := rows.Scan(&j.ID, &j.GalleryID, &j.WorkspaceID, &j.RequestedByName,
			&j.RequestedByEmail, &j.RequestedByUserID, &j.AssetIDs, &j.Variant,
			&j.Status, &j.Progress, &j.TotalAssets, &j.DownloadURL,
			&j.FileSizeBytes, &j.ErrorMessage, &j.ExpiresAt, &j.CreatedAt,
			&j.CompletedAt); err != nil {
			return nil, fmt.Errorf("download job scan: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

// MarkJobFailed records an error message and sets status=failed.
// Used by the worker on terminal failures.
func (r *DownloadRepo) MarkJobFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE download_jobs
		 SET status='failed', error_message=$2, completed_at=now()
		 WHERE id=$1`, id, errMsg)
	if err != nil {
		return fmt.Errorf("download job mark failed: %w", err)
	}
	return nil
}

// ListJobsByGallery returns download jobs for a gallery.
func (r *DownloadRepo) ListJobsByGallery(ctx context.Context, galleryID uuid.UUID) ([]DownloadJob, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, workspace_id, requested_by_name, requested_by_email, requested_by_user_id, asset_ids, variant, status, progress, total_assets, download_url, file_size_bytes, error_message, expires_at, created_at, completed_at
		 FROM download_jobs WHERE gallery_id = $1 ORDER BY created_at DESC LIMIT 20`, galleryID,
	)
	if err != nil {
		return nil, fmt.Errorf("download job list: %w", err)
	}
	defer rows.Close()

	var jobs []DownloadJob
	for rows.Next() {
		var j DownloadJob
		if err := rows.Scan(&j.ID, &j.GalleryID, &j.WorkspaceID, &j.RequestedByName, &j.RequestedByEmail, &j.RequestedByUserID, &j.AssetIDs, &j.Variant, &j.Status, &j.Progress, &j.TotalAssets, &j.DownloadURL, &j.FileSizeBytes, &j.ErrorMessage, &j.ExpiresAt, &j.CreatedAt, &j.CompletedAt); err != nil {
			return nil, fmt.Errorf("download job scan: %w", err)
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

// CreateEvent logs a download event.
func (r *DownloadRepo) CreateEvent(ctx context.Context, event *DownloadEvent) error {
	if event.ID == uuid.Nil {
		event.ID = uuid.New()
	}
	event.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO download_events (id, gallery_id, asset_id, download_job_id, downloader_name, downloader_email, downloader_user_id, downloader_ip, variant, file_size_bytes, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		event.ID, event.GalleryID, event.AssetID, event.DownloadJobID, event.DownloaderName, event.DownloaderEmail, event.DownloaderUserID, event.DownloaderIP, event.Variant, event.FileSizeBytes, event.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("download event create: %w", err)
	}
	return nil
}

// ListEventsByGallery returns download events for a gallery.
func (r *DownloadRepo) ListEventsByGallery(ctx context.Context, galleryID uuid.UUID, limit int) ([]DownloadEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, gallery_id, asset_id, download_job_id, downloader_name, downloader_email, downloader_user_id, downloader_ip, variant, file_size_bytes, created_at
		 FROM download_events WHERE gallery_id = $1 ORDER BY created_at DESC LIMIT $2`, galleryID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("download event list: %w", err)
	}
	defer rows.Close()

	var events []DownloadEvent
	for rows.Next() {
		var e DownloadEvent
		if err := rows.Scan(&e.ID, &e.GalleryID, &e.AssetID, &e.DownloadJobID, &e.DownloaderName, &e.DownloaderEmail, &e.DownloaderUserID, &e.DownloaderIP, &e.Variant, &e.FileSizeBytes, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("download event scan: %w", err)
		}
		events = append(events, e)
	}
	return events, nil
}
