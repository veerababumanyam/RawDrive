package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ServicePackage is a reusable CRM package offered by a workspace.
type ServicePackage struct {
	ID             uuid.UUID      `json:"id"`
	WorkspaceID    uuid.UUID      `json:"workspace_id"`
	Name           string         `json:"name"`
	Description    string         `json:"description"`
	Inclusions     []string       `json:"inclusions"`
	BasePricePaisa int64          `json:"base_price_paisa"`
	GSTRate        float64        `json:"gst_rate"`
	SACCode        string         `json:"sac_code"`
	Active         bool           `json:"active"`
	Addons         []PackageAddon `json:"addons,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

type PackageAddon struct {
	ID          uuid.UUID `json:"id"`
	PackageID   uuid.UUID `json:"package_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	PricePaisa  int64     `json:"price_paisa"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type ServicePackageRepo struct {
	DB *pgxpool.Pool
}

func NewServicePackageRepo(db *pgxpool.Pool) *ServicePackageRepo {
	return &ServicePackageRepo{DB: db}
}

func (r *ServicePackageRepo) Create(ctx context.Context, pkg *ServicePackage) error {
	if pkg.ID == uuid.Nil {
		pkg.ID = uuid.New()
	}
	now := time.Now().UTC()
	pkg.CreatedAt = now
	pkg.UpdatedAt = now
	if pkg.SACCode == "" {
		pkg.SACCode = "998386"
	}
	if pkg.GSTRate == 0 {
		pkg.GSTRate = 18
	}
	pkg.Active = true
	inclusions, err := json.Marshal(pkg.Inclusions)
	if err != nil {
		return fmt.Errorf("marshal package inclusions: %w", err)
	}

	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx, `
		INSERT INTO service_packages
			(id, workspace_id, name, description, inclusions, base_price_paisa, gst_rate, sac_code, active, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		pkg.ID, pkg.WorkspaceID, pkg.Name, pkg.Description, inclusions, pkg.BasePricePaisa,
		pkg.GSTRate, pkg.SACCode, pkg.Active, pkg.CreatedAt, pkg.UpdatedAt)
	if err != nil {
		return fmt.Errorf("create service package: %w", err)
	}
	if err := replacePackageAddons(ctx, tx, pkg.ID, pkg.Addons); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *ServicePackageRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (ServicePackage, error) {
	row := r.DB.QueryRow(ctx, `
		SELECT id, workspace_id, name, description, inclusions, base_price_paisa,
		       gst_rate, sac_code, active, created_at, updated_at
		FROM service_packages
		WHERE id = $1 AND workspace_id = $2`, id, workspaceID)
	pkg, err := scanServicePackage(row)
	if err != nil {
		return pkg, err
	}
	pkg.Addons, err = r.listAddons(ctx, pkg.ID)
	return pkg, err
}

func (r *ServicePackageRepo) List(ctx context.Context, workspaceID uuid.UUID, includeInactive bool) ([]ServicePackage, error) {
	query := `
		SELECT id, workspace_id, name, description, inclusions, base_price_paisa,
		       gst_rate, sac_code, active, created_at, updated_at
		FROM service_packages
		WHERE workspace_id = $1`
	if !includeInactive {
		query += ` AND active = TRUE`
	}
	query += ` ORDER BY updated_at DESC`

	rows, err := r.DB.Query(ctx, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var packages []ServicePackage
	for rows.Next() {
		pkg, err := scanServicePackage(rows)
		if err != nil {
			return nil, err
		}
		pkg.Addons, err = r.listAddons(ctx, pkg.ID)
		if err != nil {
			return nil, err
		}
		packages = append(packages, pkg)
	}
	return packages, rows.Err()
}

func (r *ServicePackageRepo) Update(ctx context.Context, pkg *ServicePackage) error {
	pkg.UpdatedAt = time.Now().UTC()
	if pkg.SACCode == "" {
		pkg.SACCode = "998386"
	}
	if pkg.GSTRate == 0 {
		pkg.GSTRate = 18
	}
	inclusions, err := json.Marshal(pkg.Inclusions)
	if err != nil {
		return fmt.Errorf("marshal package inclusions: %w", err)
	}
	tx, err := r.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE service_packages
		SET name=$1, description=$2, inclusions=$3, base_price_paisa=$4,
		    gst_rate=$5, sac_code=$6, active=$7, updated_at=$8
		WHERE id=$9 AND workspace_id=$10`,
		pkg.Name, pkg.Description, inclusions, pkg.BasePricePaisa, pkg.GSTRate,
		pkg.SACCode, pkg.Active, pkg.UpdatedAt, pkg.ID, pkg.WorkspaceID)
	if err != nil {
		return fmt.Errorf("update service package: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	if err := replacePackageAddons(ctx, tx, pkg.ID, pkg.Addons); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *ServicePackageRepo) Deactivate(ctx context.Context, workspaceID, id uuid.UUID) error {
	tag, err := r.DB.Exec(ctx, `
		UPDATE service_packages SET active = FALSE, updated_at = $1
		WHERE id = $2 AND workspace_id = $3`, time.Now().UTC(), id, workspaceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func scanServicePackage(row pgx.Row) (ServicePackage, error) {
	var pkg ServicePackage
	var inclusions []byte
	err := row.Scan(&pkg.ID, &pkg.WorkspaceID, &pkg.Name, &pkg.Description,
		&inclusions, &pkg.BasePricePaisa, &pkg.GSTRate, &pkg.SACCode,
		&pkg.Active, &pkg.CreatedAt, &pkg.UpdatedAt)
	if err != nil {
		return pkg, err
	}
	if len(inclusions) > 0 {
		_ = json.Unmarshal(inclusions, &pkg.Inclusions)
	}
	return pkg, nil
}

func replacePackageAddons(ctx context.Context, tx pgx.Tx, packageID uuid.UUID, addons []PackageAddon) error {
	if _, err := tx.Exec(ctx, `DELETE FROM package_addons WHERE package_id = $1`, packageID); err != nil {
		return err
	}
	now := time.Now().UTC()
	for i := range addons {
		if addons[i].ID == uuid.Nil {
			addons[i].ID = uuid.New()
		}
		addons[i].PackageID = packageID
		addons[i].CreatedAt = now
		addons[i].UpdatedAt = now
		if _, err := tx.Exec(ctx, `
			INSERT INTO package_addons
				(id, package_id, name, description, price_paisa, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7)`,
			addons[i].ID, packageID, addons[i].Name, addons[i].Description,
			addons[i].PricePaisa, now, now); err != nil {
			return fmt.Errorf("replace package addon: %w", err)
		}
	}
	return nil
}

func (r *ServicePackageRepo) listAddons(ctx context.Context, packageID uuid.UUID) ([]PackageAddon, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, package_id, name, description, price_paisa, created_at, updated_at
		FROM package_addons
		WHERE package_id = $1
		ORDER BY created_at ASC`, packageID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var addons []PackageAddon
	for rows.Next() {
		var addon PackageAddon
		if err := rows.Scan(&addon.ID, &addon.PackageID, &addon.Name, &addon.Description,
			&addon.PricePaisa, &addon.CreatedAt, &addon.UpdatedAt); err != nil {
			return nil, err
		}
		addons = append(addons, addon)
	}
	return addons, rows.Err()
}
