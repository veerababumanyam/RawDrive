package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"regexp"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrDealerAlreadyExists  = errors.New("dealer already registered for this user")
	ErrDealerNotFound       = errors.New("dealer not found")
	ErrDealerAlreadyDeleted = errors.New("dealer is already deleted")
	ErrAgreementRequired    = errors.New("agreement acceptance is required")
	ErrInvalidPAN           = errors.New("invalid PAN number format")
	ErrInvalidGSTIN         = errors.New("invalid GSTIN format")
)

var (
	panRegex   = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)
	gstinRegex = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)
)

type CreateDealerRequest struct {
	BusinessName      string     `json:"business_name"`
	StateID           int        `json:"state_id"`
	TerritoryType     string     `json:"territory_type"`
	PANNumber         string     `json:"pan_number"`
	GSTIN             string     `json:"gstin"`
	BankAccount       *string    `json:"bank_account"` // JSON string
	AgreementAccepted bool       `json:"agreement_accepted"`
	TargetUserID      *uuid.UUID `json:"user_id,omitempty"` // admin-only: link dealer to a specific user
	// DealerEmail is the email address for the dealer's login account.
	// When provided, AdminCreateDealer creates a new user account with
	// platform_role=dealer and links the dealer record to that user.
	// A password is generated and emailed to the dealer upon approval.
	DealerEmail string `json:"dealer_email,omitempty"`
}

// DealerCredentialsSender delivers login credentials to a newly approved
// dealer. Satisfied by *email.NotificationSender.
type DealerCredentialsSender interface {
	Send(ctx context.Context, to, subject, body, actionURL string) error
}

type DealerService struct {
	repo         *repository.DealerRepo
	adminUserRepo *repository.AdminUserRepo  // for creating dealer user accounts
	credsSender  DealerCredentialsSender     // nil = skip email (dev/test)
	frontendURL  string                      // for login link in credentials email
}

func NewDealerService(repo *repository.DealerRepo) *DealerService {
	return &DealerService{repo: repo}
}

// WithAdminUserRepo wires the admin user repo so AdminCreateDealer can
// create a user account when a dealer_email is provided.
func (s *DealerService) WithAdminUserRepo(r *repository.AdminUserRepo) *DealerService {
	s.adminUserRepo = r
	return s
}

// WithCredentialsSender wires an email sender for dealer approval notifications.
func (s *DealerService) WithCredentialsSender(sender DealerCredentialsSender, frontendURL string) *DealerService {
	s.credsSender = sender
	s.frontendURL = frontendURL
	return s
}

// generateDealerPassword returns a cryptographically random 16-char password
// that meets the complexity rules (upper + lower + digit + special).
func generateDealerPassword() (string, error) {
	const (
		upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
		lower   = "abcdefghjkmnpqrstuvwxyz"
		digits  = "23456789"
		special = "!@#$%^&*"
		all     = upper + lower + digits + special
	)
	pw := make([]byte, 0, 16)
	// Guarantee at least one from each class.
	for _, charset := range []string{upper, lower, digits, special} {
		b := make([]byte, 1)
		if _, err := rand.Read(b); err != nil {
			return "", err
		}
		pw = append(pw, charset[int(b[0])%len(charset)])
	}
	// Fill remaining 12 positions from the full set.
	rest := make([]byte, 12)
	if _, err := rand.Read(rest); err != nil {
		return "", err
	}
	for _, b := range rest {
		pw = append(pw, all[int(b)%len(all)])
	}
	// Fisher-Yates shuffle to avoid predictable positions.
	shuffled := make([]byte, len(pw))
	copy(shuffled, pw)
	shuf := make([]byte, len(pw))
	if _, err := rand.Read(shuf); err != nil {
		return "", err
	}
	for i := len(shuffled) - 1; i > 0; i-- {
		j := int(shuf[i]) % (i + 1)
		shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
	}
	return string(shuffled), nil
}

