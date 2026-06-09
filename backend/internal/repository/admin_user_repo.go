package repository

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUserFilter struct {
	Cursor   *uuid.UUID
	Limit    int
	Search   string
	Role     string
	Status   string
	StateID  *uuid.UUID
	Sort     string // "created_at", "last_login_at", "full_name"
	TierSlug string
}

// M39 E5-S1 (FR-F01): AdminUserCreate is the admin user-create payload
// shape for AdminUserRepo.CreateUser.
type AdminUserCreate struct {
	Email              string
	FullName           string
	Role               string
	PasswordHash       *string // nil for invite-only path
	EmailVerified      bool
	MustChangePassword bool // set true for admin-created dealer accounts
	// PendingPlanTier captures an admin-granted plan comp (migration
	// 113). When non-nil and non-empty, the value is written to
	// users.pending_plan_tier and applied by the onboarding service
	// when the user's workspace is created. NULL/empty means no
	// grant — the photographer picks their own plan during the
	// onboarding wizard (default: free).
	PendingPlanTier *string
}

// ErrDuplicateEmail is surfaced when INSERT INTO users collides with the
// unique index on email. The service layer maps this to HTTP 409.
var ErrDuplicateEmail = fmt.Errorf("users.email uniqueness violation")

// AdminUserRow is the wire shape returned by GET /api/v1/admin/users.
// JSON tags match the frontend AdminUser interface in
// frontend/src/lib/api/admin.ts exactly; Go field names remain PascalCase
// by convention but the JSON output is snake_case for the UI.
//
// full_name is aliased from users.display_name (the actual column name
// in migration 002). platform_role comes from the column added in
// migration 035. storage_used is computed on-the-fly from the assets
// table (uploaded_by) — there is no denormalized column. workspace_count
// is computed from workspace_members. Payment/subscription fields are
// summary fields for the admin users table; GetByID adds the full recent
// payment event list.
type AdminUserRow struct {
	ID           uuid.UUID `db:"id" json:"id"`
	FullName     string    `db:"full_name" json:"full_name"`
	Email        string    `db:"email" json:"email"`
	Phone        *string   `db:"phone" json:"phone,omitempty"`
	AvatarURL    *string   `db:"avatar_url" json:"avatar_url,omitempty"`
	PlatformRole string    `db:"platform_role" json:"platform_role"`
	Status       string    `db:"status" json:"status"`
	// state_id is the integer primary key from states.id — NOT a
	// UUID. Declared as *int32 (nullable) so the scan tolerates
	// users whose state has not been set during onboarding.
	StateID                   *int32     `db:"state_id" json:"state_id,omitempty"`
	StateName                 *string    `db:"state_name" json:"state_name,omitempty"`
	TierSlug                  *string    `db:"tier_slug" json:"tier_slug,omitempty"`
	TierName                  *string    `db:"tier_name" json:"tier_name,omitempty"`
	StorageUsed               int64      `db:"storage_used" json:"storage_used"`
	WorkspaceCount            int64      `db:"workspace_count" json:"workspace_count"`
	SubscriptionStatus        *string    `db:"subscription_status" json:"subscription_status,omitempty"`
	SubscriptionAmountPaisa   *int64     `db:"subscription_amount_paisa" json:"subscription_amount_paisa,omitempty"`
	SubscriptionBillingPeriod *string    `db:"subscription_billing_interval" json:"subscription_billing_interval,omitempty"`
	SubscriptionExpiresAt     *time.Time `db:"subscription_expires_at" json:"subscription_expires_at,omitempty"`
	TotalPaidPaisa            int64      `db:"total_paid_paise" json:"total_paid_paise"`
	LatestPaymentProvider     *string    `db:"latest_payment_provider" json:"latest_payment_provider,omitempty"`
	LatestPaymentStatus       *string    `db:"latest_payment_status" json:"latest_payment_status,omitempty"`
	LatestPaymentAmountPaisa  *int64     `db:"latest_payment_amount_paise" json:"latest_payment_amount_paise,omitempty"`
	LatestPaymentAt           *time.Time `db:"latest_payment_at" json:"latest_payment_at,omitempty"`
	LatestPaymentReference    *string    `db:"latest_payment_reference" json:"latest_payment_reference,omitempty"`
	LatestPaymentOrderID      *string    `db:"latest_payment_order_id" json:"latest_payment_order_id,omitempty"`
	LatestPaymentID           *string    `db:"latest_payment_id" json:"latest_payment_id,omitempty"`
	SearchText                string     `db:"search_text" json:"search_text,omitempty"`
	LastLoginAt               *time.Time `db:"last_login_at" json:"last_login_at,omitempty"`
	CreatedAt                 time.Time  `db:"created_at" json:"created_at"`
}

