package workspace

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PgRepo implements Repository using PostgreSQL.
type PgRepo struct {
	pool *pgxpool.Pool
}

// NewPgRepo creates a new PostgreSQL-backed workspace repository.
func NewPgRepo(pool *pgxpool.Pool) *PgRepo {
	return &PgRepo{pool: pool}
}

// CreateWithBootstrap co-creates the workspace row, its Owner
// workspace_members row, and its workspace_storage quota row inside a
// SINGLE pgx transaction (AREA-CUSTOMER-3 / AREA-CUSTOMER-1, audit
// 2026-05-31). Either all three rows are committed together or none are:
// a workspace can NEVER exist without its membership + quota rows.
//
// Idempotency: the members and storage inserts use ON CONFLICT DO NOTHING /
// DO UPDATE so a partial-failure retry of onboarding does not error, but
// the function still VERIFIES (via affected-row / existence checks inside
// the tx) that both rows are present before committing. If the workspace
// insert raises the migration-096 (owner_id, lower(name)) unique violation
// the typed ErrDuplicateName sentinel is surfaced so the onboarding adapter
// can run its recovery path.
//
// quotaBytes is supplied by the caller (resolved from the plan tier via
// service.PlanDefaultQuotaBytes) to avoid an import cycle between the
// workspace and service packages.
func (r *PgRepo) CreateWithBootstrap(ctx context.Context, ws *Workspace, quotaBytes int64) (*Workspace, error) {
	if ws.BusinessProfileSlug == "" {
		ws.BusinessProfileSlug = resolveBusinessProfileSlug(ws.Name)
	}
	if ws.BusinessUniqueCode == "" {
		code, err := generateUniqueBusinessCode(ctx, r)
		if err == nil {
			ws.BusinessUniqueCode = code
		}
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("workspace bootstrap begin tx: %w", err)
	}
	// Rollback is a no-op once Commit succeeds; safe to always defer.
	defer func() { _ = tx.Rollback(ctx) }()

	// 1. workspace row
	if err := tx.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, plan_tier, business_profile_slug, business_unique_code)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		ws.Name, ws.StateID, ws.OwnerID, ws.PlanTier, ws.BusinessProfileSlug, ws.BusinessUniqueCode,
	).Scan(&ws.ID); err != nil {
		if isDuplicateOwnerName(err) {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("workspace bootstrap insert workspace: %w", err)
	}

	// 2. Owner membership row. ON CONFLICT DO NOTHING keeps re-runs safe;
	//    the existence check below guarantees the row is actually present
	//    before we commit, so a missing 'Owner' role (0 rows inserted)
	//    cannot silently leave the workspace member-less.
	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_members (workspace_id, user_id, role_id)
		 VALUES ($1, $2, (SELECT id FROM roles WHERE name = 'Owner'))
		 ON CONFLICT DO NOTHING`,
		ws.ID, ws.OwnerID,
	); err != nil {
		return nil, fmt.Errorf("workspace bootstrap insert member: %w", err)
	}
	var memberExists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2)`,
		ws.ID, ws.OwnerID,
	).Scan(&memberExists); err != nil {
		return nil, fmt.Errorf("workspace bootstrap verify member: %w", err)
	}
	if !memberExists {
		return nil, fmt.Errorf("workspace bootstrap: owner membership row not created (missing 'Owner' role?)")
	}

	// 3. Storage quota row. The dashboard storage widget reads this table
	//    directly (never mocked), so it MUST exist for every workspace.
	if _, err := tx.Exec(ctx,
		`INSERT INTO workspace_storage (workspace_id, used_bytes, derivative_bytes, quota_bytes)
		 VALUES ($1, 0, 0, $2)
		 ON CONFLICT (workspace_id) DO UPDATE SET quota_bytes = $2
		 WHERE workspace_storage.quota_bytes = 0`,
		ws.ID, quotaBytes,
	); err != nil {
		return nil, fmt.Errorf("workspace bootstrap insert storage: %w", err)
	}
	var storageExists bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM workspace_storage WHERE workspace_id = $1)`,
		ws.ID,
	).Scan(&storageExists); err != nil {
		return nil, fmt.Errorf("workspace bootstrap verify storage: %w", err)
	}
	if !storageExists {
		return nil, fmt.Errorf("workspace bootstrap: storage quota row not created")
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("workspace bootstrap commit: %w", err)
	}
	return ws, nil
}

func (r *PgRepo) Create(ctx context.Context, ws *Workspace) (*Workspace, error) {
	// Populate business-subdomain identity (migration 121) if the caller
	// hasn't supplied them. Failure to generate a unique code is non-fatal:
	// we leave the field empty and let the migration's CHECK + UNIQUE
	// constraints catch it (workspace creation will return a clean error
	// from PG rather than silently violate). The DB index is the source
	// of truth for uniqueness.
	if ws.BusinessProfileSlug == "" {
		ws.BusinessProfileSlug = resolveBusinessProfileSlug(ws.Name)
	}
	if ws.BusinessUniqueCode == "" {
		code, err := generateUniqueBusinessCode(ctx, r)
		if err == nil {
			ws.BusinessUniqueCode = code
		}
		// silent fallback — if generation fails, the INSERT below carries
		// a NULL code which violates the partial-unique index; PG returns
		// an error and the workspace isn't created. Better than a wedge
		// where the row exists but has no subdomain identity.
	}

	err := r.pool.QueryRow(ctx,
		`INSERT INTO workspaces (name, state_id, owner_id, plan_tier, business_profile_slug, business_unique_code)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id`,
		ws.Name, ws.StateID, ws.OwnerID, ws.PlanTier, ws.BusinessProfileSlug, ws.BusinessUniqueCode,
	).Scan(&ws.ID)
	if err != nil {
		// Issue #5: surface migration-096 unique violations as a
		// typed sentinel so the onboarding adapter can short-circuit
		// the partial-failure retry case without leaking PG codes.
		if isDuplicateOwnerName(err) {
			return nil, ErrDuplicateName
		}
		return nil, fmt.Errorf("workspace repo create: %w", err)
	}
	return ws, nil
}

// GetByOwnerAndName fetches the workspace owned by ownerID whose name
// matches case-insensitively. Returns ErrNotFound when no row matches.
// Used by the onboarding adapter to recover from a duplicate-insert
// retry by returning the previously-created workspace ID.
func (r *PgRepo) GetByOwnerAndName(ctx context.Context, ownerID, name string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE owner_id = $1 AND lower(name) = lower($2) LIMIT 1`,
		ownerID, name,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by owner+name: %w", err)
	}
	return ws, nil
}

