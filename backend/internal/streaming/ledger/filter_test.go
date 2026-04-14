package ledger_test

import (
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/ledger"
)

// M35-35-7 — happy path: all supported filters parse cleanly.
func TestFilter_ParsesFilters(t *testing.T) {
	ws := uuid.New()
	actor := uuid.New()
	req := httptest.NewRequest("GET",
		"/admin/streaming/ledger?"+
			"workspace="+ws.String()+
			"&actor_id="+actor.String()+
			"&entry_type=purchase,refund"+
			"&from_date=2026-04-01T00:00:00Z"+
			"&to_date=2026-04-14T00:00:00Z"+
			"&search=pi_test"+
			"&limit=50",
		nil,
	)

	f, err := ledger.ParseFromRequest(req)
	require.NoError(t, err)
	require.NotNil(t, f.WorkspaceID)
	assert.Equal(t, ws, *f.WorkspaceID)
	require.NotNil(t, f.ActorID)
	assert.Equal(t, actor, *f.ActorID)
	assert.ElementsMatch(t, []string{"purchase", "refund"}, f.EntryTypes)
	require.NotNil(t, f.From)
	require.NotNil(t, f.To)
	assert.True(t, f.To.After(*f.From))
	assert.Equal(t, "pi_test", f.Search)
	assert.Equal(t, 50, f.Limit)
}

// M35-35-7 — invalid entry_type enum → 400.
func TestFilter_RejectsInvalidEnumType(t *testing.T) {
	req := httptest.NewRequest("GET",
		"/admin/streaming/ledger?entry_type=fraud", nil)
	_, err := ledger.ParseFromRequest(req)
	assert.ErrorIs(t, err, ledger.ErrInvalidEntryType)
}

// Inverted date range (to <= from) must fail. Prevents silently empty results.
func TestFilter_RejectsInvertedDateRange(t *testing.T) {
	req := httptest.NewRequest("GET",
		"/admin/streaming/ledger?from_date=2026-04-14T00:00:00Z&to_date=2026-04-01T00:00:00Z",
		nil)
	_, err := ledger.ParseFromRequest(req)
	assert.ErrorIs(t, err, ledger.ErrInvalidDateRange)
}

func TestFilter_RejectsBadWorkspaceID(t *testing.T) {
	req := httptest.NewRequest("GET",
		"/admin/streaming/ledger?workspace=not-a-uuid", nil)
	_, err := ledger.ParseFromRequest(req)
	assert.ErrorIs(t, err, ledger.ErrInvalidWorkspace)
}

func TestFilter_DefaultLimitWhenAbsent(t *testing.T) {
	req := httptest.NewRequest("GET", "/admin/streaming/ledger", nil)
	f, err := ledger.ParseFromRequest(req)
	require.NoError(t, err)
	assert.Equal(t, ledger.DefaultLimit, f.Limit)
}

func TestFilter_RejectsOutOfBoundsLimit(t *testing.T) {
	for _, v := range []string{"0", "-1", "9999", "abc"} {
		req := httptest.NewRequest("GET", "/admin/streaming/ledger?limit="+v, nil)
		_, err := ledger.ParseFromRequest(req)
		assert.Truef(t, errors.Is(err, ledger.ErrInvalidLimit), "limit=%q expected ErrInvalidLimit got %v", v, err)
	}
}

func TestFilter_CursorRoundtrip(t *testing.T) {
	c := ledger.Cursor{CreatedAt: time.Now().UTC().Truncate(time.Microsecond), ID: uuid.New()}
	enc := ledger.EncodeCursor(c)
	got, err := ledger.DecodeCursor(enc)
	require.NoError(t, err)
	assert.Equal(t, c.ID, got.ID)
	assert.True(t, got.CreatedAt.Equal(c.CreatedAt))
}

func TestFilter_RejectsSearchTooLong(t *testing.T) {
	long := make([]byte, ledger.MaxSearchLen+1)
	for i := range long {
		long[i] = 'a'
	}
	req := httptest.NewRequest("GET", "/admin/streaming/ledger?search="+string(long), nil)
	_, err := ledger.ParseFromRequest(req)
	assert.ErrorIs(t, err, ledger.ErrSearchTooLong)
}
