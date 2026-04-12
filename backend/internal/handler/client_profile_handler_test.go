package handler

import (
	"testing"
	"time"
)

func TestSortTimelineDesc(t *testing.T) {
	now := time.Now()
	entries := []TimelineEntry{
		{Timestamp: now.Add(-2 * time.Hour), Type: "deal_created", Title: "oldest"},
		{Timestamp: now, Type: "invoice_paid", Title: "newest"},
		{Timestamp: now.Add(-1 * time.Hour), Type: "invoice_sent", Title: "middle"},
	}

	sortTimelineDesc(entries)

	if entries[0].Title != "newest" {
		t.Errorf("expected newest first, got %q", entries[0].Title)
	}
	if entries[1].Title != "middle" {
		t.Errorf("expected middle second, got %q", entries[1].Title)
	}
	if entries[2].Title != "oldest" {
		t.Errorf("expected oldest last, got %q", entries[2].Title)
	}
}

func TestSortTimelineDesc_Empty(t *testing.T) {
	var entries []TimelineEntry
	sortTimelineDesc(entries) // should not panic
	if len(entries) != 0 {
		t.Errorf("expected empty slice, got %d entries", len(entries))
	}
}

func TestSortTimelineDesc_SingleEntry(t *testing.T) {
	entries := []TimelineEntry{
		{Timestamp: time.Now(), Type: "deal_created", Title: "only"},
	}
	sortTimelineDesc(entries)
	if entries[0].Title != "only" {
		t.Errorf("expected single entry preserved, got %q", entries[0].Title)
	}
}

func TestSortTimelineDesc_SameTimestamp(t *testing.T) {
	now := time.Now()
	entries := []TimelineEntry{
		{Timestamp: now, Type: "deal_created", Title: "a"},
		{Timestamp: now, Type: "invoice_sent", Title: "b"},
		{Timestamp: now, Type: "invoice_paid", Title: "c"},
	}
	sortTimelineDesc(entries)
	// All same timestamp — sort is stable (insertion sort), order preserved.
	if len(entries) != 3 {
		t.Errorf("expected 3 entries, got %d", len(entries))
	}
}

func TestProfileResponseTypes(t *testing.T) {
	// Verify that the response types can be instantiated without issues.
	resp := ClientProfileResponse{
		Contact: ProfileContact{
			Name:        "Test Client",
			ContactType: "client",
		},
		Galleries:       []ProfileGallery{},
		Invoices:        []ProfileInvoice{},
		Deals:           []ProfileDeal{},
		Events:          []ProfileEvent{},
		LifetimeRevenue: 150000,
	}

	if resp.Contact.Name != "Test Client" {
		t.Errorf("expected name Test Client, got %q", resp.Contact.Name)
	}
	if resp.LifetimeRevenue != 150000 {
		t.Errorf("expected lifetime revenue 150000, got %d", resp.LifetimeRevenue)
	}
	if len(resp.Galleries) != 0 {
		t.Errorf("expected empty galleries, got %d", len(resp.Galleries))
	}
}

func TestTimelineEntryMetadata(t *testing.T) {
	entry := TimelineEntry{
		Timestamp: time.Now(),
		Type:      "invoice_paid",
		Title:     "Invoice paid: INV-001",
		Metadata: map[string]any{
			"invoice_id":        "abc-123",
			"amount_paid_paisa": int64(50000),
		},
	}
	if entry.Type != "invoice_paid" {
		t.Errorf("expected type invoice_paid, got %q", entry.Type)
	}
	if entry.Metadata["invoice_id"] != "abc-123" {
		t.Errorf("expected invoice_id abc-123, got %v", entry.Metadata["invoice_id"])
	}
}

func TestNewClientProfileHandler(t *testing.T) {
	// Verify constructor does not panic with nil (handler won't work, but
	// construction should be safe for DI wiring order).
	h := NewClientProfileHandler(nil)
	if h == nil {
		t.Error("expected non-nil handler")
	}
}
