// Package scheduler provides a dependency-free cron-style job registry for
// background maintenance tasks: monthly payout calculation (M6), scheduled
// reports (M7), retention sweeps (M7, M10), backup automation (M10), alerting
// cron (M7), and DSR SLA enforcement (M10).
//
// Design choices:
//
//   - No external cron library. For rawdrive's needs — "every N duration",
//     "daily at HH:MM", "monthly on day D" — three schedule kinds are enough
//     and avoid pulling in another dep.
//
//   - One goroutine per job. Jobs are long-running tasks that run infrequently
//     (daily/monthly), so the goroutine-per-job pattern is simple and correct.
//     It also isolates job panics to one goroutine (we recover in the runner).
//
//   - Stats are in-memory. Production operators who need persistence should
//     wire a PersistentStore interface; for MVP the process-local counts are
//     sufficient and match the existing worker_registry ergonomics.
//
//   - Schedules are pure. They take a `now` and return "next run time" — no
//     hidden state — which makes Next() directly testable with fixed times.
//
// Example use:
//
//	s := scheduler.New()
//	s.Register("monthly-payouts",
//	    scheduler.MonthlyOnDay(1),
//	    func(ctx context.Context) error { return payoutSvc.CalculateMonth(ctx) })
//	s.Register("retention-sweep",
//	    scheduler.DailyAt(2, 30),
//	    func(ctx context.Context) error { return retentionSvc.Sweep(ctx) })
//	s.Start(ctx)
//	defer s.Stop()
package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

// Schedule returns the next time a job should fire, given the current time.
// Implementations must be pure (no state) and must always return a time
// strictly after `now`.
type Schedule interface {
	Next(now time.Time) time.Time
	String() string
}

// JobFunc is the signature every registered job implements. It receives a
// cancellable context that the scheduler cancels on Stop().
type JobFunc func(ctx context.Context) error

// Job is a registered job metadata record exposed by Jobs().
type Job struct {
	Name     string
	Schedule string
	NextRun  time.Time
}

// Stats tracks run outcomes for a job over its lifetime in this process.
type Stats struct {
	Name       string
	RunCount   int64
	ErrorCount int64
	LastRun    time.Time
	LastError  string
	NextRun    time.Time
}

// Scheduler is a registry + runner for cron-style jobs.
type Scheduler struct {
	mu      sync.RWMutex
	entries map[string]*entry
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	started bool
}

// entry is the internal per-job record (not exported to avoid tying the
// public API to mutable state).
type entry struct {
	name     string
	schedule Schedule
	fn       JobFunc

	mu         sync.Mutex
	runCount   int64
	errorCount int64
	lastRun    time.Time
	lastError  string
	nextRun    time.Time
}

// New constructs an empty Scheduler.
func New() *Scheduler {
	return &Scheduler{
		entries: make(map[string]*entry),
	}
}

// Register adds a job to the scheduler. The same name cannot be registered
// twice; duplicates return an error. Register must be called before Start.
// (After Start, adding jobs is not supported — restart instead.)
func (s *Scheduler) Register(name string, sched Schedule, fn JobFunc) error {
	if name == "" {
		return errors.New("scheduler: job name required")
	}
	if sched == nil {
		return errors.New("scheduler: schedule required")
	}
	if fn == nil {
		return errors.New("scheduler: job func required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.entries[name]; exists {
		return fmt.Errorf("scheduler: job %q already registered", name)
	}
	s.entries[name] = &entry{
		name:     name,
		schedule: sched,
		fn:       fn,
		nextRun:  sched.Next(time.Now()),
	}
	return nil
}

// Jobs returns a snapshot of all registered jobs.
func (s *Scheduler) Jobs() []Job {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Job, 0, len(s.entries))
	for _, e := range s.entries {
		e.mu.Lock()
		out = append(out, Job{
			Name:     e.name,
			Schedule: e.schedule.String(),
			NextRun:  e.nextRun,
		})
		e.mu.Unlock()
	}
	return out
}

// Stat returns per-job lifetime statistics. The second return is false if
// no job by that name is registered.
func (s *Scheduler) Stat(name string) (Stats, bool) {
	s.mu.RLock()
	e, ok := s.entries[name]
	s.mu.RUnlock()
	if !ok {
		return Stats{}, false
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	return Stats{
		Name:       e.name,
		RunCount:   e.runCount,
		ErrorCount: e.errorCount,
		LastRun:    e.lastRun,
		LastError:  e.lastError,
		NextRun:    e.nextRun,
	}, true
}

// Start begins running all registered jobs in goroutines. Start is idempotent
// — calling it twice is a no-op. The caller-provided ctx is the parent for
// all job goroutines.
func (s *Scheduler) Start(ctx context.Context) {
	s.mu.Lock()
	if s.started {
		s.mu.Unlock()
		return
	}
	s.started = true
	s.ctx, s.cancel = context.WithCancel(ctx)
	entries := make([]*entry, 0, len(s.entries))
	for _, e := range s.entries {
		entries = append(entries, e)
	}
	s.mu.Unlock()

	for _, e := range entries {
		s.wg.Add(1)
		go s.run(e)
	}
	log.Printf("scheduler: started %d job(s)", len(entries))
}

// Stop signals all running jobs to stop and waits for them to return. After
// Stop, the Scheduler cannot be reused.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return
	}
	cancel := s.cancel
	s.started = false
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	s.wg.Wait()
	log.Println("scheduler: stopped")
}

