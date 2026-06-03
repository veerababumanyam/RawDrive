package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	mailaddr "net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/passwordpolicy"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
)

// ShareLinkHandler handles share link HTTP requests.
type ShareLinkHandler struct {
	shareSvc          *service.ShareLinkService
	gallerySvc        *service.GalleryService
	galleryShareEmail *email.GalleryShareSender
	shareLogRepo      *repository.GalleryShareLogRepo
	publicBaseURL     string
}

func NewShareLinkHandler(svc *service.ShareLinkService) *ShareLinkHandler {
	return &ShareLinkHandler{shareSvc: svc}
}

func (h *ShareLinkHandler) WithGalleryShareEmail(sender *email.GalleryShareSender, gallerySvc *service.GalleryService, publicBaseURL string, logRepo *repository.GalleryShareLogRepo) *ShareLinkHandler {
	h.galleryShareEmail = sender
	h.gallerySvc = gallerySvc
	h.publicBaseURL = strings.TrimRight(publicBaseURL, "/")
	h.shareLogRepo = logRepo
	return h
}

func (h *ShareLinkHandler) Create(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		PIN             string   `json:"pin"`
		ExpiryDays      *int     `json:"expiry_days"`
		DownloadAllowed bool     `json:"download_allowed"`
		MaxAccessCount  *int     `json:"max_access_count"`
		AccessMode      string   `json:"access_mode"`
		AllowedEmails   []string `json:"allowed_emails"`
		RecipientEmails []string `json:"recipient_emails"`
		Message         string   `json:"message"`
		Channel         string   `json:"channel"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}
	pin := strings.TrimSpace(input.PIN)
	accessMode, err := service.NormalizeShareAccessMode(input.AccessMode, pin != "")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
		return
	}
	if (accessMode == service.AccessPIN || accessMode == service.AccessPassword) && pin == "" {
		http.Error(w, `{"error":"pin is required for protected share links"}`, http.StatusBadRequest)
		return
	}
	if pin != "" {
		if err := passwordpolicy.ValidateBcryptInput("pin", pin); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusBadRequest)
			return
		}
	}
	if accessMode == service.AccessEmail {
		if len(input.AllowedEmails) == 0 && len(input.RecipientEmails) > 0 {
			input.AllowedEmails = input.RecipientEmails
		}
		if len(input.AllowedEmails) == 0 {
			http.Error(w, `{"error":"at least one allowed email is required for email share links"}`, http.StatusBadRequest)
			return
		}
		if err := validateRecipientEmails(input.AllowedEmails); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
	}
	emailShareRequested := strings.EqualFold(input.Channel, "email") && len(input.RecipientEmails) > 0
	if emailShareRequested {
		if h.galleryShareEmail == nil || h.gallerySvc == nil {
			http.Error(w, `{"error":"smtp email is not configured"}`, http.StatusServiceUnavailable)
			return
		}
		if err := validateRecipientEmails(input.RecipientEmails); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
	}

	// tenant-ownership guard (integration audit 2026-05-31): enforced after cheap
	// input validation so overlong input is still rejected before any service work.
	if _, _, ok := guardGalleryWorkspace(w, r, h.gallerySvc, galleryID); !ok {
		return
	}

	createInput := service.CreateShareLinkInput{
		GalleryID:       galleryID,
		PIN:             pin,
		DownloadAllowed: input.DownloadAllowed,
		MaxAccessCount:  input.MaxAccessCount,
		Permissions: map[string]interface{}{
			"access_mode": string(accessMode),
		},
	}
	if len(input.AllowedEmails) > 0 {
		createInput.Permissions["allowed_emails"] = input.AllowedEmails
	}
	if len(input.RecipientEmails) > 0 {
		createInput.Permissions["recipient_emails"] = input.RecipientEmails
	}
	if input.Message != "" {
		createInput.Permissions["message"] = input.Message
	}
	if input.Channel != "" {
		createInput.Permissions["channel"] = input.Channel
	}
	if input.ExpiryDays != nil && *input.ExpiryDays > 0 {
		d := time.Duration(*input.ExpiryDays) * 24 * time.Hour
		createInput.ExpiresIn = &d
	}

	link, err := h.shareSvc.Create(r.Context(), createInput)
	if err != nil {
		log.Printf("gallery share link create failed gallery=%s err=%v", galleryID, err)
		http.Error(w, `{"error":"create failed"}`, http.StatusInternalServerError)
		return
	}
	if emailShareRequested {
		if err := h.sendGalleryShareEmails(r, galleryID, link, input.RecipientEmails, input.Message); err != nil {
			log.Printf("gallery share email failed gallery=%s err=%v", galleryID, err)
			if revokeErr := h.shareSvc.Revoke(r.Context(), link.ID); revokeErr != nil {
				log.Printf("gallery share revoke after email failure failed link=%s err=%v", link.ID, revokeErr)
			}
			http.Error(w, `{"error":"email send failed"}`, http.StatusBadGateway)
			return
		}
	}

	respondJSON(w, http.StatusCreated, link)
}

func validateRecipientEmails(recipients []string) error {
	for _, recipient := range recipients {
		if _, err := mailaddr.ParseAddress(strings.TrimSpace(recipient)); err != nil {
			return fmt.Errorf("invalid recipient email")
		}
	}
	return nil
}

func (h *ShareLinkHandler) sendGalleryShareEmails(r *http.Request, galleryID uuid.UUID, link *repository.ShareLink, recipients []string, message string) error {
	gallery, err := h.gallerySvc.GetByID(r.Context(), galleryID)
	if err != nil {
		return err
	}
	if gallery == nil {
		return fmt.Errorf("gallery not found")
	}

	shareURL := h.galleryShareURL(r, gallery.Slug, link.Token)
	message = strings.ReplaceAll(message, "{link}", shareURL)
	senderName, sentBy := shareSenderFromClaims(r)
	for _, recipient := range recipients {
		recipient = strings.TrimSpace(recipient)
		err := h.galleryShareEmail.Send(r.Context(), recipient, email.GalleryShareData{
			SenderName:   senderName,
			GalleryTitle: gallery.Title,
			Message:      message,
			GalleryLink:  shareURL,
		})
		if err != nil {
			return err
		}
		if h.shareLogRepo != nil && sentBy != uuid.Nil {
			if err := h.shareLogRepo.Create(r.Context(), repository.GalleryShareLog{
				ID:           uuid.New(),
				GalleryID:    galleryID,
				SentToEmail:  recipient,
				SentByUserID: sentBy,
				Message:      message,
				SentAt:       time.Now(),
			}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *ShareLinkHandler) galleryShareURL(r *http.Request, slug, token string) string {
	base := h.publicBaseURL
	if base == "" {
		scheme := r.Header.Get("X-Forwarded-Proto")
		if scheme == "" {
			if r.TLS != nil {
				scheme = "https"
			} else {
				scheme = "http"
			}
		}
		host := r.Header.Get("X-Forwarded-Host")
		if host == "" {
			host = r.Host
		}
		base = scheme + "://" + host
	}
	return strings.TrimRight(base, "/") + "/g/" + url.PathEscape(slug) + "?share=" + url.QueryEscape(token)
}

func shareSenderFromClaims(r *http.Request) (string, uuid.UUID) {
	claims := middleware.JWTClaimsFromContext(r.Context())
	if claims == nil {
		return "RawDrive", uuid.Nil
	}
	senderName := "RawDrive"
	if emailAddr, _ := claims["email"].(string); emailAddr != "" {
		senderName = emailAddr
	}
	sub, _ := claims["sub"].(string)
	userID, err := uuid.Parse(sub)
	if err != nil {
		return senderName, uuid.Nil
	}
	return senderName, userID
}

func (h *ShareLinkHandler) ListByGallery(w http.ResponseWriter, r *http.Request) {
	galleryID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid gallery id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31)
	if _, _, ok := guardGalleryWorkspace(w, r, h.gallerySvc, galleryID); !ok {
		return
	}

	links, err := h.shareSvc.ListByGallery(r.Context(), galleryID)
	if err != nil {
		http.Error(w, `{"error":"list failed"}`, http.StatusInternalServerError)
		return
	}

	respondJSON(w, http.StatusOK, links)
}

// Verify validates a share link token and optional credential, then atomically
// increments access_count. Returns 403 with "access_limit_exceeded" when the
// link has reached its max_access_count cap (GAL-FR-112).
func (h *ShareLinkHandler) Verify(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	if token == "" {
		http.Error(w, `{"error":"missing token"}`, http.StatusBadRequest)
		return
	}

	var input struct {
		Credential string `json:"credential"`
	}
	_ = json.NewDecoder(r.Body).Decode(&input) // credential optional

	ok, err := h.shareSvc.ValidateAccess(r.Context(), token, input.Credential)
	if err != nil {
		if err.Error() == "share link access limit reached" {
			http.Error(w, `{"error":"access_limit_exceeded"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusUnauthorized)
		return
	}
	if !ok {
		http.Error(w, `{"error":"invalid_credential"}`, http.StatusUnauthorized)
		return
	}

	// Atomically commit the access (enforces max_access_count under concurrent load).
	if _, err := h.shareSvc.TrackAccess(r.Context(), token); err != nil {
		if errors.Is(err, repository.ErrAccessLimitExceeded) {
			http.Error(w, `{"error":"access_limit_exceeded"}`, http.StatusForbidden)
			return
		}
		http.Error(w, `{"error":"track failed"}`, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

func (h *ShareLinkHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	linkID, err := uuid.Parse(chi.URLParam(r, "linkId"))
	if err != nil {
		http.Error(w, `{"error":"invalid link id"}`, http.StatusBadRequest)
		return
	}

	// tenant-ownership guard (integration audit 2026-05-31): the URL carries a
	// child (link) id, not a gallery id, so guardGalleryWorkspace can't be called
	// directly. We scope the revoke to the caller's workspace via the link's
	// owning gallery atomically in the UPDATE; 0 rows affected ⇒ 404 (matching
	// the guard's cross-tenant contract so foreign-link existence is not leaked).
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}

	affected, err := h.shareSvc.RevokeInWorkspace(r.Context(), linkID, workspaceID)
	if err != nil {
		http.Error(w, `{"error":"revoke failed"}`, http.StatusInternalServerError)
		return
	}
	if affected == 0 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
