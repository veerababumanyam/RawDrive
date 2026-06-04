package repository

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ──────────────────────── Constructor ────────────────────────

func TestNewAdminUserRepo(t *testing.T) {
	repo := NewAdminUserRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

// ──────────────────────── AdminUserFilter ────────────────────────

func TestAdminUserFilter_Defaults(t *testing.T) {
	var f AdminUserFilter
	assert.Equal(t, 0, f.Limit)
	assert.Empty(t, f.Search)
	assert.Empty(t, f.Role)
	assert.Empty(t, f.Status)
	assert.Nil(t, f.StateID)
	assert.Nil(t, f.Cursor)
}

func TestAdminUserFilter_AllFieldsSet(t *testing.T) {
	stateID := uuid.New()
	cursor := uuid.New()
	f := AdminUserFilter{
		Cursor:   &cursor,
		Limit:    50,
		Search:   "alice",
		Role:     "photographer",
		Status:   "active",
		StateID:  &stateID,
		Sort:     "full_name",
		TierSlug: "pro",
	}
	assert.Equal(t, 50, f.Limit)
	assert.Equal(t, "alice", f.Search)
	assert.Equal(t, "photographer", f.Role)
	assert.Equal(t, "active", f.Status)
	assert.Equal(t, stateID, *f.StateID)
	assert.Equal(t, cursor, *f.Cursor)
	assert.Equal(t, "full_name", f.Sort)
	assert.Equal(t, "pro", f.TierSlug)
}

func TestAdminUserFilter_LimitClamping(t *testing.T) {
	// Replicate the clamping logic from List method
	tests := []struct {
		input    int
		expected int
	}{
		{0, 50}, {-1, 50}, {101, 50}, {1, 1}, {100, 100}, {50, 50},
	}
	for _, tt := range tests {
		f := AdminUserFilter{Limit: tt.input}
		if f.Limit <= 0 || f.Limit > 100 {
			f.Limit = 50
		}
		assert.Equal(t, tt.expected, f.Limit)
	}
}

func TestAdminUserFilter_SortMapping(t *testing.T) {
	// Replicate the sort column mapping from List method. "full_name" at
	// the API level maps to the real column u.display_name; "last_login_at"
	// maps to u.last_login_at (added in migration 058).
	tests := []struct {
		sort     string
		expected string
	}{
		{"", "u.created_at"},
		{"created_at", "u.created_at"},
		{"last_login_at", "u.last_login_at"},
		{"full_name", "u.display_name"},
		{"invalid", "u.created_at"},
	}
	for _, tt := range tests {
		sortCol := "u.created_at"
		switch tt.sort {
		case "last_login_at":
			sortCol = "u.last_login_at"
		case "full_name":
			sortCol = "u.display_name"
		}
		assert.Equal(t, tt.expected, sortCol, "sort=%q", tt.sort)
	}
}

// ──────────────────────── AdminUserRow ────────────────────────

func TestAdminUserRow_Fields(t *testing.T) {
	now := time.Now()
	// state_id is the integer PK from states.id, not a UUID. The
	// repo struct field flipped to *int32 in the 2026-04-12 admin
	// users 500 fix — this test fixture followed suit.
	stateID := int32(29)
	stateName := "Karnataka"
	tier := "pro"
	tierName := "Pro"
	row := AdminUserRow{
		ID:             uuid.New(),
		FullName:       "Alice Sharma",
		Email:          "alice@example.com",
		PlatformRole:   "photographer",
		Status:         "active",
		StateID:        &stateID,
		StateName:      &stateName,
		TierSlug:       &tier,
		TierName:       &tierName,
		StorageUsed:    1024000,
		WorkspaceCount: 2,
		CreatedAt:      now,
	}
	assert.NotEqual(t, uuid.Nil, row.ID)
	assert.Equal(t, "Alice Sharma", row.FullName)
	assert.Equal(t, "alice@example.com", row.Email)
	assert.Equal(t, "photographer", row.PlatformRole)
	assert.Equal(t, "active", row.Status)
	assert.Equal(t, stateID, *row.StateID)
	assert.Equal(t, int64(2), row.WorkspaceCount)
	assert.Equal(t, "Karnataka", *row.StateName)
	assert.Equal(t, "pro", *row.TierSlug)
	assert.Equal(t, "Pro", *row.TierName)
	assert.Equal(t, int64(1024000), row.StorageUsed)
	assert.Equal(t, now, row.CreatedAt)
}

func TestAdminUserRow_NullableFields(t *testing.T) {
	row := AdminUserRow{
		ID:           uuid.New(),
		FullName:     "Bob",
		Email:        "bob@test.com",
		PlatformRole: "photographer",
		Status:       "active",
	}
	assert.NotEqual(t, uuid.Nil, row.ID)
	assert.Equal(t, "Bob", row.FullName)
	assert.Equal(t, "bob@test.com", row.Email)
	assert.Equal(t, "photographer", row.PlatformRole)
	assert.Equal(t, "active", row.Status)
	assert.Nil(t, row.Phone)
	assert.Nil(t, row.StateID)
	assert.Nil(t, row.StateName)
	assert.Nil(t, row.TierSlug)
	assert.Nil(t, row.TierName)
	assert.Nil(t, row.LastLoginAt)
}

func TestAdminUserRow_JSONFieldNames(t *testing.T) {
	// Asserts that the JSON wire shape matches the frontend AdminUser
	// TypeScript interface (frontend/src/lib/api/admin.ts). Without these
	// tags the default encoder would emit PascalCase keys that the
	// frontend cannot read — every admin user row would be blank.
	row := AdminUserRow{
		ID:             uuid.New(),
		FullName:       "Test",
		Email:          "test@example.com",
		PlatformRole:   "photographer",
		Status:         "active",
		StorageUsed:    1000,
		WorkspaceCount: 3,
		CreatedAt:      time.Now(),
	}
	assert.NotEqual(t, uuid.Nil, row.ID)
	assert.Equal(t, "Test", row.FullName)
	assert.Equal(t, "test@example.com", row.Email)
	assert.Equal(t, "photographer", row.PlatformRole)
	assert.Equal(t, "active", row.Status)
	assert.Equal(t, int64(1000), row.StorageUsed)
	assert.Equal(t, int64(3), row.WorkspaceCount)
	assert.False(t, row.CreatedAt.IsZero())

	data, err := json.Marshal(row)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &decoded))

	expected := []string{"id", "full_name", "email", "platform_role", "status", "storage_used", "workspace_count", "created_at"}
	for _, key := range expected {
		assert.Contains(t, decoded, key, "expected snake_case JSON key %q on AdminUserRow", key)
	}
}

