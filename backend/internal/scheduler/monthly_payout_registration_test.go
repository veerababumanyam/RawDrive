package scheduler

import (
	"context"
	"testing"
	"time"
)

// TestMonthlyPayoutRegistration verifies that the scheduler accepts the
// exact shape of the job main.go registers: name="monthly-payout-calculation",
// schedule=MonthlyOnDay(1), and a context-accepting JobFunc. This test pins
// the contract so a future refactor of main.go can't silently break it.
func TestMonthlyPayoutRegistration(t *testing.T) {
	s := New()
	called := false
	job := func(_ context.Context) error {
		called = true
		return nil
	}

	if err := s.Register("monthly-payout-calculation", MonthlyOnDay(1), job); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}

	// Verify the job was registered with the expected name and schedule.
	jobs := s.Jobs()
	if len(jobs) != 1 {
		t.Fatalf("want 1 registered job, got %d", len(jobs))
	}
	if jobs[0].Name != "monthly-payout-calculation" {
		t.Errorf("want name %q, got %q", "monthly-payout-calculation", jobs[0].Name)
	}
	if jobs[0].Schedule != "monthly on day 1 at 00:00" {
		t.Errorf("want schedule %q, got %q", "monthly on day 1 at 00:00", jobs[0].Schedule)
	}
	// NextRun should be in the future (the 1st of some upcoming month).
	if !jobs[0].NextRun.After(time.Now()) {
		t.Errorf("NextRun %s should be in the future", jobs[0].NextRun)
	}

	// Duplicate registration must error.
	if err := s.Register("monthly-payout-calculation", MonthlyOnDay(1), job); err == nil {
		t.Error("want error on duplicate registration, got nil")
	}

	// The job should not have been invoked yet (Start not called).
	if called {
		t.Error("job should not have run without Start()")
	}

	// Stat should return the registration with zero run count.
	stat, ok := s.Stat("monthly-payout-calculation")
	if !ok {
		t.Fatal("Stat returned not found")
	}
	if stat.RunCount != 0 {
		t.Errorf("want 0 runs, got %d", stat.RunCount)
	}
}

// TestMonthlyPayoutRegistration_RejectsMissingArgs guards against main.go
// accidentally passing a nil schedule or JobFunc.
func TestMonthlyPayoutRegistration_RejectsMissingArgs(t *testing.T) {
	s := New()

	if err := s.Register("", MonthlyOnDay(1), func(_ context.Context) error { return nil }); err == nil {
		t.Error("want error for empty name")
	}
	if err := s.Register("x", nil, func(_ context.Context) error { return nil }); err == nil {
		t.Error("want error for nil schedule")
	}
	if err := s.Register("x", MonthlyOnDay(1), nil); err == nil {
		t.Error("want error for nil job func")
	}
}
