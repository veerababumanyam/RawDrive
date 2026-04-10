package handler

// NotificationDispatcher is a thin handler-package wrapper that adapts the
// shared service.NotificationDeliveryService into a narrow call-site API for
// M4 handlers. It exists so lead / booking / payment / invoice flows can
// fire notifications in one line without threading the full delivery
// service, its providers, and the owner-lookup query through every handler.
//
// Design:
//
//   - The wrapper holds the delivery service and a workspace → owner-user
//     lookup function. Production wires the lookup to a real pgxpool query
//     on the workspaces.owner_id column; tests inject a fake.
//
//   - Dispatch is best-effort: a delivery failure must never fail the
//     originating HTTP request (a lead capture, a booking, a payment).
//     Errors are logged at the service layer and a telemetry hook may be
//     added later. The dispatcher's Notify method returns no error.
//
//   - The wrapper is safe when nil. Handlers can hold a *NotificationDispatcher
//     that was not wired in main.go (for example in tests) and call Notify
//     without guarding — the method is a no-op on a nil receiver. This keeps
//     handler code uncluttered.
//
//   - The "bookings" category is used for lead-created notifications because
//     the M4 schema treats lead capture as the top of the booking funnel.
//     The full category set is enforced by the delivery service itself.

import (
	"context"
	"log"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/service"
)

// OwnerLookupFunc resolves the user ID of a workspace's primary owner.
// Returns uuid.Nil if the workspace has no resolvable owner — the
// dispatcher treats that as "nothing to notify" and logs a debug line.
type OwnerLookupFunc func(ctx context.Context, workspaceID uuid.UUID) (uuid.UUID, error)

// NotificationDispatcher bundles the delivery service with the owner lookup.
type NotificationDispatcher struct {
	delivery *service.NotificationDeliveryService
	lookup   OwnerLookupFunc
}

// NewNotificationDispatcher builds a dispatcher. Both arguments are required;
// if either is nil the returned dispatcher is a no-op, which is the desired
// behavior in tests and in deployments where delivery is not yet wired.
func NewNotificationDispatcher(delivery *service.NotificationDeliveryService, lookup OwnerLookupFunc) *NotificationDispatcher {
	if delivery == nil || lookup == nil {
		return nil
	}
	return &NotificationDispatcher{delivery: delivery, lookup: lookup}
}

// Notify resolves the workspace owner and dispatches a single intent. It is
// safe to call on a nil receiver — the call becomes a no-op. Per-channel
// errors are swallowed after being logged by the delivery service; this
// method must never fail the caller's HTTP request.
func (d *NotificationDispatcher) Notify(ctx context.Context, workspaceID uuid.UUID, category, title, body, actionURL string) {
	if d == nil {
		return
	}
	if workspaceID == uuid.Nil {
		return
	}
	ownerID, err := d.lookup(ctx, workspaceID)
	if err != nil {
		log.Printf("notification dispatcher: owner lookup failed workspace=%s err=%v", workspaceID, err)
		return
	}
	if ownerID == uuid.Nil {
		log.Printf("notification dispatcher: no owner resolved for workspace=%s — skipping", workspaceID)
		return
	}
	wsCopy := workspaceID
	intent := service.NotificationIntent{
		UserID:      ownerID,
		WorkspaceID: &wsCopy,
		Category:    category,
		Title:       title,
		Body:        body,
		ActionURL:   actionURL,
	}
	if _, err := d.delivery.Deliver(ctx, intent); err != nil {
		log.Printf("notification dispatcher: delivery failed workspace=%s owner=%s category=%s err=%v",
			workspaceID, ownerID, category, err)
	}
}
