package service

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAdminExportService_Constructor(t *testing.T) {
	svc := NewAdminExportService(nil, nil)
	assert.NotNil(t, svc)
	assert.Nil(t, svc.userRepo)
	assert.Nil(t, svc.revenueRepo)
}

type fakeRevenueExportRepo struct {
	series []repository.RevenueTimeSeries
}

func (f fakeRevenueExportRepo) GetTimeSeries(context.Context, time.Time, time.Time, string) ([]repository.RevenueTimeSeries, error) {
	return f.series, nil
}

func TestAdminExportService_ExportRevenueCSV(t *testing.T) {
	svc := NewAdminExportService(nil, nil).WithRevenueRepoForTest(fakeRevenueExportRepo{
		series: []repository.RevenueTimeSeries{
			{Period: "2026-06", Revenue: 123400, Subscribers: 7, Churn: 1},
		},
	})

	var out bytes.Buffer
	err := svc.ExportRevenueCSV(context.Background(), time.Now().AddDate(0, -1, 0), time.Now(), "month", &out)
	require.NoError(t, err)
	assert.Contains(t, out.String(), "Period,Revenue,Subscriptions,Churn")
	assert.Contains(t, out.String(), "2026-06,123400,7,1")
}

func TestAdminExportService_ExportRevenuePDF(t *testing.T) {
	svc := NewAdminExportService(nil, nil).WithRevenueRepoForTest(fakeRevenueExportRepo{
		series: []repository.RevenueTimeSeries{
			{Period: "2026-06", Revenue: 123400, Subscribers: 7, Churn: 1},
		},
	})

	out, err := svc.ExportRevenuePDF(context.Background(), time.Now().AddDate(0, -1, 0), time.Now(), "month")
	require.NoError(t, err)
	require.True(t, bytes.HasPrefix(out, []byte("%PDF-")), "expected valid PDF signature")
	assert.True(t, strings.Contains(string(out), "RawDrive Document"), "PDF should include renderer metadata")
}
