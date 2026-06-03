package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// MarketplaceService wraps the M5 marketplace repositories with validation
// and state-transition enforcement. It mirrors the pattern used by M4/M6/M7
// services and closes the gap documented in the M3-M10 audit (M5 had no
// service layer before this file).
//
// Scope: freelancer listings, freelancer reviews, hire requests, gear
// bookings conflict checks. Messaging / moderation flows remain in their
// respective handlers for now.
type MarketplaceService struct {
	freelancerRepo *repository.FreelancerRepo
	gearRepo       *repository.GearRepo
	messagingRepo  *repository.MessagingRepo
	moderationRepo *repository.ModerationRepo
}

// NewMarketplaceService constructs a MarketplaceService. Any of the repo
// pointers may be nil if that capability is not needed by the caller; the
// methods will return a clear error when a missing dependency is invoked.
func NewMarketplaceService(
	freelancerRepo *repository.FreelancerRepo,
	gearRepo *repository.GearRepo,
	messagingRepo *repository.MessagingRepo,
	moderationRepo *repository.ModerationRepo,
) *MarketplaceService {
	return &MarketplaceService{
		freelancerRepo: freelancerRepo,
		gearRepo:       gearRepo,
		messagingRepo:  messagingRepo,
		moderationRepo: moderationRepo,
	}
}

// ──────────────────────── Sentinel Errors ────────────────────────

var (
	ErrMarketplaceRepoNotWired    = errors.New("marketplace repository not wired")
	ErrHireRequestInvalidInput    = errors.New("invalid hire request input")
	ErrHireRequestNotFound        = errors.New("hire request not found")
	ErrHireStatusTransitionDenied = errors.New("hire request status transition not allowed")
	ErrReviewInvalidRating        = errors.New("review rating must be between 1 and 5")
	ErrReviewInvalidInput         = errors.New("invalid review input")
	ErrBookingDateConflict        = errors.New("booking date range conflicts with an existing booking")
	ErrBookingInvalidRange        = errors.New("booking end date must be on or after start date")
)

// ──────────────────────── Hire Requests ────────────────────────

// HireRequestInput is the validated payload for creating a hire request.
type HireRequestInput struct {
	ListingID         uuid.UUID
	RequesterID       uuid.UUID
	FreelancerID      uuid.UUID
	EventDetails      *string
	EventDate         *time.Time
	CompensationPaisa *int64
	Requirements      *string
	Message           *string
}

// SubmitHireRequest validates the input and persists a new hire request in
// "sent" state. The freelancer user receives it via ListHireRequestsByFreelancer.
func (s *MarketplaceService) SubmitHireRequest(ctx context.Context, in HireRequestInput) (*repository.HireRequest, error) {
	if s.freelancerRepo == nil {
		return nil, ErrMarketplaceRepoNotWired
	}
	if in.ListingID == uuid.Nil || in.RequesterID == uuid.Nil {
		return nil, fmt.Errorf("%w: listing_id and requester_id are required", ErrHireRequestInvalidInput)
	}
	if in.RequesterID == in.FreelancerID {
		return nil, fmt.Errorf("%w: requester cannot hire themselves", ErrHireRequestInvalidInput)
	}
	// Resolve freelancer user from the listing if caller did not supply it.
	freelancerID := in.FreelancerID
	if freelancerID == uuid.Nil {
		listing, err := s.freelancerRepo.GetByID(ctx, in.ListingID)
		if err != nil {
			return nil, fmt.Errorf("%w: listing lookup failed: %v", ErrHireRequestInvalidInput, err)
		}
		freelancerID = listing.UserID
	}
	if in.CompensationPaisa != nil && *in.CompensationPaisa < 0 {
		return nil, fmt.Errorf("%w: compensation must be non-negative", ErrHireRequestInvalidInput)
	}

	hr := &repository.HireRequest{
		ListingID:         in.ListingID,
		RequesterID:       in.RequesterID,
		FreelancerID:      freelancerID,
		EventDetails:      in.EventDetails,
		EventDate:         in.EventDate,
		CompensationPaisa: in.CompensationPaisa,
		Requirements:      in.Requirements,
		Message:           in.Message,
		Status:            "sent",
	}
	if err := s.freelancerRepo.CreateHireRequest(ctx, hr); err != nil {
		return nil, err
	}
	return hr, nil
}

// hireStatusTransitions enforces E15-S3's booking state machine.
// Aligns with migration 000014 CHECK constraint.
var hireStatusTransitions = map[string]map[string]bool{
	"sent":      {"accepted": true, "declined": true, "cancelled": true},
	"accepted":  {"confirmed": true, "cancelled": true, "declined": true},
	"confirmed": {"completed": true, "cancelled": true},
	// Terminal states
	"declined":  {},
	"cancelled": {},
	"completed": {},
}

// IsValidHireStatusTransition reports whether moving `from` → `to` is allowed
// under the hire-request state machine. Exposed for direct handler testing.
func IsValidHireStatusTransition(from, to string) bool {
	allowed, ok := hireStatusTransitions[from]
	if !ok {
		return false
	}
	return allowed[to]
}

