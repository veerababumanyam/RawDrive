package worker

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// fakePublisher records Publish calls for inspection.
type fakePublisher struct {
	mu       sync.Mutex
	subjects []string
	payloads [][]byte
	failNext bool
}

func (p *fakePublisher) Publish(_ context.Context, subject string, data []byte) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.failNext {
		p.failNext = false
		return errors.New("broker unavailable")
	}
	p.subjects = append(p.subjects, subject)
	p.payloads = append(p.payloads, data)
	return nil
}

// TestPublishAssetReady_EmitsCorrectSubjectAndPayload verifies the helper
// publishes on the expected subject with a JSON body carrying asset_id and
// workspace_id.
func TestPublishAssetReady_EmitsCorrectSubjectAndPayload(t *testing.T) {
	p := &fakePublisher{}
	assetID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	workspaceID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	PublishAssetReady(context.Background(), p, assetID, workspaceID)

	if len(p.subjects) != 1 {
		t.Fatalf("expected 1 publish, got %d", len(p.subjects))
	}
	wantSubject := "asset.ready." + workspaceID.String()
	if p.subjects[0] != wantSubject {
		t.Errorf("subject: want %s, got %q", wantSubject, p.subjects[0])
	}

	var body struct {
		AssetID     string `json:"asset_id"`
		WorkspaceID string `json:"workspace_id"`
	}
	if err := json.Unmarshal(p.payloads[0], &body); err != nil {
		t.Fatalf("payload not valid JSON: %v", err)
	}
	if body.AssetID != assetID.String() {
		t.Errorf("asset_id: want %s, got %s", assetID, body.AssetID)
	}
	if body.WorkspaceID != workspaceID.String() {
		t.Errorf("workspace_id: want %s, got %s", workspaceID, body.WorkspaceID)
	}
}

// TestPublishAssetReady_NilPublisherIsSafe verifies that passing nil as the
// publisher is a no-op rather than a panic. The thumbnail worker's publisher
// field is optional to keep existing tests compiling.
func TestPublishAssetReady_NilPublisherIsSafe(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("nil publisher caused panic: %v", r)
		}
	}()
	PublishAssetReady(context.Background(), nil, uuid.New(), uuid.New())
}

// TestPublishAssetReady_DoesNotPanicOnPublishError verifies publish errors
// are swallowed (logged) rather than propagated — a failed event publish
// must never fail the worker's main job (asset processing).
func TestPublishAssetReady_DoesNotPanicOnPublishError(t *testing.T) {
	p := &fakePublisher{failNext: true}
	defer func() {
		if r := recover(); r != nil {
			t.Errorf("publish error caused panic: %v", r)
		}
	}()
	PublishAssetReady(context.Background(), p, uuid.New(), uuid.New())
}
