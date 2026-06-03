package service

// DSR (Data Subject Request) service — closes M10 E27-S3 (DPDPA/GDPR
// "rights of data principals" workflow).
//
// India's Digital Personal Data Protection Act 2023 and the EU GDPR both
// require operators to provide a clear, free, low-friction way for data
// subjects to:
//   1. Access — receive a copy of their personal data ("export")
//   2. Erase — request deletion of their personal data ("erasure")
//   3. Rectify — correct inaccurate personal data ("rectification")
//   4. Withdraw consent — covered by ConsentService.WithdrawConsent
//
// Data subjects in RawDrive are:
//   - Workspace owners and members (have a users row)
//   - Gallery viewers identified by email (no users row, only consent +
//     access_log + proofing_selections rows)
//
// This service handles BOTH cohorts. For users it builds an export bundle
// from all related rows; for visitors it queries by email.
//
// Status state machine: pending → processing → completed | failed
//
// Note: actual file purge (R2 objects, audit log redaction) happens in the
// background `dsr_purge_worker`. This service writes the request row, gates
// duplicate requests, generates the export bundle, and exposes status.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

// DSRRequestType is the kind of data subject request.
type DSRRequestType string

const (
	DSRTypeAccess  DSRRequestType = "access"
	DSRTypeErasure DSRRequestType = "erasure"
	DSRTypeRectify DSRRequestType = "rectify"
)

// DSRStatus is the lifecycle status of a request.
type DSRStatus string

const (
	DSRStatusPending    DSRStatus = "pending"
	DSRStatusProcessing DSRStatus = "processing"
	DSRStatusCompleted  DSRStatus = "completed"
	DSRStatusFailed     DSRStatus = "failed"
)

// DSRRequest is the persisted record of a data subject request.
type DSRRequest struct {
	ID            uuid.UUID       `json:"id"`
	SubjectEmail  string          `json:"subject_email"`
	SubjectUserID *uuid.UUID      `json:"subject_user_id,omitempty"`
	RequestType   DSRRequestType  `json:"request_type"`
	Status        DSRStatus       `json:"status"`
	RequestedAt   time.Time       `json:"requested_at"`
	CompletedAt   *time.Time      `json:"completed_at,omitempty"`
	ExportPayload json.RawMessage `json:"export_payload,omitempty"`
	FailureReason string          `json:"failure_reason,omitempty"`
}

// DSRPersister is the narrow surface this service needs from a repo.
// Tests inject a fake; production wires a real Postgres-backed impl.
type DSRPersister interface {
	Create(ctx context.Context, req *DSRRequest) error
	GetByID(ctx context.Context, id uuid.UUID) (*DSRRequest, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status DSRStatus, payload json.RawMessage, failureReason string) error
	FindRecentBySubject(ctx context.Context, email string, since time.Time) ([]*DSRRequest, error)
}

// SubjectDataExporter pulls the export payload from upstream tables.
// Implementations gather rows from users, workspaces, galleries, assets,
// proofing selections, consent records, audit logs (subject scope only).
// Returning a single map keeps the contract simple — the worker serialises
// the map as the bundle JSON delivered to the subject.
type SubjectDataExporter interface {
	ExportSubjectData(ctx context.Context, email string, userID *uuid.UUID) (map[string]any, error)
}

// DSRService coordinates DSR request lifecycles.
type DSRService struct {
	store    DSRPersister
	exporter SubjectDataExporter
	now      func() time.Time
}

// NewDSRService constructs the service. Exporter is optional — when nil,
// access requests fail with a clear error rather than producing an empty
// bundle. This forces operators to wire a real exporter before serving
// access requests, satisfying the DPDPA "completeness" requirement.
func NewDSRService(store DSRPersister) *DSRService {
	return &DSRService{store: store, now: time.Now}
}

// WithExporter wires in the data exporter used for access requests.
func (s *DSRService) WithExporter(e SubjectDataExporter) *DSRService {
	s.exporter = e
	return s
}

