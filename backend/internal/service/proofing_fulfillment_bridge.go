package service

// proofing_fulfillment_bridge.go — M14 GAL-FR-159.
//
// Converts finalized proofing selections into a fulfillment order.
// The typical flow:
//
//  1. Client browses the gallery, stars favorites via proofing
//  2. Client submits their selections (ProofingService.SubmitSelections)
//  3. Studio reviews and approves
//  4. Studio triggers the bridge, which:
//       a. Reads the submitted selections for the gallery
//       b. Computes a subtotal using a resolver (default: zero — i.e.
//          the selections are provided as free digital deliverables)
//       c. Creates a gallery_orders row with fulfillment_status=pending
//          and an items[] array of {asset_id, type:"proofing_selection"}
//
// The resolver interface keeps pricing logic pluggable so future
// integrations (print products auto-selected from proofing, digital
// bundles based on count) slot in without changing the bridge.

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// ProofingOrderPricer computes a subtotal for a set of selection asset
// IDs. nil → free (zero subtotal).
type ProofingOrderPricer interface {
	PriceProofingSelections(ctx context.Context, galleryID uuid.UUID, assetIDs []uuid.UUID) (int, error)
}

// Bridge errors surfaced to handlers.
var (
	ErrBridgeNoSelections = errors.New("bridge: no approved selections to fulfill")
	ErrBridgeMissingEmail = errors.New("bridge: client_email required")
)

// ProofingFulfillmentBridge wires approved proofing selections into the
// gallery_orders table.
type ProofingFulfillmentBridge struct {
	proofingRepo *repository.ProofingRepo
	orderRepo    *repository.OrderRepo
	pricer       ProofingOrderPricer
}

// NewProofingFulfillmentBridge constructs a bridge. pricer may be nil.
func NewProofingFulfillmentBridge(pr *repository.ProofingRepo, or *repository.OrderRepo, pricer ProofingOrderPricer) *ProofingFulfillmentBridge {
	return &ProofingFulfillmentBridge{
		proofingRepo: pr,
		orderRepo:    or,
		pricer:       pricer,
	}
}

// BridgeInput is the request payload.
type BridgeInput struct {
	GalleryID   uuid.UUID `json:"gallery_id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	ClientName  string    `json:"client_name"`
	ClientEmail string    `json:"client_email"`
}

// BridgeSelections pulls the client's selections and creates a pending
// order. Returns the new order ID so the caller can surface it in the
// response.
func (b *ProofingFulfillmentBridge) BridgeSelections(ctx context.Context, in BridgeInput) (*repository.GalleryOrder, error) {
	if strings.TrimSpace(in.ClientEmail) == "" {
		return nil, ErrBridgeMissingEmail
	}

	selections, err := b.proofingRepo.ListByClient(ctx, in.GalleryID, in.ClientEmail)
	if err != nil {
		return nil, err
	}
	if len(selections) == 0 {
		return nil, ErrBridgeNoSelections
	}

	// Only items the client actually selected (not rejected).
	selectedAssetIDs := make([]uuid.UUID, 0, len(selections))
	for _, sel := range selections {
		if sel.Status == "selected" || sel.Status == "approved" {
			selectedAssetIDs = append(selectedAssetIDs, sel.AssetID)
		}
	}
	if len(selectedAssetIDs) == 0 {
		return nil, ErrBridgeNoSelections
	}

	// Price the selections. nil pricer → free bundle.
	subtotal := 0
	if b.pricer != nil {
		subtotal, err = b.pricer.PriceProofingSelections(ctx, in.GalleryID, selectedAssetIDs)
		if err != nil {
			return nil, err
		}
	}

	// Build the items JSONB payload.
	itemsPayload := make([]map[string]any, 0, len(selectedAssetIDs))
	for _, id := range selectedAssetIDs {
		itemsPayload = append(itemsPayload, map[string]any{
			"type":     "proofing_selection",
			"asset_id": id.String(),
		})
	}
	itemsJSON, err := json.Marshal(itemsPayload)
	if err != nil {
		return nil, err
	}

	order := &repository.GalleryOrder{
		GalleryID:         in.GalleryID,
		WorkspaceID:       in.WorkspaceID,
		ClientName:        in.ClientName,
		ClientEmail:       strings.ToLower(strings.TrimSpace(in.ClientEmail)),
		Items:             itemsJSON,
		Subtotal:          subtotal,
		Discount:          0,
		Total:             subtotal,
		PaymentStatus:     "pending",
		FulfillmentStatus: "pending",
	}
	if err := b.orderRepo.Create(ctx, order); err != nil {
		return nil, err
	}
	return order, nil
}