// AdminUserDetail is the shape returned by GET /api/v1/admin/users/{id}.
// Adds avatar_url, updated_at, workspaces and activity timeline on top of
// the row shape.
type AdminUserDetail struct {
	ID           uuid.UUID `db:"id" json:"id"`
	FullName     string    `db:"full_name" json:"full_name"`
	Email        string    `db:"email" json:"email"`
	Phone        *string   `db:"phone" json:"phone,omitempty"`
	AvatarURL    *string   `db:"avatar_url" json:"avatar_url,omitempty"`
	PlatformRole string    `db:"platform_role" json:"platform_role"`
	Status       string    `db:"status" json:"status"`
	// states.id is integer, not UUID — see AdminUserRow for the
	// same correction.
	StateID                   *int32                  `db:"state_id" json:"state_id,omitempty"`
	StateName                 *string                 `db:"state_name" json:"state_name,omitempty"`
	TierSlug                  *string                 `db:"tier_slug" json:"tier_slug,omitempty"`
	TierName                  *string                 `db:"tier_name" json:"tier_name,omitempty"`
	StorageUsed               int64                   `db:"storage_used" json:"storage_used"`
	WorkspaceCount            int64                   `db:"workspace_count" json:"workspace_count"`
	SubscriptionStatus        *string                 `db:"subscription_status" json:"subscription_status,omitempty"`
	SubscriptionAmountPaisa   *int64                  `db:"subscription_amount_paisa" json:"subscription_amount_paisa,omitempty"`
	SubscriptionBillingPeriod *string                 `db:"subscription_billing_interval" json:"subscription_billing_interval,omitempty"`
	SubscriptionExpiresAt     *time.Time              `db:"subscription_expires_at" json:"subscription_expires_at,omitempty"`
	TotalPaidPaisa            int64                   `db:"total_paid_paise" json:"total_paid_paise"`
	LatestPaymentProvider     *string                 `db:"latest_payment_provider" json:"latest_payment_provider,omitempty"`
	LatestPaymentStatus       *string                 `db:"latest_payment_status" json:"latest_payment_status,omitempty"`
	LatestPaymentAmountPaisa  *int64                  `db:"latest_payment_amount_paise" json:"latest_payment_amount_paise,omitempty"`
	LatestPaymentAt           *time.Time              `db:"latest_payment_at" json:"latest_payment_at,omitempty"`
	LatestPaymentReference    *string                 `db:"latest_payment_reference" json:"latest_payment_reference,omitempty"`
	LatestPaymentOrderID      *string                 `db:"latest_payment_order_id" json:"latest_payment_order_id,omitempty"`
	LatestPaymentID           *string                 `db:"latest_payment_id" json:"latest_payment_id,omitempty"`
	SearchText                string                  `db:"search_text" json:"search_text,omitempty"`
	LastLoginAt               *time.Time              `db:"last_login_at" json:"last_login_at,omitempty"`
	CreatedAt                 time.Time               `db:"created_at" json:"created_at"`
	UpdatedAt                 time.Time               `db:"updated_at" json:"updated_at"`
	Workspaces                []AdminUserWorkspace    `json:"workspaces"`
	PaymentEvents             []AdminUserPaymentEvent `json:"payment_events"`
	ActivityTimeline          []AuditLogEntry         `json:"recent_audit_logs"`
}

type AdminUserWorkspace struct {
	ID        uuid.UUID `db:"id" json:"id"`
	Name      string    `db:"name" json:"name"`
	Role      string    `db:"role" json:"role"`
	CreatedAt time.Time `db:"created_at" json:"created_at"`
}

