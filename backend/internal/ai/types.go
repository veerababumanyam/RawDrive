// Package ai provides AI-powered features: face detection, semantic search, auto-tagging,
// duplicate detection, and smart culling via the Google Gemini API.
package ai

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// Sentinel errors for AI operations.
var (
	ErrNoAPIKey         = errors.New("ai: no API key configured for workspace")
	ErrQuotaExceeded    = errors.New("ai: Gemini quota exceeded (429)")
	ErrCapReached       = errors.New("ai: monthly spend cap reached")
	ErrFaceDetectFailed = errors.New("ai: face detection failed")
	ErrParseFailure     = errors.New("ai: failed to parse Gemini response")
	ErrClusterNotFound  = errors.New("ai: cluster not found")
	ErrSameCluster      = errors.New("ai: source and target clusters are the same")
	ErrSplitWouldEmpty  = errors.New("ai: split would empty source cluster")
	ErrNonMemberFace    = errors.New("ai: face not a member of cluster")
	ErrJobNotFound      = errors.New("ai: job not found")
)

// BoundingBox represents a face region in normalized coordinates (0-1).
type BoundingBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// DetectedFace is returned by GeminiClient.DetectFaces.
type DetectedFace struct {
	Index       int         `json:"face_index"`
	BoundingBox BoundingBox `json:"bounding_box"`
	Confidence  float64     `json:"confidence"`
	Embedding   []float32   `json:"embedding,omitempty"` // 128-dim
}

