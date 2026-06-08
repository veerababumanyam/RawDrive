package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPricingChangeRequestNotFound = errors.New("pricing change request not found")
var ErrPricingChangeRequestInvalidStatus = errors.New("pricing change request invalid status")

type PricingChangeRequestService struct {
	db *pgxpool.Pool
}

func NewPricingChangeRequestService(db *pgxpool.Pool) *PricingChangeRequestService {
	return &PricingChangeRequestService{db: db}
}

type PricingChangeRequest struct {
	ID              uuid.UUID      `json:"id"`
	RequestType     string         `json:"request_type"`
	TargetType      string         `json:"target_type"`
	TargetKey       string         `json:"target_key"`
	Status          string         `json:"status"`
	SubmittedBy     *uuid.UUID     `json:"submitted_by,omitempty"`
	SubmittedAt     *time.Time     `json:"submitted_at,omitempty"`
	ApprovedBy      *uuid.UUID     `json:"approved_by,omitempty"`
	ApprovedAt      *time.Time     `json:"approved_at,omitempty"`
	RejectedBy      *uuid.UUID     `json:"rejected_by,omitempty"`
	RejectedAt      *time.Time     `json:"rejected_at,omitempty"`
	RejectionReason string         `json:"rejection_reason,omitempty"`
	ApprovalComment string         `json:"approval_comment,omitempty"`
	EffectiveFrom   *time.Time     `json:"effective_from,omitempty"`
	BeforeState     map[string]any `json:"before_state"`
	AfterState      map[string]any `json:"after_state"`
	ImpactSummary   map[string]any `json:"impact_summary"`
	EmailPreview    map[string]any `json:"email_preview"`
	PublishedAt     *time.Time     `json:"published_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type CreatePricingChangeRequestInput struct {
	RequestType   string         `json:"request_type"`
	TargetType    string         `json:"target_type"`
	TargetKey     string         `json:"target_key"`
	BeforeState   map[string]any `json:"before_state"`
	AfterState    map[string]any `json:"after_state"`
	ImpactSummary map[string]any `json:"impact_summary"`
	EmailPreview  map[string]any `json:"email_preview"`
	ActorID       *uuid.UUID     `json:"-"`
}

func (s *PricingChangeRequestService) Create(ctx context.Context, in CreatePricingChangeRequestInput) (PricingChangeRequest, error) {
	if s == nil || s.db == nil {
		return PricingChangeRequest{}, errors.New("pricing change request database not configured")
	}
	if strings.TrimSpace(in.RequestType) == "" || strings.TrimSpace(in.TargetType) == "" || strings.TrimSpace(in.TargetKey) == "" {
		return PricingChangeRequest{}, errors.New("request_type, target_type, and target_key are required")
	}
	before, err := marshalJSONMap(in.BeforeState)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	after, err := marshalJSONMap(in.AfterState)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	impact, err := marshalJSONMap(in.ImpactSummary)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	email, err := marshalJSONMap(in.EmailPreview)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	row := s.db.QueryRow(ctx, `
		INSERT INTO pricing_change_requests (
			request_type, target_type, target_key, submitted_by,
			before_state, after_state, impact_summary, email_preview
		) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb)
		RETURNING id, request_type, target_type, target_key, status,
		          submitted_by, submitted_at, approved_by, approved_at,
		          rejected_by, rejected_at, rejection_reason, approval_comment,
		          effective_from, before_state, after_state, impact_summary,
		          email_preview, published_at, created_at, updated_at
	`, strings.TrimSpace(in.RequestType), strings.TrimSpace(in.TargetType), strings.TrimSpace(in.TargetKey),
		in.ActorID, before, after, impact, email)
	req, err := scanPricingChangeRequest(row)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	_ = s.recordAudit(ctx, req.ID, req.TargetType, req.TargetKey, "draft_created", in.ActorID, "", req.AfterState)
	return req, nil
}

func (s *PricingChangeRequestService) List(ctx context.Context, status string) ([]PricingChangeRequest, error) {
	if s == nil || s.db == nil {
		return nil, errors.New("pricing change request database not configured")
	}
	query := `
		SELECT id, request_type, target_type, target_key, status,
		       submitted_by, submitted_at, approved_by, approved_at,
		       rejected_by, rejected_at, rejection_reason, approval_comment,
		       effective_from, before_state, after_state, impact_summary,
		       email_preview, published_at, created_at, updated_at
		  FROM pricing_change_requests`
	args := []any{}
	if strings.TrimSpace(status) != "" {
		query += ` WHERE status = $1`
		args = append(args, strings.TrimSpace(status))
	}
	query += ` ORDER BY created_at DESC LIMIT 200`
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var requests []PricingChangeRequest
	for rows.Next() {
		req, err := scanPricingChangeRequest(rows)
		if err != nil {
			return nil, err
		}
		requests = append(requests, req)
	}
	return requests, rows.Err()
}

func (s *PricingChangeRequestService) Get(ctx context.Context, id uuid.UUID) (PricingChangeRequest, error) {
	if s == nil || s.db == nil {
		return PricingChangeRequest{}, errors.New("pricing change request database not configured")
	}
	row := s.db.QueryRow(ctx, `
		SELECT id, request_type, target_type, target_key, status,
		       submitted_by, submitted_at, approved_by, approved_at,
		       rejected_by, rejected_at, rejection_reason, approval_comment,
		       effective_from, before_state, after_state, impact_summary,
		       email_preview, published_at, created_at, updated_at
		  FROM pricing_change_requests
		 WHERE id = $1
	`, id)
	req, err := scanPricingChangeRequest(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PricingChangeRequest{}, ErrPricingChangeRequestNotFound
	}
	return req, err
}

func (s *PricingChangeRequestService) Submit(ctx context.Context, id uuid.UUID, actorID *uuid.UUID) (PricingChangeRequest, error) {
	return s.transition(ctx, id, actorID, "pending_approval", "", "", nil, "submitted")
}

func (s *PricingChangeRequestService) Approve(ctx context.Context, id uuid.UUID, actorID *uuid.UUID, comment string, effectiveFrom *time.Time) (PricingChangeRequest, error) {
	if strings.TrimSpace(comment) == "" {
		return PricingChangeRequest{}, errors.New("approval comment required")
	}
	return s.transition(ctx, id, actorID, "approved", strings.TrimSpace(comment), "", effectiveFrom, "approved")
}

func (s *PricingChangeRequestService) Reject(ctx context.Context, id uuid.UUID, actorID *uuid.UUID, reason string) (PricingChangeRequest, error) {
	if strings.TrimSpace(reason) == "" {
		return PricingChangeRequest{}, errors.New("rejection reason required")
	}
	return s.transition(ctx, id, actorID, "rejected", "", strings.TrimSpace(reason), nil, "rejected")
}

func (s *PricingChangeRequestService) Publish(ctx context.Context, id uuid.UUID, actorID *uuid.UUID) (PricingChangeRequest, error) {
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	req, err := s.getForUpdate(ctx, tx, id)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	if req.Status != "approved" && req.Status != "scheduled" {
		return PricingChangeRequest{}, ErrPricingChangeRequestInvalidStatus
	}
	if req.EffectiveFrom != nil && req.EffectiveFrom.After(time.Now().UTC()) {
		req, err = updatePricingChangeRequestStatus(ctx, tx, id, "scheduled", actorID, req.ApprovalComment, "", req.EffectiveFrom)
		if err != nil {
			return PricingChangeRequest{}, err
		}
		if err := insertPricingAuditEvent(ctx, tx, &id, req.TargetType, req.TargetKey, "scheduled", actorID, "", req.AfterState); err != nil {
			return PricingChangeRequest{}, err
		}
		return req, tx.Commit(ctx)
	}
	if err := s.applyPublishedChange(ctx, tx, req); err != nil {
		return PricingChangeRequest{}, err
	}
	row := tx.QueryRow(ctx, `
		UPDATE pricing_change_requests
		   SET status = 'published', published_at = NOW(), updated_at = NOW()
		 WHERE id = $1
		RETURNING id, request_type, target_type, target_key, status,
		          submitted_by, submitted_at, approved_by, approved_at,
		          rejected_by, rejected_at, rejection_reason, approval_comment,
		          effective_from, before_state, after_state, impact_summary,
		          email_preview, published_at, created_at, updated_at
	`, id)
	published, err := scanPricingChangeRequest(row)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	if err := insertPricingAuditEvent(ctx, tx, &id, published.TargetType, published.TargetKey, "published", actorID, "", published.AfterState); err != nil {
		return PricingChangeRequest{}, err
	}
	if err := enqueuePricingChangeNotices(ctx, tx, published); err != nil {
		return PricingChangeRequest{}, err
	}
	return published, tx.Commit(ctx)
}

func (s *PricingChangeRequestService) PreviewCatalog(ctx context.Context, id uuid.UUID) (PricingCatalog, error) {
	req, err := s.Get(ctx, id)
	if err != nil {
		return PricingCatalog{}, err
	}
	catalogSvc := NewPricingCatalogService(s.db)
	catalog, err := catalogSvc.PublicCatalog(ctx)
	if err != nil {
		return PricingCatalog{}, err
	}
	if req.TargetType == "subscription_plan" && (req.RequestType == "plan_update" || req.RequestType == "plan_create") {
		plan, err := planCatalogEntryFromMap(req.AfterState)
		if err != nil {
			return PricingCatalog{}, err
		}
		replaced := false
		for i := range catalog.Plans {
			if catalog.Plans[i].Tier == plan.Tier {
				catalog.Plans[i] = plan
				replaced = true
			}
		}
		if !replaced {
			catalog.Plans = append(catalog.Plans, plan)
		}
	}
	if req.TargetType == "billing_product" && (req.RequestType == "product_update" || req.RequestType == "product_create") {
		product, err := billingProductFromMap(req.AfterState)
		if err != nil {
			return PricingCatalog{}, err
		}
		product.VersionID = "preview"
		product.Version = 0
		product.EffectiveFrom = time.Now().UTC()
		replaceProductInCatalog(&catalog, product)
	}
	if req.TargetType == "billing_product" && req.RequestType == "product_archive" {
		removeProductFromCatalog(&catalog, strings.TrimSpace(req.TargetKey))
	}
	return catalog, nil
}

func (s *PricingChangeRequestService) transition(ctx context.Context, id uuid.UUID, actorID *uuid.UUID, status string, approvalComment string, rejectionReason string, effectiveFrom *time.Time, event string) (PricingChangeRequest, error) {
	req, err := updatePricingChangeRequestStatus(ctx, s.db, id, status, actorID, approvalComment, rejectionReason, effectiveFrom)
	if err != nil {
		return PricingChangeRequest{}, err
	}
	_ = s.recordAudit(ctx, req.ID, req.TargetType, req.TargetKey, event, actorID, firstNonEmpty(approvalComment, rejectionReason), req.AfterState)
	return req, nil
}

func updatePricingChangeRequestStatus(ctx context.Context, q subscriptionCatalogBackfillDB, id uuid.UUID, status string, actorID *uuid.UUID, approvalComment string, rejectionReason string, effectiveFrom *time.Time) (PricingChangeRequest, error) {
	var row pgx.Row
	switch status {
	case "pending_approval":
		row = q.QueryRow(ctx, `
			UPDATE pricing_change_requests
			   SET status = 'pending_approval', submitted_by = COALESCE($2::uuid, submitted_by),
			       submitted_at = NOW(), updated_at = NOW()
			 WHERE id = $1 AND status = 'draft'
			RETURNING id, request_type, target_type, target_key, status,
			          submitted_by, submitted_at, approved_by, approved_at,
			          rejected_by, rejected_at, rejection_reason, approval_comment,
			          effective_from, before_state, after_state, impact_summary,
			          email_preview, published_at, created_at, updated_at
		`, id, actorID)
	case "approved":
		row = q.QueryRow(ctx, `
			UPDATE pricing_change_requests
			   SET status = 'approved', approved_by = $2::uuid, approved_at = NOW(),
			       approval_comment = $3::text, effective_from = COALESCE($4::timestamptz, NOW()),
			       updated_at = NOW()
			 WHERE id = $1 AND status = 'pending_approval'
			RETURNING id, request_type, target_type, target_key, status,
			          submitted_by, submitted_at, approved_by, approved_at,
			          rejected_by, rejected_at, rejection_reason, approval_comment,
			          effective_from, before_state, after_state, impact_summary,
			          email_preview, published_at, created_at, updated_at
		`, id, actorID, approvalComment, effectiveFrom)
	case "rejected":
		row = q.QueryRow(ctx, `
			UPDATE pricing_change_requests
			   SET status = 'rejected', rejected_by = $2::uuid, rejected_at = NOW(),
			       rejection_reason = $3::text, updated_at = NOW()
			 WHERE id = $1 AND status = 'pending_approval'
			RETURNING id, request_type, target_type, target_key, status,
			          submitted_by, submitted_at, approved_by, approved_at,
			          rejected_by, rejected_at, rejection_reason, approval_comment,
			          effective_from, before_state, after_state, impact_summary,
			          email_preview, published_at, created_at, updated_at
		`, id, actorID, rejectionReason)
	case "scheduled":
		row = q.QueryRow(ctx, `
			UPDATE pricing_change_requests
			   SET status = 'scheduled', updated_at = NOW()
			 WHERE id = $1 AND status IN ('approved', 'scheduled')
			RETURNING id, request_type, target_type, target_key, status,
			          submitted_by, submitted_at, approved_by, approved_at,
			          rejected_by, rejected_at, rejection_reason, approval_comment,
			          effective_from, before_state, after_state, impact_summary,
			          email_preview, published_at, created_at, updated_at
		`, id)
	default:
		return PricingChangeRequest{}, ErrPricingChangeRequestInvalidStatus
	}
	req, err := scanPricingChangeRequest(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PricingChangeRequest{}, ErrPricingChangeRequestInvalidStatus
	}
	return req, err
}

func (s *PricingChangeRequestService) getForUpdate(ctx context.Context, q subscriptionCatalogBackfillDB, id uuid.UUID) (PricingChangeRequest, error) {
	row := q.QueryRow(ctx, `
		SELECT id, request_type, target_type, target_key, status,
		       submitted_by, submitted_at, approved_by, approved_at,
		       rejected_by, rejected_at, rejection_reason, approval_comment,
		       effective_from, before_state, after_state, impact_summary,
		       email_preview, published_at, created_at, updated_at
		  FROM pricing_change_requests
		 WHERE id = $1
		 FOR UPDATE
	`, id)
	req, err := scanPricingChangeRequest(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return PricingChangeRequest{}, ErrPricingChangeRequestNotFound
	}
	return req, err
}

func (s *PricingChangeRequestService) applyPublishedChange(ctx context.Context, q subscriptionCatalogBackfillDB, req PricingChangeRequest) error {
	switch req.TargetType {
	case "subscription_plan":
		return publishSubscriptionPlanChange(ctx, q, req)
	case "billing_product":
		return publishBillingProductChange(ctx, q, req)
	default:
		return nil
	}
}

func publishSubscriptionPlanChange(ctx context.Context, q subscriptionCatalogBackfillDB, req PricingChangeRequest) error {
	plan, err := planCatalogEntryFromMap(req.AfterState)
	if err != nil {
		return err
	}
	if err := validateGovernedPlan(plan); err != nil {
		return err
	}
	if req.RequestType == "plan_archive" {
		if _, err := q.Exec(ctx, `
			UPDATE subscription_plans
			   SET active = FALSE, self_serve = FALSE, updated_at = NOW()
			 WHERE tier = $1
		`, req.TargetKey); err != nil {
			return err
		}
		return nil
	}
	_, err = q.Exec(ctx, `
		INSERT INTO subscription_plans (
			tier, name, description, currency, monthly_price_paise,
			annual_price_paise, quota_bytes, gallery_limit, client_limit,
			features, popular, paid, active, self_serve, trial_days, rank
		) VALUES (
			$1::text, $2::text, $3::text, $4::text, $5::bigint, $6::bigint,
			$7::bigint, $8::integer, $9::integer, $10::text[], $11::boolean,
			$12::boolean, $13::boolean, $14::boolean, $15::integer, $16::integer
		)
		ON CONFLICT (tier) DO UPDATE
		   SET name = EXCLUDED.name,
		       description = EXCLUDED.description,
		       currency = EXCLUDED.currency,
		       monthly_price_paise = EXCLUDED.monthly_price_paise,
		       annual_price_paise = EXCLUDED.annual_price_paise,
		       quota_bytes = EXCLUDED.quota_bytes,
		       gallery_limit = EXCLUDED.gallery_limit,
		       client_limit = EXCLUDED.client_limit,
		       features = EXCLUDED.features,
		       popular = EXCLUDED.popular,
		       paid = EXCLUDED.paid,
		       active = EXCLUDED.active,
		       self_serve = EXCLUDED.self_serve,
		       trial_days = EXCLUDED.trial_days,
		       rank = EXCLUDED.rank,
		       updated_at = NOW()
	`, plan.Tier, plan.Name, plan.Description, plan.Currency, plan.MonthlyPricePaise,
		plan.AnnualPricePaise, plan.QuotaBytes, plan.GalleryLimit, plan.ClientLimit,
		plan.Features, plan.Popular, plan.Paid, plan.Active, plan.SelfServe,
		plan.TrialDays, plan.Rank)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		WITH next_version AS (
			SELECT COALESCE(MAX(version), 0) + 1 AS version
			  FROM subscription_plan_versions
			 WHERE tier = $1
		)
		INSERT INTO subscription_plan_versions (
			tier, version, status, name, description, currency,
			monthly_price_paise, annual_price_paise, quota_bytes,
			gallery_limit, client_limit, features, popular, paid, active,
			self_serve, trial_days, rank, effective_from, approved_at
		)
		SELECT $1::text, next_version.version, 'approved'::text, $2::text, $3::text, $4::text,
		       $5::bigint, $6::bigint, $7::bigint, $8::integer, $9::integer,
		       $10::text[], $11::boolean, $12::boolean, $13::boolean,
		       $14::boolean, $15::integer, $16::integer,
		       COALESCE($17::timestamptz, NOW()), NOW()
		  FROM next_version
	`, plan.Tier, plan.Name, plan.Description, plan.Currency, plan.MonthlyPricePaise,
		plan.AnnualPricePaise, plan.QuotaBytes, plan.GalleryLimit, plan.ClientLimit,
		plan.Features, plan.Popular, plan.Paid, plan.Active, plan.SelfServe,
		plan.TrialDays, plan.Rank, req.EffectiveFrom)
	return err
}