type AdminUserPaymentEvent struct {
	ID                uuid.UUID  `db:"id" json:"id"`
	Source            string     `db:"source" json:"source"`
	Provider          string     `db:"provider" json:"provider"`
	Status            string     `db:"status" json:"status"`
	AmountPaisa       int64      `db:"amount_paise" json:"amount_paise"`
	Currency          string     `db:"currency" json:"currency"`
	Reference         *string    `db:"reference" json:"reference,omitempty"`
	ProviderOrderID   *string    `db:"provider_order_id" json:"provider_order_id,omitempty"`
	ProviderPaymentID *string    `db:"provider_payment_id" json:"provider_payment_id,omitempty"`
	PaidAt            *time.Time `db:"paid_at" json:"paid_at,omitempty"`
	CreatedAt         time.Time  `db:"created_at" json:"created_at"`
}

type PaginatedResult[T any] struct {
	Items      []T        `json:"items"`
	NextCursor *uuid.UUID `json:"next_cursor,omitempty"`
	TotalCount int64      `json:"total_count"`
}

// ---------------------------------------------------------------------------
// Repo
// ---------------------------------------------------------------------------

type AdminUserRepo struct {
	pool *pgxpool.Pool
}

func NewAdminUserRepo(pool *pgxpool.Pool) *AdminUserRepo {
	return &AdminUserRepo{pool: pool}
}

// adminUserSelectColumns is the shared SELECT list used by List and GetByID
// so we only maintain the column-to-field mapping in one place. Every column
// aliases to the frontend-compatible snake_case name so pgx's StructByName
// collector binds directly onto the struct fields.
const adminUserSelectColumns = `
		u.id,
		COALESCE(u.display_name, '') AS full_name,
		COALESCE(u.email, '') AS email,
		u.phone,
		u.avatar_url,
		u.platform_role,
		u.status,
		u.state_id,
		st.name AS state_name,
		owner_ws.tier_slug,
		CASE owner_ws.tier_slug
		    WHEN 'creator'          THEN 'Creator'
		    WHEN 'pro_photographer' THEN 'Pro Photographer'
		    WHEN 'studio'           THEN 'Studio'
		    WHEN 'elite_studio'     THEN 'Elite Studio'
		    WHEN 'starter'          THEN 'Creator'
		    WHEN 'professional'     THEN 'Pro Photographer'
		    WHEN 'business'         THEN 'Elite Studio'
		    WHEN 'enterprise'       THEN 'Elite Studio'
		    ELSE                         'Starter'
		 END AS tier_name,
		COALESCE(storage_stats.storage_used, 0) AS storage_used,
		COALESCE(workspace_stats.workspace_count, 0) AS workspace_count,
		sub.subscription_status,
		sub.subscription_amount_paisa,
		sub.subscription_billing_interval,
		sub.subscription_expires_at,
		COALESCE(pay.total_paid_paise, 0) AS total_paid_paise,
		pay.latest_payment_provider,
		pay.latest_payment_status,
		pay.latest_payment_amount_paise,
		pay.latest_payment_at,
		pay.latest_payment_reference,
		pay.latest_payment_order_id,
		pay.latest_payment_id,
		CONCAT_WS(' ',
			u.id::text,
			COALESCE(u.display_name, ''),
			COALESCE(u.email, ''),
			COALESCE(u.phone, ''),
			COALESCE(u.platform_role, ''),
			COALESCE(u.status, ''),
			COALESCE(st.name, ''),
			COALESCE(owner_ws.workspace_name, ''),
			COALESCE(owner_ws.tier_slug, ''),
			COALESCE(sub.subscription_status, ''),
			COALESCE(sub.subscription_billing_interval, ''),
			COALESCE(pay.latest_payment_provider, ''),
			COALESCE(pay.latest_payment_status, ''),
			COALESCE(pay.latest_payment_reference, ''),
			COALESCE(pay.latest_payment_order_id, ''),
			COALESCE(pay.latest_payment_id, ''),
			COALESCE(pay.payment_search_text, '')
		) AS search_text,
		u.last_login_at,
		u.created_at`