// isDuplicateOwnerName reports whether err originates from a
// unique_violation on the migration-096 (owner_id, lower(name)) index.
// Matching by constraint name keeps unrelated future unique indexes
// (e.g., a global slug) from being misclassified as duplicate-name.
func isDuplicateOwnerName(err error) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return false
	}
	if pgErr.Code != "23505" {
		return false
	}
	return pgErr.ConstraintName == "workspaces_owner_lower_name_uniq"
}

func (r *PgRepo) GetByID(ctx context.Context, id string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE id = $1`, id,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get: %w", err)
	}
	return ws, nil
}

// businessUniqueCodeExists is the codeExister implementation for the
// generator's collision retry loop (see business_subdomain.go).
func (r *PgRepo) businessUniqueCodeExists(ctx context.Context, code string) (bool, error) {
	var exists bool
	err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM workspaces WHERE business_unique_code = $1)`,
		code,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("workspace repo code exists: %w", err)
	}
	return exists, nil
}

// GetByBusinessUniqueCode resolves a workspace from the random 8-char code
// portion of its subdomain. Used by the public gallery handler to scope
// slug lookups: the code is globally unique (idx_workspaces_business_unique_code,
// migration 121) so this is a single-row lookup. Returns ErrNotFound when
// no workspace matches — including soft-deleted ones, since this path
// serves public traffic and shouldn't resurrect deleted studios.
func (r *PgRepo) GetByBusinessUniqueCode(ctx context.Context, code string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free'),
		        COALESCE(business_profile_slug, ''), COALESCE(business_unique_code, '')
		 FROM workspaces
		 WHERE business_unique_code = $1 AND deleted_at IS NULL
		 LIMIT 1`,
		code,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier, &ws.BusinessProfileSlug, &ws.BusinessUniqueCode)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by business code: %w", err)
	}
	return ws, nil
}

// GetByOwner returns the first workspace owned by the given user.
func (r *PgRepo) GetByOwner(ctx context.Context, ownerID string) (*Workspace, error) {
	ws := &Workspace{}
	err := r.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(state_id::text,''), COALESCE(owner_id::text,''), COALESCE(plan_tier, 'free')
		 FROM workspaces WHERE owner_id = $1 LIMIT 1`, ownerID,
	).Scan(&ws.ID, &ws.Name, &ws.StateID, &ws.OwnerID, &ws.PlanTier)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("workspace repo get by owner: %w", err)
	}
	return ws, nil
}
