package repository

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAuditLogRepo(t *testing.T) {
	repo := NewAuditLogRepo(nil)
	assert.NotNil(t, repo)
}

func TestAuditLogEntry_Fields(t *testing.T) {
	now := time.Now()
	ip := "192.168.1.1"
	entry := AuditLogEntry{
		ID:           uuid.New(),
		ActorID:      uuid.New(),
		ActorType:    "admin",
		Action:       "user.suspended",
		ResourceType: "user",
		ResourceID:   "user-123",
		IPAddress:    &ip,
		Severity:     "high",
		CreatedAt:    now,
	}
	assert.NotEqual(t, uuid.Nil, entry.ID)
	assert.NotEqual(t, uuid.Nil, entry.ActorID)
	assert.Equal(t, "admin", entry.ActorType)
	assert.Equal(t, "user.suspended", entry.Action)
	assert.Equal(t, "user", entry.ResourceType)
	assert.Equal(t, "user-123", entry.ResourceID)
	assert.Equal(t, "high", entry.Severity)
	assert.Equal(t, "192.168.1.1", *entry.IPAddress)
	assert.Equal(t, now, entry.CreatedAt)
}

func TestAuditLogEntry_NullableFields(t *testing.T) {
	entry := AuditLogEntry{
		ID:           uuid.New(),
		ActorID:      uuid.New(),
		ActorType:    "system",
		Action:       "cron.cleanup",
		ResourceType: "system",
		Severity:     "low",
		CreatedAt:    time.Now(),
	}
	assert.NotEqual(t, uuid.Nil, entry.ID)
	assert.NotEqual(t, uuid.Nil, entry.ActorID)
	assert.Equal(t, "system", entry.ActorType)
	assert.Equal(t, "cron.cleanup", entry.Action)
	assert.Equal(t, "system", entry.ResourceType)
	assert.Equal(t, "low", entry.Severity)
	assert.False(t, entry.CreatedAt.IsZero())
	assert.Nil(t, entry.IPAddress)
	assert.Nil(t, entry.UserAgent)
	assert.Nil(t, entry.WorkspaceID)
	assert.Nil(t, entry.StateID)
	assert.Nil(t, entry.Metadata)
	assert.Nil(t, entry.BeforeState)
	assert.Nil(t, entry.AfterState)
}

func TestAuditLogFilter_Defaults(t *testing.T) {
	var f AuditLogFilter
	assert.Nil(t, f.ActorID)
	assert.Empty(t, f.Action)
	assert.Empty(t, f.ResourceType)
	assert.Empty(t, f.Severity)
	assert.Equal(t, 0, f.Limit)
}

func TestAuditLogFilter_AllFields(t *testing.T) {
	actorID := uuid.New()
	from := time.Now().Add(-24 * time.Hour)
	to := time.Now()
	cursor := uuid.New()
	f := AuditLogFilter{
		ActorID:      &actorID,
		Action:       "user.suspended",
		ResourceType: "user",
		ResourceID:   "user-456",
		DateFrom:     &from,
		DateTo:       &to,
		Severity:     "high",
		Cursor:       &cursor,
		Limit:        50,
	}
	assert.Equal(t, actorID, *f.ActorID)
	assert.Equal(t, "user.suspended", f.Action)
	assert.Equal(t, "user", f.ResourceType)
	assert.Equal(t, "user-456", f.ResourceID)
	assert.Equal(t, from, *f.DateFrom)
	assert.Equal(t, to, *f.DateTo)
	assert.Equal(t, "high", f.Severity)
	assert.Equal(t, cursor, *f.Cursor)
	assert.Equal(t, 50, f.Limit)
}

func TestAuditLogCreate_JSON(t *testing.T) {
	actorID := uuid.New()
	create := AuditLogCreate{
		ActorID:      actorID,
		ActorType:    "admin",
		Action:       "moderation.approve",
		ResourceType: "moderation_item",
		ResourceID:   "mod-1",
		Severity:     "medium",
	}
	data, err := json.Marshal(create)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, actorID.String(), decoded["actor_id"])
	assert.Equal(t, "admin", decoded["actor_type"])
	assert.Equal(t, "moderation.approve", decoded["action"])
	assert.Equal(t, "medium", decoded["severity"])
}

func TestAuditLogCreate_MetadataOmitEmpty(t *testing.T) {
	create := AuditLogCreate{
		ActorID:      uuid.New(),
		ActorType:    "admin",
		Action:       "test",
		ResourceType: "test",
		Severity:     "low",
	}
	data, err := json.Marshal(create)
	require.NoError(t, err)
	// metadata, before_state, after_state should be omitted
	assert.NotContains(t, string(data), "metadata")
	assert.NotContains(t, string(data), "before_state")
	assert.NotContains(t, string(data), "after_state")
}
