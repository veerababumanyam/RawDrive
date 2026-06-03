// Package ledger supports the super-admin streaming ledger explorer shipped in
// M35 / 35-7. It exposes a pure filter-parser (filter.go) and a keyset-paginated
// query / streaming-CSV iterator (ledger_query.go) that the admin_ledger_handler
// composes.
//
// The table of record is `streaming_ledger_entries` (migration 085). All
// queries order by (created_at DESC, id DESC) so keyset pagination is stable
// even across ties on created_at (gen_random_uuid() provides the tiebreak).
package ledger

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// EntryTypeWhitelist is the allowed set of streaming_ledger_entries.entry_type
// values. Mirrors the CHECK constraint in migration 085.
var EntryTypeWhitelist = map[string]struct{}{
	"purchase":   {},
	"reserve":    {},
	"consume":    {},
	"refund":     {},
	"overage":    {},
	"adjustment": {},
}

// Errors surfaced by Parse. Handlers map these to 400 codes.
var (
	ErrInvalidWorkspace = errors.New("ledger: invalid_workspace_id")
	ErrInvalidActor     = errors.New("ledger: invalid_actor_id")
	ErrInvalidEntryType = errors.New("ledger: invalid_entry_type")
	ErrInvalidDateRange = errors.New("ledger: invalid_date_range")
	ErrInvalidCursor    = errors.New("ledger: invalid_cursor")
	ErrInvalidLimit     = errors.New("ledger: invalid_limit")
	ErrSearchTooLong    = errors.New("ledger: search_too_long")
)

// Filter is the parsed, validated query surface. All fields are optional
// except Limit which defaults via DefaultLimit.
type Filter struct {
	WorkspaceID *uuid.UUID
	ActorID     *uuid.UUID
	EntryTypes  []string
	From        *time.Time
	To          *time.Time
	Search      string
	Limit       int
	Cursor      *Cursor
}

// Cursor is the keyset pagination handle: (created_at DESC, id DESC).
type Cursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

const (
	// DefaultLimit is applied when the caller omits ?limit= or supplies 0.
	DefaultLimit = 100
	// MaxLimit caps a single JSON page.
	MaxLimit = 500
	// MaxSearchLen caps free-text search; prevents abusive LIKE inputs.
	MaxSearchLen = 64
	// CSVHardCap is the maximum rows streamed by a CSV export.
	CSVHardCap = 100_000
	// CSVFlushEvery flushes the csv writer every N rows during export.
	CSVFlushEvery = 500
)

// ParseFromRequest parses a Filter from the HTTP query string.
// Rejects invalid UUIDs, out-of-whitelist entry types, inverted date ranges,
// oversized search strings, and out-of-bounds limits.
func ParseFromRequest(r *http.Request) (Filter, error) {
	q := r.URL.Query()
	return parseFromValues(q)
}

// ParseFromValues is the lookup-agnostic form, exposed for unit tests.
func ParseFromValues(values map[string][]string) (Filter, error) {
	return parseFromValues(values)
}

func parseFromValues(q map[string][]string) (Filter, error) {
	var f Filter

	if v := firstNonEmpty(q["workspace"], q["workspace_id"]); v != "" && v != "all" {
		id, err := uuid.Parse(v)
		if err != nil {
			return Filter{}, ErrInvalidWorkspace
		}
		f.WorkspaceID = &id
	}

	if v := firstNonEmpty(q["actor"], q["actor_id"]); v != "" {
		id, err := uuid.Parse(v)
		if err != nil {
			return Filter{}, ErrInvalidActor
		}
		f.ActorID = &id
	}

	// entry_type may repeat (multi-select) or be comma-separated.
	for _, raw := range q["entry_type"] {
		for _, part := range strings.Split(raw, ",") {
			p := strings.TrimSpace(strings.ToLower(part))
			if p == "" {
				continue
			}
			if _, ok := EntryTypeWhitelist[p]; !ok {
				return Filter{}, ErrInvalidEntryType
			}
			f.EntryTypes = append(f.EntryTypes, p)
		}
	}

	if v := firstNonEmpty(q["from"], q["from_date"]); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return Filter{}, ErrInvalidDateRange
		}
		f.From = &t
	}
	if v := firstNonEmpty(q["to"], q["to_date"]); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			return Filter{}, ErrInvalidDateRange
		}
		f.To = &t
	}
	if f.From != nil && f.To != nil && !f.To.After(*f.From) {
		return Filter{}, ErrInvalidDateRange
	}

	if v := firstNonEmpty(q["search"]); v != "" {
		s := strings.TrimSpace(v)
		if len(s) > MaxSearchLen {
			return Filter{}, ErrSearchTooLong
		}
		f.Search = s
	}

	f.Limit = DefaultLimit
	if v := firstNonEmpty(q["limit"]); v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err != nil || n < 1 || n > MaxLimit {
			return Filter{}, ErrInvalidLimit
		}
		f.Limit = n
	}

	if v := firstNonEmpty(q["cursor"]); v != "" {
		c, err := DecodeCursor(v)
		if err != nil {
			return Filter{}, ErrInvalidCursor
		}
		f.Cursor = &c
	}

	return f, nil
}

// EncodeCursor serializes a cursor as "<rfc3339nano>|<uuid>". Opaque to callers.
func EncodeCursor(c Cursor) string {
	return c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID.String()
}

// DecodeCursor parses a cursor produced by EncodeCursor. Returns an error on
// malformed inputs — handlers must map to 400 invalid_cursor.
func DecodeCursor(s string) (Cursor, error) {
	i := strings.IndexByte(s, '|')
	if i <= 0 || i == len(s)-1 {
		return Cursor{}, ErrInvalidCursor
	}
	t, err := time.Parse(time.RFC3339Nano, s[:i])
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	id, err := uuid.Parse(s[i+1:])
	if err != nil {
		return Cursor{}, ErrInvalidCursor
	}
	return Cursor{CreatedAt: t.UTC(), ID: id}, nil
}

func firstNonEmpty(slices ...[]string) string {
	for _, s := range slices {
		if len(s) > 0 && s[0] != "" {
			return s[0]
		}
	}
	return ""
}
