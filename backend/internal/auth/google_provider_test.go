package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGoogleProviderExchangeCodeParsesInvalidClient(t *testing.T) {
	tokenServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "application/x-www-form-urlencoded", r.Header.Get("Content-Type"))
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"invalid_client","error_description":"The provided client secret is invalid."}`))
	}))
	defer tokenServer.Close()

	provider := &GoogleProvider{
		client:        tokenServer.Client(),
		clientID:      "client-id.apps.googleusercontent.com",
		clientSecret:  "client-secret",
		redirectURI:   "http://localhost:8080/auth/oauth/google/callback",
		tokenEndpoint: tokenServer.URL,
	}

	token, err := provider.ExchangeCode(context.Background(), "code", "verifier")

	require.Nil(t, token)
	var tokenErr *GoogleTokenError
	require.True(t, errors.As(err, &tokenErr), "expected GoogleTokenError, got %T: %v", err, err)
	assert.Equal(t, http.StatusUnauthorized, tokenErr.StatusCode)
	assert.Equal(t, "invalid_client", tokenErr.Code)
	assert.True(t, IsOAuthProviderConfigurationError(err))
	assert.NotContains(t, err.Error(), "provided client secret")
}
