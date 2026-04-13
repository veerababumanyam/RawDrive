package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	rdm "github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/streaming/viewer"
)

func newViewerService(t *testing.T) *viewer.Service {
	t.Helper()
	return viewer.NewService(viewer.Config{
		SigningKey:  []byte("viewer-ctx-test-signing-key-xxxxxxx"),
		SlidingTTL:  5 * time.Minute,
		MaxLifetime: 1 * time.Hour,
	})
}

func echoHandler(w http.ResponseWriter, r *http.Request) {
	if s := rdm.ViewerSessionFromContext(r.Context()); s != nil {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(s.StreamID + ":" + string(s.AccessLevel)))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func TestViewerContext_AttachesSessionOnValidJWT(t *testing.T) {
	svc := newViewerService(t)
	streamID := uuid.NewString()
	pair, err := svc.IssueSession(streamID, viewer.AccessLevelPIN)
	require.NoError(t, err)

	h := rdm.ViewerContext(svc)(http.HandlerFunc(echoHandler))
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.Contains(t, rec.Body.String(), streamID)
	assert.Contains(t, rec.Body.String(), "pin")
}

func TestViewerContext_PassesThroughWithoutJWT(t *testing.T) {
	svc := newViewerService(t)

	h := rdm.ViewerContext(svc)(http.HandlerFunc(echoHandler))
	req := httptest.NewRequest("GET", "/x", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusNoContent, rec.Code, "anonymous requests must pass through, not 401")
}

func TestViewerContext_Rejects401OnInvalidJWT(t *testing.T) {
	svc := newViewerService(t)

	h := rdm.ViewerContext(svc)(http.HandlerFunc(echoHandler))
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Authorization", "Bearer this-is-not-a-valid-jwt")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "invalid_viewer_session")
}

func TestRequireViewerSession_Returns401WhenAbsent(t *testing.T) {
	svc := newViewerService(t)
	h := rdm.ViewerContext(svc)(rdm.RequireViewerSession()(http.HandlerFunc(echoHandler)))

	req := httptest.NewRequest("POST", "/chat", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "viewer_session_required")
}

func TestRequireViewerSession_AllowsWhenPresent(t *testing.T) {
	svc := newViewerService(t)
	pair, err := svc.IssueSession(uuid.NewString(), viewer.AccessLevelOpen)
	require.NoError(t, err)

	h := rdm.ViewerContext(svc)(rdm.RequireViewerSession()(http.HandlerFunc(echoHandler)))
	req := httptest.NewRequest("POST", "/chat", nil)
	req.Header.Set("Authorization", "Bearer "+pair.AccessToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestBearerTokenCaseInsensitive(t *testing.T) {
	svc := newViewerService(t)
	pair, err := svc.IssueSession(uuid.NewString(), viewer.AccessLevelInviteOnly)
	require.NoError(t, err)

	h := rdm.ViewerContext(svc)(http.HandlerFunc(echoHandler))
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Authorization", "bearer "+pair.AccessToken)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	assert.Equal(t, http.StatusOK, rec.Code)
}

func TestViewerContext_NilVerifierIsNoOp(t *testing.T) {
	h := rdm.ViewerContext(nil)(http.HandlerFunc(echoHandler))
	req := httptest.NewRequest("GET", "/x", nil)
	req.Header.Set("Authorization", "Bearer whatever")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	// With nil verifier the middleware becomes a no-op; the handler still
	// sees no viewer session attached.
	assert.Equal(t, http.StatusNoContent, rec.Code)
}
