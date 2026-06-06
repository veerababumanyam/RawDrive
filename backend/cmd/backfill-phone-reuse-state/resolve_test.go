package main

import (
	"testing"
	"time"
)

func at(day int) time.Time { return time.Date(2026, 1, day, 0, 0, 0, 0, time.UTC) }

// byID indexes decisions for assertion convenience.
func byID(ds []decision) map[string]decision {
	m := make(map[string]decision, len(ds))
	for _, d := range ds {
		m[d.ID] = d
	}
	return m
}

func TestPlanBackfill_SingletonFreeAndPaid(t *testing.T) {
	got := byID(planBackfill([]account{
		{ID: "u1", Normalized: "919000000001", CreatedAt: at(1), Paid: false},
		{ID: "u2", Normalized: "919000000002", CreatedAt: at(1), Paid: true},
		{ID: "u3", Normalized: "", CreatedAt: at(1), Paid: false}, // phoneless
	}))
	if got["u1"].State != stateFree {
		t.Fatalf("u1 = %q, want free", got["u1"].State)
	}
	if got["u2"].State != statePaidActive {
		t.Fatalf("u2 = %q, want paid_active", got["u2"].State)
	}
	if got["u3"].State != stateFree {
		t.Fatalf("u3 (phoneless) = %q, want free", got["u3"].State)
	}
	for id, d := range got {
		if d.Collision {
			t.Fatalf("%s flagged as collision but is a singleton", id)
		}
	}
}

// The core auto-resolve rule: oldest non-paid keeps free, later non-paid
// colliders become paid_expired, paid colliders become paid_active.
func TestPlanBackfill_CollisionResolution(t *testing.T) {
	got := byID(planBackfill([]account{
		// All share one normalized phone (differently-formatted at signup).
		{ID: "newest_free", Normalized: "919876543210", CreatedAt: at(5), Paid: false},
		{ID: "oldest_free", Normalized: "919876543210", CreatedAt: at(1), Paid: false},
		{ID: "mid_paid", Normalized: "919876543210", CreatedAt: at(3), Paid: true},
		{ID: "mid_free", Normalized: "919876543210", CreatedAt: at(4), Paid: false},
	}))

	if got["oldest_free"].State != stateFree {
		t.Fatalf("oldest_free = %q, want free (keeps the single free slot)", got["oldest_free"].State)
	}
	if got["mid_paid"].State != statePaidActive {
		t.Fatalf("mid_paid = %q, want paid_active", got["mid_paid"].State)
	}
	if got["mid_free"].State != statePaidExpired {
		t.Fatalf("mid_free = %q, want paid_expired (lost the free slot)", got["mid_free"].State)
	}
	if got["newest_free"].State != statePaidExpired {
		t.Fatalf("newest_free = %q, want paid_expired", got["newest_free"].State)
	}
	// Exactly ONE free in the group — the invariant the partial unique index needs.
	freeCount := 0
	for _, id := range []string{"oldest_free", "mid_paid", "mid_free", "newest_free"} {
		if got[id].State == stateFree {
			freeCount++
		}
		if !got[id].Collision {
			t.Fatalf("%s should be flagged Collision", id)
		}
	}
	if freeCount != 1 {
		t.Fatalf("group has %d free accounts, want exactly 1", freeCount)
	}
}

// A collision group whose oldest member is paid: the paid one is paid_active and
// the single free slot still goes to the oldest NON-paid member.
func TestPlanBackfill_OldestPaid_FreeGoesToOldestNonPaid(t *testing.T) {
	got := byID(planBackfill([]account{
		{ID: "oldest_paid", Normalized: "918000000000", CreatedAt: at(1), Paid: true},
		{ID: "second_free", Normalized: "918000000000", CreatedAt: at(2), Paid: false},
		{ID: "third_free", Normalized: "918000000000", CreatedAt: at(3), Paid: false},
	}))
	if got["oldest_paid"].State != statePaidActive {
		t.Fatalf("oldest_paid = %q, want paid_active", got["oldest_paid"].State)
	}
	if got["second_free"].State != stateFree {
		t.Fatalf("second_free = %q, want free", got["second_free"].State)
	}
	if got["third_free"].State != statePaidExpired {
		t.Fatalf("third_free = %q, want paid_expired", got["third_free"].State)
	}
}

// Determinism: equal CreatedAt is broken by ID so the same input always yields
// the same free-slot winner (critical — the index must be reproducibly buildable).
func TestPlanBackfill_DeterministicTieBreak(t *testing.T) {
	in := []account{
		{ID: "b", Normalized: "917000000000", CreatedAt: at(1), Paid: false},
		{ID: "a", Normalized: "917000000000", CreatedAt: at(1), Paid: false},
	}
	for i := 0; i < 5; i++ {
		got := byID(planBackfill(in))
		if got["a"].State != stateFree || got["b"].State != statePaidExpired {
			t.Fatalf("non-deterministic tie-break: a=%q b=%q", got["a"].State, got["b"].State)
		}
	}
}

func TestPlanBackfill_NoPaidPendingEverEmitted(t *testing.T) {
	for _, d := range planBackfill([]account{
		{ID: "x", Normalized: "916000000000", CreatedAt: at(1), Paid: false},
		{ID: "y", Normalized: "916000000000", CreatedAt: at(2), Paid: true},
	}) {
		if d.State != stateFree && d.State != statePaidActive && d.State != statePaidExpired {
			t.Fatalf("%s got unexpected backfill state %q", d.ID, d.State)
		}
	}
}
