package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// DefaultEmbeddingModel is the Gemini text embedding model used when no
// override is configured via platform_settings(ai.embedding_model) or the
// AI_EMBEDDING_MODEL environment variable. Keeping this as the fallback
// preserves backward compatibility for existing deployments.
const DefaultEmbeddingModel = "text-embedding-004"

// GeminiClient wraps the Google Gemini REST API.
type GeminiClient struct {
	httpClient *http.Client
	baseURL    string
	modelID    string
	// embeddingModel is the model used by GenerateEmbedding. It defaults to
	// DefaultEmbeddingModel and may be overridden via WithEmbeddingModel with
	// a value resolved from platform_settings → env → default at construction.
	embeddingModel string
}

// NewGeminiClient creates a Gemini API client.
func NewGeminiClient(modelID string) *GeminiClient {
	if modelID == "" {
		modelID = "gemini-2.0-flash"
	}
	return &GeminiClient{
		httpClient:     &http.Client{Timeout: 30 * time.Second},
		baseURL:        "https://generativelanguage.googleapis.com/v1beta",
		modelID:        modelID,
		embeddingModel: DefaultEmbeddingModel,
	}
}

// ResolveEmbeddingModel applies the configured embedding-model value, falling
// back to DefaultEmbeddingModel when the caller passes an empty/whitespace
// value. Callers thread the result of the platform_settings(ai.embedding_model)
// → env(AI_EMBEDDING_MODEL) → default lookup through here so that an unset
// config resolves to exactly DefaultEmbeddingModel (no behaviour change).
func ResolveEmbeddingModel(configured string) string {
	if strings.TrimSpace(configured) == "" {
		return DefaultEmbeddingModel
	}
	return strings.TrimSpace(configured)
}

// WithEmbeddingModel returns the client with its embedding model set to the
// resolved value. An empty/whitespace value keeps DefaultEmbeddingModel so
// existing callers and tests that never call this method are unaffected.
func (c *GeminiClient) WithEmbeddingModel(model string) *GeminiClient {
	c.embeddingModel = ResolveEmbeddingModel(model)
	return c
}

// EmbeddingModel reports the embedding model the client will use. Exposed so
// services can attribute cost/usage to the same model the request targets.
func (c *GeminiClient) EmbeddingModel() string {
	return ResolveEmbeddingModel(c.embeddingModel)
}

// geminiRequest is the Gemini API request envelope.
type geminiRequest struct {
	Contents []geminiContent `json:"contents"`
}

type geminiContent struct {
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text       string      `json:"text,omitempty"`
	InlineData *inlineData `json:"inline_data,omitempty"`
}

type inlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"` // base64
}

// geminiResponse is the Gemini API response envelope.
type geminiResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
	} `json:"usageMetadata"`
}

func (c *GeminiClient) callAPI(ctx context.Context, apiKey string, model string, parts []geminiPart) (*geminiResponse, error) {
	if model == "" {
		model = c.modelID
	}

	reqBody := geminiRequest{
		Contents: []geminiContent{{Parts: parts}},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/models/%s:generateContent?key=%s", c.baseURL, model, apiKey)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http call: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode == 429 {
		return nil, ErrQuotaExceeded
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("gemini API error %d: %s", resp.StatusCode, string(respBody))
	}

	var gemResp geminiResponse
	if err := json.Unmarshal(respBody, &gemResp); err != nil {
		return nil, fmt.Errorf("unmarshal response: %w", err)
	}

	return &gemResp, nil
}

func (c *GeminiClient) extractText(resp *geminiResponse) (string, error) {
	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "", ErrParseFailure
	}
	return resp.Candidates[0].Content.Parts[0].Text, nil
}

// ValidateKey tests an API key by making a minimal Gemini call.
func (c *GeminiClient) ValidateKey(ctx context.Context, apiKey string) error {
	parts := []geminiPart{{Text: "Reply with just the word: ok"}}
	_, err := c.callAPI(ctx, apiKey, c.modelID, parts)
	return err
}

// DetectFaces calls Gemini vision to detect faces in an image.
// Returns detected faces, input tokens, output tokens.
func (c *GeminiClient) DetectFaces(ctx context.Context, apiKey string, imageData []byte, contentType string) ([]DetectedFace, int, int, error) {
	prompt := `Detect all human faces in this image. Return ONLY valid JSON array, no markdown:
[{"face_index":0,"bounding_box":{"x":0.1,"y":0.2,"w":0.15,"h":0.15},"confidence":0.97}]
Coordinates are normalized 0-1 relative to image dimensions.`

	parts := []geminiPart{
		{Text: prompt},
		{InlineData: &inlineData{MimeType: contentType, Data: base64.StdEncoding.EncodeToString(imageData)}},
	}

	resp, err := c.callAPI(ctx, apiKey, c.modelID, parts)
	if err != nil {
		return nil, 0, 0, err
	}

	text, err := c.extractText(resp)
	if err != nil {
		return nil, 0, 0, err
	}

	// Strip markdown code fences if present
	text = stripCodeFences(text)

	var faces []DetectedFace
	if err := json.Unmarshal([]byte(text), &faces); err != nil {
		return nil, 0, 0, fmt.Errorf("%w: %v", ErrParseFailure, err)
	}

	return faces,
		resp.UsageMetadata.PromptTokenCount,
		resp.UsageMetadata.CandidatesTokenCount,
		nil
}

