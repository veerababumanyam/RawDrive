package cf

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"
)

// HTTPClient is a thin wrapper around *http.Client that centralises:
//   - bearer auth (sourced from *Config — NEVER hardcoded)
//   - JSON encode/decode
//   - 4xx/5xx → *CFError classification
//   - transport errors → ErrCFNetwork
//   - retry with exponential backoff on 429 and 5xx (max 3 attempts)
//
// It is concurrency-safe; a single instance can be shared across goroutines.
type HTTPClient struct {
	cfg      *Config
	base     string
	http     *http.Client
	maxRetry int
	sleep    func(time.Duration) // injectable for deterministic tests
}

// NewHTTPClient returns an HTTPClient configured from cfg. base is the CF API
// base URL; pass "" for the default "https://api.cloudflare.com/client/v4".
func NewHTTPClient(cfg *Config, base string) *HTTPClient {
	if base == "" {
		base = "https://api.cloudflare.com/client/v4"
	}
	return &HTTPClient{
		cfg:      cfg,
		base:     base,
		http:     &http.Client{Timeout: 30 * time.Second},
		maxRetry: 3,
		sleep:    time.Sleep,
	}
}

// Do sends a request with JSON body (may be nil) and decodes JSON response
// into out (may be nil). Returns *CFError for HTTP-level failures,
// ErrCFNetwork for transport failures. Retries 429/5xx with backoff.
func (c *HTTPClient) Do(ctx context.Context, method, path string, body, out any) error {
	var payload []byte
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		payload = b
	}

	var lastErr error
	for attempt := 0; attempt < c.maxRetry; attempt++ {
		if attempt > 0 {
			delay := time.Duration(1<<attempt) * 100 * time.Millisecond
			c.sleep(delay)
		}

		req, err := http.NewRequestWithContext(ctx, method, c.base+path, bytes.NewReader(payload))
		if err != nil {
			return err
		}
		if c.cfg != nil && c.cfg.APIToken != "" {
			req.Header.Set("Authorization", "Bearer "+c.cfg.APIToken)
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")

		resp, err := c.http.Do(req)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return err
			}
			lastErr = ErrCFNetwork
			continue
		}
		respBody, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			if out != nil && len(respBody) > 0 {
				if err := json.Unmarshal(respBody, out); err != nil {
					return err
				}
			}
			return nil
		}

		cfErr := classifyStatus(resp.StatusCode, respBody)
		// Retry only on transient: 429 + 5xx
		if resp.StatusCode == 429 || resp.StatusCode >= 500 {
			lastErr = cfErr
			continue
		}
		return cfErr
	}
	return lastErr
}
