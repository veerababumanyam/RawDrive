package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// StreamService handles live streaming business logic.
type StreamService struct {
	streamRepo *repository.StreamRepo
	chatRepo   *repository.StreamChatRepo
}

// NewStreamService creates a new StreamService.
func NewStreamService(sr *repository.StreamRepo, cr *repository.StreamChatRepo) *StreamService {
	return &StreamService{streamRepo: sr, chatRepo: cr}
}

// CreateStreamInput holds input for creating a stream.
type CreateStreamInput struct {
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	GalleryID   *uuid.UUID `json:"gallery_id"`
	CreatedBy   uuid.UUID  `json:"created_by"`
	Title       string     `json:"title"`
	Description *string    `json:"description"`
	ScheduledAt *time.Time `json:"scheduled_at"`
	PinCode     *string    `json:"pin_code"`
	MaxQuality  string     `json:"max_quality"`
	ChatEnabled bool       `json:"chat_enabled"`
}

// CreateStream creates a new stream and provisions Cloudflare Stream resources.
func (s *StreamService) CreateStream(ctx context.Context, input CreateStreamInput) (*repository.Stream, error) {
	if input.Title == "" {
		return nil, fmt.Errorf("stream title is required")
	}
	if input.MaxQuality == "" {
		input.MaxQuality = "1080p"
	}

	stream := &repository.Stream{
		WorkspaceID:      input.WorkspaceID,
		GalleryID:        input.GalleryID,
		CreatedBy:        input.CreatedBy,
		Title:            input.Title,
		Description:      input.Description,
		ScheduledAt:      input.ScheduledAt,
		PinCode:          input.PinCode,
		MaxQuality:       input.MaxQuality,
		ChatEnabled:      input.ChatEnabled,
		ChatSlowModeSecs: 0,
	}

	if err := s.streamRepo.Create(ctx, stream); err != nil {
		return nil, fmt.Errorf("create stream: %w", err)
	}

	// Provision Cloudflare Stream live input (if API key configured)
	// Check multiple env var names for compatibility with existing .env.cobolt
	cfAPIToken := envFirst("CF_STREAM_API_TOKEN", "CLODFLARE_STREAMING", "CLOUDFLARE_STREAMING")
	cfAccountID := envFirst("CF_STREAM_ACCOUNT_ID", "R2_ACCOUNT_ID")
	if cfAPIToken != "" && cfAccountID != "" {
		cfUID, rtmpsURL, rtmpsKey, playbackURL, err := provisionCloudflareStream(ctx, cfAPIToken, cfAccountID, stream.Title)
		if err != nil {
			log.Printf("WARNING: Cloudflare Stream provisioning failed for stream %s: %v", stream.ID, err)
			// Stream is still created — CF provisioning can be retried
		} else {
			if err := s.streamRepo.UpdateCloudflareFields(ctx, stream.ID, cfUID, rtmpsURL, rtmpsKey, playbackURL); err != nil {
				log.Printf("WARNING: failed to save CF fields for stream %s: %v", stream.ID, err)
			}
			stream.CFStreamUID = &cfUID
			stream.CFRtmpsURL = &rtmpsURL
			stream.CFRtmpsKey = &rtmpsKey
			stream.CFPlaybackURL = &playbackURL
		}
	} else {
		log.Println("WARNING: CF_STREAM_API_TOKEN or CF_STREAM_ACCOUNT_ID not set. Live streaming requires Cloudflare Stream.")
	}

	if input.ScheduledAt != nil {
		if err := s.streamRepo.UpdateStatus(ctx, stream.ID, "scheduled"); err != nil {
			log.Printf("WARNING: failed to set stream %s as scheduled: %v", stream.ID, err)
		}
		stream.Status = "scheduled"
	}

	return stream, nil
}

// GetStream retrieves a stream by ID.
func (s *StreamService) GetStream(ctx context.Context, id uuid.UUID) (*repository.Stream, error) {
	stream, err := s.streamRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}
	return &stream, nil
}

// ListStreams lists streams for a workspace.
func (s *StreamService) ListStreams(ctx context.Context, workspaceID uuid.UUID, status string, limit, offset int) ([]repository.Stream, error) {
	return s.streamRepo.List(ctx, repository.StreamFilter{
		WorkspaceID: workspaceID,
		Status:      status,
		Limit:       limit,
		Offset:      offset,
	})
}

// StartStream marks a stream as live.
func (s *StreamService) StartStream(ctx context.Context, id uuid.UUID) error {
	return s.streamRepo.SetLive(ctx, id)
}

// EndStream marks a stream as ended.
func (s *StreamService) EndStream(ctx context.Context, id uuid.UUID, durationSecs int) error {
	return s.streamRepo.SetEnded(ctx, id, durationSecs)
}

// DeleteStream removes a stream.
func (s *StreamService) DeleteStream(ctx context.Context, id uuid.UUID) error {
	return s.streamRepo.Delete(ctx, id)
}