func (s *DealerService) RegisterDealer(ctx context.Context, userID uuid.UUID, req CreateDealerRequest) (*repository.Dealer, error) {
	if !req.AgreementAccepted {
		return nil, ErrAgreementRequired
	}
	if !panRegex.MatchString(req.PANNumber) {
		return nil, ErrInvalidPAN
	}
	if req.GSTIN != "" && !gstinRegex.MatchString(req.GSTIN) {
		return nil, ErrInvalidGSTIN
	}

	// Check for existing dealer
	_, err := s.repo.GetByUserID(ctx, userID)
	if err == nil {
		return nil, ErrDealerAlreadyExists
	}

	d := &repository.Dealer{
		UserID:        userID,
		StateID:       req.StateID,
		BusinessName:  req.BusinessName,
		TerritoryType: req.TerritoryType,
		PANNumber:     req.PANNumber,
		GSTIN:         nilIfEmpty(req.GSTIN),
		BankAccount:   req.BankAccount,
		Status:        "pending",
	}
	if d.TerritoryType == "" {
		d.TerritoryType = "primary"
	}

	if err := s.repo.Create(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

// AdminCreateDealer creates a dealer from the admin panel.
//
// When DealerEmail is provided, a new user account (platform_role=dealer) is
// created for that email address and the dealer record is linked to it.
// A random password is generated, stored hashed, and the account is left
// with email_verified=false + must_change_password=true until the admin
// approves the dealer — approval triggers the credentials email.
//
// Unlike RegisterDealer (dealer self-registration), admins are creating records
// on behalf of different businesses, so the one-per-user uniqueness check
// is only applied when TargetUserID is explicitly set in the request.
func (s *DealerService) AdminCreateDealer(ctx context.Context, adminID uuid.UUID, req CreateDealerRequest) (*repository.Dealer, error) {
	if !req.AgreementAccepted {
		return nil, ErrAgreementRequired
	}
	if !panRegex.MatchString(req.PANNumber) {
		return nil, ErrInvalidPAN
	}
	if req.GSTIN != "" && !gstinRegex.MatchString(req.GSTIN) {
		return nil, ErrInvalidGSTIN
	}

	var userID uuid.UUID

	switch {
	case req.DealerEmail != "":
		// Create a new user account for the dealer.
		if s.adminUserRepo == nil {
			return nil, fmt.Errorf("admin user repo not configured")
		}
		plainPw, err := generateDealerPassword()
		if err != nil {
			return nil, fmt.Errorf("generating dealer password: %w", err)
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(plainPw), 12)
		if err != nil {
			return nil, fmt.Errorf("hashing dealer password: %w", err)
		}
		h := string(hashed)
		detail, err := s.adminUserRepo.CreateUser(ctx, repository.AdminUserCreate{
			Email:              req.DealerEmail,
			FullName:           req.BusinessName,
			Role:               "dealer",
			PasswordHash:       &h,
			EmailVerified:      false,
			MustChangePassword: true,
		})
		if err != nil {
			return nil, err
		}
		userID = detail.ID

	case req.TargetUserID != nil:
		userID = *req.TargetUserID
		// Uniqueness check only when targeting a specific existing user.
		if _, err := s.repo.GetByUserID(ctx, userID); err == nil {
			return nil, ErrDealerAlreadyExists
		}

	default:
		userID = adminID
	}

	d := &repository.Dealer{
		UserID:        userID,
		StateID:       req.StateID,
		BusinessName:  req.BusinessName,
		TerritoryType: req.TerritoryType,
		PANNumber:     req.PANNumber,
		GSTIN:         nilIfEmpty(req.GSTIN),
		BankAccount:   req.BankAccount,
		Status:        "pending",
	}
	if d.TerritoryType == "" {
		d.TerritoryType = "primary"
	}

	if err := s.repo.Create(ctx, d); err != nil {
		return nil, err
	}
	return d, nil
}

func (s *DealerService) ApproveDealer(ctx context.Context, dealerID, adminID uuid.UUID, commissionRate float64) (*repository.Dealer, error) {
	dealer, err := s.repo.GetByID(ctx, dealerID)
	if err != nil {
		return nil, ErrDealerNotFound
	}
	if dealer.Status == "approved" {
		return nil, errors.New("dealer already approved")
	}

	// Generate referral code
	code, err := s.repo.GenerateReferralCode(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.repo.UpdateStatus(ctx, dealerID, "approved", &adminID, nil); err != nil {
		return nil, err
	}
	if err := s.repo.SetCommissionRate(ctx, dealerID, commissionRate); err != nil {
		return nil, err
	}
	if err := s.repo.SetReferralCode(ctx, dealerID, code); err != nil {
		return nil, err
	}

	// Send credentials email if the dealer has an admin-created account
	// (identified by must_change_password=true on their user row).
	if s.adminUserRepo != nil && s.credsSender != nil {
		s.sendDealerCredentialsEmail(ctx, dealer.UserID, dealer.BusinessName)
	}

	dealer.Status = "approved"
	dealer.ReferralCode = &code
	dealer.CommissionRatePct = &commissionRate
	return &dealer, nil
}

// sendDealerCredentialsEmail generates a fresh password for the dealer,
// stores it hashed, and emails the credentials. Non-fatal: on any error
// the approval has already committed, so failures are logged and skipped.
func (s *DealerService) sendDealerCredentialsEmail(ctx context.Context, dealerUserID uuid.UUID, businessName string) {
	dealerEmail, err := s.adminUserRepo.GetEmailByID(ctx, dealerUserID)
	if err != nil {
		log.Printf("[dealer-creds] GetEmailByID failed for user %s: %v", dealerUserID, err)
		return
	}
	if dealerEmail == "" {
		log.Printf("[dealer-creds] skipping credentials email: user %s has no email address", dealerUserID)
		return
	}

	plainPw, err := generateDealerPassword()
	if err != nil {
		log.Printf("[dealer-creds] password generation failed: %v", err)
		return
	}
	hashed, err := bcrypt.GenerateFromPassword([]byte(plainPw), 12)
	if err != nil {
		log.Printf("[dealer-creds] bcrypt failed: %v", err)
		return
	}
	if err := s.adminUserRepo.SetDealerCredentials(ctx, dealerUserID, string(hashed)); err != nil {
		log.Printf("[dealer-creds] SetDealerCredentials failed for user %s: %v", dealerUserID, err)
		return
	}

	base := s.frontendURL
	if base == "" {
		base = "https://app.rawdrive.in"
	}
	body := fmt.Sprintf(
		"Your RawDrive dealer account for %q has been approved.\n\nLogin: %s\nPassword: %s\n\nPlease change your password after your first login.",
		businessName, dealerEmail, plainPw,
	)
	if err := s.credsSender.Send(ctx, dealerEmail,
		"Your RawDrive Dealer Account is Approved",
		body,
		base+"/login",
	); err != nil {
		log.Printf("[dealer-creds] email send failed to %s: %v", dealerEmail, err)
		return
	}
	log.Printf("[dealer-creds] credentials email sent to %s for dealer %q", dealerEmail, businessName)
}

func (s *DealerService) RejectDealer(ctx context.Context, dealerID, adminID uuid.UUID, reason string) error {
	return s.repo.UpdateStatus(ctx, dealerID, "rejected", &adminID, &reason)
}

func (s *DealerService) SuspendDealer(ctx context.Context, dealerID, adminID uuid.UUID, reason string) error {
	return s.repo.UpdateStatus(ctx, dealerID, "suspended", &adminID, &reason)
}

func (s *DealerService) EnableDealer(ctx context.Context, dealerID, adminID uuid.UUID) error {
	dealer, err := s.repo.GetByID(ctx, dealerID)
	if err != nil {
		return ErrDealerNotFound
	}
	if dealer.Status != "suspended" {
		return errors.New("dealer is not suspended")
	}
	return s.repo.UpdateStatus(ctx, dealerID, "approved", &adminID, nil)
}

func (s *DealerService) GetDealerDashboard(ctx context.Context, userID uuid.UUID) (*repository.Dealer, error) {
	dealer, err := s.repo.GetByUserID(ctx, userID)
	if err != nil {
		return nil, ErrDealerNotFound
	}
	return &dealer, nil
}

func (s *DealerService) ListDealers(ctx context.Context, filter repository.DealerFilter) ([]repository.Dealer, error) {
	return s.repo.List(ctx, filter)
}

// SoftDeleteDealer soft-deletes a dealer (M39 E7-S2).
// Returns (service.ErrDealerNotFound) when the dealer does not exist.
// Returns (ErrDealerAlreadyDeleted) when the dealer is already soft-deleted.
func (s *DealerService) SoftDeleteDealer(ctx context.Context, dealerID uuid.UUID) error {
	existing, err := s.repo.GetByID(ctx, dealerID)
	if err != nil {
		return ErrDealerNotFound
	}
	if existing.DeletedAt != nil {
		return ErrDealerAlreadyDeleted
	}
	updated, err := s.repo.SoftDelete(ctx, dealerID)
	if err != nil {
		return err
	}
	if !updated {
		// Race: row turned into deleted state between our read and write.
		return ErrDealerAlreadyDeleted
	}
	return nil
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
