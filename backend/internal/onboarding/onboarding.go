package onboarding

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strconv"
)

var (
	ErrInvalidState        = errors.New("invalid state")
	ErrInvalidGSTIN        = errors.New("invalid GSTIN")
	ErrStepRequired        = errors.New("previous step required")
	ErrWorkspaceCreateFail = errors.New("workspace creation failed")
)

// validSelfServePlans is the whitelist of plan tiers a user may select
// during self-serve onboarding.
var validSelfServePlans = map[string]bool{
	"free":         true,
	"starter":      true,
	"professional": true,
	"business":     true,
	"enterprise":   true,
}

// normalizePlanTier validates and normalises the plan tier string.
// Empty → "free"; unknown → "free".
func normalizePlanTier(plan string) (string, error) {
	if plan == "" {
		return "free", nil
	}
	if validSelfServePlans[plan] {
		return plan, nil
	}
	return "free", nil
}

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
	Phone        string `json:"phone,omitempty"`
	PlanTier     string `json:"plan,omitempty"`
}

// WorkspaceCreator is the port used to create the user's workspace at
// the end of onboarding. Kept as an interface so tests can substitute
// an in-memory stub. Production implementation lives in main.go as
// onboardingWorkspaceCreator (adapting workspace.Service).
type WorkspaceCreator interface {
	CreateWorkspace(ctx context.Context, userID, stateID, businessName, planTier string) (string, error)
}

// UserUpdater is the port used to update user profile fields (e.g. phone)
// during onboarding. Kept as an interface so tests can substitute a stub.
type UserUpdater interface {
	UpdatePhone(ctx context.Context, userID, phone string) error
}

// PlanGrantStore is the port used to consume an admin-granted plan comp
// recorded on users.pending_plan_tier (migration 113). The onboarding
// service calls ConsumePendingPlanTier just before workspace creation;
// when a grant is present the value overrides the user's wizard-selected
// plan and the column is cleared atomically so the grant applies once.
// Returns ("", nil) when no grant exists — the onboarding flow then
// keeps the user's own selection.
type PlanGrantStore interface {
	ConsumePendingPlanTier(ctx context.Context, userID string) (string, error)
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
	repo      Repository
	wsc       WorkspaceCreator
	pub       EventPublisher
	userUpd   UserUpdater
	planGrant PlanGrantStore
}

