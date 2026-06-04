package rbac

import (
	"context"
	"errors"
	"time"

	"github.com/rawdrive/backend/internal/cache"
)

var (
	ErrRoleNotFound = errors.New("role not found")
)

type Role string

// Workspace roles (within a workspace)
const (
	RoleOwner  Role = "Owner"
	RoleAdmin  Role = "Admin"
	RoleEditor Role = "Editor"
	RoleViewer Role = "Viewer"
)

// Platform roles (user-level, from PRD 6.2)
const (
	PlatformSuperAdmin   = "super_admin"
	PlatformAdmin        = "admin"
	PlatformDealer       = "dealer"
	PlatformPhotographer = "photographer"
	PlatformTeamMember   = "team_member"
	PlatformClient       = "client"
)

// ValidPlatformRoles is the set of all valid platform role values.
var ValidPlatformRoles = map[string]bool{
	PlatformSuperAdmin:   true,
	PlatformAdmin:        true,
	PlatformDealer:       true,
	PlatformPhotographer: true,
	PlatformTeamMember:   true,
	PlatformClient:       true,
}

// Role hierarchy: Owner > Admin > Editor > Viewer
var roleLevel = map[Role]int{
	RoleOwner:  4,
	RoleAdmin:  3,
	RoleEditor: 2,
	RoleViewer: 1,
}

// Permission matrix: endpoint -> list of PermissionRule
type PermissionRule struct {
	MinRole Role
}

// Endpoint is "resource:action"
type Endpoint string

var permissionMatrix = map[Endpoint][]PermissionRule{
	// workspace
	"workspace:read":   {{MinRole: RoleViewer}},
	"workspace:write":  {{MinRole: RoleEditor}},
	"workspace:manage": {{MinRole: RoleAdmin}},
	"workspace:delete": {{MinRole: RoleOwner}},
	// files
	"files:read":   {{MinRole: RoleViewer}},
	"files:write":  {{MinRole: RoleEditor}},
	"files:manage": {{MinRole: RoleAdmin}},
	"files:delete": {{MinRole: RoleOwner}},
	// team
	"team:read":   {{MinRole: RoleViewer}},
	"team:manage": {{MinRole: RoleAdmin}},
	"team:delete": {{MinRole: RoleOwner}},
	// settings
	"settings:read":   {{MinRole: RoleViewer}},
	"settings:write":  {{MinRole: RoleAdmin}},
	"settings:manage": {{MinRole: RoleAdmin}},
	"settings:delete": {{MinRole: RoleOwner}},
}

var allEndpoints = []Endpoint{
	"workspace:read", "workspace:write", "workspace:manage", "workspace:delete",
	"files:read", "files:write", "files:manage", "files:delete",
	"team:read", "team:manage", "team:delete",
	"settings:read", "settings:write", "settings:manage", "settings:delete",
}

func GetPermissionMatrix() map[Endpoint][]PermissionRule {
	return permissionMatrix
}

func GetAllEndpoints() []Endpoint {
	return allEndpoints
}

// ──────────────────────────── Interfaces ────────────────────────────

type PermissionStore interface {
	GetRole(ctx context.Context, userID, workspaceID string) (Role, error)
	SetRole(ctx context.Context, userID, workspaceID string, role Role) error
}

type AuditLogger interface {
	LogPermissionDenied(ctx context.Context, userID, workspaceID, resource, action string)
}

// ──────────────────────────── Engine ────────────────────────────

type Engine interface {
	Evaluate(ctx context.Context, userID, workspaceID, resource, action string) (bool, error)
	AssignRole(ctx context.Context, assignerID, targetUserID, workspaceID string, role Role) error
}

type engine struct {
	store PermissionStore
	audit AuditLogger
	// cache is the shared in-proc TTL cache (see internal/cache). It replaces a
	// bespoke map[string]*cacheEntry + RWMutex; semantics are identical — keyed
	// by "userID:workspaceID", 5-minute default TTL, read-through in getRole.
	cache *cache.Cache[Role]
}

func NewEngine(store PermissionStore, audit AuditLogger) Engine {
	return NewEngineWithCacheTTL(store, audit, 5*time.Minute)
}

func NewEngineWithCacheTTL(store PermissionStore, audit AuditLogger, ttl time.Duration) Engine {
	return &engine{
		store: store,
		audit: audit,
		cache: cache.New[Role]("rbac.role", ttl),
	}
}

func (e *engine) getRole(ctx context.Context, userID, workspaceID string) (Role, error) {
	key := userID + ":" + workspaceID
	return e.cache.GetOrLoad(ctx, key, func(ctx context.Context) (Role, error) {
		return e.store.GetRole(ctx, userID, workspaceID)
	})
}

// invalidate drops the cached role for a single (userID, workspaceID) key so the
// next getRole re-reads the source of truth. Any code path that mutates the
// underlying store for a user MUST invalidate that user's entry to keep this
// read-through cache coherent — otherwise a role change is masked for up to
// cacheTTL.
func (e *engine) invalidate(userID, workspaceID string) {
	key := userID + ":" + workspaceID
	e.cache.Delete(key)
}

func (e *engine) Evaluate(ctx context.Context, userID, workspaceID, resource, action string) (bool, error) {
	role, err := e.getRole(ctx, userID, workspaceID)
	if err != nil {
		if errors.Is(err, ErrRoleNotFound) {
			return false, nil
		}
		return false, err
	}

	endpoint := Endpoint(resource + ":" + action)
	rules, ok := permissionMatrix[endpoint]
	if !ok {
		// Unknown endpoint - deny by default
		e.audit.LogPermissionDenied(ctx, userID, workspaceID, resource, action)
		return false, nil
	}

	userLevel := roleLevel[role]
	for _, rule := range rules {
		if userLevel >= roleLevel[rule.MinRole] {
			return true, nil
		}
	}

	e.audit.LogPermissionDenied(ctx, userID, workspaceID, resource, action)
	return false, nil
}

func (e *engine) AssignRole(ctx context.Context, assignerID, targetUserID, workspaceID string, role Role) error {
	assignerRole, err := e.getRole(ctx, assignerID, workspaceID)
	if err != nil {
		return err
	}

	// Can't assign a role >= your own level
	if roleLevel[role] >= roleLevel[assignerRole] {
		return errors.New("privilege escalation: cannot assign role at or above your own level")
	}

	if err := e.store.SetRole(ctx, targetUserID, workspaceID, role); err != nil {
		return err
	}

	// The source of truth just changed for this user — drop any cached projection
	// so the next Evaluate re-reads the new role instead of serving the stale one
	// for up to cacheTTL. Without this, a demotion/revocation leaves a
	// privilege-lag window in which the user keeps their old (elevated) access.
	e.invalidate(targetUserID, workspaceID)
	return nil
}
