package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/rawdrive/backend/internal/email"
)

const defaultDealershipNotifyEmail = "hello@swazconsultants.com"

var (
	rePAN   = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)
	reGSTIN = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)
)

var validDealerTerritoryTypes = map[string]bool{
	"primary": true, "secondary": true, "ambassador": true,
}

// DealerApplicationHandler handles public dealer partnership applications.
type DealerApplicationHandler struct {
	sender      *email.DealerApplicationSender
	notifyEmail string
}

// NewDealerApplicationHandler constructs the handler. sender may be nil when
// SMTP is unconfigured; the endpoint still accepts submissions but skips
// email delivery.
func NewDealerApplicationHandler(sender *email.DealerApplicationSender) *DealerApplicationHandler {
	notifyEmail := os.Getenv("DEALERSHIP_NOTIFY_EMAIL")
	if notifyEmail == "" {
		notifyEmail = defaultDealershipNotifyEmail
	}
	return &DealerApplicationHandler{sender: sender, notifyEmail: notifyEmail}
}

type dealerApplicationRequest struct {
	DealerEmail     string `json:"dealer_email"`
	BusinessName    string `json:"business_name"`
	State           string `json:"state"`
	TerritoryType   string `json:"territory_type"`
	PANNumber       string `json:"pan_number"`
	GSTIN           string `json:"gstin"`
	BusinessProfile string `json:"business_profile"`
}

// Submit handles POST /api/v1/public/dealer-applications (no auth required).
func (h *DealerApplicationHandler) Submit(w http.ResponseWriter, r *http.Request) {
	var req dealerApplicationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	req.DealerEmail = strings.TrimSpace(req.DealerEmail)
	req.BusinessName = strings.TrimSpace(req.BusinessName)
	req.State = strings.TrimSpace(req.State)
	req.TerritoryType = strings.TrimSpace(req.TerritoryType)
	req.PANNumber = strings.TrimSpace(strings.ToUpper(req.PANNumber))
	req.GSTIN = strings.TrimSpace(strings.ToUpper(req.GSTIN))
	req.BusinessProfile = strings.TrimSpace(req.BusinessProfile)

	if req.DealerEmail == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dealer_email is required"})
		return
	}
	if req.BusinessName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "business_name is required"})
		return
	}
	if req.State == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "state is required"})
		return
	}
	if !validDealerTerritoryTypes[req.TerritoryType] {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "territory_type must be primary, secondary, or ambassador"})
		return
	}
	if req.PANNumber != "" && !rePAN.MatchString(req.PANNumber) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "PAN number must be 10 characters (e.g. ABCDE1234F)"})
		return
	}
	if req.GSTIN != "" && !reGSTIN.MatchString(req.GSTIN) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "GSTIN must be 15 characters in standard format"})
		return
	}

	data := email.DealerApplicationData{
		DealerEmail:     req.DealerEmail,
		BusinessName:    req.BusinessName,
		State:           req.State,
		TerritoryType:   req.TerritoryType,
		PANNumber:       req.PANNumber,
		GSTIN:           req.GSTIN,
		BusinessProfile: req.BusinessProfile,
		SubmittedAt:     time.Now(),
	}

	if h.sender != nil {
		if err := h.sender.SendNotification(r.Context(), h.notifyEmail, data); err != nil {
			log.Printf("dealer application: notification email to %s failed: %v", h.notifyEmail, err)
		}
		if err := h.sender.SendAcknowledgment(r.Context(), data); err != nil {
			log.Printf("dealer application: acknowledgment email to %s failed: %v", req.DealerEmail, err)
		}
	} else {
		log.Printf("dealer application: SMTP not configured — skipping emails for %s", req.DealerEmail)
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "submitted"})
}
