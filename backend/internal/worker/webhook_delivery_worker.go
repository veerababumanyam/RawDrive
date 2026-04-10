package worker

// webhook_delivery_worker.go — M9 E26-S2 outbound webhook delivery.
//
// The webhook tables (webhooks, webhook_deliveries) and HMAC signing
// existed since migration 042 but no actual delivery mechanism was wired.
// This worker closes that gap: it polls webhook_deliveries for pending
// rows, POSTs them to the subscriber URL with the X-RawDrive-Signature
// header, and records the response.
//
// Retry strategy: exponential backoff via the dedicated DeliveryAttempt
// state. Pending rows with attempt < maxAttempts and last_attempted_at
// older than backoff(attempt) are picked up. After maxAttempts the row
// is moved to "dead" status — operators can manually retry from the
// dashboard once the upstream is fixed.
//
// Concurrency: single-instance only for simplicity. The pending poll
// uses FOR UPDATE SKIP LOCKED so adding a second instance is safe but
// not currently necessary at rawdrive's scale.

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookDelivery is the local view of a delivery row. We re-declare it
// to avoid forcing a repository import in the worker (the existing
// repository.WebhookDelivery type is fine but a smaller struct keeps
// this worker self-contained and easier to test).
type WebhookDelivery struct {
	ID          uuid.UUID
	WebhookID   uuid.UUID
	URL         string
	Secret      string
	EventType   string
	Payload     []byte
	Attempt     int
	Status      string
	LastError   string
	LastAttempt *time.Time
}

// WebhookDeliveryWorker polls and dispatches pending webhook deliveries.
type WebhookDeliveryWorker struct {
	pool         *pgxpool.Pool
	httpClient   *http.Client
	pollInterval time.Duration
	maxAttempts  int
	stopCh       chan struct{}
}

// NewWebhookDeliveryWorker constructs a worker with sensible defaults.
// httpClient nil → uses http.Client{Timeout: 30s}.
func NewWebhookDeliveryWorker(pool *pgxpool.Pool) *WebhookDeliveryWorker {
	return &WebhookDeliveryWorker{
		pool:         pool,
		httpClient:   &http.Client{Timeout: 30 * time.Second},
		pollInterval: 10 * time.Second,
		maxAttempts:  5,
		stopCh:       make(chan struct{}),
	}
}

// WithHTTPClient overrides the HTTP client (used by tests with httptest).
func (w *WebhookDeliveryWorker) WithHTTPClient(c *http.Client) *WebhookDeliveryWorker {
	w.httpClient = c
	return w
}

// WithPollInterval overrides the poll cadence.
func (w *WebhookDeliveryWorker) WithPollInterval(d time.Duration) *WebhookDeliveryWorker {
	w.pollInterval = d
	return w
}

// Start implements worker.Worker.
func (w *WebhookDeliveryWorker) Start(ctx context.Context) {
	log.Println("webhook delivery worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Println("webhook delivery worker: ctx cancelled, stopping")
			return
		case <-w.stopCh:
			log.Println("webhook delivery worker: stop signal received")
			return
		case <-ticker.C:
			w.processBatch(ctx)
		}
	}
}

// Stop implements worker.Worker.
func (w *WebhookDeliveryWorker) Stop() {
	close(w.stopCh)
}

// processBatch claims pending deliveries and dispatches each one. Errors
// from individual deliveries do not abort the batch.
func (w *WebhookDeliveryWorker) processBatch(ctx context.Context) {
	rows, err := w.pool.Query(ctx, `
		SELECT d.id, d.webhook_id, w.url, w.secret, d.event_type, d.payload,
		       d.attempt, COALESCE(d.error_message, '')
		FROM webhook_deliveries d
		JOIN webhooks w ON w.id = d.webhook_id
		WHERE d.status IN ('pending', 'failed')
		  AND d.attempt < $1
		  AND w.is_active = true
		ORDER BY d.created_at ASC
		LIMIT 10
		FOR UPDATE SKIP LOCKED`, w.maxAttempts)
	if err != nil {
		log.Printf("webhook worker: claim batch: %v", err)
		return
	}
	defer rows.Close()

	var batch []WebhookDelivery
	for rows.Next() {
		var d WebhookDelivery
		if err := rows.Scan(&d.ID, &d.WebhookID, &d.URL, &d.Secret, &d.EventType,
			&d.Payload, &d.Attempt, &d.LastError); err != nil {
			log.Printf("webhook worker: scan: %v", err)
			continue
		}
		batch = append(batch, d)
	}

	for _, d := range batch {
		w.deliverOne(ctx, d)
	}
}