// FaceCluster is the persistent domain record for a detected face.
type FaceCluster struct {
	ID           uuid.UUID   `json:"id"`
	WorkspaceID  uuid.UUID   `json:"workspace_id"`
	AssetID      uuid.UUID   `json:"asset_id"`
	GalleryID    *uuid.UUID  `json:"gallery_id,omitempty"`
	FaceIndex    int         `json:"face_index"`
	BoundingBox  BoundingBox `json:"bounding_box"`
	Embedding    []float32   `json:"-"` // never serialized to clients
	ClusterLabel *uuid.UUID  `json:"cluster_label,omitempty"`
	ClusterName  string      `json:"cluster_name,omitempty"`
	Confidence   float64     `json:"confidence"`
	Source       string      `json:"source"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

// ClusterSummary is a condensed view for listing face clusters.
type ClusterSummary struct {
	ClusterLabel  uuid.UUID   `json:"cluster_label"`
	ClusterName   string      `json:"cluster_name"`
	FaceCount     int         `json:"face_count"`
	AssetCount    int         `json:"asset_count"`
	SampleAssetID uuid.UUID   `json:"sample_asset_id"`
	SampleBBox    BoundingBox `json:"sample_bounding_box"`
}

// AIJob represents an async AI processing job.
type AIJob struct {
	ID             uuid.UUID              `json:"id"`
	WorkspaceID    uuid.UUID              `json:"workspace_id"`
	Type           string                 `json:"type"`
	Status         string                 `json:"status"` // pending, running, done, failed
	TotalItems     int                    `json:"total_items"`
	ProcessedItems int                    `json:"processed_items"`
	Result         map[string]interface{} `json:"result,omitempty"`
	Error          string                 `json:"error,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

// AIConfig holds per-workspace AI configuration (BYOK key, spend cap).
type AIConfig struct {
	ID              uuid.UUID `json:"id"`
	WorkspaceID     uuid.UUID `json:"workspace_id"`
	Provider        string    `json:"provider"`
	EncryptedKey    string    `json:"-"` // never serialized
	ModelPreference string    `json:"model_preference"`
	MonthlyCapPaisa int64     `json:"monthly_cap_paisa"`
	Alert80Sent     bool      `json:"alert_80_sent"`
	Alert100Sent    bool      `json:"alert_100_sent"`
	Enabled         bool      `json:"enabled"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// AIUsageLog records a single AI operation for cost tracking.
type AIUsageLog struct {
	ID                uuid.UUID  `json:"id"`
	WorkspaceID       uuid.UUID  `json:"workspace_id"`
	Operation         string     `json:"operation"` // tagging, search, face_detection, curation
	Model             string     `json:"model"`
	InputTokens       int64      `json:"input_tokens"`
	OutputTokens      int64      `json:"output_tokens"`
	CostEstimatePaisa int64      `json:"cost_estimate_paisa"`
	AssetID           *uuid.UUID `json:"asset_id,omitempty"`
	JobID             *uuid.UUID `json:"job_id,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

// AITag represents a single auto-generated tag on an asset.
type AITag struct {
	Tag        string  `json:"tag"`
	Category   string  `json:"category"` // scene, mood, object, color, composition
	Confidence float64 `json:"confidence"`
	Source     string  `json:"source"` // model name or "manual"
	Status     string  `json:"status"` // pending_review, accepted, rejected, edited
}

// GeneratedTag is returned by GeminiClient.GenerateTags.
type GeneratedTag struct {
	Tag        string  `json:"tag"`
	Category   string  `json:"category"`
	Confidence float64 `json:"confidence"`
}

// QualityScore holds per-image technical quality assessment.
type QualityScore struct {
	Sharpness   float64 `json:"sharpness"`
	Exposure    float64 `json:"exposure"`
	Composition float64 `json:"composition"`
	Overall     float64 `json:"overall"`
}

// DuplicateGroup represents a group of near-identical images.
type DuplicateGroup struct {
	ID          uuid.UUID              `json:"id"`
	WorkspaceID uuid.UUID              `json:"workspace_id"`
	GalleryID   *uuid.UUID             `json:"gallery_id,omitempty"`
	Status      string                 `json:"status"` // pending, resolved, dismissed
	Members     []DuplicateGroupMember `json:"members,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
}

// DuplicateGroupMember is one member of a duplicate group.
type DuplicateGroupMember struct {
	ID               uuid.UUID     `json:"id"`
	GroupID          uuid.UUID     `json:"group_id"`
	AssetID          uuid.UUID     `json:"asset_id"`
	SimilarityScore  float64       `json:"similarity_score"`
	IsRepresentative bool          `json:"is_representative"`
	Quality          *QualityScore `json:"quality,omitempty"`
}

// SpendSummary is the aggregate AI spend for a workspace in a period.
type SpendSummary struct {
	WorkspaceID     uuid.UUID        `json:"workspace_id"`
	PeriodStart     time.Time        `json:"period_start"`
	PeriodEnd       time.Time        `json:"period_end"`
	TotalPaisa      int64            `json:"total_paisa"`
	ByOperation     map[string]int64 `json:"by_operation"`
	MonthlyCapPaisa int64            `json:"monthly_cap_paisa"`
	CapUsedPercent  float64          `json:"cap_used_percent"`
}

// DailySpend is one day's aggregated AI cost.
type DailySpend struct {
	Date        time.Time        `json:"date"`
	TotalPaisa  int64            `json:"total_paisa"`
	ByOperation map[string]int64 `json:"by_operation"`
}

// CreditSummary is the credit/usage overview for a workspace.
type CreditSummary struct {
	WorkspaceID         uuid.UUID `json:"workspace_id"`
	MonthlyCapPaisa     int64     `json:"monthly_cap_paisa"`
	SpentThisMonthPaisa int64     `json:"spent_this_month_paisa"`
	RemainingPaisa      int64     `json:"remaining_paisa"` // -1 if no cap
	CapUsedPercent      float64   `json:"cap_used_percent"`
	IsCapReached        bool      `json:"is_cap_reached"`
	Alert80Sent         bool      `json:"alert_80_sent"`
	Alert100Sent        bool      `json:"alert_100_sent"`
}

// SearchResult is returned by semantic search.
type SearchResult struct {
	AssetID       uuid.UUID         `json:"asset_id"`
	Filename      string            `json:"filename"`
	ContentType   string            `json:"content_type"`
	ThumbnailURLs map[string]string `json:"thumbnail_urls"`
	Similarity    float64           `json:"similarity"`
	AITags        []AITag           `json:"ai_tags,omitempty"`
	AICaption     string            `json:"ai_caption,omitempty"`
}

// ---- HTTP Request/Response types ----

// FaceDetectRequest is the body for POST /api/v1/ai/face-detect.
type FaceDetectRequest struct {
	AssetIDs  []uuid.UUID `json:"asset_ids"`
	GalleryID *uuid.UUID  `json:"gallery_id,omitempty"`
}

// FaceDetectResponse is the response for POST /api/v1/ai/face-detect.
type FaceDetectResponse struct {
	JobID  uuid.UUID `json:"job_id"`
	Status string    `json:"status"`
}

// SemanticSearchRequest is the body for POST /api/v1/ai/search.
type SemanticSearchRequest struct {
	Query     string     `json:"query"`
	GalleryID *uuid.UUID `json:"gallery_id,omitempty"`
	Limit     int        `json:"limit,omitempty"`
}

// TagTriggerRequest is the body for POST /api/v1/ai/tags.
type TagTriggerRequest struct {
	AssetIDs []uuid.UUID `json:"asset_ids"`
}

// TagPatch describes a single tag edit operation.
type TagPatch struct {
	Tag    string `json:"tag"`
	Status string `json:"status"` // accepted, rejected, edited
	NewTag string `json:"new_tag,omitempty"`
}

// TagEditRequest is the body for PATCH /api/v1/ai/tags/:assetId.
type TagEditRequest struct {
	Patches []TagPatch `json:"patches"`
}

// ConfigSaveRequest is the body for POST /api/v1/ai/config.
type ConfigSaveRequest struct {
	APIKey          string `json:"api_key"`
	ModelPreference string `json:"model_preference,omitempty"`
}

// SpendCapRequest is the body for PUT /api/v1/ai/spend/cap.
type SpendCapRequest struct {
	MonthlyCapPaisa int64 `json:"monthly_cap_paisa"`
}