func publishBillingProductChange(ctx context.Context, q subscriptionCatalogBackfillDB, req PricingChangeRequest) error {
	if req.RequestType == "product_archive" {
		code := strings.TrimSpace(req.TargetKey)
		if code == "" {
			return errors.New("product code required")
		}
		if _, err := q.Exec(ctx, `
			UPDATE billing_products
			   SET active = FALSE, archived_at = NOW(), updated_at = NOW()
			 WHERE code = $1
		`, code); err != nil {
			return err
		}
		var archivedVersion int
		err := q.QueryRow(ctx, `
			WITH current_version AS (
				SELECT name, description, currency, price_paise, billing_interval,
				       metadata, rank
				  FROM billing_product_versions
				 WHERE product_code = $1
				   AND status IN ('approved', 'published')
				   AND archived_at IS NULL
				 ORDER BY effective_from DESC, version DESC
				 LIMIT 1
			), next_version AS (
				SELECT COALESCE(MAX(version), 0) + 1 AS version
				  FROM billing_product_versions
				 WHERE product_code = $1
			)
			INSERT INTO billing_product_versions (
				product_code, version, status, name, description, currency,
				price_paise, billing_interval, metadata, active, rank,
				effective_from, approved_at, archived_at
			)
			SELECT $1::text, next_version.version, 'approved'::text, current_version.name,
			       current_version.description, current_version.currency,
			       current_version.price_paise, current_version.billing_interval,
			       current_version.metadata, FALSE, current_version.rank,
			       COALESCE($2::timestamptz, NOW()), NOW(), NOW()
			  FROM current_version, next_version
			RETURNING version
		`, code, req.EffectiveFrom).Scan(&archivedVersion)
		if errors.Is(err, pgx.ErrNoRows) {
			return errors.New("product version not found")
		}
		return err
	}

	product, err := billingProductFromMap(req.AfterState)
	if err != nil {
		return err
	}
	if strings.TrimSpace(req.TargetKey) != "" && req.RequestType != "product_create" && product.Code != strings.TrimSpace(req.TargetKey) {
		return errors.New("product code cannot be changed")
	}
	metadataJSON, err := marshalJSONMap(product.Metadata)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		INSERT INTO billing_products (
			code, product_type, name, description, active, rank, archived_at
		) VALUES ($1::text, $2::text, $3::text, $4::text, $5::boolean, $6::integer, NULL)
		ON CONFLICT (code) DO UPDATE
		   SET product_type = billing_products.product_type,
		       name = EXCLUDED.name,
		       description = EXCLUDED.description,
		       active = EXCLUDED.active,
		       rank = EXCLUDED.rank,
		       archived_at = CASE WHEN EXCLUDED.active THEN NULL ELSE billing_products.archived_at END,
		       updated_at = NOW()
	`, product.Code, product.ProductType, product.Name, product.Description, product.Active, product.Rank)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		WITH next_version AS (
			SELECT COALESCE(MAX(version), 0) + 1 AS version
			  FROM billing_product_versions
			 WHERE product_code = $1
		)
		INSERT INTO billing_product_versions (
			product_code, version, status, name, description, currency,
			price_paise, billing_interval, metadata, active, rank,
			effective_from, approved_at
		)
		SELECT $1::text, next_version.version, 'approved'::text, $2::text, $3::text, $4::text,
		       $5::bigint, $6::text, $7::jsonb, $8::boolean, $9::integer,
		       COALESCE($10::timestamptz, NOW()), NOW()
		  FROM next_version
	`, product.Code, product.Name, product.Description, product.Currency,
		product.PricePaise, product.BillingInterval, metadataJSON, product.Active,
		product.Rank, req.EffectiveFrom)
	return err
}

