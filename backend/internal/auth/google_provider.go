package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type GoogleProvider struct {
	client       *http.Client
	clientID     string
	clientSecret string
	redirectURI  string
}

func NewGoogleProvider(clientID, clientSecret, redirectURI string) *GoogleProvider {
	return &GoogleProvider{
		client:       &http.Client{Timeout: 10 * time.Second},
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURI:  redirectURI,
	}
}

func (p *GoogleProvider) ExchangeCode(ctx context.Context, code string) (*OAuthToken, error) {
	form := url.Values{
		"code":          []string{code},
		"client_id":     []string{p.clientID},
		"client_secret": []string{p.clientSecret},
		"redirect_uri":  []string{p.redirectURI},
		"grant_type":    []string{"authorization_code"},
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://oauth2.googleapis.com/token",
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
		return nil, fmt.Errorf("google token exchange returned %d", resp.StatusCode)
	}

	var payload struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.AccessToken == "" {
		return nil, fmt.Errorf("google token exchange returned empty access token")
	}

	return &OAuthToken{AccessToken: payload.AccessToken}, nil
}

func (p *GoogleProvider) GetProfile(ctx context.Context, token *OAuthToken) (*OAuthProfile, error) {
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		"https://openidconnect.googleapis.com/v1/userinfo",
		nil,
	)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token.AccessToken)

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("google userinfo returned %d", resp.StatusCode)
	}

	var payload struct {
		Sub     string `json:"sub"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, err
	}
	if payload.Email == "" || payload.Sub == "" {
		return nil, fmt.Errorf("google userinfo response missing required fields")
	}

	return &OAuthProfile{
		Email:       payload.Email,
		DisplayName: payload.Name,
		AvatarURL:   payload.Picture,
		ProviderID:  payload.Sub,
	}, nil
}