// GenerateTags calls Gemini vision to produce tags and a caption for an image.
func (c *GeminiClient) GenerateTags(ctx context.Context, apiKey string, imageData []byte, contentType string) ([]GeneratedTag, string, int, int, error) {
	prompt := `Analyze this photograph and return ONLY valid JSON, no markdown:
{"tags":[{"tag":"golden hour","category":"mood","confidence":0.95}],"caption":"A description of the image"}
Categories: scene, mood, object, color, composition. Generate 5-15 tags. Caption should be 1-2 sentences.`

	parts := []geminiPart{
		{Text: prompt},
		{InlineData: &inlineData{MimeType: contentType, Data: base64.StdEncoding.EncodeToString(imageData)}},
	}

	resp, err := c.callAPI(ctx, apiKey, c.modelID, parts)
	if err != nil {
		return nil, "", 0, 0, err
	}

	text, err := c.extractText(resp)
	if err != nil {
		return nil, "", 0, 0, err
	}

	text = stripCodeFences(text)

	var result struct {
		Tags    []GeneratedTag `json:"tags"`
		Caption string         `json:"caption"`
	}
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, "", 0, 0, fmt.Errorf("%w: %v", ErrParseFailure, err)
	}

	return result.Tags, result.Caption,
		resp.UsageMetadata.PromptTokenCount,
		resp.UsageMetadata.CandidatesTokenCount,
		nil
}

// GenerateEmbedding calls the Gemini text embedding model.
// Returns a 768-dim float32 vector and tokens used.
func (c *GeminiClient) GenerateEmbedding(ctx context.Context, apiKey, text string) ([]float32, int, error) {
	model := c.EmbeddingModel()

	reqBody := map[string]any{
		"model": "models/" + model,
		"content": map[string]any{
			"parts": []map[string]string{{"text": text}},
		},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, 0, err
	}

	url := fmt.Sprintf("%s/models/%s:embedContent?key=%s", c.baseURL, model, apiKey)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == 429 {
		return nil, 0, ErrQuotaExceeded
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}

	if resp.StatusCode != 200 {
		return nil, 0, fmt.Errorf("embedding API error %d: %s", resp.StatusCode, string(respBody))
	}

	var embedResp struct {
		Embedding struct {
			Values []float32 `json:"values"`
		} `json:"embedding"`
	}
	if err := json.Unmarshal(respBody, &embedResp); err != nil {
		return nil, 0, fmt.Errorf("%w: %v", ErrParseFailure, err)
	}

	return embedResp.Embedding.Values, len(text) / 4, nil // approximate token count
}

// AssessQuality calls Gemini to assess image technical quality.
func (c *GeminiClient) AssessQuality(ctx context.Context, apiKey string, imageData []byte, contentType string) (*QualityScore, int, int, error) {
	prompt := `Rate this photograph's technical quality. Return ONLY valid JSON, no markdown:
{"sharpness":0.85,"exposure":0.9,"composition":0.75,"overall":0.83}
All values 0.0-1.0 where 1.0 is perfect.`

	parts := []geminiPart{
		{Text: prompt},
		{InlineData: &inlineData{MimeType: contentType, Data: base64.StdEncoding.EncodeToString(imageData)}},
	}

	resp, err := c.callAPI(ctx, apiKey, c.modelID, parts)
	if err != nil {
		return nil, 0, 0, err
	}

	text, err := c.extractText(resp)
	if err != nil {
		return nil, 0, 0, err
	}

	text = stripCodeFences(text)

	var score QualityScore
	if err := json.Unmarshal([]byte(text), &score); err != nil {
		return nil, 0, 0, fmt.Errorf("%w: %v", ErrParseFailure, err)
	}

	return &score,
		resp.UsageMetadata.PromptTokenCount,
		resp.UsageMetadata.CandidatesTokenCount,
		nil
}

// GenerateText calls Gemini with a text-only prompt and returns the raw text
// response along with prompt and candidate token counts. Used by features
// that analyse metadata rather than image bytes, such as design
// recommendations (GAL-FR-078).
func (c *GeminiClient) GenerateText(ctx context.Context, apiKey, prompt string) (string, int, int, error) {
	parts := []geminiPart{{Text: prompt}}
	resp, err := c.callAPI(ctx, apiKey, c.modelID, parts)
	if err != nil {
		return "", 0, 0, err
	}
	text, err := c.extractText(resp)
	if err != nil {
		return "", 0, 0, err
	}
	return stripCodeFences(text),
		resp.UsageMetadata.PromptTokenCount,
		resp.UsageMetadata.CandidatesTokenCount,
		nil
}

// stripCodeFences removes ```json ... ``` wrappers from Gemini output.
func stripCodeFences(s string) string {
	// Remove ```json prefix
	for _, prefix := range []string{"```json\n", "```json ", "```\n"} {
		if len(s) > len(prefix) && s[:len(prefix)] == prefix {
			s = s[len(prefix):]
			break
		}
	}
	// Remove trailing ```
	if len(s) > 3 && s[len(s)-3:] == "```" {
		s = s[:len(s)-3]
	}
	// Trim whitespace
	for len(s) > 0 && (s[0] == ' ' || s[0] == '\n' || s[0] == '\r') {
		s = s[1:]
	}
	for len(s) > 0 && (s[len(s)-1] == ' ' || s[len(s)-1] == '\n' || s[len(s)-1] == '\r') {
		s = s[:len(s)-1]
	}
	return s
}