func enqueuePricingChangeNotices(ctx context.Context, q subscriptionCatalogBackfillDB, req PricingChangeRequest) error {
	if req.TargetType != "subscription_plan" || strings.TrimSpace(req.TargetKey) == "" {
		return nil
	}
	var batchID uuid.UUID
	if err := q.QueryRow(ctx, `
		INSERT INTO pricing_email_batches (
		    pricing_change_request_id, template_key, template_version,
		    recipient_count, status, metadata
		)
		SELECT $1::uuid, 'pricing_change_notice', '2026-06-06',
		       COUNT(DISTINCT s.workspace_id), 'queued',
		       jsonb_build_object('target_type', $2::text, 'target_key', $3::text)
		  FROM subscriptions s
		 WHERE s.status = 'active'
		   AND s.tier_slug = $3::text
		RETURNING id`,
		req.ID, req.TargetType, req.TargetKey,
	).Scan(&batchID); err != nil {
		return err
	}
	_, err := q.Exec(ctx, `
		INSERT INTO billing_lifecycle_jobs (
		    job_type, target_type, target_id, workspace_id, user_id,
		    due_at, proof_snapshot, metadata
		)
		SELECT 'pricing_change_notice', 'workspace', s.workspace_id, s.workspace_id,
		       w.owner_id, NOW(),
		       jsonb_build_object(
		           'pricing_change_request_id', $1::text,
		           'target_key', $2::text,
		           'notice_channel', 'email'
		       ),
		       jsonb_build_object(
		           'source', 'pricing_change_publish',
		           'pricing_email_batch_id', $3::text
		       )
		  FROM subscriptions s
		  JOIN workspaces w ON w.id = s.workspace_id
		 WHERE s.status = 'active'
		   AND s.tier_slug = $2::text`,
		req.ID, req.TargetKey, batchID,
	)
	return err
}

