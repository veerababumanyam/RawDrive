package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// JobRepo handles ai_jobs table operations.
type JobRepo struct {
	pool *pgxpool.Pool
}

// NewJobRepo creates a JobRepo.
func NewJobRepo(pool *pgxpool.Pool) *JobRepo {
	return &JobRepo{pool: pool}
}

// Create inserts a new AI job.
func (r *JobRepo) Create(ctx context.Context, job *AIJob) error {
	if job.ID == uuid.Nil {
		job.ID = uuid.New()
	}
	job.CreatedAt = time.Now()
	job.UpdatedAt = job.CreatedAt

	_, err := r.pool.Exec(ctx,
		`INSERT INTO ai_jobs (id, workspace_id, type, status, total_items, processed_items,
		 result, error, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		job.ID, job.WorkspaceID, job.Type, job.Status,
		job.TotalItems, job.ProcessedItems, job.Result, job.Error,
		job.CreatedAt, job.UpdatedAt)
	if err != nil {
		return fmt.Errorf("job repo: create: %w", err)
	}
	return nil
}

// GetByID returns a job by ID.
func (r *JobRepo) GetByID(ctx context.Context, id uuid.UUID) (*AIJob, error) {
	var job AIJob
	err := r.pool.QueryRow(ctx,
		`SELECT id, workspace_id, type, status, total_items, processed_items,
		 result, error, created_at, updated_at
		 FROM ai_jobs WHERE id = $1`, id,
	).Scan(&job.ID, &job.WorkspaceID, &job.Type, &job.Status,
		&job.TotalItems, &job.ProcessedItems, &job.Result, &job.Error,
		&job.CreatedAt, &job.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("job repo: get: %w", err)
	}
	return &job, nil
}

// ListPending returns pending jobs of a given type.
func (r *JobRepo) ListPending(ctx context.Context, jobType string, limit int) ([]*AIJob, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, type, status, total_items, processed_items,
		 result, error, created_at, updated_at
		 FROM ai_jobs WHERE type = $1 AND status = 'pending'
		 ORDER BY created_at ASC LIMIT $2`, jobType, limit)
	if err != nil {
		return nil, fmt.Errorf("job repo: list pending: %w", err)
	}
	defer rows.Close()

	var jobs []*AIJob
	for rows.Next() {
		var job AIJob
		if err := rows.Scan(&job.ID, &job.WorkspaceID, &job.Type, &job.Status,
			&job.TotalItems, &job.ProcessedItems, &job.Result, &job.Error,
			&job.CreatedAt, &job.UpdatedAt); err != nil {
			return nil, err
		}
		jobs = append(jobs, &job)
	}
	return jobs, rows.Err()
}

// UpdateProgress updates job progress.
func (r *JobRepo) UpdateProgress(ctx context.Context, id uuid.UUID, status string, processed int) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_jobs SET status = $2, processed_items = $3, updated_at = now()
		 WHERE id = $1`, id, status, processed)
	return err
}

// MarkDone marks a job as completed.
func (r *JobRepo) MarkDone(ctx context.Context, id uuid.UUID, result map[string]any) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_jobs SET status = 'done', result = $2, updated_at = now()
		 WHERE id = $1`, id, result)
	return err
}

// MarkFailed marks a job as failed.
func (r *JobRepo) MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE ai_jobs SET status = 'failed', error = $2, updated_at = now()
		 WHERE id = $1`, id, errMsg)
	return err
}