// UpdateHireStatus transitions a hire request to the requested status after
// validating the transition against the state machine. Callers must have
// already verified the caller is the freelancer or requester for the record.
func (s *MarketplaceService) UpdateHireStatus(ctx context.Context, hireID uuid.UUID, newStatus string) (*repository.HireRequest, error) {
	if s.freelancerRepo == nil {
		return nil, ErrMarketplaceRepoNotWired
	}
	if hireID == uuid.Nil {
		return nil, fmt.Errorf("%w: hire id required", ErrHireRequestInvalidInput)
	}
	current, err := s.freelancerRepo.GetHireRequest(ctx, hireID)
	if err != nil {
		return nil, ErrHireRequestNotFound
	}
	if !IsValidHireStatusTransition(current.Status, newStatus) {
		return nil, fmt.Errorf("%w: %s → %s", ErrHireStatusTransitionDenied, current.Status, newStatus)
	}
	if err := s.freelancerRepo.UpdateHireStatus(ctx, hireID, newStatus); err != nil {
		return nil, err
	}
	current.Status = newStatus
	return &current, nil
}

// ListHireRequestsByFreelancer returns all hire requests received by a
// freelancer user (mirrors the repo method, added here so handlers can
// resolve all M5 operations through a single service dependency).
func (s *MarketplaceService) ListHireRequestsByFreelancer(ctx context.Context, freelancerID uuid.UUID) ([]repository.HireRequest, error) {
	if s.freelancerRepo == nil {
		return nil, ErrMarketplaceRepoNotWired
	}
	if freelancerID == uuid.Nil {
		return nil, fmt.Errorf("%w: freelancer id required", ErrHireRequestInvalidInput)
	}
	return s.freelancerRepo.ListHireRequestsByFreelancer(ctx, freelancerID)
}

// ListHireRequestsByRequester returns all hire requests sent by a user.
func (s *MarketplaceService) ListHireRequestsByRequester(ctx context.Context, requesterID uuid.UUID) ([]repository.HireRequest, error) {
	if s.freelancerRepo == nil {
		return nil, ErrMarketplaceRepoNotWired
	}
	if requesterID == uuid.Nil {
		return nil, fmt.Errorf("%w: requester id required", ErrHireRequestInvalidInput)
	}
	return s.freelancerRepo.ListHireRequestsByRequester(ctx, requesterID)
}

// ──────────────────────── Freelancer Reviews ────────────────────────

// ReviewInput is the validated payload for creating a freelancer review.
type ReviewInput struct {
	ListingID  uuid.UUID
	ReviewerID uuid.UUID
	BookingID  *uuid.UUID
	Rating     int
	ReviewText *string
}

// CreateFreelancerReview validates the rating (1-5) and persists the review.
// This is the missing counterpart to FreelancerRepo.ListReviews noted in the
// M5 gap audit.
func (s *MarketplaceService) CreateFreelancerReview(ctx context.Context, in ReviewInput) (*repository.FreelancerReview, error) {
	if s.freelancerRepo == nil {
		return nil, ErrMarketplaceRepoNotWired
	}
	if in.ListingID == uuid.Nil || in.ReviewerID == uuid.Nil {
		return nil, fmt.Errorf("%w: listing_id and reviewer_id are required", ErrReviewInvalidInput)
	}
	if in.Rating < 1 || in.Rating > 5 {
		return nil, ErrReviewInvalidRating
	}
	// Self-review prevention: the listing owner may not review themselves.
	listing, err := s.freelancerRepo.GetByID(ctx, in.ListingID)
	if err != nil {
		return nil, fmt.Errorf("%w: listing lookup failed: %v", ErrReviewInvalidInput, err)
	}
	if listing.UserID == in.ReviewerID {
		return nil, fmt.Errorf("%w: reviewer cannot review their own listing", ErrReviewInvalidInput)
	}

	rev := &repository.FreelancerReview{
		ListingID:  in.ListingID,
		ReviewerID: in.ReviewerID,
		BookingID:  in.BookingID,
		Rating:     in.Rating,
		ReviewText: in.ReviewText,
	}
	if err := s.freelancerRepo.CreateReview(ctx, rev); err != nil {
		return nil, err
	}
	return rev, nil
}

// ──────────────────────── Gear Booking Conflict Check ────────────────────────

// CheckBookingConflict reports whether a prospective gear booking for the
// given date range overlaps with an existing pending/approved/active booking
// on the same gear listing. Returns ErrBookingInvalidRange if end < start,
// ErrBookingDateConflict on overlap, or nil if the slot is free.
//
// This wires the missing "date-conflict detection before CreateBooking"
// called out in the M5 gap audit (item 7 of "Key missing chunks").
func (s *MarketplaceService) CheckBookingConflict(ctx context.Context, gearID uuid.UUID, start, end time.Time) error {
	if s.gearRepo == nil {
		return ErrMarketplaceRepoNotWired
	}
	if end.Before(start) {
		return ErrBookingInvalidRange
	}
	conflict, err := s.gearRepo.BookingConflictCheck(ctx, gearID, start, end)
	if err != nil {
		return err
	}
	if conflict {
		return ErrBookingDateConflict
	}
	return nil
}
