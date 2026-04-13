package cf

import (
	"context"
	"time"
)

// LiveInput represents a Cloudflare Stream live input record.
type LiveInput struct {
	UID        string            `json:"uid"`
	StreamKey  string            `json:"streamKey"`  // RTMPS key — SECRET, never log
	RTMPSURL   string            `json:"rtmpsUrl"`
	SRTURL     string            `json:"srtUrl"`
	SRTPasskey string            `json:"srtPasskey"` // SECRET
	Status     string            `json:"status"` // "idle" | "connected" | "disconnected"
	Created    time.Time         `json:"created"`
	Modified   time.Time         `json:"modified"`
	Meta       map[string]string `json:"meta,omitempty"`
}

// LiveInputPatch is the Update payload. Matches CF PATCH semantics where
// unspecified fields are left unchanged. Top-level requireSignedURLs/
// allowedOrigins are intentionally absent — per Cloudflare Stream API,
// those properties live under `recording` only.
type LiveInputPatch struct {
	Meta      map[string]string `json:"meta,omitempty"`
	Recording *RecordingConfig  `json:"recording,omitempty"`
}

// createBody is the request envelope for POST /stream/live_inputs.
// Separate from LiveInputPatch because Create has slightly different
// semantics (defaults, defaultCreator) and we want tests to assert the
// exact wire shape Cloudflare expects.
type createBody struct {
	Meta           map[string]string `json:"meta"`
	Recording      *RecordingConfig  `json:"recording"`
	DefaultCreator string            `json:"defaultCreator,omitempty"`
}

type RecordingConfig struct {
	Mode                string   `json:"mode,omitempty"` // "automatic" | "off"
	RequireSignedURLs   *bool    `json:"requireSignedURLs,omitempty"`
	AllowedOrigins      []string `json:"allowedOrigins,omitempty"`
	TimeoutSeconds      int      `json:"timeoutSeconds,omitempty"`
}

// LiveInputClient is the contract consumed by stream_service and the
// reconciliation worker (E105-S4). Implementations must NEVER hardcode
// credentials.
type LiveInputClient interface {
	Create(ctx context.Context, meta map[string]string) (*LiveInput, error)
	Update(ctx context.Context, uid string, patch LiveInputPatch) (*LiveInput, error)
	Disable(ctx context.Context, uid string) error
	Delete(ctx context.Context, uid string) error
	Get(ctx context.Context, uid string) (*LiveInput, error)
}

// cfLiveInputClient is the real Cloudflare-backed implementation.
type cfLiveInputClient struct {
	cfg *Config
	c   *HTTPClient
}

// NewCFLiveInputClient builds a LiveInputClient against CF's live_inputs API.
// Every Create enforces RequireSignedURLs=true per M30 security policy.
func NewCFLiveInputClient(cfg *Config, httpClient *HTTPClient) LiveInputClient {
	return &cfLiveInputClient{cfg: cfg, c: httpClient}
}

// cfResponse is the standard CF API envelope.
type cfResponse[T any] struct {
	Success bool      `json:"success"`
	Errors  []cfError `json:"errors"`
	Result  T         `json:"result"`
}

type cfError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (c *cfLiveInputClient) basePath() string {
	return "/accounts/" + c.cfg.AccountID + "/stream/live_inputs"
}

func (c *cfLiveInputClient) Create(ctx context.Context, meta map[string]string) (*LiveInput, error) {
	requireSigned := true
	if meta == nil {
		meta = map[string]string{}
	}
	body := createBody{
		Meta: meta,
		Recording: &RecordingConfig{
			Mode:              "automatic",
			RequireSignedURLs: &requireSigned,
			AllowedOrigins:    c.cfg.AllowedOrigins,
		},
	}
	var resp cfResponse[LiveInput]
	if err := c.c.Do(ctx, "POST", c.basePath(), body, &resp); err != nil {
		return nil, err
	}
	result := resp.Result
	return &result, nil
}

func (c *cfLiveInputClient) Update(ctx context.Context, uid string, patch LiveInputPatch) (*LiveInput, error) {
	var resp cfResponse[LiveInput]
	if err := c.c.Do(ctx, "PUT", c.basePath()+"/"+uid, patch, &resp); err != nil {
		return nil, err
	}
	result := resp.Result
	return &result, nil
}

func (c *cfLiveInputClient) Disable(ctx context.Context, uid string) error {
	requireSigned := true
	patch := LiveInputPatch{
		Recording: &RecordingConfig{
			Mode:              "off",
			RequireSignedURLs: &requireSigned,
		},
	}
	_, err := c.Update(ctx, uid, patch)
	return err
}

func (c *cfLiveInputClient) Delete(ctx context.Context, uid string) error {
	err := c.c.Do(ctx, "DELETE", c.basePath()+"/"+uid, nil, nil)
	// 404 on delete means it's already gone — idempotent success.
	if cfErr := (&CFError{}); err != nil && asCFError(err, cfErr) && cfErr.Code == 404 {
		return nil
	}
	return err
}

func (c *cfLiveInputClient) Get(ctx context.Context, uid string) (*LiveInput, error) {
	var resp cfResponse[LiveInput]
	if err := c.c.Do(ctx, "GET", c.basePath()+"/"+uid, nil, &resp); err != nil {
		return nil, err
	}
	result := resp.Result
	return &result, nil
}

// asCFError is a small helper to avoid importing "errors" solely for As here.
func asCFError(err error, target *CFError) bool {
	if err == nil || target == nil {
		return false
	}
	if e, ok := err.(*CFError); ok {
		*target = *e
		return true
	}
	return false
}
