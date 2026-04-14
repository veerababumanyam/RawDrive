package ledger

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Row is the canonical projection returned by Query and streamed by StreamCSV.
// Pointer fields are NULL-safe; callers format to JSON/CSV as needed.
type Row struct {
	ID            uuid.UUID
	WorkspaceID   uuid.UUID
	EntryType     string
	AmountPaise   int64
	MinutesDelta  int32
	PurchaseID    *uuid.UUID
	ReservationID *uuid.UUID
	StreamID      *uuid.UUID
	IdempotencyKey string
	CreatedBy     *uuid.UUID
	CreatedAt     time.Time
}

// CSVHeader is the exact header row written by StreamCSV. Kept stable so
// downstream consumers (BI, ops spreadsheets) can parse unambiguously.
var CSVHeader = []string{
	"id", "workspace", "type", "amount", "minutes_delta",
	"purchase_id", "reservation_id", "stream_id",
	"idempotency_key", "created_by", "created_at",
}

// BuildSelect assembles a parameterized SELECT for the filter. The returned
// args are positional placeholders bound via pgx ($1, $2, ...).
//
// Ordering: (created_at DESC, id DESC) for stable keyset pagination.
// Keyset WHERE is applied only when f.Cursor != nil — comparison is
// ((created_at, id) < (cursor.created_at, cursor.id)) which keeps the sort
// order while skipping rows already returned.
//
// When forCSV=true the limit clause is omitted (caller enforces CSVHardCap
// row-by-row during iteration) and the projection is identical — so CSV and
// JSON exports for the same filter are byte-for-byte comparable.
func BuildSelect(f Filter, forCSV bool) (sql string, args []any) {
	var b strings.Builder
	b.WriteString(`SELECT id, workspace_id, entry_type, amount_paise, minutes_delta,
	       purchase_id, reservation_id, stream_id,
	       idempotency_key, created_by, created_at
	FROM streaming_ledger_entries`)

	where := []string{}
	add := func(clause string, a ...any) {
		for range a {
			// Rewrite $? placeholders to the running index.
		}
		// Simple $N rewriting: each call inserts args with indices starting from
		// len(args)+1; the clause supplies $? tokens which we substitute.
		idx := len(args) + 1
		out := clause
		for strings.Contains(out, "$?") {
			out = strings.Replace(out, "$?", fmt.Sprintf("$%d", idx), 1)
			idx++
		}
		where = append(where, out)
		args = append(args, a...)
	}

	if f.WorkspaceID != nil {
		add("workspace_id = $?", *f.WorkspaceID)
	}
	if f.ActorID != nil {
		add("created_by = $?", *f.ActorID)
	}
	if len(f.EntryTypes) > 0 {
		add("entry_type = ANY($?)", f.EntryTypes)
	}
	if f.From != nil {
		add("created_at >= $?", *f.From)
	}
	if f.To != nil {
		add("created_at < $?", *f.To)
	}
	if f.Search != "" {
		// Prefix match on id/reservation_id/stream_id/idempotency_key — cast
		// UUIDs to text. Escape %, _, and \ in user input so wildcards in the
		// query string become literal characters; ESCAPE '\' tells PG to honour
		// the backslash escape we just inserted.
		esc := escapeLikeOperand(f.Search)
		add(`(
			idempotency_key LIKE $? || '%' ESCAPE '\'
			OR id::text       LIKE $? || '%' ESCAPE '\'
			OR reservation_id::text LIKE $? || '%' ESCAPE '\'
			OR stream_id::text      LIKE $? || '%' ESCAPE '\'
		)`, esc, esc, esc, esc)
	}
	if f.Cursor != nil {
		// Keyset: (created_at, id) < (cursor.created_at, cursor.id)
		add("(created_at, id) < ($?, $?)", f.Cursor.CreatedAt, f.Cursor.ID)
	}

	if len(where) > 0 {
		b.WriteString("\n\tWHERE ")
		b.WriteString(strings.Join(where, "\n\t  AND "))
	}
	b.WriteString("\n\tORDER BY created_at DESC, id DESC")
	if !forCSV {
		limit := f.Limit
		if limit <= 0 {
			limit = DefaultLimit
		}
		args = append(args, limit)
		fmt.Fprintf(&b, "\n\tLIMIT $%d", len(args))
	}
	return b.String(), args
}

// RowIterator abstracts pgx.Rows for unit testing. The real pgxpool.Pool.Query
// result satisfies this shape via a thin adapter in the handler package.
type RowIterator interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
	Close()
}

// Querier is satisfied by *pgxpool.Pool.Query; injectable for tests.
type Querier interface {
	QueryIter(ctx context.Context, sql string, args ...any) (RowIterator, error)
}

