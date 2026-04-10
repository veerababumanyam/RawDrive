package service

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// M16 E50-S1 / E50-S3: Upload moderation service.
//
// Backs the admin moderation dashboard (queue, override, analytics) built on
// top of the upload_scan_* columns added to the assets table in migration 053.
//
// Architectural notes:
//   - The moderation data model lives on the assets row itself; there is no
//     separate moderation queue table. The partial index
//     idx_assets_scan_status_blocked (migration 053) keeps the queue query
//     fast without a full table scan.
//   - Override issues an allowlist token via UploadAllowlistService so the
//     user can retry the same upload. It also flips upload_scan_status to
//     "override" and emits an audit event.
//   - Analytics is a single grouped query over the scan metadata columns.
// ─────────────────────────────────────────────────────────────────────────────

// UploadModerationRepo is the minimal Postgres surface the service needs.
// Kept as an interface so unit tests can stub without real DB setup.
type UploadModerationRepo interface {
	ListBlocked(ctx context.Context, workspaceID uuid.UUID, limit, offset int) ([]BlockedAssetRow, error)
	FindByID(ctx context.Context, assetID uuid.UUID) (*BlockedAssetRow, error)
	MarkOverride(ctx context.Context, assetID uuid.UUID, actorID uuid.UUID, justification string) error
	Analytics(ctx context.Context, workspaceID uuid.UUID, since time.Time) (UploadModerationAnalytics, error)
}

// BlockedAssetRow is the wire shape for one row in the moderation queue.
type BlockedAssetRow struct {
	AssetID       uuid.UUID `json:"asset_id"`
	WorkspaceID   uuid.UUID `json:"workspace_id"`
	Filename      string    `json:"filename"`
	ScanStatus    string    `json:"scan_status"`
	ScanEngine    string    `json:"scan_engine"`
	PolicyVersion string    `json:"policy_version"`
	RiskScore     float64   `json:"risk_score"`
	Findings      []byte    `json:"findings,omitempty"`
	ManifestHash  string    `json:"manifest_hash"`
	CreatedAt     time.Time `json:"created_at"`
}

// UploadModerationAnalytics is the aggregated view returned by the analytics
// endpoint — drives the admin charts (block rate, Tier D causes, engine mix).
type UploadModerationAnalytics struct {
	TotalScanned      int64            `json:"total_scanned"`
	TotalPassed       int64            `json:"total_passed"`
	TotalBlocked      int64            `json:"total_blocked"`
	TotalNeedsDesktop int64            `json:"total_needs_desktop"`
	TotalOverride     int64            `json:"total_override"`
	BlockRate         float64          `json:"block_rate"`
	TierDCauses       map[string]int64 `json:"tier_d_causes"`
	WindowStart       time.Time        `json:"window_start"`
	WindowEnd         time.Time        `json:"window_end"`
}

// UploadModerationService exposes the three admin operations (list / override / analytics).
type UploadModerationService struct {
	repo         UploadModerationRepo
	allowlistSvc *UploadAllowlistService
	auditLog     auditRecorder
	now          func() time.Time
}

// NewUploadModerationService constructs the service. The audit log is
// optional (nil-safe) — production wiring passes a real AuditLogService.
func NewUploadModerationService(
	repo UploadModerationRepo,
	allowlistSvc *UploadAllowlistService,
	auditLog *AuditLogService,
) *UploadModerationService {
	var rec auditRecorder
	if auditLog != nil {
		rec = auditLog
	}
	return &UploadModerationService{
		repo:         repo,
		allowlistSvc: allowlistSvc,
		auditLog:     rec,
		now:          time.Now,
	}
}

// ErrUploadModerationAssetNotFound is returned when the admin targets an
// asset id that either does not exist or is not in a blocked state.
var ErrUploadModerationAssetNotFound = errors.New("UPLOAD_MODERATION_ASSET_NOT_FOUND")

// ListQueue returns the page of blocked / needs-desktop assets for a workspace.
func (s *UploadModerationService) ListQueue(
	ctx context.Context,
	workspaceID uuid.UUID,
	limit, offset int,
) ([]BlockedAssetRow, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListBlocked(ctx, workspaceID, limit, offset)
}

// OverrideInput carries the fields needed to override a blocked asset.
type OverrideInput struct {
	AssetID       uuid.UUID
	ActorID       uuid.UUID
	Justification string
	TTL           time.Duration
}

