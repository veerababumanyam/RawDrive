package workspace

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrNotFound = errors.New("workspace not found")
	// ErrDuplicateName signals that the (owner_id, lower(name)) tuple
	// is already present (Issue #5 / migration 096). Surfaced by the
	// repo when PostgreSQL raises a unique_violation on the
	// workspaces_owner_lower_name_uniq index. Callers (notably the
	// onboarding adapter in cmd/api/main.go) treat this as an
	// idempotent retry signal — fetch the existing row instead of
	// surfacing a raw 23505 error to the user.
	ErrDuplicateName = errors.New("workspace name already exists for this owner")
)

type contextKey string

const tenantIDKey contextKey = "tenant_id"

func WithTenantID(ctx context.Context, tenantID string) context.Context {
	return context.WithValue(ctx, tenantIDKey, tenantID)
}

func TenantIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(tenantIDKey).(string); ok {
		return v
	}
	return ""
}

type Workspace struct {
	ID           string
	Name         string
	StateID      string
	OwnerID      string
	BusinessName string
	PlanTier     string
	// Business-subdomain identity (migration 121). Used to build
	// <slug>-<code>.rawdrive.in routing URLs. Both fields are populated
	// by PgRepo.Create from the workspace Name; pre-existing rows are
	// backfilled by migration 121. Existing callers that don't read
	// these keep compiling unchanged (zero-value strings).
	BusinessProfileSlug string
	BusinessUniqueCode  string
}

type CreateWorkspaceInput struct {
	Name         string
	StateID      string
	OwnerID      string
	BusinessName string
	PlanTier     string
}

type Repository interface {
	Create(ctx context.Context, ws *Workspace) (*Workspace, error)
	// CreateWithBootstrap atomically co-creates the workspace + its Owner
	// workspace_members row + its workspace_storage quota row in one
	// transaction (AREA-CUSTOMER-3 / AREA-CUSTOMER-1, audit 2026-05-31).
	// quotaBytes is resolved from the plan tier by the caller to avoid an
	// import cycle on the service package.
	CreateWithBootstrap(ctx context.Context, ws *Workspace, quotaBytes int64) (*Workspace, error)
	GetByID(ctx context.Context, id string) (*Workspace, error)
	// Issue #5: case-insensitive lookup used by the onboarding
	// adapter to recover the existing row when Create returned
	// ErrDuplicateName on a partial-failure retry.
	GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error)
}

type EventPublisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

type StorageBucket interface {
	ProvisionBucket(ctx context.Context, workspaceID string) error
}

type Service interface {
	Create(ctx context.Context, input CreateWorkspaceInput) (*Workspace, error)
	// CreateWithBootstrap is the SINGLE canonical workspace-creation path
	// (AREA-CUSTOMER-1, audit 2026-05-31). It atomically co-creates the
	// workspace + Owner membership + storage quota rows (via the repo's
	// transactional CreateWithBootstrap), then provisions the storage
	// bucket and publishes the workspace.created event. quotaBytes is the
	// plan-resolved quota supplied by the caller.
	CreateWithBootstrap(ctx context.Context, input CreateWorkspaceInput, quotaBytes int64) (*Workspace, error)
	GetByID(ctx context.Context, id string) (*Workspace, error)
	// GetByOwnerAndName is the recovery seam for Issue #5; see
	// Repository.GetByOwnerAndName for the case-insensitivity contract.
	GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error)
}

type service struct {
	repo   Repository
	pub    EventPublisher
	bucket StorageBucket
}

func NewService(repo Repository, pub EventPublisher, bucket StorageBucket) Service {
	return &service{repo: repo, pub: pub, bucket: bucket}
}

func generateID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x", b)
}

// newWorkspaceFromInput normalizes a CreateWorkspaceInput into a Workspace
// (defaulting name to business name and plan tier to "free"). Shared by
// Create and CreateWithBootstrap so both paths apply identical defaults.
func newWorkspaceFromInput(input CreateWorkspaceInput) *Workspace {
	name := input.Name
	if strings.TrimSpace(name) == "" {
		name = input.BusinessName
	}

	planTier := input.PlanTier
	if planTier == "" {
		planTier = "free"
	}

	return &Workspace{
		ID:           generateID(),
		Name:         name,
		StateID:      input.StateID,
		OwnerID:      input.OwnerID,
		BusinessName: input.BusinessName,
		PlanTier:     planTier,
	}
}

// provisionAndPublish runs the post-commit external side effects shared by
// Create and CreateWithBootstrap: bucket provisioning (hard prerequisite)
// and the best-effort workspace.created event.
func (s *service) provisionAndPublish(ctx context.Context, created *Workspace) error {
	if err := s.bucket.ProvisionBucket(ctx, created.ID); err != nil {
		return err
	}
	data, _ := json.Marshal(map[string]string{
		"workspace_id": created.ID,
		"name":         created.Name,
	})
	_ = s.pub.Publish(ctx, "workspace.created", data)
	return nil
}

func (s *service) Create(ctx context.Context, input CreateWorkspaceInput) (*Workspace, error) {
	ws := newWorkspaceFromInput(input)

	created, err := s.repo.Create(ctx, ws)
	if err != nil {
		return nil, err
	}

	if err := s.provisionAndPublish(ctx, created); err != nil {
		return nil, err
	}

	return created, nil
}

// CreateWithBootstrap is the single canonical workspace-creation path
// (AREA-CUSTOMER-1, audit 2026-05-31). The workspace + Owner membership +
// storage quota rows are co-created atomically in one DB transaction by the
// repo; only after that commits do we provision the storage bucket and
// publish the event. The DB invariant (no workspace without membership +
// quota) therefore holds even if the bucket/event side effects later fail.
func (s *service) CreateWithBootstrap(ctx context.Context, input CreateWorkspaceInput, quotaBytes int64) (*Workspace, error) {
	ws := newWorkspaceFromInput(input)

	created, err := s.repo.CreateWithBootstrap(ctx, ws, quotaBytes)
	if err != nil {
		return nil, err
	}

	if err := s.provisionAndPublish(ctx, created); err != nil {
		return nil, err
	}

	return created, nil
}

func (s *service) GetByID(ctx context.Context, id string) (*Workspace, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error) {
	return s.repo.GetByOwnerAndName(ctx, ownerID, name)
}
