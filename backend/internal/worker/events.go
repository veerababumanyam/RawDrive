package worker

// events.go — worker-side event publication helpers.
//
// The background workers (thumbnail, face detection, AI tagging) need to
// notify the rest of the system when they finish processing an asset so
// downstream consumers can react: analytics counters, notification
// preferences dashboards, audit logs, external webhooks, etc.
//
// We use a very small interface (Publisher) so the workers depend only on
// `Publish(ctx, subject, []byte) error` and not on the concrete EventBroker
// in the handler package. This avoids an import cycle and keeps the worker
// package unit-testable.
//
// The AI auto-tag/auto-index pipeline remains polling-based (by design —
// the search worker claims pending assets with FOR UPDATE SKIP LOCKED which
// is already correct). These events exist for OTHER consumers.

import (
	"context"
	"encoding/json"
	"log"

	"github.com/google/uuid"
)

// Publisher is the minimal surface a worker needs to publish events. Both
// *handler.EventBroker and test fakes implement it.
type Publisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

// AssetReadyPayload is the JSON body attached to an asset.ready event.
// Keep this stable — external subscribers may depend on the shape.
type AssetReadyPayload struct {
	AssetID     string `json:"asset_id"`
	WorkspaceID string `json:"workspace_id"`
}

// PublishAssetReady emits an "asset.ready" event to the given publisher.
//
// Guarantees:
//   - Nil publisher is a safe no-op (keeps worker constructors uncoupled).
//   - Publish errors are logged and swallowed — a failed notification must
//     never fail the worker's core job (asset processing).
//   - No panic on encode failure; we fail-soft with an error log.
//
// The subject `asset.ready` is matched by EventBroker prefix matching, so
// subscribers using pattern `asset` or `asset.ready` both receive it.
func PublishAssetReady(ctx context.Context, p Publisher, assetID, workspaceID uuid.UUID) {
	if p == nil {
		return
	}
	body, err := json.Marshal(AssetReadyPayload{
		AssetID:     assetID.String(),
		WorkspaceID: workspaceID.String(),
	})
	if err != nil {
		log.Printf("worker event: marshal asset.ready: %v", err)
		return
	}
	if err := p.Publish(ctx, "asset.ready", body); err != nil {
		log.Printf("worker event: publish asset.ready: %v", err)
	}
}
