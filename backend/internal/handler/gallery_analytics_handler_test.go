package handler

// gallery_analytics_handler_test.go — unit coverage for the F-054 query
// parameter bounds. The analytics list endpoints accept ?limit and ?days
// from authenticated users. Without an upper cap, very large values could
// amplify DB scan/sort work. clampLimit/clampDays enforce the cap; these
// tests pin the exact bounds (default on <=0, cap on overflow, pass-through
// in range) so a future regression that drops the cap fails here.

import "testing"

func TestClampLimit_BoundsQueryParam(t *testing.T) {
	cases := []struct {
		name string
		in   int
		want int
	}{
		{"negative falls back to default", -5, analyticsDefaultLimit},
		{"zero falls back to default", 0, analyticsDefaultLimit},
		{"in-range value passes through", 25, 25},
		{"exactly at cap passes through", analyticsMaxLimit, analyticsMaxLimit},
		{"just over cap is clamped", analyticsMaxLimit + 1, analyticsMaxLimit},
		{"huge value is clamped to cap", 1_000_000, analyticsMaxLimit},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampLimit(tc.in); got != tc.want {
				t.Errorf("clampLimit(%d) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

func TestClampDays_BoundsQueryParam(t *testing.T) {
	cases := []struct {
		name string
		in   int
		want int
	}{
		{"negative falls back to default", -10, analyticsDefaultDays},
		{"zero falls back to default", 0, analyticsDefaultDays},
		{"in-range value passes through", 90, 90},
		{"exactly at cap passes through", analyticsMaxDays, analyticsMaxDays},
		{"just over cap is clamped", analyticsMaxDays + 1, analyticsMaxDays},
		{"huge value is clamped to cap", 100_000, analyticsMaxDays},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := clampDays(tc.in); got != tc.want {
				t.Errorf("clampDays(%d) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}
