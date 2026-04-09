package service

import (
	"context"
	"errors"
	"regexp"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

var (
	ErrDealerAlreadyExists = errors.New("dealer already registered for this user")
	ErrDealerNotFound      = errors.New("dealer not found")
	ErrAgreementRequired   = errors.New("agreement acceptance is required")
	ErrInvalidPAN          = errors.New("invalid PAN number format")
	ErrInvalidGSTIN        = errors.New("invalid GSTIN format")
)

var (
	panRegex   = regexp.MustCompile(`^[A-Z]{5}[0-9]{4}[A-Z]$`)
	gstinRegex = regexp.MustCompile(`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`)
)

type CreateDealerRequest struct {
	BusinessName      string  `json:"business_name"`
	StateID           int     `json:"state_id"`
	TerritoryType     string  `json:"territory_type"`
	PANNumber         string  `json:"pan_number"`
	GSTIN             string  `json:"gstin"`
	BankAccount       *string `json:"bank_account"` // JSON string
	AgreementAccepted bool    `json:"agreement_accepted"`
}

type DealerService struct {
	repo *repository.DealerRepo
}

func NewDealerService(repo *repository.DealerRepo) *DealerService {
	return &DealerService{repo: repo}
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
	if err := s.repo.SetReferralCode(ctx, dealerID, code); err != nil {
		return nil, err
	}

	dealer.Status = "approved"
	dealer.ReferralCode = &code
	dealer.CommissionRatePct = &commissionRate
	return &dealer, nil
}

func (s *DealerService) RejectDealer(ctx context.Context, dealerID, adminID uuid.UUID, reason string) error {
	return s.repo.UpdateStatus(ctx, dealerID, "rejected", &adminID, &reason)
}

func (s *DealerService) SuspendDealer(ctx context.Context, dealerID, adminID uuid.UUID, reason string) error {
	return s.repo.UpdateStatus(ctx, dealerID, "suspended", &adminID, &reason)
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

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