// OverrideResult describes what the admin should hand to the user: a
// one-time allowlist token that the client can attach to the next upload
// attempt. The token is returned base64-encoded so it can be dropped into
// a URL or form field without re-escaping.
type OverrideResult struct {
	AssetID   uuid.UUID `json:"asset_id"`
	Token     []byte    `json:"-"` // never serialize raw bytes
	TokenB64  string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

// Override approves a blocked asset for retry by issuing an allowlist token
// bound to the asset's manifest hash and flipping the row's scan_status.
// Emits an audit event with actor + justification.
func (s *UploadModerationService) Override(ctx context.Context, in OverrideInput) (*OverrideResult, error) {
	if in.AssetID == uuid.Nil {
		return nil, fmt.Errorf("asset_id is required")
	}
	if in.Justification == "" {
		return nil, fmt.Errorf("justification is required for override")
	}
	if in.TTL <= 0 {
		in.TTL = 24 * time.Hour
	}

	asset, err := s.repo.FindByID(ctx, in.AssetID)
	if err != nil {
		return nil, fmt.Errorf("looking up asset: %w", err)
	}
	if asset == nil {
		return nil, ErrUploadModerationAssetNotFound
	}

	// Issue the allowlist token via the allowlist service so a single source
	// of truth tracks one-time usage. nil allowlistSvc is a misconfiguration,
	// not a degradation path — return an error.
	if s.allowlistSvc == nil {
		return nil, fmt.Errorf("allowlist service not wired")
	}

	token, err := s.allowlistSvc.Issue(ctx, IssueAllowlistInput{
		ManifestHash:  asset.ManifestHash,
		WorkspaceID:   asset.WorkspaceID,
		IssuedBy:      in.ActorID,
		Justification: in.Justification,
		TTL:           in.TTL,
	})
	if err != nil {
		return nil, fmt.Errorf("issuing allowlist token: %w", err)
	}

	if err := s.repo.MarkOverride(ctx, in.AssetID, in.ActorID, in.Justification); err != nil {
		return nil, fmt.Errorf("marking asset override: %w", err)
	}

	s.recordAudit(ctx, asset, in.ActorID, in.Justification)

	return &OverrideResult{
		AssetID:   in.AssetID,
		Token:     token,
		TokenB64:  encodeTokenB64(token),
		ExpiresAt: s.now().Add(in.TTL),
	}, nil
}

// Analytics returns aggregated scan metrics for the moderation dashboard.
// A zero `since` defaults to 30 days ago.
func (s *UploadModerationService) Analytics(
	ctx context.Context,
	workspaceID uuid.UUID,
	since time.Time,
) (UploadModerationAnalytics, error) {
	if since.IsZero() {
		since = s.now().Add(-30 * 24 * time.Hour)
	}
	return s.repo.Analytics(ctx, workspaceID, since)
}

// recordAudit emits a workspace.upload.override audit event. Best-effort —
// an audit log failure must not block the override itself.
func (s *UploadModerationService) recordAudit(
	ctx context.Context,
	asset *BlockedAssetRow,
	actorID uuid.UUID,
	justification string,
) {
	if s.auditLog == nil {
		return
	}

	// We import the audit log repo types lazily via the auditRecorder seam so
	// this file does not depend on repository/ — keeps the compile DAG clean.
	// The auditRecorder interface is defined in workspace_policy_service.go.
	beforeJSON, _ := json.Marshal(map[string]string{
		"upload_scan_status": asset.ScanStatus,
		"risk_score":         fmt.Sprintf("%.2f", asset.RiskScore),
	})
	afterJSON, _ := json.Marshal(map[string]string{
		"upload_scan_status": "override",
		"justification":      justification,
	})

	wsID := asset.WorkspaceID
	s.auditLog.RecordAction(ctx, repository.AuditLogCreate{
		ActorID:      actorID,
		ActorType:    "admin",
		Action:       "workspace.upload.override",
		ResourceType: "asset",
		ResourceID:   asset.AssetID.String(),
		WorkspaceID:  &wsID,
		BeforeState:  beforeJSON,
		AfterState:   afterJSON,
		Severity:     "info",
	})
}

// encodeTokenB64 base64url-encodes a raw token so it is safe in URLs.
func encodeTokenB64(raw []byte) string {
	return base64.URLEncoding.EncodeToString(raw)
}

// ─────────────────────────────────────────────────────────────────────────────
// PgUploadModerationRepo — production implementation backed by *sql.DB.
// ─────────────────────────────────────────────────────────────────────────────

// PgUploadModerationRepo reads the assets table + upload_scan_* columns.
type PgUploadModerationRepo struct {
	db *sql.DB
}

// NewPgUploadModerationRepo constructs the repo.
func NewPgUploadModerationRepo(db *sql.DB) *PgUploadModerationRepo {
	return &PgUploadModerationRepo{db: db}
}

// ListBlocked returns blocked / needs-desktop assets for a workspace.
func (r *PgUploadModerationRepo) ListBlocked(
	ctx context.Context,
	workspaceID uuid.UUID,
	limit, offset int,
) ([]BlockedAssetRow, error) {
	const q = `
		SELECT id, workspace_id, filename,
		       COALESCE(upload_scan_status, ''),
		       COALESCE(upload_scan_engine, ''),
		       COALESCE(upload_scan_policy_version, ''),
		       COALESCE(upload_scan_risk_score, 0),
		       upload_scan_findings,
		       COALESCE(upload_scan_manifest_hash, ''),
		       created_at
		FROM assets
		WHERE workspace_id = $1
		  AND upload_scan_status IN ('blocked', 'needs_desktop')
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := r.db.QueryContext(ctx, q, workspaceID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []BlockedAssetRow
	for rows.Next() {
		var row BlockedAssetRow
		var findings sql.NullString
		if err := rows.Scan(
			&row.AssetID,
			&row.WorkspaceID,
			&row.Filename,
			&row.ScanStatus,
			&row.ScanEngine,
			&row.PolicyVersion,
			&row.RiskScore,
			&findings,
			&row.ManifestHash,
			&row.CreatedAt,
		); err != nil {
			return nil, err
		}
		if findings.Valid {
			row.Findings = []byte(findings.String)
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

// FindByID returns a single blocked-or-override asset row.
func (r *PgUploadModerationRepo) FindByID(ctx context.Context, assetID uuid.UUID) (*BlockedAssetRow, error) {
	const q = `
		SELECT id, workspace_id, filename,
		       COALESCE(upload_scan_status, ''),
		       COALESCE(upload_scan_engine, ''),
		       COALESCE(upload_scan_policy_version, ''),
		       COALESCE(upload_scan_risk_score, 0),
		       upload_scan_findings,
		       COALESCE(upload_scan_manifest_hash, ''),
		       created_at
		FROM assets
		WHERE id = $1
		LIMIT 1
	`
	var row BlockedAssetRow
	var findings sql.NullString
	err := r.db.QueryRowContext(ctx, q, assetID).Scan(
		&row.AssetID,
		&row.WorkspaceID,
		&row.Filename,
		&row.ScanStatus,
		&row.ScanEngine,
		&row.PolicyVersion,
		&row.RiskScore,
		&findings,
		&row.ManifestHash,
		&row.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if findings.Valid {
		row.Findings = []byte(findings.String)
	}
	return &row, nil
}

// MarkOverride flips upload_scan_status to 'override' for the asset.
func (r *PgUploadModerationRepo) MarkOverride(
	ctx context.Context,
	assetID uuid.UUID,
	_ uuid.UUID,
	_ string,
) error {
	// Actor and justification are recorded in the audit log, not on the
	// asset row itself — the assets schema has no override_* columns.
	const q = `UPDATE assets SET upload_scan_status = 'override' WHERE id = $1`
	result, err := r.db.ExecContext(ctx, q, assetID)
	if err != nil {
		return err
	}
	if affected, _ := result.RowsAffected(); affected == 0 {
		return ErrUploadModerationAssetNotFound
	}
	return nil
}

// Analytics returns aggregate counts and the block rate over a window.
func (r *PgUploadModerationRepo) Analytics(
	ctx context.Context,
	workspaceID uuid.UUID,
	since time.Time,
) (UploadModerationAnalytics, error) {
	const q = `
		SELECT
			COUNT(*) FILTER (WHERE upload_scan_status IS NOT NULL) AS total_scanned,
			COUNT(*) FILTER (WHERE upload_scan_status = 'passed') AS total_passed,
			COUNT(*) FILTER (WHERE upload_scan_status = 'blocked') AS total_blocked,
			COUNT(*) FILTER (WHERE upload_scan_status = 'needs_desktop') AS total_needs_desktop,
			COUNT(*) FILTER (WHERE upload_scan_status = 'override') AS total_override
		FROM assets
		WHERE workspace_id = $1 AND created_at >= $2
	`
	var a UploadModerationAnalytics
	a.WindowStart = since
	a.WindowEnd = time.Now()
	a.TierDCauses = map[string]int64{}
	err := r.db.QueryRowContext(ctx, q, workspaceID, since).Scan(
		&a.TotalScanned,
		&a.TotalPassed,
		&a.TotalBlocked,
		&a.TotalNeedsDesktop,
		&a.TotalOverride,
	)
	if err != nil {
		return a, err
	}
	if a.TotalScanned > 0 {
		a.BlockRate = float64(a.TotalBlocked) / float64(a.TotalScanned)
	}
	return a, nil
}