const adminUserFromSQL = `
		FROM users u
		LEFT JOIN states st ON st.id = u.state_id
		LEFT JOIN LATERAL (
			SELECT w.id AS workspace_id, w.name AS workspace_name, w.plan_tier AS tier_slug
			FROM workspaces w
			WHERE w.owner_id = u.id
			ORDER BY w.created_at DESC NULLS LAST, w.id ASC
			LIMIT 1
		) owner_ws ON TRUE
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(a.size_bytes), 0)::bigint AS storage_used
			FROM assets a
			WHERE a.uploaded_by = u.id AND a.deleted_at IS NULL
		) storage_stats ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::bigint AS workspace_count
			FROM workspace_members wm
			WHERE wm.user_id = u.id
		) workspace_stats ON TRUE
		LEFT JOIN LATERAL (
			SELECT
				s.status AS subscription_status,
				s.amount_paisa AS subscription_amount_paisa,
				s.billing_interval AS subscription_billing_interval,
				s.expires_at AS subscription_expires_at
			FROM subscriptions s
			WHERE s.user_id = u.id
			   OR s.workspace_id IN (
					SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = u.id
					UNION
					SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = u.id
			   )
			ORDER BY
				CASE WHEN s.status IN ('active', 'trialing') THEN 0 ELSE 1 END,
				COALESCE(s.updated_at, s.created_at) DESC,
				s.id ASC
			LIMIT 1
		) sub ON TRUE
		LEFT JOIN LATERAL (
			SELECT
				COALESCE(SUM(payment_events.amount_paise) FILTER (WHERE payment_events.status = 'paid'), 0)::bigint AS total_paid_paise,
				(ARRAY_AGG(payment_events.provider ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_provider,
				(ARRAY_AGG(payment_events.status ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_status,
				(ARRAY_AGG(payment_events.amount_paise ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_amount_paise,
				(ARRAY_AGG(COALESCE(payment_events.paid_at, payment_events.created_at) ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_at,
				(ARRAY_AGG(payment_events.reference ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_reference,
				(ARRAY_AGG(payment_events.provider_order_id ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_order_id,
				(ARRAY_AGG(payment_events.provider_payment_id ORDER BY COALESCE(payment_events.paid_at, payment_events.created_at) DESC, payment_events.created_at DESC))[1] AS latest_payment_id,
				STRING_AGG(CONCAT_WS(' ',
					payment_events.id::text,
					payment_events.source,
					payment_events.provider,
					payment_events.status,
					payment_events.reference,
					payment_events.provider_order_id,
					payment_events.provider_payment_id,
					payment_events.amount_paise::text,
					payment_events.currency
				), ' ') AS payment_search_text
			FROM (
				SELECT
					bo.id,
					'billing_order'::text AS source,
					bo.provider::text AS provider,
					bo.status::text AS status,
					bo.amount_paise,
					bo.currency::text AS currency,
					bo.id::text AS reference,
					bo.provider_order_id::text AS provider_order_id,
					bo.provider_payment_id::text AS provider_payment_id,
					bo.paid_at,
					bo.created_at
				FROM billing_orders bo
				WHERE bo.user_id = u.id
				   OR bo.workspace_id IN (
						SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = u.id
						UNION
						SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = u.id
				   )
				UNION ALL
				SELECT
					suo.id,
					'subscription_order'::text AS source,
					suo.provider::text AS provider,
					suo.status::text AS status,
					suo.amount_paise,
					'INR'::text AS currency,
					suo.id::text AS reference,
					COALESCE(suo.provider_order_id, suo.razorpay_order_id)::text AS provider_order_id,
					COALESCE(suo.provider_payment_id, suo.razorpay_payment_id)::text AS provider_payment_id,
					CASE WHEN suo.status = 'paid' THEN suo.updated_at ELSE NULL END AS paid_at,
					suo.created_at
				FROM subscription_upgrade_orders suo
				WHERE suo.initiated_by = u.id
				   OR suo.workspace_id IN (
						SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = u.id
						UNION
						SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = u.id
				   )
				UNION ALL
				SELECT
					p.id,
					'invoice_payment'::text AS source,
					p.method::text AS provider,
					'paid'::text AS status,
					p.amount_paisa,
					i.currency::text AS currency,
					p.reference_number::text AS reference,
					i.invoice_number::text AS provider_order_id,
					p.reference_number::text AS provider_payment_id,
					p.payment_date AS paid_at,
					p.created_at
				FROM payments p
				JOIN invoices i ON i.id = p.invoice_id
				WHERE p.workspace_id IN (
					SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = u.id
					UNION
					SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = u.id
				)
			) payment_events
		) pay ON TRUE`