// Query runs the JSON page query and returns decoded rows plus the next cursor.
// nextCursor is non-nil only when exactly f.Limit rows were returned, implying
// at least one more page is likely available.
func Query(ctx context.Context, q Querier, f Filter) ([]Row, *Cursor, error) {
	sql, args := BuildSelect(f, false)
	it, err := q.QueryIter(ctx, sql, args...)
	if err != nil {
		return nil, nil, err
	}
	defer it.Close()

	rows := make([]Row, 0, f.Limit)
	for it.Next() {
		var r Row
		if err := it.Scan(
			&r.ID, &r.WorkspaceID, &r.EntryType, &r.AmountPaise, &r.MinutesDelta,
			&r.PurchaseID, &r.ReservationID, &r.StreamID,
			&r.IdempotencyKey, &r.CreatedBy, &r.CreatedAt,
		); err != nil {
			return nil, nil, err
		}
		rows = append(rows, r)
	}
	if err := it.Err(); err != nil {
		return nil, nil, err
	}
	var next *Cursor
	if len(rows) == f.Limit {
		last := rows[len(rows)-1]
		next = &Cursor{CreatedAt: last.CreatedAt, ID: last.ID}
	}
	return rows, next, nil
}

// Flusher abstracts csv.Writer's Flush so the streaming contract can be
// unit-tested without a real HTTP response writer.
type Flusher interface {
	Flush()
}

// StreamCSVOptions lets tests inject a Flusher and override the cap/flush
// cadence without mutating package-level constants.
type StreamCSVOptions struct {
	FlushEvery int // defaults to CSVFlushEvery
	HardCap    int // defaults to CSVHardCap
	Flusher    Flusher
}

// StreamCSVResult summarizes an export — row count (post-cap) and whether the
// cap truncated the stream. Handlers use Truncated to set the X-Truncated
// header and Rows for the admin_audit row_count column.
type StreamCSVResult struct {
	Rows      int
	Truncated bool
	Flushes   int
}

// StreamCSV pulls from q, writes filtered ledger rows to w as CSV, flushing
// every opts.FlushEvery rows and stopping after opts.HardCap. Respects
// ctx cancellation — on cancel it flushes what it has, records the partial
// count, and returns ctx.Err().
//
// w must already have CSV-appropriate headers set by the caller.
func StreamCSV(ctx context.Context, q Querier, f Filter, w io.Writer, opts StreamCSVOptions) (StreamCSVResult, error) {
	if opts.FlushEvery <= 0 {
		opts.FlushEvery = CSVFlushEvery
	}
	if opts.HardCap <= 0 {
		opts.HardCap = CSVHardCap
	}

	sql, args := BuildSelect(f, true)
	it, err := q.QueryIter(ctx, sql, args...)
	if err != nil {
		return StreamCSVResult{}, err
	}
	defer it.Close()

	cw := csv.NewWriter(w)
	if err := cw.Write(CSVHeader); err != nil {
		return StreamCSVResult{}, err
	}

	var res StreamCSVResult
	flush := func() {
		cw.Flush()
		if opts.Flusher != nil {
			opts.Flusher.Flush()
		}
		res.Flushes++
	}

	for it.Next() {
		if err := ctx.Err(); err != nil {
			flush()
			return res, err
		}
		if res.Rows >= opts.HardCap {
			res.Truncated = true
			break
		}
		var r Row
		if err := it.Scan(
			&r.ID, &r.WorkspaceID, &r.EntryType, &r.AmountPaise, &r.MinutesDelta,
			&r.PurchaseID, &r.ReservationID, &r.StreamID,
			&r.IdempotencyKey, &r.CreatedBy, &r.CreatedAt,
		); err != nil {
			return res, err
		}
		if err := cw.Write(rowToCSV(r)); err != nil {
			return res, err
		}
		res.Rows++
		if res.Rows%opts.FlushEvery == 0 {
			flush()
		}
	}
	if err := it.Err(); err != nil {
		flush()
		return res, err
	}
	// Final flush for the trailing partial batch.
	flush()
	return res, nil
}

func rowToCSV(r Row) []string {
	return []string{
		r.ID.String(),
		r.WorkspaceID.String(),
		r.EntryType,
		fmt.Sprintf("%d", r.AmountPaise),
		fmt.Sprintf("%d", r.MinutesDelta),
		uuidPtrStr(r.PurchaseID),
		uuidPtrStr(r.ReservationID),
		uuidPtrStr(r.StreamID),
		r.IdempotencyKey,
		uuidPtrStr(r.CreatedBy),
		r.CreatedAt.UTC().Format(time.RFC3339Nano),
	}
}

// escapeLikeOperand escapes LIKE meta-characters (%, _, \) in the operand so
// user-supplied search input cannot inject wildcards. Pair with `ESCAPE '\'`
// in the SQL clause.
func escapeLikeOperand(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func uuidPtrStr(p *uuid.UUID) string {
	if p == nil {
		return ""
	}
	return p.String()
}