func validateGovernedPlan(plan PlanCatalogEntry) error {
	switch plan.Tier {
	case "free":
		if plan.Paid || plan.MonthlyPricePaise != 0 || plan.AnnualPricePaise != 0 {
			return errors.New("starter/free plan cannot be made paid")
		}
	case "pay_per_event":
		if plan.SelfServe {
			return errors.New("pay per event cannot be a subscription signup or upgrade target")
		}
	}
	return nil
}

func planCatalogEntryFromMap(values map[string]any) (PlanCatalogEntry, error) {
	body, err := json.Marshal(values)
	if err != nil {
		return PlanCatalogEntry{}, err
	}
	var raw struct {
		Tier              string   `json:"tier"`
		Name              string   `json:"name"`
		Description       string   `json:"description"`
		Currency          string   `json:"currency"`
		MonthlyPricePaise int64    `json:"monthly_price_paise"`
		AnnualPricePaise  int64    `json:"annual_price_paise"`
		QuotaBytes        int64    `json:"quota_bytes"`
		GalleryLimit      int      `json:"gallery_limit"`
		ClientLimit       int      `json:"client_limit"`
		Features          []string `json:"features"`
		Popular           bool     `json:"popular"`
		Paid              bool     `json:"paid"`
		Active            bool     `json:"active"`
		SelfServe         bool     `json:"self_serve"`
		TrialDays         int      `json:"trial_days"`
		Rank              int      `json:"rank"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return PlanCatalogEntry{}, err
	}
	raw.Tier = NormalizePlanTierSlug(raw.Tier)
	if raw.Tier == "" {
		raw.Tier = NormalizePlanTierSlug(fmt.Sprint(values["id"]))
	}
	if raw.Tier == "" || strings.TrimSpace(raw.Name) == "" {
		return PlanCatalogEntry{}, errors.New("plan tier and name required")
	}
	if raw.Currency == "" {
		raw.Currency = "INR"
	}
	return PlanCatalogEntry{
		Tier:              raw.Tier,
		Name:              strings.TrimSpace(raw.Name),
		Description:       strings.TrimSpace(raw.Description),
		Currency:          strings.ToUpper(strings.TrimSpace(raw.Currency)),
		MonthlyPricePaise: raw.MonthlyPricePaise,
		AnnualPricePaise:  raw.AnnualPricePaise,
		QuotaBytes:        raw.QuotaBytes,
		GalleryLimit:      raw.GalleryLimit,
		ClientLimit:       raw.ClientLimit,
		Features:          cleanPlanFeatures(raw.Features),
		Popular:           raw.Popular,
		Paid:              raw.Paid,
		Active:            raw.Active,
		SelfServe:         raw.SelfServe,
		TrialDays:         raw.TrialDays,
		Rank:              raw.Rank,
	}, nil
}

func billingProductFromMap(values map[string]any) (BillingProductCatalog, error) {
	body, err := json.Marshal(values)
	if err != nil {
		return BillingProductCatalog{}, err
	}
	var raw struct {
		Code            string         `json:"code"`
		ProductType     string         `json:"product_type"`
		Name            string         `json:"name"`
		Description     string         `json:"description"`
		Currency        string         `json:"currency"`
		PricePaise      int64          `json:"price_paise"`
		BillingInterval string         `json:"billing_interval"`
		Metadata        map[string]any `json:"metadata"`
		Rank            int            `json:"rank"`
		Active          *bool          `json:"active"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return BillingProductCatalog{}, err
	}
	raw.Code = strings.TrimSpace(raw.Code)
	raw.ProductType = strings.TrimSpace(raw.ProductType)
	if raw.Code == "" || raw.ProductType == "" || strings.TrimSpace(raw.Name) == "" {
		return BillingProductCatalog{}, errors.New("product code, type, and name required")
	}
	if !validBillingProductType(raw.ProductType) {
		return BillingProductCatalog{}, errors.New("invalid product type")
	}
	if raw.PricePaise < 0 {
		return BillingProductCatalog{}, errors.New("price_paise must be non-negative")
	}
	if raw.Rank < 0 {
		return BillingProductCatalog{}, errors.New("rank must be non-negative")
	}
	if raw.Currency == "" {
		raw.Currency = "INR"
	}
	if raw.BillingInterval == "" {
		raw.BillingInterval = "one_time"
	}
	if !validBillingInterval(raw.BillingInterval) {
		return BillingProductCatalog{}, errors.New("invalid billing interval")
	}
	active := true
	if raw.Active != nil {
		active = *raw.Active
	}
	if raw.Metadata == nil {
		raw.Metadata = map[string]any{}
	}
	product := BillingProductCatalog{
		Code:            raw.Code,
		ProductType:     raw.ProductType,
		Name:            strings.TrimSpace(raw.Name),
		Description:     strings.TrimSpace(raw.Description),
		Currency:        strings.ToUpper(strings.TrimSpace(raw.Currency)),
		PricePaise:      raw.PricePaise,
		BillingInterval: raw.BillingInterval,
		Metadata:        raw.Metadata,
		Rank:            raw.Rank,
		Active:          active,
	}
	if err := validateBillingProductCatalog(product); err != nil {
		return BillingProductCatalog{}, err
	}
	return product, nil
}