func adminUserSearchSQL(idx int) string {
	return fmt.Sprintf(`(
		COALESCE(u.display_name, '') ILIKE $%d OR
		COALESCE(u.email, '') ILIKE $%d OR
		COALESCE(u.phone, '') ILIKE $%d OR
		u.id::text ILIKE $%d OR
		COALESCE(u.platform_role, '') ILIKE $%d OR
		COALESCE(u.status, '') ILIKE $%d OR
		COALESCE(st.name, '') ILIKE $%d OR
		COALESCE(owner_ws.workspace_name, '') ILIKE $%d OR
		COALESCE(owner_ws.tier_slug, '') ILIKE $%d OR
		COALESCE(sub.subscription_status, '') ILIKE $%d OR
		COALESCE(sub.subscription_billing_interval, '') ILIKE $%d OR
		COALESCE(pay.latest_payment_provider, '') ILIKE $%d OR
		COALESCE(pay.latest_payment_status, '') ILIKE $%d OR
		COALESCE(pay.latest_payment_reference, '') ILIKE $%d OR
		COALESCE(pay.latest_payment_order_id, '') ILIKE $%d OR
		COALESCE(pay.latest_payment_id, '') ILIKE $%d OR
		COALESCE(pay.payment_search_text, '') ILIKE $%d
	)`, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx, idx)
}

func (r *AdminUserRepo) List(ctx context.Context, f AdminUserFilter) (*PaginatedResult[AdminUserRow], error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}

	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.Search != "" {
		where = append(where, adminUserSearchSQL(idx))
		args = append(args, "%"+strings.TrimSpace(f.Search)+"%")
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.platform_role = $%d", idx))
		args = append(args, f.Role)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("u.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		where = append(where, fmt.Sprintf("u.state_id = $%d", idx))
		args = append(args, *f.StateID)
		idx++
	}
	if f.TierSlug != "" {
		where = append(where, fmt.Sprintf("owner_ws.tier_slug = $%d", idx))
		args = append(args, f.TierSlug)
		idx++
	}
	if f.Cursor != nil {
		where = append(where, fmt.Sprintf("u.id > $%d", idx))
		args = append(args, *f.Cursor)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	sortCol := "u.created_at"
	switch f.Sort {
	case "last_login_at":
		sortCol = "u.last_login_at"
	case "full_name":
		sortCol = "u.display_name"
	}

	// Total count (without cursor).
	countArgs := args
	countWhere := whereClause
	if f.Cursor != nil && len(where) > 0 {
		countParts := where[:len(where)-1]
		if len(countParts) > 0 {
			countWhere = "WHERE " + strings.Join(countParts, " AND ")
		} else {
			countWhere = ""
		}
		countArgs = args[:len(args)-1]
	}

	countSQL := fmt.Sprintf(`
		SELECT COUNT(*)
		%s
		%s`, adminUserFromSQL, countWhere)

	var totalCount int64
	if err := r.pool.QueryRow(ctx, countSQL, countArgs...).Scan(&totalCount); err != nil {
		return nil, fmt.Errorf("admin user count: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT%s
		%s
		%s
		ORDER BY %s DESC NULLS LAST, u.id ASC
		LIMIT $%d`,
		adminUserSelectColumns, adminUserFromSQL, whereClause, sortCol, idx)

	args = append(args, f.Limit+1)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("admin user list: %w", err)
	}
	defer rows.Close()

	items, err := pgx.CollectRows(rows, pgx.RowToStructByName[AdminUserRow])
	if err != nil {
		return nil, fmt.Errorf("admin user scan: %w", err)
	}

	var nextCursor *uuid.UUID
	if len(items) > f.Limit {
		items = items[:f.Limit]
		last := items[len(items)-1].ID
		nextCursor = &last
	}

	return &PaginatedResult[AdminUserRow]{
		Items:      items,
		NextCursor: nextCursor,
		TotalCount: totalCount,
	}, nil
}

// CreateUser inserts a new users row and returns the hydrated AdminUserDetail
// (M39 E5-S1 FR-F01). Returns ErrDuplicateEmail when the email already exists.
//
// Role validation, password complexity, and audit log emission happen at the
// service layer — the repo only enforces the uniqueness constraint.
func (r *AdminUserRepo) CreateUser(ctx context.Context, in AdminUserCreate) (*AdminUserDetail, error) {
	id := uuid.New()
	// INSERT via COALESCE on optional columns so the schema's DEFAULTs apply.
	// display_name is the persistence name for full_name (see migration 002).
	// pending_plan_tier is nullable in the DB; pass nil when the
	// caller didn't pre-set a plan grant so the column stays NULL
	// (chk_users_pending_plan_tier permits NULL).
	var pendingPlan any
	if in.PendingPlanTier != nil && *in.PendingPlanTier != "" {
		pendingPlan = *in.PendingPlanTier
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, email, display_name, platform_role, password_hash, email_verified, must_change_password, pending_plan_tier, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', now(), now())`,
		id, in.Email, in.FullName, in.Role, in.PasswordHash, in.EmailVerified, in.MustChangePassword, pendingPlan,
	)
	if err != nil {
		msg := err.Error()
		// pgconn surfaces uniqueness via SQLSTATE 23505 or a message
		// that contains "unique" / "duplicate key". Check both since the
		// plain pgx path we are on does not decode SQLSTATE here.
		if strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint") || strings.Contains(msg, "23505") {
			return nil, ErrDuplicateEmail
		}
		return nil, fmt.Errorf("users insert: %w", err)
	}
	return r.GetByID(ctx, id)
}

func (r *AdminUserRepo) GetByID(ctx context.Context, id uuid.UUID) (*AdminUserDetail, error) {
	query := fmt.Sprintf(`
		SELECT%s,
			u.updated_at
		%s
		WHERE u.id = $1`, adminUserSelectColumns, adminUserFromSQL)

	rows, err := r.pool.Query(ctx, query, id)
	if err != nil {
		return nil, fmt.Errorf("admin user get: %w", err)
	}
	detail, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[AdminUserDetail])
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("admin user scan: %w", err)
	}

	// Fetch workspaces the user is a member of. The workspace_members
	// table stores role via role_id (FK to roles); we resolve the name
	// via JOIN. joined_at is the real column name (see migration 005).
	wsRows, err := r.pool.Query(ctx, `
		SELECT w.id, w.name, r.name AS role, wm.joined_at AS created_at
		FROM workspace_members wm
		JOIN workspaces w ON w.id = wm.workspace_id
		JOIN roles r ON r.id = wm.role_id
		WHERE wm.user_id = $1
		ORDER BY wm.joined_at DESC`, id)
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces: %w", err)
	}
	detail.Workspaces, err = pgx.CollectRows(wsRows, pgx.RowToStructByName[AdminUserWorkspace])
	if err != nil {
		return nil, fmt.Errorf("admin user workspaces scan: %w", err)
	}

	detail.PaymentEvents, err = r.GetPaymentEvents(ctx, id, 10)
	if err != nil {
		return nil, fmt.Errorf("admin user payment events: %w", err)
	}

	// Fetch recent activity.
	detail.ActivityTimeline, err = r.GetActivityTimeline(ctx, id, 20)
	if err != nil {
		return nil, fmt.Errorf("admin user timeline: %w", err)
	}

	return &detail, nil
}