// WithClock overrides the clock for deterministic tests.
func (s *DSRService) WithClock(now func() time.Time) *DSRService {
	s.now = now
	return s
}

// Errors used by the service. Callers can errors.Is against these to
// translate to HTTP status codes.
var (
	ErrDSRInvalidEmail   = errors.New("dsr: subject_email required")
	ErrDSRInvalidType    = errors.New("dsr: invalid request_type")
	ErrDSRDuplicate      = errors.New("dsr: a request of this type was submitted within the past 24 hours")
	ErrDSRNotFound       = errors.New("dsr: request not found")
	ErrDSRExporterNotSet = errors.New("dsr: exporter not configured")
)

// SubmitRequest creates a new DSR row in pending state. Duplicate requests
// of the same type for the same subject within the past 24 hours are
// rejected to prevent enumeration attacks and accidental double-submits.
func (s *DSRService) SubmitRequest(ctx context.Context, email string, userID *uuid.UUID, reqType DSRRequestType) (*DSRRequest, error) {
	if email == "" {
		return nil, ErrDSRInvalidEmail
	}
	if reqType != DSRTypeAccess && reqType != DSRTypeErasure && reqType != DSRTypeRectify {
		return nil, ErrDSRInvalidType
	}

	cutoff := s.now().Add(-24 * time.Hour)
	recent, err := s.store.FindRecentBySubject(ctx, email, cutoff)
	if err != nil {
		return nil, fmt.Errorf("dsr lookup: %w", err)
	}
	for _, r := range recent {
		if r.RequestType == reqType && r.Status != DSRStatusFailed {
			return nil, ErrDSRDuplicate
		}
	}

	req := &DSRRequest{
		ID:            uuid.New(),
		SubjectEmail:  email,
		SubjectUserID: userID,
		RequestType:   reqType,
		Status:        DSRStatusPending,
		RequestedAt:   s.now(),
	}
	if err := s.store.Create(ctx, req); err != nil {
		return nil, fmt.Errorf("dsr create: %w", err)
	}
	return req, nil
}

// ProcessAccessRequest synchronously builds the export bundle for an
// access-type DSR. For erasure and rectify, the heavy work runs in a
// background worker (dsr_purge_worker) which calls UpdateStatus directly.
// This method is idempotent: re-processing a completed request returns
// the existing payload.
func (s *DSRService) ProcessAccessRequest(ctx context.Context, id uuid.UUID) (*DSRRequest, error) {
	req, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("dsr get: %w", err)
	}
	if req == nil {
		return nil, ErrDSRNotFound
	}
	if req.RequestType != DSRTypeAccess {
		return nil, fmt.Errorf("dsr: only access requests can be processed via this method")
	}
	if req.Status == DSRStatusCompleted {
		return req, nil // idempotent
	}
	if s.exporter == nil {
		_ = s.store.UpdateStatus(ctx, id, DSRStatusFailed, nil, "exporter not configured")
		return nil, ErrDSRExporterNotSet
	}

	// Mark in-progress so concurrent processors don't double-export.
	if err := s.store.UpdateStatus(ctx, id, DSRStatusProcessing, nil, ""); err != nil {
		return nil, fmt.Errorf("dsr mark processing: %w", err)
	}

	bundle, err := s.exporter.ExportSubjectData(ctx, req.SubjectEmail, req.SubjectUserID)
	if err != nil {
		_ = s.store.UpdateStatus(ctx, id, DSRStatusFailed, nil, err.Error())
		return nil, fmt.Errorf("dsr export: %w", err)
	}
	payload, err := json.Marshal(bundle)
	if err != nil {
		_ = s.store.UpdateStatus(ctx, id, DSRStatusFailed, nil, "marshal failed: "+err.Error())
		return nil, fmt.Errorf("dsr marshal: %w", err)
	}
	if err := s.store.UpdateStatus(ctx, id, DSRStatusCompleted, payload, ""); err != nil {
		return nil, fmt.Errorf("dsr complete: %w", err)
	}

	// Re-fetch so the caller sees the persisted final state including
	// completed_at and the populated payload.
	updated, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// GetRequest returns the current state of a request. Subjects use this to