func validateBillingProductCatalog(product BillingProductCatalog) error {
	if product.ProductType != "event_upload" || !product.Active {
		return nil
	}
	if metadataInt64(product.Metadata, "quota_bytes", 0) <= 0 {
		return errors.New("active event upload products require quota_bytes metadata")
	}
	activeDays := metadataInt64(product.Metadata, "active_days", 0)
	if activeDays <= 0 || activeDays > 30 {
		return errors.New("active event upload products require active_days between 1 and 30")
	}
	uploadWindowDays := metadataInt64(product.Metadata, "upload_window_days", 0)
	if uploadWindowDays <= 0 || uploadWindowDays > activeDays {
		return errors.New("active event upload products require upload_window_days between 1 and active_days")
	}
	retentionDays := metadataInt64(product.Metadata, "retention_days", 0)
	if retentionDays != 30 {
		return errors.New("active event upload products require retention_days of 30")
	}
	return nil
}

func metadataInt64(metadata map[string]any, key string, fallback int64) int64 {
	value, ok := metadata[key]
	if !ok {
		return fallback
	}
	switch v := value.(type) {
	case int:
		return int64(v)
	case int64:
		return v
	case float64:
		return int64(v)
	case json.Number:
		n, err := v.Int64()
		if err == nil {
			return n
		}
	case string:
		var parsed int64
		if _, err := fmt.Sscanf(strings.TrimSpace(v), "%d", &parsed); err == nil {
			return parsed
		}
	}
	return fallback
}

