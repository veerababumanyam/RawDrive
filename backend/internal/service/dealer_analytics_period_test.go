package service

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// TestResolvePeriodRange pins down date-math for every supported Period.
// The function is pure (takes a fixed `now`) so tests can assert exact times.
func TestResolvePeriodRange(t *testing.T) {
	// Fixed anchor: 2026-04-10 12:00:00 UTC (Friday of Q2).
	now := time.Date(2026, time.April, 10, 12, 0, 0, 0, time.UTC)

	type want struct {
		start time.Time
		end   time.Time
	}
	cases := []struct {
		name       string
		period     Period
		customFrom *time.Time
		customTo   *time.Time
		wantErr    error
		want       want
	}{
		{
			name:   "empty defaults to current_month",
			period: "",
			want: want{
				start: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
				end:   now,
			},
		},
		{
			name:   "current_month → first of April to now",
			period: PeriodCurrentMonth,
			want: want{
				start: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
				end:   now,
			},
		},
		{
			name:   "last_month → March 1 to April 1",
			period: PeriodLastMonth,
			want: want{
				start: time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC),
				end:   time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
			},
		},
		{
			name:   "last_7_days → now-7d to now",
			period: PeriodLast7Days,
			want: want{
				start: now.AddDate(0, 0, -7),
				end:   now,
			},
		},
		{
			name:   "last_30_days → now-30d to now",
			period: PeriodLast30Days,
			want: want{
				start: now.AddDate(0, 0, -30),
				end:   now,
			},
		},
		{
			// April is in Q2 (Apr-Jun). Last quarter is Q1: Jan 1 → Apr 1.
			name:   "last_quarter → Jan 1 to Apr 1 (April is Q2)",
			period: PeriodLastQuarter,
			want: want{
				start: time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
				end:   time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := ResolvePeriodRange(tc.period, now, tc.customFrom, tc.customTo)
			if tc.wantErr != nil {
				if !errors.Is(err, tc.wantErr) {
					t.Fatalf("want err %v, got %v", tc.wantErr, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !got.Start.Equal(tc.want.start) {
				t.Errorf("start: want %s, got %s", tc.want.start, got.Start)
			}
			if !got.End.Equal(tc.want.end) {
				t.Errorf("end: want %s, got %s", tc.want.end, got.End)
			}
		})
	}
}

func TestResolvePeriodRange_Custom(t *testing.T) {
	now := time.Date(2026, time.April, 10, 12, 0, 0, 0, time.UTC)
	from := time.Date(2026, time.February, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC)

	// Happy path.
	got, err := ResolvePeriodRange(PeriodCustom, now, &from, &to)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Start.Equal(from) || !got.End.Equal(to) {
		t.Errorf("custom range mismatch: got %+v", got)
	}

	// Missing bounds.
	if _, err := ResolvePeriodRange(PeriodCustom, now, nil, &to); !errors.Is(err, ErrInvalidCustomRange) {
		t.Errorf("missing from: want ErrInvalidCustomRange, got %v", err)
	}
	if _, err := ResolvePeriodRange(PeriodCustom, now, &from, nil); !errors.Is(err, ErrInvalidCustomRange) {
		t.Errorf("missing to: want ErrInvalidCustomRange, got %v", err)
	}

	// Reversed range.
	if _, err := ResolvePeriodRange(PeriodCustom, now, &to, &from); !errors.Is(err, ErrInvalidCustomRange) {
		t.Errorf("reversed: want ErrInvalidCustomRange, got %v", err)
	}
}

func TestResolvePeriodRange_Invalid(t *testing.T) {
	now := time.Date(2026, time.April, 10, 12, 0, 0, 0, time.UTC)
	_, err := ResolvePeriodRange("bogus", now, nil, nil)
	if !errors.Is(err, ErrInvalidPeriod) {
		t.Fatalf("want ErrInvalidPeriod, got %v", err)
	}
}

func TestDefaultDealerReportCommissionRatePct(t *testing.T) {
	if DefaultDealerReportCommissionRatePct != 20 {
		t.Fatalf("statewide dealer reports must default to 20%% commission, got %.2f", DefaultDealerReportCommissionRatePct)
	}
}

func TestSummarizeAdminStateReportTotals_DedupesStateRevenue(t *testing.T) {
	reports := []repository.AdminDealerStateReport{
		{
			DealerID:               uuid.New(),
			StateID:                12,
			TotalSubscriptionPaisa: 100000,
			DealerSharePaisa:       20000,
		},
		{
			DealerID:               uuid.New(),
			StateID:                12,
			TotalSubscriptionPaisa: 100000,
			DealerSharePaisa:       15000,
		},
		{
			DealerID:               uuid.New(),
			StateID:                27,
			TotalSubscriptionPaisa: 50000,
			DealerSharePaisa:       10000,
		},
	}

	totalRevenue, totalShare := summarizeAdminStateReportTotals(reports)
	if totalRevenue != 150000 {
		t.Fatalf("expected unique-state revenue total 150000, got %d", totalRevenue)
	}
	if totalShare != 30000 {
		t.Fatalf("expected representative-state share total 30000, got %d", totalShare)
	}
}