// run is the per-job goroutine loop. It sleeps until nextRun, then invokes
// the job with a derived context, records the outcome, and computes the new
// nextRun. A job panic is recovered and counted as an error, so one buggy
// job cannot take down the whole scheduler.
func (s *Scheduler) run(e *entry) {
	defer s.wg.Done()
	for {
		e.mu.Lock()
		wait := time.Until(e.nextRun)
		e.mu.Unlock()
		if wait < 0 {
			wait = 0
		}
		select {
		case <-s.ctx.Done():
			return
		case <-time.After(wait):
		}

		s.invoke(e)

		// Recompute next run based on the time we finished, so slow jobs
		// don't stack up.
		e.mu.Lock()
		e.nextRun = e.schedule.Next(time.Now())
		e.mu.Unlock()
	}
}

// invoke runs a single job iteration with panic recovery.
func (s *Scheduler) invoke(e *entry) {
	defer func() {
		if r := recover(); r != nil {
			e.mu.Lock()
			e.runCount++
			e.errorCount++
			e.lastRun = time.Now()
			e.lastError = fmt.Sprintf("panic: %v", r)
			e.mu.Unlock()
			log.Printf("scheduler: job %q panicked: %v", e.name, r)
		}
	}()

	err := e.fn(s.ctx)
	e.mu.Lock()
	e.runCount++
	e.lastRun = time.Now()
	if err != nil {
		e.errorCount++
		e.lastError = err.Error()
		log.Printf("scheduler: job %q error: %v", e.name, err)
	} else {
		e.lastError = ""
	}
	e.mu.Unlock()
}

// ─── Schedule implementations ──────────────────────────────────────────

// intervalSchedule fires every `interval` starting `interval` from now.
type intervalSchedule struct{ interval time.Duration }

// EveryDuration returns a Schedule that fires every `d`.
func EveryDuration(d time.Duration) Schedule {
	if d < time.Millisecond {
		d = time.Millisecond
	}
	return &intervalSchedule{interval: d}
}

func (s *intervalSchedule) Next(now time.Time) time.Time {
	return now.Add(s.interval)
}

func (s *intervalSchedule) String() string {
	return "every " + s.interval.String()
}

// dailySchedule fires once per day at HH:MM (local time).
type dailySchedule struct{ hour, minute int }

// DailyAt returns a Schedule that fires daily at the given local hour and
// minute. If the time has already passed today, the next fire is tomorrow.
func DailyAt(hour, minute int) Schedule {
	return &dailySchedule{hour: hour, minute: minute}
}

func (s *dailySchedule) Next(now time.Time) time.Time {
	today := time.Date(now.Year(), now.Month(), now.Day(), s.hour, s.minute, 0, 0, now.Location())
	if today.After(now) {
		return today
	}
	return today.AddDate(0, 0, 1)
}

func (s *dailySchedule) String() string {
	return fmt.Sprintf("daily at %02d:%02d", s.hour, s.minute)
}

// monthlySchedule fires once per month on the given day at midnight. If the
// day exceeds the month length (e.g. day 31 in February), it clamps to the
// last day of the month.
type monthlySchedule struct{ day int }

// MonthlyOnDay returns a Schedule that fires once per month on the given day
// at 00:00 local time. Values outside [1, 31] are clamped to [1, 31].
func MonthlyOnDay(day int) Schedule {
	if day < 1 {
		day = 1
	}
	if day > 31 {
		day = 31
	}
	return &monthlySchedule{day: day}
}

func (s *monthlySchedule) Next(now time.Time) time.Time {
	// Candidate: day D of this month at 00:00. If already past (including
	// exactly equal), roll to next month.
	loc := now.Location()
	candidate := dayOfMonth(now.Year(), now.Month(), s.day, loc)
	if candidate.After(now) {
		return candidate
	}
	// Next month
	nextMonth := now.Month() + 1
	year := now.Year()
	if nextMonth > 12 {
		nextMonth = 1
		year++
	}
	return dayOfMonth(year, nextMonth, s.day, loc)
}

// dayOfMonth returns midnight on the given day, clamped to the actual last
// day of the target month.
func dayOfMonth(year int, month time.Month, day int, loc *time.Location) time.Time {
	// Last day of month: day 0 of next month.
	nextMonthFirst := time.Date(year, month+1, 1, 0, 0, 0, 0, loc)
	lastDay := nextMonthFirst.AddDate(0, 0, -1).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(year, month, day, 0, 0, 0, 0, loc)
}

func (s *monthlySchedule) String() string {
	return fmt.Sprintf("monthly on day %d at 00:00", s.day)
}
