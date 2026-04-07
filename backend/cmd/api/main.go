package main

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/onboarding"
	teamPkg "github.com/rawdrive/backend/internal/team"
	"github.com/rawdrive/backend/internal/workspace"
)

// ──────────────────────────── Stub Dependencies ────────────────────────────

type stubUserService struct{}

func (s *stubUserService) Create(_ context.Context, email string) (string, error) {
	return "stub-user-id", nil
}
func (s *stubUserService) FindByEmail(_ context.Context, email string) (string, bool, error) {
	return "", false, nil
}

type stubWorkspaceRepo struct{}

func (s *stubWorkspaceRepo) Create(_ context.Context, ws *workspace.Workspace) (*workspace.Workspace, error) {
	return ws, nil
}
func (s *stubWorkspaceRepo) GetByID(_ context.Context, id string) (*workspace.Workspace, error) {
	return nil, workspace.ErrNotFound
}

type stubEventPublisher struct{}

func (s *stubEventPublisher) Publish(_ context.Context, subject string, data []byte) error {
	return nil
}

type stubStorageBucket struct{}

func (s *stubStorageBucket) ProvisionBucket(_ context.Context, workspaceID string) error {
	return nil
}

type stubDBContext struct{}

func (s *stubDBContext) SetWorkspaceID(_ context.Context, workspaceID string) error { return nil }

type stubAuditLog struct{}

func (s *stubAuditLog) LogAccess(_ context.Context, workspaceID, action string) {}

type stubWorkspaceCreator struct{}

func (s *stubWorkspaceCreator) CreateWorkspace(_ context.Context, userID, stateID, businessName string) (string, error) {
	return "ws-stub", nil
}

type stubOnboardingEventPub struct{}

func (s *stubOnboardingEventPub) Publish(_ context.Context, subject string, data []byte) error {
	return nil
}

type stubInvitationRepo struct{}

func (s *stubInvitationRepo) Create(_ context.Context, inv *teamPkg.Invitation) error { return nil }
func (s *stubInvitationRepo) GetByToken(_ context.Context, token string) (*teamPkg.Invitation, error) {
	return nil, teamPkg.ErrInvitationNotFound
}
func (s *stubInvitationRepo) GetByID(_ context.Context, id string) (*teamPkg.Invitation, error) {
	return nil, teamPkg.ErrInvitationNotFound
}
func (s *stubInvitationRepo) Revoke(_ context.Context, id string) error { return nil }

type stubEmailSender struct{}

func (s *stubEmailSender) SendInvitation(_ context.Context, email, inviteLink string) error {
	return nil
}

type stubMemberRepo struct{}

func (s *stubMemberRepo) AddMember(_ context.Context, workspaceID, userID string, role teamPkg.Role) error {
	return nil
}
func (s *stubMemberRepo) RemoveMember(_ context.Context, workspaceID, userID string) error {
	return nil
}
func (s *stubMemberRepo) IsMember(_ context.Context, workspaceID, userID string) (bool, error) {
	return false, nil
}

type stubUserLookup struct{}

func (s *stubUserLookup) FindByEmail(_ context.Context, email string) (string, bool, error) {
	return "", false, nil
}

func main() {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RequestID)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.RateLimit(60, time.Minute))

	// Services
	otpSvc := auth.NewOTPService(auth.OTPConfig{
		CodeLength:      6,
		Expiry:          5 * time.Minute,
		MaxAttempts:     5,
		RateLimitMax:    10,
		RateLimitWindow: time.Minute,
	})
	jwtSvc := auth.NewJWTService(auth.JWTConfig{
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
		MaxSessions:        5,
	})
	userSvc := &stubUserService{}
	authHandler := auth.NewHandler(otpSvc, jwtSvc, nil, userSvc)

	wsSvc := workspace.NewService(&stubWorkspaceRepo{}, &stubEventPublisher{}, &stubStorageBucket{})
	wsHandler := workspace.NewHandler(wsSvc)

	onbSvc := onboarding.NewService(&stubWorkspaceCreator{}, &stubOnboardingEventPub{})
	onbHandler := onboarding.NewHandler(onbSvc)

	invSvc := teamPkg.NewInvitationService(
		&stubInvitationRepo{},
		&stubEmailSender{},
		&stubMemberRepo{},
		&stubUserLookup{},
		teamPkg.InvitationConfig{ExpiryDuration: 7 * 24 * time.Hour},
	)
	teamHandler := teamPkg.NewHandler(invSvc, nil, nil)

	// Mount routes
	r.Mount("/auth", authHandler.Routes())

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(middleware.TenantContext(&stubDBContext{}, &stubAuditLog{}))
		r.Use(middleware.RequireState)

		r.Mount("/workspace", wsHandler.Routes())
		r.Mount("/team", teamHandler.Routes())
	})

	// Onboarding routes (exempt from RequireState)
	r.Group(func(r chi.Router) {
		r.Mount("/onboarding", onbHandler.Routes())
	})

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"ok"}`))
	})

	fmt.Println("RawDrive API starting on :8080")
	http.ListenAndServe(":8080", r)
}
