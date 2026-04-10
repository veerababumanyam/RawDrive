package service

// gallery_analytics_breakdowns_test.go — pure-logic tests for the M14
// analytics aggregation helpers. Only the sort + mapping functions are
// covered here; the repo-backed paths live in integration tests.

import (
	"testing"
)

func TestMapToDevicePoints_SortsByCountDescending(t *testing.T) {
	m := map[string]int{
		"mobile":  120,
		"desktop": 300,
		"tablet":  45,
	}
	pts := mapToDevicePoints(m)
	if len(pts) != 3 {
		t.Fatalf("want 3 points, got %d", len(pts))
	}
	if pts[0].Device != "desktop" || pts[0].Count != 300 {
		t.Errorf("first should be desktop/300, got %+v", pts[0])
	}
	if pts[1].Device != "mobile" || pts[1].Count != 120 {
		t.Errorf("second should be mobile/120, got %+v", pts[1])
	}
	if pts[2].Device != "tablet" || pts[2].Count != 45 {
		t.Errorf("third should be tablet/45, got %+v", pts[2])
	}
}

func TestMapToDevicePoints_TiebreakAlphabetical(t *testing.T) {
	m := map[string]int{
		"zebra":  10,
		"alpha":  10,
		"middle": 10,
	}
	pts := mapToDevicePoints(m)
	if pts[0].Device != "alpha" || pts[1].Device != "middle" || pts[2].Device != "zebra" {
		t.Errorf("tie-break should be alphabetical, got %+v", pts)
	}
}

func TestMapToDevicePoints_EmptyMap(t *testing.T) {
	pts := mapToDevicePoints(map[string]int{})
	if len(pts) != 0 {
		t.Errorf("empty map should produce empty slice, got %d", len(pts))
	}
}

func TestMapToChannelPoints_SortsByCountDescending(t *testing.T) {
	m := map[string]int{
		"whatsapp": 50,
		"direct":   200,
		"email":    100,
	}
	pts := mapToChannelPoints(m)
	if pts[0].Channel != "direct" || pts[0].Count != 200 {
		t.Errorf("first should be direct/200, got %+v", pts[0])
	}
	if pts[1].Channel != "email" || pts[1].Count != 100 {
		t.Errorf("second should be email/100, got %+v", pts[1])
	}
}
