package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

type GoogleProvider struct {
	client        *http.Client
	clientID      string
	clientSecret  string
	redirectURI   string
	tokenEndpoint string
	verifier      *oidc.IDTokenVerifier
}

type GoogleTokenError struct {
	StatusCode  int
	Code        string
	Description string
}

func (e *GoogleTokenError) Error() string {
	if e == nil {
		return ""
	}
	if e.Code != "" {
		return fmt.Sprintf("google token exchange failed: %s (%d)", e.Code, e.StatusCode)
	}
	return fmt.Sprintf("google token exchange failed with status %d", e.StatusCode)
}

func IsOAuthProviderConfigurationError(err error) bool {
	var tokenErr *GoogleTokenError
	return errors.As(err, &tokenErr) && tokenErr.Code == "invalid_client"
}

func NewGoogleProvider(clientID, clientSecret, redirectURI string) *GoogleProvider {
	client := &http.Client{Timeout: 10 * time.Second}
	keySet := oidc.NewRemoteKeySet(context.Background(), "https://www.googleapis.com/oauth2/v3/certs")
	return &GoogleProvider{
		client:        client,
		clientID:      clientID,
		clientSecret:  clientSecret,
		redirectURI:   redirectURI,
		tokenEndpoint: "https://oauth2.googleapis.com/token",
		verifier:      oidc.NewVerifier("https://accounts.google.com", keySet, &oidc.Config{ClientID: clientID}),
	}
}

func (p *GoogleProvider) ExchangeCode(ctx context.Context, code, codeVerifier string) (*OAuthToken, error) {
	form := url.Values{
		"code":          []string{code},
		"client_id":     []string{p.clientID},
		"client_secret": []string{p.clientSecret},
		"redirect_uri":  []string{p.redirectURI},
		"grant_type":    []string{"authorization_code"},
	}
	if codeVerifier != "" {
		form.Set("code_verifier", codeVerifier)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		p.tokenURL(),
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		var providerErr struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		if err := json.Unmarshal(body, &providerErr); err == nil && providerErr.Error != "" {
			return nil, &GoogleTokenError{
				StatusCode:  resp.StatusCode,
				Code:        providerErr.Error,
				Description: providerErr.ErrorDescription,
			}
		}
		return nil, fmt.Errorf("google token exchange returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var payload struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.AccessToken == "" {
		return nil, fmt.Errorf("google token exchange returned empty access token")
	}
	if payload.IDToken == "" {
		return nil, fmt.Errorf("google token exchange returned empty id token")
	}

	return &OAuthToken{AccessToken: payload.AccessToken, IDToken: payload.IDToken}, nil
}

func (p *GoogleProvider) tokenURL() string {
	if p != nil && p.tokenEndpoint != "" {
		return p.tokenEndpoint
	}
	return "https://oauth2.googleapis.com/token"
}

func (p *GoogleProvider) GetProfile(ctx context.Context, token *OAuthToken, expectedNonce string) (*OAuthProfile, error) {
	if token == nil || token.IDToken == "" {
		return nil, errors.New("google id token missing")
	}
	idToken, err := p.verifier.Verify(ctx, token.IDToken)
	if err != nil {
		return nil, err
	}
	if expectedNonce == "" || idToken.Nonce != expectedNonce {
		return nil, fmt.Errorf("google id token nonce mismatch")
	}

	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := idToken.Claims(&claims); err != nil {
		return nil, err
	}
	if claims.Email == "" || idToken.Subject == "" {
		return nil, fmt.Errorf("google id token missing required claims")
	}
	// S1-G1 / AREA-AUTH-4: an unverified Google email proves nothing about
	// ownership. Refuse it here so it can never reach the callback's
	// link/create logic. Returning an error makes OAuthGoogleCallback redirect
	// with an error param rather than minting a session.
	if !claims.EmailVerified {
		return nil, fmt.Errorf("google account email is not verified")
	}

	return &OAuthProfile{
		Email:         claims.Email,
		EmailVerified: claims.EmailVerified,
		DisplayName:   claims.Name,
		AvatarURL:     claims.Picture,
		ProviderID:    idToken.Subject,
	}, nil
}
