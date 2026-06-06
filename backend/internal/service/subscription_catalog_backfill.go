package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	SubscriptionCatalogBackfillSourceExact           = "exact_tier_effective_match"
	SubscriptionCatalogBackfillSourceAlias           = "alias_tier_effective_match"
	SubscriptionCatalogBackfillSourceEarliest        = "earliest_version_fallback"
	SubscriptionCatalogBackfillSourceAliasEarliest   = "alias_earliest_version_fallback"
	SubscriptionCatalogBackfillSourceLegacy          = "legacy_backfill_version"
	DefaultSubscriptionCatalogBackfillBatchSize      = 500
	subscriptionCatalogSnapshotSchema                = "subscription_catalog_snapshot.v1"
	subscriptionCatalogBackfillAuditAction           = "subscriptions.catalog_backfill_batch"
	subscriptionCatalogBackfillAuditResourceType     = "subscription_catalog_backfill"
	subscriptionCatalogBackfillLegacyFeature         = "Legacy subscription catalog backfill"
	subscriptionCatalogBackfillLegacyDescriptionBase = "Archived legacy plan identity created only to link historical subscriptions during catalog backfill."
)

var (
	ErrUnresolvedSubscriptions = errors.New("subscription catalog backfill has unresolved subscriptions")
	legacyTierUnsafeChars      = regexp.MustCompile(`[^a-z0-9_]+`)
)

type subscriptionCatalogBackfillDB interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// SubscriptionCatalogBackfillService links historical subscriptions to approved
// plan versions and writes immutable catalog snapshots. It is intentionally a
// small migration/backfill service rather than part of live checkout logic.
type SubscriptionCatalogBackfillService struct {
	db *pgxpool.Pool
}

func NewSubscriptionCatalogBackfillService(db *pgxpool.Pool) *SubscriptionCatalogBackfillService {
	return &SubscriptionCatalogBackfillService{db: db}
}

type SubscriptionCatalogBackfillOptions struct {
	DryRun    bool `json:"dry_run"`
	Force     bool `json:"force"`
	BatchSize int  `json:"batch_size"`
}

type SubscriptionCatalogBackfillReport struct {
	DryRun                   bool                             `json:"dry_run"`
	Force                    bool                             `json:"force"`
	BatchSize                int                              `json:"batch_size"`
	StartedAt                time.Time                        `json:"started_at"`
	CompletedAt              time.Time                        `json:"completed_at"`
	RunID                    string                           `json:"run_id,omitempty"`
	SkippedAlreadyBackfilled int64                            `json:"skipped_already_backfilled"`
	Scanned                  int                              `json:"scanned"`
	WouldBackfill            int                              `json:"would_backfill"`
	Backfilled               int                              `json:"backfilled"`
	ExactMatches             int                              `json:"exact_tier_date_matches"`
	AliasMatches             int                              `json:"alias_matches"`
	EarliestVersionFallbacks int                              `json:"earliest_version_fallbacks"`
	LegacyVersionMatches     int                              `json:"legacy_version_matches"`
	LegacyVersionsToCreate   int                              `json:"legacy_versions_to_create"`
	LegacyVersionsCreated    int                              `json:"legacy_versions_created"`
	LegacyVersionTiers       []string                         `json:"legacy_version_tiers,omitempty"`
	AuditEventsWritten       int                              `json:"audit_events_written"`
	Unresolved               []SubscriptionBackfillUnresolved `json:"unresolved_rows,omitempty"`

	legacyTierSet map[string]struct{}
}

type SubscriptionBackfillUnresolved struct {
	SubscriptionID    string `json:"subscription_id"`
	TierSlug          string `json:"tier_slug,omitempty"`
	WorkspacePlanTier string `json:"workspace_plan_tier,omitempty"`
	Reason            string `json:"reason"`
}

type subscriptionBackfillRow struct {
	ID                uuid.UUID
	WorkspaceID       uuid.UUID
	TierSlug          string
	WorkspacePlanTier string
	AmountPaisa       int64
	BillingInterval   string
	Status            string
	StartedAt         time.Time
	ExpiresAt         *time.Time
}

