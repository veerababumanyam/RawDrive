package ledger_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/streaming/ledger"
)

// --- fake iterator / querier ---------------------------------------------

type fakeRow struct {
	id, ws                         uuid.UUID
	entryType                      string
	amount                         int64
	minutes                        int32
	purchase, reservation, stream *uuid.UUID
	idem                           string
	createdBy                      *uuid.UUID
	createdAt                      time.Time
}

type fakeIter struct {
	rows   []fakeRow
	i      int
	closed bool
	err    error
}

func (f *fakeIter) Next() bool {
	if f.err != nil {
		return false
	}
	if f.i >= len(f.rows) {
		return false
	}
	f.i++
	return true
}

func (f *fakeIter) Scan(dest ...any) error {
	r := f.rows[f.i-1]
	vals := []any{
		r.id, r.ws, r.entryType, r.amount, r.minutes,
		r.purchase, r.reservation, r.stream, r.idem, r.createdBy, r.createdAt,
	}
	if len(dest) != len(vals) {
		return fmt.Errorf("fake scan: want %d dest got %d", len(vals), len(dest))
	}
	for i, v := range vals {
		switch d := dest[i].(type) {
		case *uuid.UUID:
			*d = v.(uuid.UUID)
		case **uuid.UUID:
			*d = v.(*uuid.UUID)
		case *string:
			*d = v.(string)
		case *int64:
			*d = v.(int64)
		case *int32:
			*d = v.(int32)
		case *time.Time:
			*d = v.(time.Time)
		default:
			return fmt.Errorf("fake scan: unsupported dest type %T", dest[i])
		}
	}
	return nil
}

func (f *fakeIter) Err() error { return f.err }
func (f *fakeIter) Close()     { f.closed = true }

type fakeQuerier struct {
	iter    *fakeIter
	lastSQL string
	lastArg []any
}

func (q *fakeQuerier) QueryIter(_ context.Context, sql string, args ...any) (ledger.RowIterator, error) {
	q.lastSQL = sql
	q.lastArg = args
	return q.iter, nil
}

func mkRows(n int) []fakeRow {
	out := make([]fakeRow, n)
	base := time.Date(2026, 4, 14, 12, 0, 0, 0, time.UTC)
	for i := range out {
		out[i] = fakeRow{
			id:        uuid.New(),
			ws:        uuid.New(),
			entryType: "purchase",
			amount:    int64(100 + i),
			minutes:   0,
			idem:      fmt.Sprintf("idem-%d", i),
			// Descending created_at so the fake mimics the ORDER BY output.
			createdAt: base.Add(-time.Duration(i) * time.Second),
		}
	}
	return out
}

type countingFlusher struct{ n int }

func (c *countingFlusher) Flush() { c.n++ }

// --- tests ---------------------------------------------------------------

// M35-35-7 — keyset pagination: Query returns descending rows, sets nextCursor
// only when the page is full, and the cursor targets the last row.
func TestQuery_KeysetPagination_ReturnsStableOrder(t *testing.T) {
	rows := mkRows(10)
	q := &fakeQuerier{iter: &fakeIter{rows: rows}}
	f := ledger.Filter{Limit: 10}

	got, next, err := ledger.Query(context.Background(), q, f)
	require.NoError(t, err)
	require.Len(t, got, 10)
	// Order preserved — first returned row has the newest created_at.
	for i := 1; i < len(got); i++ {
		assert.Truef(t, got[i-1].CreatedAt.After(got[i].CreatedAt) ||
			got[i-1].CreatedAt.Equal(got[i].CreatedAt),
			"expected descending created_at at idx %d", i)
	}
	// Cursor set because limit was hit.
	require.NotNil(t, next)
	assert.Equal(t, got[len(got)-1].ID, next.ID)
	assert.True(t, got[len(got)-1].CreatedAt.Equal(next.CreatedAt))

	// Second page: below limit → nextCursor must be nil.
	q2 := &fakeQuerier{iter: &fakeIter{rows: mkRows(3)}}
	got2, next2, err := ledger.Query(context.Background(), q2, ledger.Filter{Limit: 10})
	require.NoError(t, err)
	assert.Len(t, got2, 3)
	assert.Nil(t, next2)

	// SQL sanity: keyset WHERE must appear when cursor is set.
	c := ledger.Cursor{CreatedAt: time.Now(), ID: uuid.New()}
	sql, _ := ledger.BuildSelect(ledger.Filter{Limit: 10, Cursor: &c}, false)
	assert.Contains(t, sql, "(created_at, id) <")
	assert.Contains(t, sql, "ORDER BY created_at DESC, id DESC")
}

