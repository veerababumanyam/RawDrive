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
}

type CreateWorkspaceInput struct {
	Name         string
	StateID      string
	OwnerID      string
	BusinessName string
}

type Repository interface {
	Create(ctx context.Context, ws *Workspace) (*Workspace, error)
	GetByID(ctx context.Context, id string) (*Workspace, error)
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

	ws := &Workspace{
		ID:           generateID(),
		Name:         name,
		StateID:      input.StateID,
		OwnerID:      input.OwnerID,
		BusinessName: input.BusinessName,
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