func validBillingProductType(productType string) bool {
	switch productType {
	case "event_upload", "gallery_extension", "storage_booster", "upload_credit_pack", "streaming_pack":
		return true
	default:
		return false
	}
}

func validBillingInterval(interval string) bool {
	switch interval {
	case "one_time", "monthly", "annual":
		return true
	default:
		return false
	}
}

func replaceProductInCatalog(catalog *PricingCatalog, product BillingProductCatalog) {
	switch product.ProductType {
	case "event_upload":
		catalog.EventPacks = replaceProduct(catalog.EventPacks, product)
	case "gallery_extension":
		catalog.GalleryExtensions = replaceProduct(catalog.GalleryExtensions, product)
	case "storage_booster":
		catalog.StorageBoosters = replaceProduct(catalog.StorageBoosters, product)
	}
}

func replaceProduct(products []BillingProductCatalog, product BillingProductCatalog) []BillingProductCatalog {
	for i := range products {
		if products[i].Code == product.Code {
			products[i] = product
			return products
		}
	}
	return append(products, product)
}

func removeProductFromCatalog(catalog *PricingCatalog, code string) {
	catalog.EventPacks = removeProduct(catalog.EventPacks, code)
	catalog.GalleryExtensions = removeProduct(catalog.GalleryExtensions, code)
	catalog.StorageBoosters = removeProduct(catalog.StorageBoosters, code)
}

