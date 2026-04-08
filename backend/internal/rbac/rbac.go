package rbac

import (
	"context"
	"errors"
	"sync"
	"time"
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

type cacheEntry struct {
	role      Role
	expiresAt time.Time
}

type engine struct {
	store    PermissionStore
	audit    AuditLogger
	cacheTTL time.Duration
	mu       sync.RWMutex
	cache    map[string]*cacheEntry // "userID:workspaceID" -> cacheEntry
}

func NewEngine(store PermissionStore, audit AuditLogger) Engine {
	return &engine{
		store:    store,
		audit:    audit,
		cacheTTL: 5 * time.Minute,
		cache:    make(map[string]*cacheEntry),
	}
}

func NewEngineWithCacheTTL(store PermissionStore, audit AuditLogger, ttl time.Duration) Engine {
	return &engine{
		store:    store,
		audit:    audit,
		cacheTTL: ttl,
		cache:    make(map[string]*cacheEntry),
	}
}

func (e *engine) getRole(ctx context.Context, userID, workspaceID string) (Role, error) {
	key := userID + ":" + workspaceID

	e.mu.RLock()
	if entry, ok := e.cache[key]; ok && time.Now().Before(entry.expiresAt) {
		role := entry.role
		e.mu.RUnlock()
		return role, nil
	}
	e.mu.RUnlock()

	role, err := e.store.GetRole(ctx, userID, workspaceID)
	if err != nil {
		return "", err
	}

	e.mu.Lock()
	e.cache[key] = &cacheEntry{
		role:      role,
		expiresAt: time.Now().Add(e.cacheTTL),
	}
	e.mu.Unlock()

	return role, nil
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

	return e.store.SetRole(ctx, targetUserID, workspaceID, role)
}