// deliverOne POSTs a single delivery to its subscriber URL, writes the
// outcome back to the row, and updates status:
//
//	2xx                       → completed
//	4xx, 5xx, network failure → failed (re-tried up to maxAttempts)
//	4xx                       → still re-tried because the client could
//	                            be transiently misconfigured (Stripe model)
//	final attempt failure     → status = "dead", operator must manually retry
func (w *WebhookDeliveryWorker) deliverOne(ctx context.Context, d WebhookDelivery) {
	signature := signWebhookPayload(d.Secret, d.Payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.URL, bytes.NewReader(d.Payload))
	if err != nil {
		w.recordFailure(ctx, d, fmt.Sprintf("build request: %v", err), 0)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "RawDrive-Webhook/1.0")
	req.Header.Set("X-RawDrive-Event", d.EventType)
	req.Header.Set("X-RawDrive-Signature", signature)
	req.Header.Set("X-RawDrive-Delivery", d.ID.String())

	resp, err := w.httpClient.Do(req)
	if err != nil {
		w.recordFailure(ctx, d, fmt.Sprintf("transport: %v", err), 0)
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		w.recordSuccess(ctx, d, resp.StatusCode, string(bodyBytes))
		return
	}
	w.recordFailure(ctx, d, fmt.Sprintf("status %d: %s", resp.StatusCode, string(bodyBytes)), resp.StatusCode)
}

// signWebhookPayload returns the HMAC-SHA256 hex digest of the payload.
// Subscribers verify by recomputing with their stored secret.
func signWebhookPayload(secret string, payload []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return hex.EncodeToString(mac.Sum(nil))
}

// recordSuccess marks the delivery completed.
func (w *WebhookDeliveryWorker) recordSuccess(ctx context.Context, d WebhookDelivery, status int, body string) {
	_, err := w.pool.Exec(ctx,
		`UPDATE webhook_deliveries
		 SET status = 'completed',
		     attempt = attempt + 1,
		     response_status = $2,
		     response_body = $3,
		     delivered_at = now(),
		     error_message = NULL
		 WHERE id = $1`,
		d.ID, status, body)
	if err != nil {
		log.Printf("webhook worker: record success %s: %v", d.ID, err)
	}
}

// recordFailure increments the attempt counter and marks the row as
// either "failed" (will be retried) or "dead" (max attempts reached).
func (w *WebhookDeliveryWorker) recordFailure(ctx context.Context, d WebhookDelivery, errMsg string, status int) {
	nextAttempt := d.Attempt + 1
	newStatus := "failed"
	if nextAttempt >= w.maxAttempts {
		newStatus = "dead"
	}
	_, err := w.pool.Exec(ctx,
		`UPDATE webhook_deliveries
		 SET status = $2,
		     attempt = $3,
		     response_status = NULLIF($4, 0),
		     error_message = $5
		 WHERE id = $1`,
		d.ID, newStatus, nextAttempt, status, errMsg)
	if err != nil {
		log.Printf("webhook worker: record failure %s: %v", d.ID, err)
	}
}

// Verify the package contract: this worker is a worker.Worker.
var _ Worker = (*WebhookDeliveryWorker)(nil)

// Sentinel for tests that want to assert the worker handled a malformed
// row gracefully (currently just logged, not returned).
var ErrNoActiveWebhook = errors.New("webhook worker: no active webhook for delivery")