type subscriptionPlanVersion struct {
	ID                 uuid.UUID  `json:"id"`
	Tier               string     `json:"tier"`
	Version            int        `json:"version"`
	Status             string     `json:"status"`
	Name               string     `json:"name"`
	Description        string     `json:"description"`
	Currency           string     `json:"currency"`
	MonthlyPricePaise  int64      `json:"monthly_price_paise"`
	AnnualPricePaise   int64      `json:"annual_price_paise"`
	QuotaBytes         int64      `json:"quota_bytes"`
	GalleryLimit       int        `json:"gallery_limit"`
	ClientLimit        int        `json:"client_limit"`
	Features           []string   `json:"features"`
	Popular            bool       `json:"popular"`
	Paid               bool       `json:"paid"`
	Active             bool       `json:"active"`
	SelfServe          bool       `json:"self_serve"`
	TrialDays          int        `json:"trial_days"`
	Rank               int        `json:"rank"`
	EffectiveFrom      time.Time  `json:"effective_from"`
	EffectiveTo        *time.Time `json:"effective_to,omitempty"`
	ApprovedAt         *time.Time `json:"approved_at,omitempty"`
	ArchivedAt         *time.Time `json:"archived_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	LegacyCreated      bool       `json:"-"`
	LegacyOriginalTier string     `json:"-"`
}

type subscriptionBackfillDecision struct {
	Version        subscriptionPlanVersion
	Source         string
	RawTier        string
	NormalizedTier string
	LegacyTier     string
	RequiresLegacy bool
	Unresolved     bool
	Reason         string
}

func (s *SubscriptionCatalogBackfillService) Run(ctx context.Context, opts SubscriptionCatalogBackfillOptions) (report SubscriptionCatalogBackfillReport, err error) {
	if s == nil || s.db == nil {
		return SubscriptionCatalogBackfillReport{}, errors.New("subscription catalog backfill database is not configured")
	}
	opts = normalizeSubscriptionCatalogBackfillOptions(opts)
	report = SubscriptionCatalogBackfillReport{
		DryRun:        opts.DryRun,
		Force:         opts.Force,
		BatchSize:     opts.BatchSize,
		StartedAt:     time.Now().UTC(),
		RunID:         uuid.NewString(),
		legacyTierSet: map[string]struct{}{},
	}
	defer func() {
		report.CompletedAt = time.Now().UTC()
		report.finalizeLegacyTiers()
	}()

	if !opts.Force {
		skipped, err := countAlreadyBackfilledSubscriptions(ctx, s.db)
		if err != nil {
			return report, err
		}
		report.SkippedAlreadyBackfilled = skipped
	}

	versions, err := loadSubscriptionPlanVersions(ctx, s.db)
	if err != nil {
		return report, err
	}

	if opts.DryRun {
		err = s.runDryRun(ctx, opts, versions, &report)
	} else {
		err = s.runApply(ctx, opts, versions, &report)
	}
	return report, err
}

func ValidateSubscriptionCatalogBackfillPreflight(report SubscriptionCatalogBackfillReport) error {
	if len(report.Unresolved) > 0 {
		return fmt.Errorf("%w: %d unresolved row(s)", ErrUnresolvedSubscriptions, len(report.Unresolved))
	}
	return nil
}

func (s *SubscriptionCatalogBackfillService) runDryRun(ctx context.Context, opts SubscriptionCatalogBackfillOptions, versions map[string][]subscriptionPlanVersion, report *SubscriptionCatalogBackfillReport) error {
	var lastID uuid.UUID
	for {
		rows, err := selectSubscriptionBackfillBatch(ctx, s.db, opts, lastID, false)
		if err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for _, row := range rows {
			decision := planSubscriptionCatalogBackfill(row, versions)
			report.addDecision(row, decision, true)
		}
		lastID = rows[len(rows)-1].ID
	}
}

func (s *SubscriptionCatalogBackfillService) runApply(ctx context.Context, opts SubscriptionCatalogBackfillOptions, versions map[string][]subscriptionPlanVersion, report *SubscriptionCatalogBackfillReport) error {
	var lastID uuid.UUID
	batchNumber := 0
	for {
		tx, err := s.db.Begin(ctx)
		if err != nil {
			return err
		}
		rows, err := selectSubscriptionBackfillBatch(ctx, tx, opts, lastID, true)
		if err != nil {
			_ = tx.Rollback(ctx)
			return err
		}
		if len(rows) == 0 {
			_ = tx.Rollback(ctx)
			return nil
		}

		batchNumber++
		batchReport := SubscriptionCatalogBackfillReport{legacyTierSet: map[string]struct{}{}}
		for _, row := range rows {
			decision := planSubscriptionCatalogBackfill(row, versions)
			if decision.RequiresLegacy {
				created, version, ensureErr := ensureLegacySubscriptionPlanVersion(ctx, tx, decision.RawTier, decision.LegacyTier)
				if ensureErr != nil {
					_ = tx.Rollback(ctx)
					return ensureErr
				}
				version.LegacyCreated = created
				version.LegacyOriginalTier = decision.RawTier
				versions[decision.LegacyTier] = []subscriptionPlanVersion{version}
				decision.Version = version
				decision.Source = SubscriptionCatalogBackfillSourceLegacy
				decision.Unresolved = false
				decision.Reason = ""
				if created {
					report.LegacyVersionsCreated++
					batchReport.LegacyVersionsCreated++
				}
			}
			if decision.Unresolved {
				report.addDecision(row, decision, false)
				_ = tx.Rollback(ctx)
				report.finalizeLegacyTiers()
				return fmt.Errorf("%w: subscription %s: %s", ErrUnresolvedSubscriptions, row.ID, decision.Reason)
			}

			snapshot, snapshotErr := BuildSubscriptionCatalogSnapshot(row, decision.Version, decision)
			if snapshotErr != nil {
				_ = tx.Rollback(ctx)
				return snapshotErr
			}
			if _, err := tx.Exec(ctx, `
				UPDATE subscriptions
				   SET plan_version_id = $2,
				       catalog_snapshot = $3::jsonb,
				       catalog_backfilled_at = NOW(),
				       catalog_backfill_source = $4,
				       updated_at = NOW()
				 WHERE id = $1
			`, row.ID, decision.Version.ID, snapshot, decision.Source); err != nil {
				_ = tx.Rollback(ctx)
				return fmt.Errorf("backfill subscription %s: %w", row.ID, err)
			}
			report.addDecision(row, decision, false)
			batchReport.addDecision(row, decision, false)
		}

		if batchReport.Backfilled > 0 {
			if err := insertSubscriptionBackfillAudit(ctx, tx, report.RunID, batchNumber, opts, batchReport); err != nil {
				_ = tx.Rollback(ctx)
				return err
			}
			report.AuditEventsWritten++
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
		lastID = rows[len(rows)-1].ID
	}
}

func normalizeSubscriptionCatalogBackfillOptions(opts SubscriptionCatalogBackfillOptions) SubscriptionCatalogBackfillOptions {
	if opts.BatchSize <= 0 {
		opts.BatchSize = DefaultSubscriptionCatalogBackfillBatchSize
	}
	return opts
}

func countAlreadyBackfilledSubscriptions(ctx context.Context, q subscriptionCatalogBackfillDB) (int64, error) {
	var count int64
	err := q.QueryRow(ctx, `
		SELECT COUNT(*)
		  FROM subscriptions
		 WHERE plan_version_id IS NOT NULL
		   AND catalog_snapshot IS NOT NULL
		   AND catalog_backfilled_at IS NOT NULL
	`).Scan(&count)
	return count, err
}

func loadSubscriptionPlanVersions(ctx context.Context, q subscriptionCatalogBackfillDB) (map[string][]subscriptionPlanVersion, error) {
	rows, err := q.Query(ctx, `
		SELECT id, tier, version, status, name, description, currency,
		       monthly_price_paise, annual_price_paise, quota_bytes,
		       gallery_limit, client_limit, features, popular, paid, active,
		       self_serve, trial_days, rank, effective_from, effective_to,
		       approved_at, archived_at, created_at, updated_at
		  FROM subscription_plan_versions
		 WHERE status IN ('approved', 'published')
		 ORDER BY tier ASC, effective_from ASC, version ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("load subscription plan versions: %w", err)
	}
	defer rows.Close()

	grouped := map[string][]subscriptionPlanVersion{}
	for rows.Next() {
		version, err := scanSubscriptionPlanVersion(rows)
		if err != nil {
			return nil, err
		}
		grouped[version.Tier] = append(grouped[version.Tier], version)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for tier := range grouped {
		sortSubscriptionPlanVersions(grouped[tier])
	}
	return grouped, nil
}