// NewService constructs the Service. repo is required; wsc, pub, and
// userUpd may be nil (workspace creation, event publishing, and user
// updates are best-effort when nil).
func NewService(repo Repository, wsc WorkspaceCreator, pub EventPublisher, opts ...ServiceOption) Service {
	s := &service{
		repo: repo,
		wsc:  wsc,
		pub:  pub,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// ServiceOption configures optional dependencies on the onboarding service.
type ServiceOption func(*service)

// WithUserUpdater sets the UserUpdater used to persist phone during onboarding.
func WithUserUpdater(u UserUpdater) ServiceOption {
	return func(s *service) { s.userUpd = u }
}

// WithPlanGrantStore sets the PlanGrantStore used to read and clear an
// admin-granted plan comp during onboarding. When nil (the default in
// tests and pre-migration deployments) the user's wizard-selected plan
// is used as-is.
func WithPlanGrantStore(g PlanGrantStore) ServiceOption {
	return func(s *service) { s.planGrant = g }
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

// SetProfile writes the business profile, creates the user's workspace,
// and advances the step to "complete" — in that order.
//
// Ordering matters: workspace creation happens BEFORE the step=complete
// upsert, so if the workspace creator returns an error the user row
// stays at step=profile and the handler surfaces a 500. This is the
// fix for the prior silent-failure bug (pre-v0.0.47) where a failed
// workspace create left the user with "onboarding complete ✓" on
// screen but no actual workspace — they'd be trapped with a JWT
// workspace_id of "pending-onboarding" and no way to retry.
//
// The one caveat: if CreateWorkspace partially succeeds (workspace row
// exists but e.g. the workspace_members write fails), a retry will
// return "workspace already exists" and re-fail here. Callers should
// treat repeated failures as a support-ticket signal rather than
// retrying forever. A future task can add an "existing workspace?"
// check here for full idempotency.
func (s *service) SetProfile(ctx context.Context, userID string, input ProfileInput) error {
	existing, err := s.repo.Get(ctx, userID)
	if err != nil {
		return err
	}
	if existing == nil || existing.CurrentStep == StepStateSelection {
		return ErrStepRequired
	}

	// Idempotent short-circuit: if the user already completed onboarding
	// (including a successful workspace create from a prior call), a
	// retry here should be a no-op success, not a duplicate workspace
	// attempt. Step=complete means the happy path ran to the end.
	if existing.CurrentStep == StepComplete {
		return nil
	}

	if existing.StateID == nil {
		// Defensive: should be impossible because the step check above
		// already enforces we're past state_selection, which means
		// state_id was persisted. Refuse explicitly instead of silently
		// passing a nil-deref state id to the workspace creator.
		return ErrStepRequired
	}

	if input.GSTIN != "" && !isValidGSTIN(input.GSTIN) {
		return ErrInvalidGSTIN
	}

	// Validate and normalise plan tier before doing any side-effects.
	planTier, err := normalizePlanTier(input.PlanTier)
	if err != nil {
		return err
	}

	// Persist phone if provided and a UserUpdater is wired in.
	// Best-effort: a failure here does not block onboarding completion.
	if input.Phone != "" && s.userUpd != nil {
		_ = s.userUpd.UpdatePhone(ctx, userID, input.Phone)
	}

	// STEP 1: create workspace (hard prerequisite, not best-effort).
	// A failure here must NOT advance the step — the user should be
	// able to retry by resubmitting the profile form.
	if s.wsc == nil {
		return fmt.Errorf("%w: workspace creator not configured", ErrWorkspaceCreateFail)
	}
	// Admin-granted plan comp (migration 113). When a super admin
	// pre-set users.pending_plan_tier via the New User dialog, the
	// grant takes precedence over whatever plan the user picked in
	// the wizard. ConsumePendingPlanTier is atomic (UPDATE ...
	// RETURNING with NOT NULL guard) so a retry of profile submission
	// can't apply the same grant twice — the second call returns
	// "" because the column is already cleared.
	//
	// We consume BEFORE CreateWorkspace so a workspace-create failure
	// has already burned the grant. That's intentional: the
	// alternative (consume after) would mean a transient DB error
	// could orphan the workspace at the user's wizard-chosen tier
	// AND leave the grant unredeemed. Burning the grant up-front
	// matches the "admin-given, single-use comp" mental model — if
	// the admin needs to retry they can re-grant via the same dialog.
	if s.planGrant != nil {
		granted, gerr := s.planGrant.ConsumePendingPlanTier(ctx, userID)
		if gerr != nil {
			// Non-fatal: surface as a log line and fall through to
			// the user's wizard choice. The grant column is left
			// untouched in the error path (UPDATE rolls back), so
			// the admin can retry by re-saving the user.
			log.Printf("onboarding: consume pending plan tier for user=%s: %v", userID, gerr)
		} else if granted != "" {
			log.Printf("onboarding: applying admin plan grant user=%s tier=%s", userID, granted)
			planTier = granted
		}
	}
	if _, err := s.wsc.CreateWorkspace(
		ctx,
		userID,
		strconv.Itoa(*existing.StateID),
		input.BusinessName,
		planTier,
	); err != nil {
		return fmt.Errorf("%w: %v", ErrWorkspaceCreateFail, err)
	}

	// STEP 2: persist the profile and advance the step. If this upsert
	// fails after a successful workspace create, the workspace is
	// orphaned but the step stays at "profile", so a retry will hit
	// the idempotent short-circuit above (step=complete check) — once
	// a follow-up adds "existing workspace?" detection to step 1.
	// For now: repeated upsert failures here are a support signal.
	if err := s.repo.Upsert(ctx, &StatusRecord{
		UserID:       userID,
		CurrentStep:  StepComplete,
		BusinessName: input.BusinessName,
		DisplayName:  input.DisplayName,
		GSTIN:        input.GSTIN,
	}); err != nil {
		return err
	}

	// STEP 3: best-effort event publish. The workspace is created and
	// the step is persisted — event publishing is truly fire-and-forget
	// here because downstream consumers can also bootstrap themselves
	// from the onboarding_statuses table on next poll.
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
