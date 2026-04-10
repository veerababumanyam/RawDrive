package scheduler

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

// TestRegisterAndListJobs verifies registered jobs are discoverable by name.
func TestRegisterAndListJobs(t *testing.T) {
	s := New()
	s.Register("payout-monthly", EveryDuration(24*time.Hour), func(context.Context) error { return nil })
	s.Register("retention-daily", EveryDuration(24*time.Hour), func(context.Context) error { return nil })

	jobs := s.Jobs()
	if len(jobs) != 2 {
		t.Fatalf("expected 2 jobs, got %d", len(jobs))
	}
	names := map[string]bool{}
	for _, j := range jobs {
		names[j.Name] = true
	}
	if !names["payout-monthly"] || !names["retention-daily"] {
		t.Errorf("missing expected job names, got: %v", names)
	}
}

// TestRegisterDuplicateReturnsError verifies same-name registration fails.
func TestRegisterDuplicateReturnsError(t *testing.T) {
	s := New()
	if err := s.Register("job", EveryDuration(time.Hour), func(context.Context) error { return nil }); err != nil {
		t.Fatalf("first register failed: %v", err)
	}
	if err := s.Register("job", EveryDuration(time.Hour), func(context.Context) error { return nil }); err == nil {
		t.Error("expected duplicate registration to fail")
	}
}

// TestRunsAtInterval verifies a job with a small interval runs multiple
// times when the scheduler is started.
func TestRunsAtInterval(t *testing.T) {
	s := New()
	var runs int32
	err := s.Register("fast", EveryDuration(20*time.Millisecond), func(context.Context) error {
		atomic.AddInt32(&runs, 1)
		return nil
	})
	if err != nil {
		t.Fatalf("Register: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)
	defer s.Stop()

	// Wait for multiple ticks
	time.Sleep(90 * time.Millisecond)

	got := atomic.LoadInt32(&runs)
	if got < 2 {
		t.Errorf("expected at least 2 runs in 90ms with 20ms interval, got %d", got)
	}
}

// TestStopHaltsJob verifies that after Stop the job stops executing.
func TestStopHaltsJob(t *testing.T) {
	s := New()
	var runs int32
	_ = s.Register("halt-me", EveryDuration(10*time.Millisecond), func(context.Context) error {
		atomic.AddInt32(&runs, 1)
		return nil
	})

	ctx := context.Background()
	s.Start(ctx)
	time.Sleep(35 * time.Millisecond)
	s.Stop()

	runsAtStop := atomic.LoadInt32(&runs)
	time.Sleep(40 * time.Millisecond)
	runsAfterWait := atomic.LoadInt32(&runs)

	if runsAfterWait > runsAtStop+1 { // allow one in-flight tick
		t.Errorf("job kept running after Stop: before=%d after=%d", runsAtStop, runsAfterWait)
	}
}

// TestErrorIncrementsCountButContinues verifies that job errors are counted
// but the scheduler does NOT unregister the job.
func TestErrorIncrementsCountButContinues(t *testing.T) {
	s := New()
	var runs int32
	_ = s.Register("failing", EveryDuration(15*time.Millisecond), func(context.Context) error {
		atomic.AddInt32(&runs, 1)
		return errors.New("boom")
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	s.Start(ctx)
	defer s.Stop()

	time.Sleep(70 * time.Millisecond)

	stats, ok := s.Stat("failing")
	if !ok {
		t.Fatal("stats missing for registered job")
	}
	if stats.ErrorCount < 2 {
		t.Errorf("expected >= 2 errors, got %d", stats.ErrorCount)
	}
	if stats.RunCount < 2 {
		t.Errorf("expected >= 2 runs, got %d", stats.RunCount)
	}
}

// TestDailyAtNextRun verifies DailyAt schedule next-run computation.
func TestDailyAtNextRun(t *testing.T) {
	// Fixed reference time: 2026-04-10 08:00:00 UTC
	now := time.Date(2026, 4, 10, 8, 0, 0, 0, time.UTC)

	// Schedule: daily at 02:00 — should be tomorrow 02:00
	sched := DailyAt(2, 0)
	next := sched.Next(now)
	want := time.Date(2026, 4, 11, 2, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("DailyAt(2,0) from 08:00 → want %v, got %v", want, next)
	}

	// Schedule: daily at 14:00 — should be today 14:00
	schedLater := DailyAt(14, 0)
	nextLater := schedLater.Next(now)
	wantLater := time.Date(2026, 4, 10, 14, 0, 0, 0, time.UTC)
	if !nextLater.Equal(wantLater) {
		t.Errorf("DailyAt(14,0) from 08:00 → want %v, got %v", wantLater, nextLater)
	}
}

// TestMonthlyOnDayNextRun verifies MonthlyOnDay next-run for typical cases.
func TestMonthlyOnDayNextRun(t *testing.T) {
	// From mid-month: 2026-04-15 → next should be 2026-05-01 00:00 UTC
	sched := MonthlyOnDay(1)
	now := time.Date(2026, 4, 15, 12, 0, 0, 0, time.UTC)
	next := sched.Next(now)
	want := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("MonthlyOnDay(1) from 2026-04-15 → want %v, got %v", want, next)
	}

	// From 1st of month exactly midnight — should return NEXT month
	now2 := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	next2 := sched.Next(now2)
	want2 := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	if !next2.Equal(want2) {
		t.Errorf("MonthlyOnDay(1) exactly at 2026-04-01 00:00 → want %v, got %v", want2, next2)
	}
}

// TestEveryDurationNextRun verifies interval-based schedules.
func TestEveryDurationNextRun(t *testing.T) {
	sched := EveryDuration(2 * time.Hour)
	now := time.Date(2026, 4, 10, 8, 0, 0, 0, time.UTC)
	next := sched.Next(now)
	want := now.Add(2 * time.Hour)
	if !next.Equal(want) {
		t.Errorf("EveryDuration(2h) → want %v, got %v", want, next)
	}
}
