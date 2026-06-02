package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestMFAChallengeTokenFromRequestUsesBodyFallback(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/verify-totp", nil)
	req.AddCookie(&http.Cookie{Name: mfaChallengeCookieName, Value: "cookie-token"})

	assert.Equal(t, "body-token", mfaChallengeTokenFromRequest(req, " body-token "))
}

func TestMFAChallengeTokenFromRequestFallsBackToCookie(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/auth/verify-totp", nil)
	req.AddCookie(&http.Cookie{Name: mfaChallengeCookieName, Value: " cookie-token "})

	assert.Equal(t, "cookie-token", mfaChallengeTokenFromRequest(req, ""))
}

func TestMFAChallengeCookieIsHttpOnlyAndScopedToAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/auth/oauth/google/callback", nil)
	rr := httptest.NewRecorder()

	setMFAChallengeCookie(rr, req, "challenge-token")

	cookies := rr.Result().Cookies()
	if assert.Len(t, cookies, 1) {
		assert.Equal(t, mfaChallengeCookieName, cookies[0].Name)
		assert.Equal(t, "challenge-token", cookies[0].Value)
		assert.True(t, cookies[0].HttpOnly)
		assert.Equal(t, "/auth", cookies[0].Path)
		assert.Equal(t, http.SameSiteStrictMode, cookies[0].SameSite)
		assert.Greater(t, cookies[0].MaxAge, 0)
	}
}