func scanSubscriptionPlanVersion(row pgx.Row) (subscriptionPlanVersion, error) {
	var v subscriptionPlanVersion
	var effectiveTo, approvedAt, archivedAt pgtype.Timestamptz
	if err := row.Scan(
		&v.ID,
		&v.Tier,
		&v.Version,
		&v.Status,
		&v.Name,
		&v.Description,
		&v.Currency,
		&v.MonthlyPricePaise,
		&v.AnnualPricePaise,
		&v.QuotaBytes,
		&v.GalleryLimit,
		&v.ClientLimit,
		&v.Features,
		&v.Popular,
		&v.Paid,
		&v.Active,
		&v.SelfServe,
		&v.TrialDays,
		&v.Rank,
		&v.EffectiveFrom,
		&effectiveTo,
		&approvedAt,
		&archivedAt,
		&v.CreatedAt,
		&v.UpdatedAt,
	); err != nil {
		return subscriptionPlanVersion{}, err
	}
	v.EffectiveTo = timestamptzPtr(effectiveTo)
	v.ApprovedAt = timestamptzPtr(approvedAt)
	v.ArchivedAt = timestamptzPtr(archivedAt)
	v.Features = append([]string(nil), v.Features...)
	return v, nil
}

func sortSubscriptionPlanVersions(versions []subscriptionPlanVersion) {
	sort.SliceStable(versions, func(i, j int) bool {
		if versions[i].EffectiveFrom.Equal(versions[j].EffectiveFrom) {
			return versions[i].Version < versions[j].Version
		}
		return versions[i].EffectiveFrom.Before(versions[j].EffectiveFrom)
	})
}

