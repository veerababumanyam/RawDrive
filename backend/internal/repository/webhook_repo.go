package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Webhook represents a webhook subscription.
type Webhook struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	URL         string     `json:"url"`
	Secret      string     `json:"secret,omitempty"`
	Events      []string   `json:"events"`
	IsActive    bool       `json:"is_active"`
	CreatedBy   *uuid.UUID `json:"created_by,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// WebhookDelivery represents a webhook delivery attempt.
type WebhookDelivery struct {
	ID             uuid.UUID  `json:"id"`
	WebhookID      uuid.UUID  `json:"webhook_id"`
	EventType      string     `json:"event_type"`
	Payload        []byte     `json:"payload"`
	ResponseStatus int        `json:"response_status,omitempty"`
	ResponseBody   string     `json:"response_body,omitempty"`
	Attempt        int        `json:"attempt"`
	Status         string     `json:"status"`
	ErrorMessage   string     `json:"error_message,omitempty"`
	DeliveredAt    *time.Time `json:"delivered_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
}

// WebhookRepo handles webhook persistence.
type WebhookRepo struct {
	pool *pgxpool.Pool
}

// NewWebhookRepo creates a new WebhookRepo.
func NewWebhookRepo(pool *pgxpool.Pool) *WebhookRepo {
	return &WebhookRepo{pool: pool}
}

// Create inserts a new webhook.
func (r *WebhookRepo) Create(ctx context.Context, w *Webhook) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	now := time.Now()
	w.CreatedAt = now
	w.UpdatedAt = now

	_, err := r.pool.Exec(ctx,
		`INSERT INTO webhooks (id, workspace_id, url, secret, events, is_active, created_by, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		w.ID, w.WorkspaceID, w.URL, w.Secret, w.Events, w.IsActive, w.CreatedBy, w.CreatedAt, w.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("webhook create: %w", err)
	}
	return nil
}

// ListByWorkspace returns active webhooks for a workspace.
func (r *WebhookRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]Webhook, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, url, secret, events, is_active, created_by, created_at, updated_at
		 FROM webhooks WHERE workspace_id = $1 AND is_active = true ORDER BY created_at`, workspaceID,
	)
	if err != nil {
		return nil, fmt.Errorf("webhook list: %w", err)
	}
	defer rows.Close()

	var webhooks []Webhook
	for rows.Next() {
		var w Webhook
		if err := rows.Scan(&w.ID, &w.WorkspaceID, &w.URL, &w.Secret, &w.Events, &w.IsActive, &w.CreatedBy, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, fmt.Errorf("webhook scan: %w", err)
		}
		webhooks = append(webhooks, w)
	}
	return webhooks, nil
}

// Delete deactivates a webhook.
func (r *WebhookRepo) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `UPDATE webhooks SET is_active = false, updated_at = now() WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("webhook delete: %w", err)
	}
	return nil
}

// CreateDelivery logs a webhook delivery attempt.
func (r *WebhookRepo) CreateDelivery(ctx context.Context, d *WebhookDelivery) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	d.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx,
		`INSERT INTO webhook_deliveries (id, webhook_id, event_type, payload, response_status, response_body, attempt, status, error_message, delivered_at, created_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		d.ID, d.WebhookID, d.EventType, d.Payload, d.ResponseStatus, d.ResponseBody, d.Attempt, d.Status, d.ErrorMessage, d.DeliveredAt, d.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("webhook delivery create: %w", err)
	}
	return nil
}

// ListDeliveriesByWebhook returns recent deliveries for a webhook.
func (r *WebhookRepo) ListDeliveriesByWebhook(ctx context.Context, webhookID uuid.UUID, limit int) ([]WebhookDelivery, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := r.pool.Query(ctx,
		`SELECT id, webhook_id, event_type, payload, response_status, response_body, attempt, status, error_message, delivered_at, created_at
		 FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`, webhookID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("webhook delivery list: %w", err)
	}
	defer rows.Close()

	var deliveries []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.EventType, &d.Payload, &d.ResponseStatus, &d.ResponseBody, &d.Attempt, &d.Status, &d.ErrorMessage, &d.DeliveredAt, &d.CreatedAt); err != nil {
			return nil, fmt.Errorf("webhook delivery scan: %w", err)
		}
		deliveries = append(deliveries, d)
	}
	return deliveries, nil
}
