package onboarding

import (
	"context"
	"errors"
	"sync"
)

var (
	ErrInvalidState = errors.New("invalid state")
	ErrInvalidGSTIN = errors.New("invalid GSTIN")
	ErrStepRequired = errors.New("previous step required")
)

// Valid Indian states (subset for demonstration).
var validStates = map[string]bool{
	"MH": true, "KA": true, "TN": true, "DL": true, "GJ": true,
	"RJ": true, "UP": true, "WB": true, "AP": true, "TS": true,
	"KL": true, "MP": true, "BR": true, "PB": true, "HR": true,
	"JK": true, "GA": true, "HP": true, "UK": true, "JH": true,
	"AS": true, "CT": true, "OR": true, "MN": true, "ML": true,
	"MZ": true, "NL": true, "SK": true, "TR": true, "AR": true,
}

type Step string

const (
	StepStateSelection Step = "state_selection"
	StepProfile        Step = "profile"
	StepComplete       Step = "complete"
)

type OnboardingStatus struct {
	UserID      string `json:"user_id"`
	CurrentStep Step   `json:"current_step"`
	StateID     string `json:"state_id,omitempty"`
	BusinessName string `json:"business_name,omitempty"`
	GSTIN       string `json:"gstin,omitempty"`
}

type StateSelectionInput struct {
	StateID string `json:"state_id"`
}

type ProfileInput struct {
	BusinessName string `json:"business_name"`
	GSTIN        string `json:"gstin"`
	DisplayName  string `json:"display_name"`
}

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

type service struct {
	mu       sync.Mutex
	statuses map[string]*OnboardingStatus
	wsc      WorkspaceCreator
	pub      EventPublisher
}

func NewService(wsc WorkspaceCreator, pub EventPublisher) Service {
	return &service{
		statuses: make(map[string]*OnboardingStatus),
		wsc:      wsc,
		pub:      pub,
	}
}

func (s *service) SelectState(ctx context.Context, userID string, input StateSelectionInput) error {
	if !validStates[input.StateID] {
		return ErrInvalidState
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	status, ok := s.statuses[userID]
	if !ok {
		status = &OnboardingStatus{
			UserID:      userID,
			CurrentStep: StepStateSelection,
		}
		s.statuses[userID] = status
	}

	status.StateID = input.StateID
	status.CurrentStep = StepProfile

	return nil
}

func (s *service) SetProfile(ctx context.Context, userID string, input ProfileInput) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	status, ok := s.statuses[userID]
	if !ok || status.CurrentStep == StepStateSelection {
		return ErrStepRequired
	}

	if input.GSTIN != "" && !isValidGSTIN(input.GSTIN) {
		return ErrInvalidGSTIN
	}

	status.BusinessName = input.BusinessName
	status.GSTIN = input.GSTIN
	status.CurrentStep = StepComplete

	// Create workspace automatically on completion
	if s.wsc != nil {
		_, _ = s.wsc.CreateWorkspace(ctx, userID, status.StateID, input.BusinessName)
	}

	// Publish onboarding.complete event
	if s.pub != nil {
		_ = s.pub.Publish(ctx, "onboarding.complete", []byte(`{"user_id":"`+userID+`"}`))
	}

	return nil
}

func (s *service) GetStatus(ctx context.Context, userID string) (*OnboardingStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	status, ok := s.statuses[userID]
	if !ok {
		return &OnboardingStatus{
			UserID:      userID,
			CurrentStep: StepStateSelection,
		}, nil
	}

	return status, nil
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
