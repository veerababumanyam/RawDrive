package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// LifecycleState represents the valid states for an asset.
type LifecycleState string

const (
	StateActive   LifecycleState = "active"
	StateArchived LifecycleState = "archived"
	StateHidden   LifecycleState = "hidden"
	StateLocked   LifecycleState = "locked"
	StateDeleted  LifecycleState = "deleted"
)

// ValidTransitions maps current state to allowed next states.
var ValidTransitions = map[LifecycleState][]LifecycleState{
	StateActive:   {StateArchived, StateHidden, StateLocked, StateDeleted},
	StateArchived: {StateActive, StateDeleted},
	StateHidden:   {StateActive, StateDeleted},
	StateLocked:   {StateActive}, // Must explicitly unlock before other transitions
	StateDeleted:  {StateActive}, // Restore from Recently Deleted
}

// AssetLifecycleService manages asset state transitions.
type AssetLifecycleService struct {
	assetRepo *repository.AssetRepo
	coverSvc  *GalleryCoverService
	storageSvc *StorageAccounting
}

// NewAssetLifecycleService creates a new AssetLifecycleService.
func NewAssetLifecycleService(ar *repository.AssetRepo, cs *GalleryCoverService, ss *StorageAccounting) *AssetLifecycleService {
	return &AssetLifecycleService{assetRepo: ar, coverSvc: cs, storageSvc: ss}
}

// CanTransition checks if the state transition is valid.
func CanTransition(from, to LifecycleState) bool {
	allowed, ok := ValidTransitions[from]
	if !ok {
		return false
	}
	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

// TransitionInput contains parameters for a state transition.
type TransitionInput struct {
	AssetID     uuid.UUID
	WorkspaceID uuid.UUID
	TargetState LifecycleState
	Reason      string
}

// Transition changes an asset's lifecycle state with validation.
func (s *AssetLifecycleService) Transition(ctx context.Context, input TransitionInput) error {
	asset, err := s.assetRepo.GetByIDAndWorkspace(ctx, input.AssetID, input.WorkspaceID)
	if err != nil {
		return fmt.Errorf("lifecycle: get asset: %w", err)
	}
	if asset == nil {
		return fmt.Errorf("lifecycle: asset not found")
	}

	currentState := LifecycleState(asset.Status)
	if !CanTransition(currentState, input.TargetState) {
		return fmt.Errorf("lifecycle: invalid transition from %s to %s", currentState, input.TargetState)
	}

	if err := s.assetRepo.UpdateStatus(ctx, input.AssetID, string(input.TargetState)); err != nil {
		return fmt.Errorf("lifecycle: update status: %w", err)
	}

	// Handle side effects
	switch input.TargetState {
	case StateDeleted:
		// Soft delete — set deleted_at for retention window
		// Cover auto-update if this was the gallery cover
		// Note: actual purge happens via background job after 30-day retention
	case StateActive:
		// Restore — clear deleted_at
	}

	return nil
}

// Archive moves an asset to archived state (hidden from gallery but stored).
func (s *AssetLifecycleService) Archive(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	return s.Transition(ctx, TransitionInput{AssetID: assetID, WorkspaceID: workspaceID, TargetState: StateArchived})
}

// Hide removes asset from client view but keeps visible to photographer.
func (s *AssetLifecycleService) Hide(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	return s.Transition(ctx, TransitionInput{AssetID: assetID, WorkspaceID: workspaceID, TargetState: StateHidden})
}

// Lock prevents deletion/modification (requires explicit unlock).
func (s *AssetLifecycleService) Lock(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	return s.Transition(ctx, TransitionInput{AssetID: assetID, WorkspaceID: workspaceID, TargetState: StateLocked})
}

// Restore returns a deleted asset to active state.
func (s *AssetLifecycleService) Restore(ctx context.Context, assetID, workspaceID uuid.UUID) error {
	return s.Transition(ctx, TransitionInput{AssetID: assetID, WorkspaceID: workspaceID, TargetState: StateActive})
}
