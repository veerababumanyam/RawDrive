package service

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAdminRevenueService(t *testing.T) {
	svc := NewAdminRevenueService(nil)
	assert.NotNil(t, svc)
}

func TestCalculateRevenueSharePaisa_DefaultTwentyPercent(t *testing.T) {
	assert.Equal(t, int64(20000), calculateRevenueSharePaisa(100000, DefaultDealerReportCommissionRatePct))
	assert.Equal(t, int64(0), calculateRevenueSharePaisa(100000, 0))
	assert.Equal(t, int64(0), calculateRevenueSharePaisa(0, DefaultDealerReportCommissionRatePct))
}

func TestBuildRevenueReportTextIncludesDealerAndDistrictRows(t *testing.T) {
	report := &AdminRevenueRecordsResponse{
		StateID:                  12,
		StateName:                "Karnataka",
		District:                 "Bengaluru Urban",
		GeneratedAt:              time.Date(2026, 6, 6, 8, 41, 0, 0, time.UTC),
		DefaultCommissionRatePct: DefaultDealerReportCommissionRatePct,
		TotalRevenuePaisa:        100000,
		TotalSubscribers:         3,
		TotalDealerSharePaisa:    20000,
		Dealer: &AdminRevenueReportDealer{
			DealerID:          uuid.MustParse("550e8400-e29b-41d4-a716-446655440000"),
			BusinessName:      "RawDrive Karnataka",
			Email:             "dealer@example.test",
			CommissionRatePct: 20,
		},
		Records: []AdminRevenueRecord{
			{
				StateID:          12,
				StateName:        "Karnataka",
				District:         "Bengaluru Urban",
				RevenuePaisa:     100000,
				SubscriberCount:  3,
				DealerSharePaisa: 20000,
			},
		},
	}

	text := buildRevenueReportText(report)
	assert.Contains(t, text, "Scope: Karnataka / Bengaluru Urban")
	assert.Contains(t, text, "Dealer: RawDrive Karnataka")
	assert.Contains(t, text, "dealer@example.test")
	assert.Contains(t, text, "Bengaluru Urban | INR 1000.00 | 3 | INR 200.00")
	assert.Equal(t, "revenue-report-karnataka-bengaluru-urban.pdf", revenueReportPDFName(report))
}