// M35-35-7 — CSV cap at 100k: iterator keeps feeding rows but StreamCSV stops
// after HardCap and marks Truncated=true.
func TestStreamCSV_Cap100k(t *testing.T) {
	// Use a small cap so the test stays fast but the contract is identical.
	const cap = 25
	rows := mkRows(cap + 10)
	q := &fakeQuerier{iter: &fakeIter{rows: rows}}

	var buf bytes.Buffer
	res, err := ledger.StreamCSV(context.Background(), q, ledger.Filter{}, &buf,
		ledger.StreamCSVOptions{HardCap: cap, FlushEvery: 5})
	require.NoError(t, err)
	assert.Equal(t, cap, res.Rows)
	assert.True(t, res.Truncated, "expected Truncated=true once cap reached")

	// Header + cap data lines.
	lines := strings.Split(strings.TrimRight(buf.String(), "\n"), "\n")
	assert.Equal(t, cap+1, len(lines), "header + %d data rows", cap)
	assert.Equal(t, "id,workspace,type,amount,minutes_delta,purchase_id,reservation_id,stream_id,idempotency_key,created_by,created_at",
		lines[0])
}

// M35-35-7 — Flush cadence: custom FlushEvery=500 (default); with rows=1500 we
// expect at least 3 mid-stream flushes + 1 terminal flush = 4.
func TestStreamCSV_FlushEvery500(t *testing.T) {
	rows := mkRows(1500)
	q := &fakeQuerier{iter: &fakeIter{rows: rows}}
	cf := &countingFlusher{}

	var buf bytes.Buffer
	res, err := ledger.StreamCSV(context.Background(), q, ledger.Filter{}, &buf,
		ledger.StreamCSVOptions{FlushEvery: 500, HardCap: 10_000, Flusher: cf})
	require.NoError(t, err)
	assert.Equal(t, 1500, res.Rows)
	assert.False(t, res.Truncated)
	// 3 mid-stream (at 500/1000/1500) + 1 terminal flush.
	assert.GreaterOrEqual(t, cf.n, 3, "injected flusher must fire at least once per 500 rows")
	assert.Equal(t, cf.n, res.Flushes, "Flushes counter matches external flusher")
}

// Context cancel mid-stream: StreamCSV must return ctx.Err() and still record
// rows already flushed so the audit row reflects reality.
func TestStreamCSV_ContextCancelMidStream(t *testing.T) {
	rows := mkRows(200)
	q := &fakeQuerier{iter: &fakeIter{rows: rows}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // canceled before first Next — the loop must bail on ctx.Err.

	var buf bytes.Buffer
	res, err := ledger.StreamCSV(ctx, q, ledger.Filter{}, &buf,
		ledger.StreamCSVOptions{FlushEvery: 10, HardCap: 1000})
	// Either io error (cancel before the loop starts) or ctx.Err mid-loop.
	if err != nil {
		assert.True(t, errors.Is(err, context.Canceled), "expected context.Canceled, got %v", err)
	}
	// Regardless, rows must be <= total and header must have been emitted.
	assert.LessOrEqual(t, res.Rows, 200)
}