func removeProduct(products []BillingProductCatalog, code string) []BillingProductCatalog {
	out := products[:0]
	for _, product := range products {
		if product.Code != code {
			out = append(out, product)
		}
	}
	return out
}

func scanPricingChangeRequest(row pgx.Row) (PricingChangeRequest, error) {
	var req PricingChangeRequest
	var submittedBy, approvedBy, rejectedBy pgtype.UUID
	var submittedAt, approvedAt, rejectedAt, effectiveFrom, publishedAt pgtype.Timestamptz
	var rejectionReason, approvalComment pgtype.Text
	var beforeState, afterState, impactSummary, emailPreview []byte
	if err := row.Scan(
		&req.ID,
		&req.RequestType,
		&req.TargetType,
		&req.TargetKey,
		&req.Status,
		&submittedBy,
		&submittedAt,
		&approvedBy,
		&approvedAt,
		&rejectedBy,
		&rejectedAt,
		&rejectionReason,
		&approvalComment,
		&effectiveFrom,
		&beforeState,
		&afterState,
		&impactSummary,
		&emailPreview,
		&publishedAt,
		&req.CreatedAt,
		&req.UpdatedAt,
	); err != nil {
		return PricingChangeRequest{}, err
	}
	req.SubmittedBy = pgUUIDPtr(submittedBy)
	req.SubmittedAt = timestamptzValue(submittedAt)
	req.ApprovedBy = pgUUIDPtr(approvedBy)
	req.ApprovedAt = timestamptzValue(approvedAt)
	req.RejectedBy = pgUUIDPtr(rejectedBy)
	req.RejectedAt = timestamptzValue(rejectedAt)
	req.EffectiveFrom = timestamptzValue(effectiveFrom)
	req.PublishedAt = timestamptzValue(publishedAt)
	req.RejectionReason = textValue(rejectionReason)
	req.ApprovalComment = textValue(approvalComment)
	req.BeforeState = unmarshalJSONMap(beforeState)
	req.AfterState = unmarshalJSONMap(afterState)
	req.ImpactSummary = unmarshalJSONMap(impactSummary)
	req.EmailPreview = unmarshalJSONMap(emailPreview)
	return req, nil
}