func selectSubscriptionBackfillBatch(ctx context.Context, q subscriptionCatalogBackfillDB, opts SubscriptionCatalogBackfillOptions, lastID uuid.UUID, lock bool) ([]subscriptionBackfillRow, error) {
	lockClause := ""
	if lock {
		lockClause = " FOR UPDATE OF s SKIP LOCKED"
	}
	query := fmt.Sprintf(`
		WITH picked AS (
			SELECT s.id
			  FROM subscriptions s
			 WHERE ($1::boolean
			        OR s.plan_version_id IS NULL
			        OR s.catalog_snapshot IS NULL
			        OR s.catalog_backfilled_at IS NULL)
			   AND s.id > $2
			 ORDER BY s.id
			 LIMIT $3%s
		)
		SELECT s.id, s.workspace_id, s.tier_slug, w.plan_tier,
		       s.amount_paisa, s.billing_interval, s.status,
		       s.started_at, s.expires_at
		  FROM subscriptions s
		  JOIN picked p ON p.id = s.id
		  LEFT JOIN workspaces w ON w.id = s.workspace_id
		 ORDER BY s.id
	`, lockClause)
	rows, err := q.Query(ctx, query, opts.Force, lastID, opts.BatchSize)
	if err != nil {
		return nil, fmt.Errorf("select subscription backfill batch: %w", err)
	}
	defer rows.Close()

	out := make([]subscriptionBackfillRow, 0, opts.BatchSize)
	for rows.Next() {
		var row subscriptionBackfillRow
		var tierSlug, workspaceTier pgtype.Text
		var expiresAt pgtype.Timestamptz
		if err := rows.Scan(
			&row.ID,
			&row.WorkspaceID,
			&tierSlug,
			&workspaceTier,
			&row.AmountPaisa,
			&row.BillingInterval,
			&row.Status,
			&row.StartedAt,
			&expiresAt,
		); err != nil {
			return nil, err
		}
		row.TierSlug = textValue(tierSlug)
		row.WorkspacePlanTier = textValue(workspaceTier)
		row.ExpiresAt = timestamptzPtr(expiresAt)
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func planSubscriptionCatalogBackfill(row subscriptionBackfillRow, versions map[string][]subscriptionPlanVersion) subscriptionBackfillDecision {
	rawTier := firstNonEmpty(row.TierSlug, row.WorkspacePlanTier)
	if rawTier == "" {
		return subscriptionBackfillDecision{
			Unresolved: true,
			Reason:     "subscription has no tier_slug and workspace has no plan_tier fallback",
		}
	}
	normalizedTier := NormalizePlanTierSlug(rawTier)
	if normalizedTier == "" {
		return subscriptionBackfillDecision{
			RawTier:    rawTier,
			Unresolved: true,
			Reason:     "normalized tier is empty",
		}
	}

	planVersions := versions[normalizedTier]
	alias := !strings.EqualFold(strings.TrimSpace(rawTier), normalizedTier)
	if len(planVersions) > 0 {
		version, fallback := nearestSubscriptionPlanVersion(planVersions, row.StartedAt)
		return subscriptionBackfillDecision{
			Version:        version,
			Source:         subscriptionBackfillSource(alias, fallback),
			RawTier:        rawTier,
			NormalizedTier: normalizedTier,
		}
	}

	legacyTier, ok := legacyBackfillTier(rawTier)
	if !ok {
		return subscriptionBackfillDecision{
			RawTier:    rawTier,
			Unresolved: true,
			Reason:     "tier cannot be converted to a legacy backfill slug",
		}
	}
	return subscriptionBackfillDecision{
		RawTier:        rawTier,
		NormalizedTier: normalizedTier,
		LegacyTier:     legacyTier,
		RequiresLegacy: true,
		Source:         SubscriptionCatalogBackfillSourceLegacy,
	}
}

func nearestSubscriptionPlanVersion(versions []subscriptionPlanVersion, startedAt time.Time) (subscriptionPlanVersion, bool) {
	sortSubscriptionPlanVersions(versions)
	var latestBefore *subscriptionPlanVersion
	for i := range versions {
		if !versions[i].EffectiveFrom.After(startedAt) {
			latestBefore = &versions[i]
		}
	}
	if latestBefore != nil {
		return *latestBefore, false
	}
	return versions[0], true
}

func subscriptionBackfillSource(alias bool, fallback bool) string {
	switch {
	case alias && fallback:
		return SubscriptionCatalogBackfillSourceAliasEarliest
	case alias:
		return SubscriptionCatalogBackfillSourceAlias
	case fallback:
		return SubscriptionCatalogBackfillSourceEarliest
	default:
		return SubscriptionCatalogBackfillSourceExact
	}
}

func BuildSubscriptionCatalogSnapshot(row subscriptionBackfillRow, version subscriptionPlanVersion, decision subscriptionBackfillDecision) ([]byte, error) {
	snapshot := map[string]any{
		"snapshot_schema": subscriptionCatalogSnapshotSchema,
		"source":          "subscription_catalog_backfill",
		"match": map[string]any{
			"source":          decision.Source,
			"raw_tier":        decision.RawTier,
			"normalized_tier": decision.NormalizedTier,
			"legacy_tier":     decision.LegacyTier,
		},
		"subscription": map[string]any{
			"id":               row.ID.String(),
			"workspace_id":     row.WorkspaceID.String(),
			"tier_slug":        row.TierSlug,
			"workspace_tier":   row.WorkspacePlanTier,
			"amount_paisa":     row.AmountPaisa,
			"billing_interval": row.BillingInterval,
			"status":           row.Status,
			"started_at":       row.StartedAt,
			"expires_at":       row.ExpiresAt,
		},
		"billing": map[string]any{
			"preserved_amount_paisa": row.AmountPaisa,
			"billing_interval":       row.BillingInterval,
		},
		"plan": version,
	}
	return json.Marshal(snapshot)
}

func ensureLegacySubscriptionPlanVersion(ctx context.Context, tx subscriptionCatalogBackfillDB, rawTier string, legacyTier string) (bool, subscriptionPlanVersion, error) {
	if legacyTier == "" {
		return false, subscriptionPlanVersion{}, errors.New("legacy tier is empty")
	}
	if _, err := tx.Exec(ctx, `LOCK TABLE subscription_plans IN SHARE ROW EXCLUSIVE MODE`); err != nil {
		return false, subscriptionPlanVersion{}, fmt.Errorf("lock subscription_plans for legacy backfill: %w", err)
	}
	name := "Legacy Backfill: " + strings.TrimSpace(rawTier)
	if strings.TrimSpace(rawTier) == "" {
		name = "Legacy Backfill"
	}
	description := subscriptionCatalogBackfillLegacyDescriptionBase
	if rawTier != "" {
		description += " Original tier: " + strings.TrimSpace(rawTier) + "."
	}
	tag, err := tx.Exec(ctx, `
		WITH next_rank AS (
			SELECT COALESCE(MAX(rank), 0) + 1 AS rank FROM subscription_plans
		)
		INSERT INTO subscription_plans (
			tier, name, description, currency, monthly_price_paise,
			annual_price_paise, quota_bytes, gallery_limit, client_limit,
			features, popular, paid, active, self_serve, trial_days, rank
		)
		SELECT
			$1, $2, $3, 'INR', 0,
			0, 0, 0, 0,
			ARRAY[$4]::TEXT[], FALSE, TRUE, FALSE, FALSE, 0, next_rank.rank
		FROM next_rank
		ON CONFLICT (tier) DO NOTHING
	`, legacyTier, name, description, subscriptionCatalogBackfillLegacyFeature)
	if err != nil {
		return false, subscriptionPlanVersion{}, fmt.Errorf("insert legacy subscription plan %s: %w", legacyTier, err)
	}
	planCreated := tag.RowsAffected() > 0

	var versionID uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO subscription_plan_versions (
			tier, version, status, name, description, currency,
			monthly_price_paise, annual_price_paise, quota_bytes,
			gallery_limit, client_limit, features, popular, paid, active,
			self_serve, trial_days, rank, effective_from, approved_at, archived_at
		)
		SELECT
			p.tier, 1, 'approved', p.name, p.description, p.currency,
			p.monthly_price_paise, p.annual_price_paise, p.quota_bytes,
			p.gallery_limit, p.client_limit, p.features, p.popular, p.paid, p.active,
			p.self_serve, p.trial_days, p.rank, TIMESTAMPTZ '1970-01-01 00:00:00+00', NOW(), NOW()
		  FROM subscription_plans p
		 WHERE p.tier = $1
		ON CONFLICT (tier, version) DO NOTHING
		RETURNING id
	`, legacyTier).Scan(&versionID)
	versionCreated := true
	if errors.Is(err, pgx.ErrNoRows) {
		versionCreated = false
	} else if err != nil {
		return false, subscriptionPlanVersion{}, fmt.Errorf("insert legacy subscription plan version %s: %w", legacyTier, err)
	}

	version, err := selectSubscriptionPlanVersion(ctx, tx, legacyTier, 1)
	if err != nil {
		return false, subscriptionPlanVersion{}, err
	}
	version.LegacyCreated = planCreated || versionCreated
	version.LegacyOriginalTier = rawTier
	return version.LegacyCreated, version, nil
}

func selectSubscriptionPlanVersion(ctx context.Context, q subscriptionCatalogBackfillDB, tier string, version int) (subscriptionPlanVersion, error) {
	row := q.QueryRow(ctx, `
		SELECT id, tier, version, status, name, description, currency,
		       monthly_price_paise, annual_price_paise, quota_bytes,
		       gallery_limit, client_limit, features, popular, paid, active,
		       self_serve, trial_days, rank, effective_from, effective_to,
		       approved_at, archived_at, created_at, updated_at
		  FROM subscription_plan_versions
		 WHERE tier = $1 AND version = $2
	`, tier, version)
	v, err := scanSubscriptionPlanVersion(row)
	if err != nil {
		return subscriptionPlanVersion{}, fmt.Errorf("select subscription plan version %s/%d: %w", tier, version, err)
	}
	return v, nil
}

func insertSubscriptionBackfillAudit(ctx context.Context, q subscriptionCatalogBackfillDB, runID string, batchNumber int, opts SubscriptionCatalogBackfillOptions, batch SubscriptionCatalogBackfillReport) error {
	resourceID, err := uuid.Parse(runID)
	if err != nil {
		return fmt.Errorf("parse backfill run id for audit: %w", err)
	}
	batch.finalizeLegacyTiers()
	metadata, err := json.Marshal(map[string]any{
		"run_id":                   runID,
		"batch_number":             batchNumber,
		"force":                    opts.Force,
		"batch_size":               opts.BatchSize,
		"backfilled":               batch.Backfilled,
		"exact_tier_date_matches":  batch.ExactMatches,
		"alias_matches":            batch.AliasMatches,
		"earliest_version_matches": batch.EarliestVersionFallbacks,
		"legacy_version_matches":   batch.LegacyVersionMatches,
		"legacy_versions_created":  batch.LegacyVersionsCreated,
		"legacy_version_tiers":     batch.LegacyVersionTiers,
	})
	if err != nil {
		return fmt.Errorf("marshal subscription catalog backfill audit metadata: %w", err)
	}
	if _, err := q.Exec(ctx, `
		INSERT INTO audit_log (actor_id, action, resource_type, resource_id, metadata)
		VALUES (NULL, $1, $2, $3, $4::jsonb)
	`, subscriptionCatalogBackfillAuditAction, subscriptionCatalogBackfillAuditResourceType, resourceID, metadata); err != nil {
		return fmt.Errorf("insert subscription catalog backfill audit: %w", err)
	}
	return nil
}

func (r *SubscriptionCatalogBackfillReport) addDecision(row subscriptionBackfillRow, decision subscriptionBackfillDecision, dryRun bool) {
	r.Scanned++
	if decision.Unresolved {
		r.Unresolved = append(r.Unresolved, SubscriptionBackfillUnresolved{
			SubscriptionID:    row.ID.String(),
			TierSlug:          row.TierSlug,
			WorkspacePlanTier: row.WorkspacePlanTier,
			Reason:            decision.Reason,
		})
		return
	}
	if dryRun {
		r.WouldBackfill++
	} else {
		r.Backfilled++
	}
	switch decision.Source {
	case SubscriptionCatalogBackfillSourceExact:
		r.ExactMatches++
	case SubscriptionCatalogBackfillSourceAlias:
		r.AliasMatches++
	case SubscriptionCatalogBackfillSourceEarliest:
		r.EarliestVersionFallbacks++
	case SubscriptionCatalogBackfillSourceAliasEarliest:
		r.AliasMatches++
		r.EarliestVersionFallbacks++
	case SubscriptionCatalogBackfillSourceLegacy:
		r.LegacyVersionMatches++
		if decision.LegacyTier != "" {
			r.addLegacyTier(decision.LegacyTier)
			if dryRun {
				r.LegacyVersionsToCreate = len(r.legacyTierSet)
			}
		}
	}
}

func (r *SubscriptionCatalogBackfillReport) addLegacyTier(tier string) {
	if r.legacyTierSet == nil {
		r.legacyTierSet = map[string]struct{}{}
	}
	r.legacyTierSet[tier] = struct{}{}
}

func (r *SubscriptionCatalogBackfillReport) finalizeLegacyTiers() {
	if len(r.legacyTierSet) == 0 {
		return
	}
	r.LegacyVersionTiers = r.LegacyVersionTiers[:0]
	for tier := range r.legacyTierSet {
		r.LegacyVersionTiers = append(r.LegacyVersionTiers, tier)
	}
	sort.Strings(r.LegacyVersionTiers)
	if r.DryRun {
		r.LegacyVersionsToCreate = len(r.LegacyVersionTiers)
	}
}

func legacyBackfillTier(rawTier string) (string, bool) {
	clean := strings.ToLower(strings.TrimSpace(rawTier))
	clean = legacyTierUnsafeChars.ReplaceAllString(clean, "_")
	clean = strings.Trim(clean, "_")
	if clean == "" {
		return "", false
	}
	return "legacy_backfill_" + clean, true
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func textValue(value pgtype.Text) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func timestamptzPtr(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	t := value.Time
	return &t
}
