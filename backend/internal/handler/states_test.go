package handler_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/rawdrive/backend/internal/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stubStatesRepo is an in-memory StatesRepo that returns whatever rows were
// configured by the test. It does NOT re-sort — the production contract is
// that the repo returns already-sorted rows, so the test supplies pre-sorted
// fixtures to exercise that path.
type stubStatesRepo struct {
	rows   []handler.State
	failWith error
}

func (s *stubStatesRepo) ListAllSorted(_ context.Context) ([]handler.State, error) {
	if s.failWith != nil {
		return nil, s.failWith
	}
	return s.rows, nil
}

func TestStatesHandler_ListReturnsSortedStates(t *testing.T) {
	// Pre-sorted fixture: Andhra Pradesh < Delhi < Maharashtra alphabetically.
	// Includes one Union Territory so the is_union_territory flag is exercised.
	repo := &stubStatesRepo{
		rows: []handler.State{
			{ID: 1, Name: "Andhra Pradesh", Code: "IN-AP", IsUnionTerritory: false},
			{ID: 39, Name: "Delhi", Code: "IN-DL", IsUnionTerritory: true},
			{ID: 14, Name: "Maharashtra", Code: "IN-MH", IsUnionTerritory: false},
		},
	}
	h := handler.NewStatesHandler(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/states", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))
	assert.Contains(t, rr.Header().Get("Cache-Control"), "max-age=3600")

	var payload struct {
		States []handler.State `json:"states"`
	}
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&payload))
	require.Len(t, payload.States, 3)
	assert.Equal(t, "Andhra Pradesh", payload.States[0].Name)
	assert.Equal(t, "Delhi", payload.States[1].Name)
	assert.True(t, payload.States[1].IsUnionTerritory, "Delhi is a UT")
	assert.Equal(t, "Maharashtra", payload.States[2].Name)
	assert.False(t, payload.States[2].IsUnionTerritory)
}

func TestStatesHandler_ListEmptyReturnsEmptyArray(t *testing.T) {
	// An empty states table is unusual in prod but must not return null —
	// the frontend JSON.parse path assumes an array.
	repo := &stubStatesRepo{rows: []handler.State{}}
	h := handler.NewStatesHandler(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/states", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.JSONEq(t, `{"states":[]}`, rr.Body.String())
}

func TestStatesHandler_ListRepoErrorReturns500(t *testing.T) {
	repo := &stubStatesRepo{failWith: errors.New("db down")}
	h := handler.NewStatesHandler(repo)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/states", nil)
	rr := httptest.NewRecorder()
	h.List(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
	assert.Contains(t, rr.Body.String(), "failed to load states")
}