// UpdateViewerCount updates the live viewer count.
func (s *StreamService) UpdateViewerCount(ctx context.Context, id uuid.UUID, current, peak int) error {
	return s.streamRepo.UpdateViewerCount(ctx, id, current, peak)
}

// SetVODReady marks the stream's VOD as ready.
func (s *StreamService) SetVODReady(ctx context.Context, id uuid.UUID, vodUID string) error {
	return s.streamRepo.SetVODReady(ctx, id, vodUID)
}

// UpdateChatSettings updates chat configuration for a stream.
func (s *StreamService) UpdateChatSettings(ctx context.Context, id uuid.UUID, enabled bool, slowModeSecs int) error {
	return s.streamRepo.UpdateChatSettings(ctx, id, enabled, slowModeSecs)
}

// SendChatMessage stores a chat message.
func (s *StreamService) SendChatMessage(ctx context.Context, msg *repository.StreamChat) error {
	return s.chatRepo.Create(ctx, msg)
}

// GetChatHistory retrieves chat messages for a stream.
func (s *StreamService) GetChatHistory(ctx context.Context, streamID uuid.UUID, limit, offset int) ([]repository.StreamChat, error) {
	return s.chatRepo.ListByStream(ctx, streamID, limit, offset)
}

// MuteUser mutes a user in a stream's chat.
func (s *StreamService) MuteUser(ctx context.Context, streamID uuid.UUID, userName string) error {
	return s.chatRepo.MuteUser(ctx, streamID, userName)
}

// DeleteChatMessage deletes a specific chat message.
func (s *StreamService) DeleteChatMessage(ctx context.Context, messageID uuid.UUID) error {
	return s.chatRepo.DeleteMessage(ctx, messageID)
}

// VerifyStreamPin checks if the provided PIN matches the stream's PIN.
func (s *StreamService) VerifyStreamPin(ctx context.Context, streamID uuid.UUID, pin string) (bool, error) {
	stream, err := s.streamRepo.GetByID(ctx, streamID)
	if err != nil {
		return false, err
	}
	if stream.PinCode == nil || *stream.PinCode == "" {
		return true, nil // No PIN required
	}
	return *stream.PinCode == pin, nil
}

// envFirst returns the first non-empty value from the given env var names.
func envFirst(names ...string) string {
	for _, name := range names {
		if v := os.Getenv(name); v != "" {
			return v
		}
	}
	return ""
}

// cfLiveInputRequest is the request body for Cloudflare Stream Live Input API.
type cfLiveInputRequest struct {
	Meta      map[string]string `json:"meta"`
	Recording cfRecordingConfig `json:"recording"`
}

type cfRecordingConfig struct {
	Mode string `json:"mode"`
}

// cfLiveInputResponse is the response from Cloudflare Stream Live Input API.
type cfLiveInputResponse struct {
	Success bool `json:"success"`
	Result  struct {
		UID  string `json:"uid"`
		RTMPS struct {
			URL       string `json:"url"`
			StreamKey string `json:"streamKey"`
		} `json:"rtmps"`
		WebRTC struct {
			URL string `json:"url"`
		} `json:"webRTC"`
	} `json:"result"`
	Errors []struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
}

// provisionCloudflareStream creates a live input on Cloudflare Stream.
// Calls POST /client/v4/accounts/{account_id}/stream/live_inputs
// Returns: cfUID, rtmpsURL, rtmpsKey, playbackURL.
func provisionCloudflareStream(ctx context.Context, apiToken, accountID, title string) (string, string, string, string, error) {
	reqBody := cfLiveInputRequest{
		Meta:      map[string]string{"name": title},
		Recording: cfRecordingConfig{Mode: "automatic"},
	}
	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", "", "", "", fmt.Errorf("marshal request: %w", err)
	}

	url := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/stream/live_inputs", accountID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", "", "", "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", "", "", fmt.Errorf("CF Stream API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", "", "", fmt.Errorf("read CF response: %w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", "", "", "", fmt.Errorf("CF Stream API returned %d: %s", resp.StatusCode, string(respBody))
	}

	var cfResp cfLiveInputResponse
	if err := json.Unmarshal(respBody, &cfResp); err != nil {
		return "", "", "", "", fmt.Errorf("parse CF response: %w", err)
	}
	if !cfResp.Success {
		errMsg := "unknown error"
		if len(cfResp.Errors) > 0 {
			errMsg = cfResp.Errors[0].Message
		}
		return "", "", "", "", fmt.Errorf("CF Stream API error: %s", errMsg)
	}

	// Build playback URL from configured subdomain or CF default
	subdomain := envFirst("CLOUDFLARE_SUB_DOMAIN")
	if subdomain == "" {
		subdomain = fmt.Sprintf("customer-%s.cloudflarestream.com", accountID)
	}
	playbackURL := fmt.Sprintf("https://%s/%s/iframe", subdomain, cfResp.Result.UID)

	log.Printf("Cloudflare Stream: provisioned live input %s for %q", cfResp.Result.UID, title)

	return cfResp.Result.UID,
		cfResp.Result.RTMPS.URL,
		cfResp.Result.RTMPS.StreamKey,
		playbackURL,
		nil
}
