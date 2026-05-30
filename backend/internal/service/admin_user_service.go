package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/logging"
	"github.com/rawdrive/backend/internal/passwordpolicy"
	"github.com/rawdrive/backend/internal/repository"
	"golang.org/x/crypto/bcrypt"
)

// AdminInviteSender delivers a platform-role invitation email to a
// newly created user (Issue #4). Satisfied by *email.InvitationSender.
type AdminInviteSender interface {
	SendAdminInvitation(ctx context.Context, email, role, inviteLink string) error
}

var (
	ErrCannotSuspendSelf           = errors.New("cannot suspend your own account")
	ErrCannotSuspendSuperAdmin     = errors.New("cannot suspend a super_admin")
	ErrCannotImpersonateSuperAdmin = errors.New("cannot impersonate a super_admin")
	ErrInvalidRole                 = errors.New("invalid role")
	ErrUserNotFound                = errors.New("user not found")

	// F-020: ImpersonateUser previously minted an HS256 token signed with
	// JWT_IMPERSONATION_SECRET that NOTHING in the system could validate —
	// the only access-token validator (auth.jwtService.ParseAccessToken)
	// rejects any non-RSA token before reading a single claim, and no
	// middleware/exchange endpoint ever validated the impersonation secret.
	// The feature now mints a real RS256 platform access token via the
	// wired auth.JWTService so JWTAuth/TenantContext accept it. When the
	// signer is not wired we refuse loudly rather than handing back a
	// useless token.
	ErrImpersonationNotConfigured = errors.New("impersonation token signer not configured")

	// M39 E5-S1 (FR-F01): admin user creation sentinels.
	ErrDuplicateEmail          = errors.New("email already registered")
	ErrInvalidEmail            = errors.New("invalid email format")
	ErrWeakPassword            = errors.New("password does not meet complexity requirements")
	ErrMissingPasswordOrInvite = errors.New("either initial_password or send_invite=true is required")
	ErrMissingActor            = errors.New("actor id required")
)

// M39 E5-S1: CreateInput describes the admin user create payload.
type CreateInput struct {
	Email           string
	FullName        string
	Role            string
	InitialPassword *string
	SendInvite      bool
	ActorID         uuid.UUID
	// PlanTier is an optional admin-granted plan comp. When set to one
	// of the canonical tier slugs (free / starter / professional /
	// business / enterprise) the value is persisted to
	// users.pending_plan_tier (migration 113) and applied at the
	// user's workspace-creation time. Only meaningful for the
	// photographer role — other roles do not own a workspace. The
	// service rejects unknown tier values with ErrInvalidPlanTier
	// rather than silently falling back so a typo from the admin
	// dialog surfaces as a 400 instead of an unexpected "free" grant.
	PlanTier *string
}

// validAdminGrantTiers mirrors the chk_users_pending_plan_tier CHECK
// constraint (migration 113) and the workspaces.plan_tier CHECK
// (migration 070). Kept here so the service layer can validate before
// the repo INSERT — saves a round-trip and gives a clear sentinel error.
var validAdminGrantTiers = map[string]struct{}{
	"free":         {},
	"starter":      {},
	"professional": {},
	"business":     {},
	"enterprise":   {},
}

// ErrInvalidPlanTier — returned by Create when an unknown plan tier slug
// is supplied. The handler maps this to HTTP 400 with code
// "invalid_plan_tier" so the admin dialog can surface a specific message.
var ErrInvalidPlanTier = errors.New("invalid plan tier")

// E5-S1 role whitelist. superadmin / super_admin are explicitly rejected so
// privilege escalation via the admin create API is impossible (SEC-F05).
// QA #44 aligns the whitelist with the users.platform_role CHECK constraint
// in migration 035 — 'user' and 'customer' are NOT valid platform roles and
// previously caused the INSERT to fail with a constraint violation.
var allowedCreateRoles = map[string]struct{}{
	"admin":        {},
	"photographer": {},
	"dealer":       {},
	"team_member":  {},
	"client":       {},
}