func (s *PricingChangeRequestService) recordAudit(ctx context.Context, requestID uuid.UUID, targetType string, targetKey string, eventType string, actorID *uuid.UUID, comment string, metadata map[string]any) error {
	return insertPricingAuditEvent(ctx, s.db, &requestID, targetType, targetKey, eventType, actorID, comment, metadata)
}

func insertPricingAuditEvent(ctx context.Context, q subscriptionCatalogBackfillDB, requestID *uuid.UUID, targetType string, targetKey string, eventType string, actorID *uuid.UUID, comment string, metadata map[string]any) error {
	payload, err := marshalJSONMap(metadata)
	if err != nil {
		return err
	}
	_, err = q.Exec(ctx, `
		INSERT INTO pricing_audit_events (
			change_request_id, target_type, target_key, event_type,
			actor_id, comment, metadata
		) VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::uuid, $6::text, $7::jsonb)
	`, requestID, targetType, targetKey, eventType, actorID, comment, payload)
	return err
}

func marshalJSONMap(values map[string]any) (string, error) {
	if values == nil {
		values = map[string]any{}
	}
	body, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func unmarshalJSONMap(body []byte) map[string]any {
	if len(body) == 0 {
		return map[string]any{}
	}
	var out map[string]any
	if err := json.Unmarshal(body, &out); err != nil {
		return map[string]any{}
	}
	if out == nil {
		out = map[string]any{}
	}
	return out
}

func pgUUIDPtr(value pgtype.UUID) *uuid.UUID {
	if !value.Valid {
		return nil
	}
	id, err := uuid.FromBytes(value.Bytes[:])
	if err != nil {
		return nil
	}
	return &id
}
