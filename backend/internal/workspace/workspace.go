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

func (s *service) Create(ctx context.Context, input CreateWorkspaceInput) (*Workspace, error) {
	name := input.Name
	if strings.TrimSpace(name) == "" {
		name = input.BusinessName
	}

	planTier := input.PlanTier
	if planTier == "" {
		planTier = "free"
	}

	ws := &Workspace{
		ID:           generateID(),
		Name:         name,
		StateID:      input.StateID,
		OwnerID:      input.OwnerID,
		BusinessName: input.BusinessName,
		PlanTier:     planTier,
	}

	created, err := s.repo.Create(ctx, ws)
	if err != nil {
		return nil, err
	}

	// Provision storage bucket
	if err := s.bucket.ProvisionBucket(ctx, created.ID); err != nil {
		return nil, err
	}

	// Publish workspace.created event
	data, _ := json.Marshal(map[string]string{
		"workspace_id": created.ID,
		"name":         created.Name,
	})
	_ = s.pub.Publish(ctx, "workspace.created", data)

	return created, nil
}

func (s *service) GetByID(ctx context.Context, id string) (*Workspace, error) {
	return s.repo.GetByID(ctx, id)
}

func (s *service) GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error) {
	return s.repo.GetByOwnerAndName(ctx, ownerID, name)
}