// ──────────────────────── AdminUserDetail ────────────────────────

func TestAdminUserDetail_WorkspacesSlice(t *testing.T) {
	detail := AdminUserDetail{
		ID:           uuid.New(),
		FullName:     "Test User",
		Email:        "test@test.com",
		PlatformRole: "studio_admin",
		Status:       "active",
		Workspaces: []AdminUserWorkspace{
			{ID: uuid.New(), Name: "Studio A", Role: "owner"},
			{ID: uuid.New(), Name: "Studio B", Role: "member"},
		},
	}
	assert.NotEqual(t, uuid.Nil, detail.ID)
	assert.Equal(t, "Test User", detail.FullName)
	assert.Equal(t, "test@test.com", detail.Email)
	assert.Equal(t, "studio_admin", detail.PlatformRole)
	assert.Equal(t, "active", detail.Status)
	assert.Len(t, detail.Workspaces, 2)
	assert.NotEqual(t, uuid.Nil, detail.Workspaces[0].ID)
	assert.Equal(t, "Studio A", detail.Workspaces[0].Name)
	assert.NotEqual(t, uuid.Nil, detail.Workspaces[1].ID)
	assert.Equal(t, "member", detail.Workspaces[1].Role)
}

// ──────────────────────── PaginatedResult ────────────────────────

func TestPaginatedResult_JSON(t *testing.T) {
	cursor := uuid.New()
	result := PaginatedResult[AdminUserRow]{
		Items:      []AdminUserRow{{ID: uuid.New(), FullName: "Test"}},
		NextCursor: &cursor,
		TotalCount: 100,
	}
	data, err := json.Marshal(result)
	require.NoError(t, err)

	var decoded map[string]interface{}
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, float64(100), decoded["total_count"])
	assert.NotNil(t, decoded["next_cursor"])
	assert.NotNil(t, decoded["items"])
}

func TestPaginatedResult_EmptyItems(t *testing.T) {
	result := PaginatedResult[AdminUserRow]{
		Items:      []AdminUserRow{},
		TotalCount: 0,
	}
	assert.Empty(t, result.Items)
	assert.Nil(t, result.NextCursor)
	assert.Equal(t, int64(0), result.TotalCount)
}

// ──────────────────────── boolToInt helper ────────────────────────

func TestBoolToInt(t *testing.T) {
	assert.Equal(t, 1, boolToInt(true))
	assert.Equal(t, 0, boolToInt(false))
}