var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// validatePasswordComplexity enforces the minimum floor for admin-created
// passwords: >=12 chars, at least one upper, one lower, one digit, one
// special (M39 E5-S1 SEC-F05 auxiliary, aligns with existing password-reset
// rules in auth.PasswordService).
func validatePasswordComplexity(pw string) error {
	if len(pw) < 12 {
		return ErrWeakPassword
	}
	// F-056: cap length at bcrypt's byte limit so overlong admin-set passwords
	// are rejected before hashing.
	if !passwordpolicy.FitsBcrypt(pw) {
		return ErrWeakPassword
	}
	var hasUpper, hasLower, hasDigit, hasSpecial bool
	for _, c := range pw {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= 'a' && c <= 'z':
			hasLower = true
		case c >= '0' && c <= '9':
			hasDigit = true
		default:
			hasSpecial = true
		}
	}
	if !(hasUpper && hasLower && hasDigit && hasSpecial) {
		return ErrWeakPassword
	}
	return nil
}

type AdminUserService struct {
	userRepo     *repository.AdminUserRepo
	auditLog     *AuditLogService
	jwtSecret    []byte
	inviteSender AdminInviteSender
	frontendURL  string
	// F-020: optional impersonation deps. tokenSigner mints RS256 platform
	// access tokens that the real validator accepts; wsLookup resolves the
	// target user's primary workspace / state / role context so the minted
	// token carries the workspace_id + role + platform_role claims that
	// TenantContext requires (without them the token 403s at TenantContext).
	// Wired via SetImpersonationTokenSigner so the existing 3-arg
	// constructor and its callers/tests stay unchanged.
	tokenSigner auth.JWTService
	wsLookup    auth.WorkspaceLookup
}

func NewAdminUserService(userRepo *repository.AdminUserRepo, auditLog *AuditLogService, jwtSecret []byte) *AdminUserService {
	return &AdminUserService{userRepo: userRepo, auditLog: auditLog, jwtSecret: jwtSecret}
}

// SetImpersonationTokenSigner wires the RS256 platform JWT service and the
// workspace lookup used by ImpersonateUser (F-020). Kept as a setter so the
// original 3-arg constructor and its existing callers/tests do not change —
// main.go calls this during bootstrap with the same jwtSvc + workspace
// resolver the auth/login path uses. Passing a nil signer leaves
// impersonation disabled: ImpersonateUser then returns
// ErrImpersonationNotConfigured rather than minting an unusable token.
func (s *AdminUserService) SetImpersonationTokenSigner(signer auth.JWTService, wsLookup auth.WorkspaceLookup) {
	s.tokenSigner = signer
	s.wsLookup = wsLookup
}

// SetAdminInviteSender wires the platform-role invitation email sender
// used by the SendInvite branch of Create (Issue #4). Kept as a setter
// so existing callers (main.go, tests) using the original 3-arg
// constructor do not need to change.
func (s *AdminUserService) SetAdminInviteSender(sender AdminInviteSender, frontendURL string) {
	s.inviteSender = sender
	s.frontendURL = frontendURL
}

func (s *AdminUserService) ListUsers(ctx context.Context, filter repository.AdminUserFilter) (*repository.PaginatedResult[repository.AdminUserRow], error) {
	return s.userRepo.List(ctx, filter)
}

func (s *AdminUserService) GetUser(ctx context.Context, id uuid.UUID) (*repository.AdminUserDetail, error) {
	return s.userRepo.GetByID(ctx, id)
}