func (r *AdminUserRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reason string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, status, id)
	if err != nil {
		return fmt.Errorf("admin user update status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.status_change', 'user', $3, jsonb_build_object('status', $4::text, 'reason', $5::text), 'warning', NOW())`,
		uuid.New(), actorID, id, status, reason)
	return err
}

func (r *AdminUserRepo) UpdateRole(ctx context.Context, id uuid.UUID, role string, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `UPDATE users SET platform_role = $1, updated_at = NOW() WHERE id = $2`, role, id)
	if err != nil {
		return fmt.Errorf("admin user update role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.role_change', 'user', $3, jsonb_build_object('role', $4::text), 'critical', NOW())`,
		uuid.New(), actorID, id, role)
	return err
}

func (r *AdminUserRepo) BulkUpdateStatus(ctx context.Context, ids []uuid.UUID, status string, reason string, actorID uuid.UUID) (int64, error) {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET status = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`,
		status, ids)
	if err != nil {
		return 0, fmt.Errorf("admin bulk update status: %w", err)
	}

	// Audit each affected user.
	for _, uid := range ids {
		_, _ = r.pool.Exec(ctx, `
			INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
			VALUES ($1, $2, 'admin', 'user.bulk_status_change', 'user', $3, jsonb_build_object('status', $4, 'reason', $5), 'critical', NOW())`,
			uuid.New(), actorID, uid, status, reason)
	}

	return tag.RowsAffected(), nil
}

// SetDealerCredentials sets a dealer user's password, marks the account
// email_verified, and flags must_change_password=true so the first-login
// redirect kicks in. Called by DealerService.ApproveDealer after a
// generated password is hashed.
func (r *AdminUserRepo) SetDealerCredentials(ctx context.Context, userID uuid.UUID, hashedPassword string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, email_verified = true, must_change_password = true, updated_at = NOW() WHERE id = $2`,
		hashedPassword, userID,
	)
	if err != nil {
		return fmt.Errorf("set dealer credentials: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetEmailByID returns the email address for a user. Used during dealer
// approval to find the address to deliver credentials to.
func (r *AdminUserRepo) GetEmailByID(ctx context.Context, userID uuid.UUID) (string, error) {
	var email string
	err := r.pool.QueryRow(ctx, `SELECT COALESCE(email,'') FROM users WHERE id = $1`, userID).Scan(&email)
	if err != nil {
		return "", fmt.Errorf("get user email by id: %w", err)
	}
	return email, nil
}

func (r *AdminUserRepo) GetActivityTimeline(ctx context.Context, userID uuid.UUID, limit int) ([]AuditLogEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := r.pool.Query(ctx, fmt.Sprintf(`
		%s
		WHERE a.actor_id = $1 OR a.resource_id = $1::text
		ORDER BY a.created_at DESC
		LIMIT $2`, auditLogSelectSQL()), userID, limit)
	if err != nil {
		return nil, fmt.Errorf("admin activity timeline: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowToStructByName[AuditLogEntry])
}

func (r *AdminUserRepo) GetPaymentEvents(ctx context.Context, userID uuid.UUID, limit int) ([]AdminUserPaymentEvent, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := r.pool.Query(ctx, `
		SELECT
			events.id,
			events.source,
			events.provider,
			events.status,
			events.amount_paise,
			events.currency,
			events.reference,
			events.provider_order_id,
			events.provider_payment_id,
			events.paid_at,
			events.created_at
		FROM (
			SELECT
				bo.id,
				'billing_order'::text AS source,
				bo.provider::text AS provider,
				bo.status::text AS status,
				bo.amount_paise,
				bo.currency::text AS currency,
				bo.id::text AS reference,
				bo.provider_order_id::text AS provider_order_id,
				bo.provider_payment_id::text AS provider_payment_id,
				bo.paid_at,
				bo.created_at
			FROM billing_orders bo
			WHERE bo.user_id = $1
			   OR bo.workspace_id IN (
					SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = $1
					UNION
					SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = $1
			   )
			UNION ALL
			SELECT
				suo.id,
				'subscription_order'::text AS source,
				suo.provider::text AS provider,
				suo.status::text AS status,
				suo.amount_paise,
				'INR'::text AS currency,
				suo.id::text AS reference,
				COALESCE(suo.provider_order_id, suo.razorpay_order_id)::text AS provider_order_id,
				COALESCE(suo.provider_payment_id, suo.razorpay_payment_id)::text AS provider_payment_id,
				CASE WHEN suo.status = 'paid' THEN suo.updated_at ELSE NULL END AS paid_at,
				suo.created_at
			FROM subscription_upgrade_orders suo
			WHERE suo.initiated_by = $1
			   OR suo.workspace_id IN (
					SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = $1
					UNION
					SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = $1
			   )
			UNION ALL
			SELECT
				p.id,
				'invoice_payment'::text AS source,
				p.method::text AS provider,
				'paid'::text AS status,
				p.amount_paisa,
				i.currency::text AS currency,
				p.reference_number::text AS reference,
				i.invoice_number::text AS provider_order_id,
				p.reference_number::text AS provider_payment_id,
				p.payment_date AS paid_at,
				p.created_at
			FROM payments p
			JOIN invoices i ON i.id = p.invoice_id
			WHERE p.workspace_id IN (
				SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = $1
				UNION
				SELECT w_scope.id FROM workspaces w_scope WHERE w_scope.owner_id = $1
			)
		) events
		ORDER BY COALESCE(events.paid_at, events.created_at) DESC, events.created_at DESC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("admin user payment events: %w", err)
	}
	defer rows.Close()
	return pgx.CollectRows(rows, pgx.RowToStructByName[AdminUserPaymentEvent])
}

func (r *AdminUserRepo) ExportCSV(ctx context.Context, f AdminUserFilter, writer io.Writer) error {
	var (
		where []string
		args  []interface{}
		idx   = 1
	)

	if f.Search != "" {
		where = append(where, adminUserSearchSQL(idx))
		args = append(args, "%"+strings.TrimSpace(f.Search)+"%")
		idx++
	}
	if f.Role != "" {
		where = append(where, fmt.Sprintf("u.platform_role = $%d", idx))
		args = append(args, f.Role)
		idx++
	}
	if f.Status != "" {
		where = append(where, fmt.Sprintf("u.status = $%d", idx))
		args = append(args, f.Status)
		idx++
	}
	if f.StateID != nil {
		where = append(where, fmt.Sprintf("u.state_id = $%d", idx))
		args = append(args, *f.StateID)
		idx++
	}

	whereClause := ""
	if len(where) > 0 {
		whereClause = "WHERE " + strings.Join(where, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT
			u.id,
			COALESCE(u.display_name, '') AS full_name,
			u.email,
			COALESCE(u.phone, '') AS phone,
			u.platform_role,
			u.status,
			COALESCE(st.name, '') AS state_name,
			COALESCE(
				(SELECT SUM(size_bytes) FROM assets WHERE uploaded_by = u.id AND deleted_at IS NULL),
				0
			) AS storage_used,
			u.created_at
		%s
		%s
		ORDER BY u.created_at DESC`, adminUserFromSQL, whereClause)

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("admin export csv: %w", err)
	}
	defer rows.Close()

	w := csv.NewWriter(writer)
	defer w.Flush()

	_ = w.Write([]string{"id", "full_name", "email", "phone", "platform_role", "status", "state_name", "storage_used", "created_at"})

	for rows.Next() {
		var (
			id, fullName, email, phone, role, status, stateName string
			storageUsed                                         int64
			createdAt                                           time.Time
		)
		if err := rows.Scan(&id, &fullName, &email, &phone, &role, &status, &stateName, &storageUsed, &createdAt); err != nil {
			return fmt.Errorf("admin export row scan: %w", err)
		}
		_ = w.Write([]string{id, fullName, email, phone, role, status, stateName, fmt.Sprintf("%d", storageUsed), createdAt.Format(time.RFC3339)})
	}

	return rows.Err()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// UpdateTier changes the plan_tier on the workspace owned by userID and
// syncs the workspace_storage quota to the new tier's default bytes.
func (r *AdminUserRepo) UpdateTier(ctx context.Context, userID uuid.UUID, tier string, quotaBytes int64, actorID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE workspaces SET plan_tier = $1 WHERE owner_id = $2`,
		tier, userID,
	)
	if err != nil {
		return fmt.Errorf("admin update tier: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	_, _ = r.pool.Exec(ctx, `
		INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		SELECT id, 0, 0, $1 FROM workspaces WHERE owner_id = $2
		ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $1`,
		quotaBytes, userID,
	)
	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (id, actor_id, actor_type, action, resource_type, resource_id, metadata, severity, created_at)
		VALUES ($1, $2, 'admin', 'user.tier_change', 'user', $3, jsonb_build_object('tier', $4::text), 'warning', NOW())`,
		uuid.New(), actorID, userID, tier)
	return err
}

// ConsumePendingPlanTier atomically reads users.pending_plan_tier for the
// given user and clears it in the same statement. The onboarding service
// calls this just before creating the workspace so it can override the
// user-picked plan with the admin's grant. Returns "" with no error when
// the column is NULL — the onboarding flow then falls back to the user's
// own selection.
//
// The UPDATE ... RETURNING pattern guarantees the read-and-clear is
// atomic: a concurrent retry of onboarding completion cannot apply the
// same grant twice, even if the workspace insert fails and the user
// resubmits the wizard form a moment later.
func (r *AdminUserRepo) ConsumePendingPlanTier(ctx context.Context, userID uuid.UUID) (string, error) {
	var planTier *string
	err := r.pool.QueryRow(ctx, `
		UPDATE users
		   SET pending_plan_tier = NULL,
		       updated_at = now()
		 WHERE id = $1
		   AND pending_plan_tier IS NOT NULL
		RETURNING pending_plan_tier`, userID).Scan(&planTier)
	if err == pgx.ErrNoRows {
		// Either the user doesn't exist (caller's problem; will surface
		// later) or the column was already NULL — both map to "no grant".
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("consume pending plan tier: %w", err)
	}
	if planTier == nil {
		return "", nil
	}
	return *planTier, nil
}
