package service

// gallery_analytics_breakdowns.go — M14 GAL-FR-185/186/187.
//
// Builds aggregation views on top of the existing GalleryAnalyticsRepo
// without touching the schema. Three endpoints:
//
//   GAL-FR-185  Device breakdown        → DeviceBreakdown(days)
//   GAL-FR-186  Download velocity chart → DownloadVelocity(days)
//   GAL-FR-187  Share channel analytics → ShareChannelBreakdown(days)
//
// The source of truth is gallery_analytics_daily rows. device_breakdown
// and referrer_breakdown are JSONB maps already populated by the rollup
// worker; we just sum them across the requested window.

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// DeviceBreakdownPoint is a single device_type → count mapping returned
// by DeviceBreakdown.
type DeviceBreakdownPoint struct {
	Device string `json:"device"`
	Count  int    `json:"count"`
}

// DownloadVelocityPoint is a (date, downloads) tuple suitable for a
// line chart. Days with zero downloads still appear so the front-end
// can render a continuous axis.
type DownloadVelocityPoint struct {
	Date      string `json:"date"`
	Downloads int    `json:"downloads"`
}

// ShareChannelPoint is a single referrer → count mapping. The referrer
// key is normalized: an empty string becomes "direct".
type ShareChannelPoint struct {
	Channel string `json:"channel"`
	Count   int    `json:"count"`
}

// DeviceBreakdown sums device_breakdown JSONB across the last N days.
func (s *GalleryAnalyticsService) DeviceBreakdown(ctx context.Context, galleryID uuid.UUID, days int) ([]DeviceBreakdownPoint, error) {
	if days <= 0 {
		days = 30
	}
	rows, err := s.analyticsRepo.GetDailyStats(ctx, galleryID, time.Now().AddDate(0, 0, -days), time.Now())
	if err != nil {
		return nil, err
	}
	totals := make(map[string]int)
	for _, row := range rows {
		if len(row.DeviceBreakdown) == 0 {
			continue
		}
		var m map[string]int
		if err := json.Unmarshal(row.DeviceBreakdown, &m); err != nil {
			continue
		}
		for k, v := range m {
			totals[k] += v
		}
	}
	return mapToDevicePoints(totals), nil
}

// DownloadVelocity returns one (date, downloads) tuple per day in the
// window, including zeros. This is the shape a chart library expects.
func (s *GalleryAnalyticsService) DownloadVelocity(ctx context.Context, galleryID uuid.UUID, days int) ([]DownloadVelocityPoint, error) {
	if days <= 0 {
		days = 30
	}
	rows, err := s.analyticsRepo.GetDailyStats(ctx, galleryID, time.Now().AddDate(0, 0, -days), time.Now())
	if err != nil {
		return nil, err
	}

	// Map DB rows into date-keyed lookup, then emit every day in [now-days, now].
	byDate := make(map[string]int, len(rows))
	for _, row := range rows {
		key := row.Date.UTC().Format("2006-01-02")
		byDate[key] = row.Downloads
	}
	points := make([]DownloadVelocityPoint, 0, days)
	for i := days - 1; i >= 0; i-- {
		d := time.Now().AddDate(0, 0, -i).UTC().Format("2006-01-02")
		points = append(points, DownloadVelocityPoint{Date: d, Downloads: byDate[d]})
	}
	return points, nil
}

// ShareChannelBreakdown sums referrer_breakdown JSONB across the last N days.
func (s *GalleryAnalyticsService) ShareChannelBreakdown(ctx context.Context, galleryID uuid.UUID, days int) ([]ShareChannelPoint, error) {
	if days <= 0 {
		days = 30
	}
	rows, err := s.analyticsRepo.GetDailyStats(ctx, galleryID, time.Now().AddDate(0, 0, -days), time.Now())
	if err != nil {
		return nil, err
	}
	totals := make(map[string]int)
	for _, row := range rows {
		if len(row.ReferrerBreakdown) == 0 {
			continue
		}
		var m map[string]int
		if err := json.Unmarshal(row.ReferrerBreakdown, &m); err != nil {
			continue
		}
		for k, v := range m {
			channel := k
			if channel == "" {
				channel = "direct"
			}
			totals[channel] += v
		}
	}
	return mapToChannelPoints(totals), nil
}

// mapToDevicePoints converts a totals map to a slice for stable JSON
// output. Ordering is deterministic (by descending count, then device
// name) so API consumers get consistent results across requests.
func mapToDevicePoints(m map[string]int) []DeviceBreakdownPoint {
	out := make([]DeviceBreakdownPoint, 0, len(m))
	for k, v := range m {
		out = append(out, DeviceBreakdownPoint{Device: k, Count: v})
	}
	sortDevicePoints(out)
	return out
}

// mapToChannelPoints mirrors mapToDevicePoints for channel slices.
func mapToChannelPoints(m map[string]int) []ShareChannelPoint {
	out := make([]ShareChannelPoint, 0, len(m))
	for k, v := range m {
		out = append(out, ShareChannelPoint{Channel: k, Count: v})
	}
	sortChannelPoints(out)
	return out
}

// sortDevicePoints sorts by descending count, tie-break by device name asc.
func sortDevicePoints(s []DeviceBreakdownPoint) {
	// Insertion sort — the set is at most ~10 device types, so this is fine.
	for i := 1; i < len(s); i++ {
		j := i
		for j > 0 && less(s[j], s[j-1]) {
			s[j], s[j-1] = s[j-1], s[j]
			j--
		}
	}
}

func sortChannelPoints(s []ShareChannelPoint) {
	for i := 1; i < len(s); i++ {
		j := i
		for j > 0 && lessChannel(s[j], s[j-1]) {
			s[j], s[j-1] = s[j-1], s[j]
			j--
		}
	}
}

func less(a, b DeviceBreakdownPoint) bool {
	if a.Count != b.Count {
		return a.Count > b.Count
	}
	return a.Device < b.Device
}

func lessChannel(a, b ShareChannelPoint) bool {
	if a.Count != b.Count {
		return a.Count > b.Count
	}
	return a.Channel < b.Channel
}
