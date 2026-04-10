package repository

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func TestNewAdminWorkspaceRepo(t *testing.T) {
	repo := NewAdminWorkspaceRepo(nil)
	assert.NotNil(t, repo)
}

func TestAdminWorkspaceFilter_Defaults(t *testing.T) {
	var f AdminWorkspaceFilter
	assert.Empty(t, f.Search)
	assert.Empty(t, f.Status)
}

func TestAdminWorkspaceRow_Fields(t *testing.T) {
	now := time.Now()
	state := "Maharashtra"
	tier := "agency"
	row := AdminWorkspaceRow{
		ID:               uuid.New(),
		Name:             "Studio Kala",
		OwnerID:          uuid.New(),
		OwnerName:        "Rahul Sharma",
		Status:           "active",
		StateName:        &state,
		SubscriptionTier: &tier,
		MemberCount:      5,
		StorageUsedBytes: 5368709120,
		GalleryCount:     250,
		CreatedAt:        now,
	}
	assert.Equal(t, "Studio Kala", row.Name)
	assert.Equal(t, "Rahul Sharma", row.OwnerName)
	assert.Equal(t, "Maharashtra", *row.StateName)
	assert.Equal(t, "agency", *row.SubscriptionTier)
	assert.Equal(t, int64(5368709120), row.StorageUsedBytes)
	assert.Equal(t, int64(250), row.GalleryCount)
}

func TestAdminWorkspaceDetail_Fields(t *testing.T) {
	detail := AdminWorkspaceDetail{
		ID:        uuid.New(),
		Name:      "Test Studio",
		OwnerID:   uuid.New(),
		OwnerName: "Test Owner",
		Status:    "active",
		Members: []WorkspaceMemberRow{
			{UserID: uuid.New(), FullName: "Alice", Role: "owner"},
			{UserID: uuid.New(), FullName: "Bob", Role: "editor"},
		},
	}
	assert.Len(t, detail.Members, 2)
	assert.Equal(t, "owner", detail.Members[0].Role)
}