// poll for completion of erasure/rectify requests.
func (s *DSRService) GetRequest(ctx context.Context, id uuid.UUID) (*DSRRequest, error) {
	req, err := s.store.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("dsr get: %w", err)
	}
	if req == nil {
		return nil, ErrDSRNotFound
	}
	return req, nil
}

// ─── Repository adapter ───────────────────────────────────────────────
//
// The Postgres-backed *repository.DSRRepo uses its own DSRRequest struct
// (declared in the repository package to avoid an import cycle, since
// service depends on repository, not the other way around). This adapter
// bridges *repository.DSRRepo to the service-level DSRPersister interface
// by converting between the two struct shapes.
//
// Use NewPostgresDSRStore in main.go:
//
//	dsrSvc := service.NewDSRService(service.NewPostgresDSRStore(dsrRepo))

// PostgresDSRStore wraps *repository.DSRRepo so it satisfies DSRPersister.
type PostgresDSRStore struct {
	repo *repository.DSRRepo
}

// NewPostgresDSRStore constructs the adapter.
func NewPostgresDSRStore(repo *repository.DSRRepo) *PostgresDSRStore {
	return &PostgresDSRStore{repo: repo}
}

// Create persists a DSR request. Converts the service struct to the repo
// struct one-for-one before delegating.
func (a *PostgresDSRStore) Create(ctx context.Context, req *DSRRequest) error {
	r := dsrServiceToRepo(req)
	if err := a.repo.Create(ctx, r); err != nil {
		return err
	}
	// Mirror generated fields back to caller (ID/RequestedAt may have been
	// set by the repo if blank).
	req.ID = r.ID
	req.RequestedAt = r.RequestedAt
	return nil
}

// GetByID fetches and converts.
func (a *PostgresDSRStore) GetByID(ctx context.Context, id uuid.UUID) (*DSRRequest, error) {
	r, err := a.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if r == nil {
		return nil, nil
	}
	return dsrRepoToService(r), nil
}

// UpdateStatus passes through after converting status to its string form.
func (a *PostgresDSRStore) UpdateStatus(ctx context.Context, id uuid.UUID, status DSRStatus, payload json.RawMessage, failureReason string) error {
	return a.repo.UpdateStatus(ctx, id, string(status), payload, failureReason)
}

// FindRecentBySubject queries and converts a slice.
func (a *PostgresDSRStore) FindRecentBySubject(ctx context.Context, email string, since time.Time) ([]*DSRRequest, error) {
	rows, err := a.repo.FindRecentBySubject(ctx, email, since)
	if err != nil {
		return nil, err
	}
	out := make([]*DSRRequest, 0, len(rows))
	for _, r := range rows {
		out = append(out, dsrRepoToService(r))
	}
	return out, nil
}

func dsrServiceToRepo(s *DSRRequest) *repository.DSRRequest {
	return &repository.DSRRequest{
		ID:            s.ID,
		SubjectEmail:  s.SubjectEmail,
		SubjectUserID: s.SubjectUserID,
		RequestType:   string(s.RequestType),
		Status:        string(s.Status),
		RequestedAt:   s.RequestedAt,
		CompletedAt:   s.CompletedAt,
		ExportPayload: s.ExportPayload,
		FailureReason: s.FailureReason,
	}
}

func dsrRepoToService(r *repository.DSRRequest) *DSRRequest {
	return &DSRRequest{
		ID:            r.ID,
		SubjectEmail:  r.SubjectEmail,
		SubjectUserID: r.SubjectUserID,
		RequestType:   DSRRequestType(r.RequestType),
		Status:        DSRStatus(r.Status),
		RequestedAt:   r.RequestedAt,
		CompletedAt:   r.CompletedAt,
		ExportPayload: r.ExportPayload,
		FailureReason: r.FailureReason,
	}
}