func (s *AdminUserService) SuspendUser(ctx context.Context, id uuid.UUID, reason string, actorID uuid.UUID) error {
	if id == actorID {
		return ErrCannotSuspendSelf
	}
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return ErrUserNotFound
	}
	if user.PlatformRole == "super_admin" {
		return ErrCannotSuspendSuperAdmin
	}
	if err := s.userRepo.UpdateStatus(ctx, id, "suspended", reason, actorID); err != nil {
		return fmt.Errorf("suspending user: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.suspend",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminUserService) ReactivateUser(ctx context.Context, id uuid.UUID, actorID uuid.UUID) error {
	if err := s.userRepo.UpdateStatus(ctx, id, "active", "", actorID); err != nil {
		return fmt.Errorf("reactivating user: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.reactivate",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

// ImpersonateUser mints a platform access token that lets an admin act as the
// target user (M6 E16-S1). F-020 fix: the token is now an RS256 token signed by
// the same auth.JWTService that the login path uses, carrying the
// workspace_id / role / platform_role / state_id claims required by
// JWTAuth + TenantContext. The previous implementation signed an HS256 token
// with JWT_IMPERSONATION_SECRET that the only validator (ParseAccessToken,
// which rejects every non-RSA token) could never accept and that no
// middleware ever consumed — so the feature returned a token nothing in the
// system could use. We mirror the login handler's workspace-context
// resolution so the impersonation session behaves like a real login as that
// user.
func (s *AdminUserService) ImpersonateUser(ctx context.Context, targetID uuid.UUID, adminID uuid.UUID) (string, error) {
	// Refuse loudly when the RS256 signer is not wired rather than handing
	// back the old unusable HS256 token. The handler maps this to a 500 and
	// the admin sees an honest failure instead of a "successful" no-op.
	// Checked first so a misconfigured deployment fails fast without a
	// pointless DB round-trip.
	if s.tokenSigner == nil {
		return "", ErrImpersonationNotConfigured
	}
	user, err := s.userRepo.GetByID(ctx, targetID)
	if err != nil {
		return "", fmt.Errorf("fetching target user: %w", err)
	}
	if user == nil {
		return "", ErrUserNotFound
	}
	if user.PlatformRole == "super_admin" {
		return "", ErrCannotImpersonateSuperAdmin
	}

	// Resolve the target user's primary workspace context exactly like the
	// login handler does (auth/handler.go): default to the onboarding
	// placeholders, then overlay anything the lookup resolves. This keeps
	// the impersonation token shape identical to a genuine login token so
	// every downstream workspace API treats it the same.
	wsID := "pending-onboarding"
	stateID := "pending-onboarding"
	role := "Owner"
	platformRole := user.PlatformRole
	if platformRole == "" {
		platformRole = "photographer"
	}
	if s.wsLookup != nil {
		resolvedWS, resolvedState, resolvedRole, resolvedPlatformRole, lookupErr := s.wsLookup.GetUserWorkspace(ctx, targetID.String())
		if lookupErr != nil {
			return "", fmt.Errorf("resolving impersonation workspace: %w", lookupErr)
		}
		if resolvedWS != "" {
			wsID = resolvedWS
		}
		if resolvedState != "" {
			stateID = resolvedState
		}
		if resolvedRole != "" {
			role = resolvedRole
		}
		if resolvedPlatformRole != "" {
			platformRole = resolvedPlatformRole
		}
	}

	signed, err := s.tokenSigner.GenerateAccessToken(ctx, auth.TokenClaims{
		Sub:          targetID.String(),
		WorkspaceID:  wsID,
		Role:         role,
		PlatformRole: platformRole,
		StateID:      stateID,
	})
	if err != nil {
		return "", fmt.Errorf("signing impersonation token: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: adminID, ActorType: "admin", Action: "user.impersonate",
		ResourceType: "user", ResourceID: targetID.String(),
	})
	return signed, nil
}

func (s *AdminUserService) ChangeRole(ctx context.Context, id uuid.UUID, newRole string, actorID uuid.UUID) error {
	if id == actorID {
		return errors.New("cannot change your own role")
	}
	// F-004: validate the target role BEFORE delegating to the repo. Without
	// this guard an admin-tier user could promote any account to super_admin
	// (the migration 035 CHECK constraint permits it and UpdateRole runs a raw
	// UPDATE with no whitelist), breaking the two-tier privilege model. Mirror
	// the Create path: explicitly reject the super_admin variants and require
	// the role to be in allowedCreateRoles. allowedCreateRoles intentionally
	// omits super_admin, so role escalation via this endpoint is impossible.
	role := strings.TrimSpace(strings.ToLower(newRole))
	if role == "superadmin" || role == "super_admin" {
		return ErrInvalidRole
	}
	if _, ok := allowedCreateRoles[role]; !ok {
		return ErrInvalidRole
	}
	if err := s.userRepo.UpdateRole(ctx, id, role, actorID); err != nil {
		return fmt.Errorf("updating role: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.change_role",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

// DeleteUser performs a GDPR/DPDPA erasure request (M7 E20-S1). It marks
// the user as deleted and relies on ON DELETE CASCADE declared in the
// schema (workspace_members, notifications, proofing_selections, etc.)
// to ripple the deletion through dependent tables. The super_admin guard
// mirrors SuspendUser so admin accounts cannot be erased by mistake.
//
// NOTE: A proper GDPR "right to be forgotten" workflow also needs to
// purge the user's assets from R2 (done asynchronously by the asset purge
// worker) and anonymize their rows in immutable audit logs (replaced by a
// tombstone entry). Those steps are deferred to the DSR workflow in M10;
// this method closes the admin-initiated delete path.
func (s *AdminUserService) DeleteUser(ctx context.Context, id, actorID uuid.UUID) error {
	if id == actorID {
		return errors.New("cannot delete your own account via admin panel")
	}
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("fetching user: %w", err)
	}
	if user == nil {
		return ErrUserNotFound
	}
	if user.PlatformRole == "super_admin" {
		return errors.New("cannot delete a super_admin")
	}
	if err := s.userRepo.UpdateStatus(ctx, id, "deleted", "gdpr_erasure", actorID); err != nil {
		return fmt.Errorf("marking user deleted: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID:      actorID,
		ActorType:    "admin",
		Action:       "user.delete",
		ResourceType: "user",
		ResourceID:   id.String(),
		Severity:     "high",
	})
	return nil
}

// GetUserActivity returns the audit log timeline for a user — what they
// did (actor_id) and what was done to them (resource_id). Used by the
// admin user detail page for incident investigations.
func (s *AdminUserService) GetUserActivity(ctx context.Context, userID uuid.UUID, limit int) ([]repository.AuditLogEntry, error) {
	return s.userRepo.GetActivityTimeline(ctx, userID, limit)
}

// Create persists a new user and optionally kicks off an invite flow or
// immediately marks the user email_verified when a password is supplied
// (M39 E5-S1 FR-F01). Superadmin escalation is refused at this layer.
func (s *AdminUserService) Create(ctx context.Context, input CreateInput) (*repository.AdminUserDetail, error) {
	email := strings.TrimSpace(strings.ToLower(input.Email))
	if !emailRegex.MatchString(email) {
		return nil, ErrInvalidEmail
	}
	if input.ActorID == uuid.Nil {
		return nil, ErrMissingActor
	}
	role := strings.TrimSpace(strings.ToLower(input.Role))
	if role == "superadmin" || role == "super_admin" {
		return nil, ErrInvalidRole
	}
	if _, ok := allowedCreateRoles[role]; !ok {
		return nil, ErrInvalidRole
	}
	if input.InitialPassword == nil && !input.SendInvite {
		return nil, ErrMissingPasswordOrInvite
	}
	// Admin-granted plan comp. Only photographers own a workspace; for
	// any other role a plan grant has no surface to apply against, so
	// we reject the combination explicitly rather than silently
	// ignoring it (the latter would let the admin dialog "succeed" but
	// the grant would never materialize).
	var pendingPlanTier *string
	if input.PlanTier != nil {
		tier := strings.TrimSpace(strings.ToLower(*input.PlanTier))
		if tier != "" {
			if _, ok := validAdminGrantTiers[tier]; !ok {
				return nil, ErrInvalidPlanTier
			}
			if role != "photographer" {
				return nil, ErrInvalidPlanTier
			}
			pendingPlanTier = &tier
		}
	}
	var passwordHash *string
	emailVerified := false
	if input.InitialPassword != nil {
		if err := validatePasswordComplexity(*input.InitialPassword); err != nil {
			return nil, err
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(*input.InitialPassword), 12)
		if err != nil {
			return nil, fmt.Errorf("hashing password: %w", err)
		}
		h := string(hashed)
		passwordHash = &h
		emailVerified = true
	}
	// Persist via repo. nil-safe behavior: when repo is unset (unit tests with
	// no backing DB) we surface a sentinel error rather than panicking so the
	// test can detect the wiring gap.
	if s.userRepo == nil {
		return nil, fmt.Errorf("admin user service: repository not configured")
	}
	detail, err := s.userRepo.CreateUser(ctx, repository.AdminUserCreate{
		Email:           email,
		FullName:        strings.TrimSpace(input.FullName),
		Role:            role,
		PasswordHash:    passwordHash,
		EmailVerified:   emailVerified,
		PendingPlanTier: pendingPlanTier,
	})
	if err != nil {
		if errors.Is(err, repository.ErrDuplicateEmail) {
			return nil, ErrDuplicateEmail
		}
		return nil, fmt.Errorf("creating user: %w", err)
	}
	if s.auditLog != nil {
		s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
			ActorID:      input.ActorID,
			ActorType:    "admin",
			Action:       "admin.user.create",
			ResourceType: "user",
			ResourceID:   detail.ID.String(),
			Severity:     "info",
		})
	}
	// Issue #4 (RawDrive_NewUniqueIssues.xlsx): when SendInvite is true and
	// no initial password was supplied, deliver a platform-role invitation
	// email pointing the invitee at the existing /forgot-password flow so
	// they can request a one-time code and set a password in a single
	// round-trip (the QA #40 flow already drives this path, so we reuse
	// the same rate-limited public endpoint instead of inventing a new
	// invite-token table). Email failure is non-fatal — the user row is
	// already persisted with email_verified=false, and an admin can resend
	// via the Reset-pw button so the account is never orphaned by a
	// transient SMTP hiccup.
	if input.SendInvite && passwordHash == nil && s.inviteSender != nil {
		base := strings.TrimRight(s.frontendURL, "/")
		if base == "" {
			base = "https://app.rawdrive.io"
		}
		inviteLink := fmt.Sprintf("%s/forgot-password?email=%s", base, url.QueryEscape(email))
		if err := s.inviteSender.SendAdminInvitation(ctx, email, role, inviteLink); err != nil {
			log.Printf("admin: invite email to %s failed: %v", logging.MaskEmail(email), err)
		}
	}
	return detail, nil
}

// ChangeTier updates the plan tier of the workspace owned by the given user.
// Only accepts canonical tier slugs. Syncs workspace_storage quota to the
// new tier's default. Restricted to super_admin at the handler layer.
func (s *AdminUserService) ChangeTier(ctx context.Context, id uuid.UUID, newTier string, actorID uuid.UUID) error {
	if _, ok := validAdminGrantTiers[newTier]; !ok {
		return ErrInvalidPlanTier
	}
	quotaBytes := PlanDefaultQuotaBytes(newTier)
	if err := s.userRepo.UpdateTier(ctx, id, newTier, quotaBytes, actorID); err != nil {
		return fmt.Errorf("updating tier: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.change_tier",
		ResourceType: "user", ResourceID: id.String(),
	})
	return nil
}

func (s *AdminUserService) BulkSuspend(ctx context.Context, ids []uuid.UUID, reason string, actorID uuid.UUID) (int64, error) {
	filtered := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		if id != actorID {
			filtered = append(filtered, id)
		}
	}
	count, err := s.userRepo.BulkUpdateStatus(ctx, filtered, "suspended", reason, actorID)
	if err != nil {
		return 0, fmt.Errorf("bulk suspending: %w", err)
	}
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID: actorID, ActorType: "admin", Action: "user.bulk_suspend",
		ResourceType: "user",
	})
	return count, nil
}
