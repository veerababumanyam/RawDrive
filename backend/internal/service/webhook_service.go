package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// WebhookService handles webhook subscription and delivery management.
type WebhookService struct {
	webhookRepo *repository.WebhookRepo
}

// NewWebhookService creates a new WebhookService.
func NewWebhookService(wr *repository.WebhookRepo) *WebhookService {
	return &WebhookService{webhookRepo: wr}
}

// CreateWebhookInput holds parameters for creating a webhook.
type CreateWebhookInput struct {
	WorkspaceID uuid.UUID
	URL         string
	Secret      string
	Events      []string
	CreatedBy   *uuid.UUID
}

// CreateWebhook creates a new webhook subscription.
func (s *WebhookService) CreateWebhook(ctx context.Context, input CreateWebhookInput) (*repository.Webhook, error) {
	if input.URL == "" {
		return nil, fmt.Errorf("webhook URL is required")
	}
	if len(input.Events) == 0 {
		return nil, fmt.Errorf("at least one event type is required")
	}

	webhook := &repository.Webhook{
		WorkspaceID: input.WorkspaceID,
		URL:         input.URL,
		Secret:      input.Secret,
		Events:      input.Events,
		IsActive:    true,
		CreatedBy:   input.CreatedBy,
	}

	if err := s.webhookRepo.Create(ctx, webhook); err != nil {
		return nil, fmt.Errorf("create webhook: %w", err)
	}
	return webhook, nil
}

// ListWebhooks returns active webhooks for a workspace.
func (s *WebhookService) ListWebhooks(ctx context.Context, workspaceID uuid.UUID) ([]repository.Webhook, error) {
	return s.webhookRepo.ListByWorkspace(ctx, workspaceID)
}

// DeleteWebhook deactivates a webhook.
func (s *WebhookService) DeleteWebhook(ctx context.Context, id uuid.UUID) error {
	return s.webhookRepo.Delete(ctx, id)
}

// SignPayload generates an HMAC-SHA256 signature for a webhook payload.
func (s *WebhookService) SignPayload(secret string, payload any) (string, []byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return "", nil, fmt.Errorf("webhook sign: marshal: %w", err)
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(data)
	signature := hex.EncodeToString(mac.Sum(nil))

	return signature, data, nil
}

// LogDelivery records a webhook delivery attempt.
func (s *WebhookService) LogDelivery(ctx context.Context, delivery *repository.WebhookDelivery) error {
	return s.webhookRepo.CreateDelivery(ctx, delivery)
}

// GetDeliveries returns recent delivery attempts for a webhook.
func (s *WebhookService) GetDeliveries(ctx context.Context, webhookID uuid.UUID, limit int) ([]repository.WebhookDelivery, error) {
	return s.webhookRepo.ListDeliveriesByWebhook(ctx, webhookID, limit)
}
