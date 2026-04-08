package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAdminModerationRepo(t *testing.T) {
	repo := NewAdminModerationRepo(nil)
	assert.NotNil(t, repo)
}

func TestModerationFilter_Defaults(t *testing.T) {
	var f ModerationFilter
	assert.Empty(t, f.ContentType)
	assert.Empty(t, f.Reason)
	assert.Empty(t, f.Status)
}

func TestModerationFilter_AllFields(t *testing.T) {
	f := ModerationFilter{
		ContentType: "gallery",
		Reason:      "auto_flagged",
		Status:      "pending",
	}
	assert.Equal(t, "gallery", f.ContentType)
	assert.Equal(t, "auto_flagged", f.Reason)
	assert.Equal(t, "pending", f.Status)
}

func TestAdminModerationItem_Fields(t *testing.T) {
	now := time.Now()
	item := AdminModerationItem{
		ID:          uuid.New(),
		ContentType: "image",
		ContentID:   uuid.New(),
		Reason:      "reported",
		Status:      "pending",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	assert.Equal(t, "image", item.ContentType)
	assert.Equal(t, "reported", item.Reason)
	assert.Equal(t, "pending", item.Status)
	assert.Nil(t, item.ReporterID)
	assert.Nil(t, item.ReviewerID)
	assert.Nil(t, item.ReviewedAt)
}

func TestModerationStats_ZeroValues(t *testing.T) {
	var stats ModerationStats
	assert.Equal(t, int64(0), stats.PendingCount)
	assert.Equal(t, int64(0), stats.OverdueCount)
	assert.Equal(t, int64(0), stats.ReviewedToday)
	assert.InDelta(t, 0.0, stats.AverageSLAMinutes, 0.01)
}
