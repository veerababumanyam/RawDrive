package onboarding

import (
	"context"
	"errors"
	"strconv"
)

var (
	ErrInvalidState = errors.New("invalid state")
	ErrInvalidGSTIN = errors.New("invalid GSTIN")
	ErrStepRequired = errors.New("previous step required")
)

type Step string

const (
	StepStateSelection Step = "state_selection"
	StepProfile        Step = "profile"
	StepComplete       Step = "complete"
)

// OnboardingStatus is the JSON wire shape returned by GET /onboarding/status
// and consumed by the frontend. StateID is serialized as a string (the
// canonical integer id as text) so the frontend never has to care about
// nullability on the wire — an empty string means "not selected".
type OnboardingStatus struct {
	UserID       string `json:"user_id"`
	CurrentStep  Step   `json:"current_step"`
	StateID      string `json:"state_id,omitempty"`
	BusinessName string `json:"business_name,omitempty"`
	GSTIN        string `json:"gstin,omitempty"`
}

// StateSelectionInput is the service-layer input for selecting a state.
// StateID here is a raw user-supplied string — numeric id, 2-letter
// code, "IN-XX" code, or full state name. The service delegates
// canonicalization to Repository.ResolveStateID.
type StateSelectionInput struct {
	StateID string `json:"state_id"`
}

type ProfileInput struct {
	BusinessName string `json:"business_name"`
	GSTIN        string `json:"gstin"`
	DisplayName  string `json:"display_name"`
}

// WorkspaceCreator is the port used to create the user's workspace at
// the end of onboarding. Kept as an interface so tests can substitute
// an in-memory stub. Production implementation lives in main.go as
// onboardingWorkspaceCreator (adapting workspace.Service).
type WorkspaceCreator interface {
	CreateWorkspace(ctx context.Context, userID, stateID, businessName string) (string, error)
}

type EventPublisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

type Service interface {
	SelectState(ctx context.Context, userID string, input StateSelectionInput) error
	SetProfile(ctx context.Context, userID string, input ProfileInput) error
	GetStatus(ctx context.Context, userID string) (*OnboardingStatus, error)
}

// service is the persistent implementation. It is stateless in Go
// memory — all progress lives in the Repository. This is the fix for
// the pre-existing "backend restart wipes onboarding progress" bug.
type service struct {
	repo Repository
	wsc  WorkspaceCreator
	pub  EventPublisher
}

// NewService constructs the Service. repo is required; wsc and pub may
// be nil (workspace creation and event publishing are best-effort).
func NewService(repo Repository, wsc WorkspaceCreator, pub EventPublisher) Service {
	return &service{
		repo: repo,
		wsc:  wsc,
		pub:  pub,
	}
}

// SelectState canonicalizes the user-supplied state identifier (any of
// numeric id, 2-letter code, "IN-XX", state name), then upserts the
// onboarding_statuses row with the new state_id and advances the step
// to "profile".
func (s *service) SelectState(ctx context.Context, userID string, input StateSelectionInput) error {
	id, err := s.repo.ResolveStateID(ctx, input.StateID)
	if err != nil {
		return err // ErrInvalidState or a wrapped DB error
	}

	return s.repo.Upsert(ctx, &StatusRecord{
		UserID:      userID,
		CurrentStep: StepProfile,
		StateID:     &id,
	})
}

// SetProfile writes the business profile, advances the step to
// "complete", and (best-effort) creates the workspace + publishes the
// completion event. Workspace creation and event publishing errors
// are intentionally logged-and-ignored by the caller rather than
// reverting onboarding — a failed downstream should not leave the
// user stuck at the profile step with nothing to click.
func (s *service) SetProfile(ctx context.Context, userID string, input ProfileInput) error {
	existing, err := s.repo.Get(ctx, userID)
	if err != nil {
		return err
	}
	if existing == nil || existing.CurrentStep == StepStateSelection {
		return ErrStepRequired
	}

	if input.GSTIN != "" && !isValidGSTIN(input.GSTIN) {
		return ErrInvalidGSTIN
	}

	if err := s.repo.Upsert(ctx, &StatusRecord{
		UserID:       userID,
		CurrentStep:  StepComplete,
		BusinessName: input.BusinessName,
		DisplayName:  input.DisplayName,
		GSTIN:        input.GSTIN,
	}); err != nil {
		return err
	}

	// Best-effort workspace creation. The workspace-creator adapter in
	// main.go takes a state identifier as a string; we pass the
	// canonical numeric id so it does no further resolution work.
	if s.wsc != nil && existing.StateID != nil {
		_, _ = s.wsc.CreateWorkspace(ctx, userID, strconv.Itoa(*existing.StateID), input.BusinessName)
	}

	if s.pub != nil {
		_ = s.pub.Publish(ctx, "onboarding.complete", []byte(`{"user_id":"`+userID+`"}`))
	}

	return nil
}

// GetStatus returns the wire-shape status for a user. A user with no
// row yet gets the defaulted "state_selection" step with no state id,
// which is what the frontend expects on first visit.
func (s *service) GetStatus(ctx context.Context, userID string) (*OnboardingStatus, error) {
	rec, err := s.repo.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	if rec == nil {
		return &OnboardingStatus{
			UserID:      userID,
			CurrentStep: StepStateSelection,
		}, nil
	}

	out := &OnboardingStatus{
		UserID:       userID,
		CurrentStep:  rec.CurrentStep,
		BusinessName: rec.BusinessName,
		GSTIN:        rec.GSTIN,
	}
	if rec.StateID != nil {
		out.StateID = strconv.Itoa(*rec.StateID)
	}
	return out, nil
}

// isValidGSTIN validates the basic format of an Indian GSTIN (15 characters).
func isValidGSTIN(gstin string) bool {
	if len(gstin) != 15 {
		return false
	}
	// Basic format: 2 digits (state code) + 10 char PAN + 1 entity + 1 default + 1 checksum
	for i := 0; i < 2; i++ {
		if gstin[i] < '0' || gstin[i] > '9' {
			return false
		}
	}
	return true
}
