package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
)

// State is the public-facing shape returned by GET /api/v1/states.
// It intentionally omits the internal `type` column (we use is_union_territory
// instead, which the UI can key off) and uses JSON names the frontend expects.
type State struct {
	ID               int    `json:"id"`
	Name             string `json:"name"`
	Code             string `json:"code"`
	IsUnionTerritory bool   `json:"is_union_territory"`
}

// StatesRepo abstracts the read side of the `states` table so the handler
// can be unit-tested with an in-memory stub. Implementations MUST return
// rows sorted alphabetically by name (the handler trusts the repo ordering
// rather than re-sorting, so tests have one source of truth).
type StatesRepo interface {
	ListAllSorted(ctx context.Context) ([]State, error)
}

// PgStatesRepo is the production pgx-backed implementation.
type PgStatesRepo struct {
	pool *pgxpool.Pool
}

func NewPgStatesRepo(pool *pgxpool.Pool) *PgStatesRepo {
	return &PgStatesRepo{pool: pool}
}

func (r *PgStatesRepo) ListAllSorted(ctx context.Context) ([]State, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, name, code, is_union_territory FROM states ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]State, 0, 40)
	for rows.Next() {
		var s State
		if err := rows.Scan(&s.ID, &s.Name, &s.Code, &s.IsUnionTerritory); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

// StatesHandler serves the public states-listing endpoint for the signup
// page. No auth required — a visitor on /register needs this before they
// have credentials.
type StatesHandler struct {
	repo StatesRepo
}

func NewStatesHandler(repo StatesRepo) *StatesHandler {
	return &StatesHandler{repo: repo}
}

// List returns all Indian states + union territories, sorted alphabetically.
// Response shape: {"states": [{id, name, code, is_union_territory}, ...]}
//
// The wrapper object gives us room to add metadata later (last_updated,
// count, etc.) without a breaking change to consumers.
func (h *StatesHandler) List(w http.ResponseWriter, r *http.Request) {
	states, err := h.repo.ListAllSorted(r.Context())
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "failed to load states"})
		return
	}

	// Cache aggressively — the states table is effectively immutable reference
	// data. 1 hour at the browser, 24 hours at any CDN. If the seed ever
	// changes this is short enough to roll out within a day.
	w.Header().Set("Cache-Control", "public, max-age=3600, s-maxage=86400")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]any{"states": states})
}
