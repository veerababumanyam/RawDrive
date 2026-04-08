package repository

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ContractTemplate represents a reusable contract template.
type ContractTemplate struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	ContentHTML string    `json:"content_html"`
	Variables   string    `json:"variables"` // JSON array
	IsPreset    bool      `json:"is_preset"`
	Version     int       `json:"version"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Contract represents a signed or pending service agreement.
type Contract struct {
	ID             uuid.UUID  `json:"id"`
	WorkspaceID    uuid.UUID  `json:"workspace_id"`
	ContactID      uuid.UUID  `json:"contact_id"`
	TemplateID     *uuid.UUID `json:"template_id"`
	Title          string     `json:"title"`
	ContentHTML    string     `json:"content_html"`
	Status         string     `json:"status"`
	TotalValuePaisa *int64    `json:"total_value_paisa"`
	SignedAt       *time.Time `json:"signed_at"`
	SignerIP       *net.IP    `json:"signer_ip"`
	SignerUserAgent *string   `json:"signer_user_agent"`
	SignatureData  *string    `json:"signature_data"`
	ExpiresAt      *time.Time `json:"expires_at"`
	EventID        *uuid.UUID `json:"event_id"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

type ContractRepo struct {
	DB *pgxpool.Pool
}

func NewContractRepo(db *pgxpool.Pool) *ContractRepo {
	return &ContractRepo{DB: db}
}

// Template methods

func (r *ContractRepo) CreateTemplate(ctx context.Context, t *ContractTemplate) error {
	t.ID = uuid.New()
	now := time.Now().UTC()
	t.CreatedAt = now
	t.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO contract_templates (id, workspace_id, name, category, content_html, variables, is_preset, version, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		t.ID, t.WorkspaceID, t.Name, t.Category, t.ContentHTML,
		t.Variables, t.IsPreset, t.Version, t.CreatedAt, t.UpdatedAt,
	)
	return err
}

func (r *ContractRepo) GetTemplate(ctx context.Context, workspaceID, id uuid.UUID) (ContractTemplate, error) {
	var t ContractTemplate
	err := r.DB.QueryRow(ctx, `
		SELECT id, workspace_id, name, category, content_html, variables, is_preset, version, created_at, updated_at
		FROM contract_templates WHERE id=$1 AND workspace_id=$2`, id, workspaceID).Scan(
		&t.ID, &t.WorkspaceID, &t.Name, &t.Category, &t.ContentHTML,
		&t.Variables, &t.IsPreset, &t.Version, &t.CreatedAt, &t.UpdatedAt,
	)
	return t, err
}

func (r *ContractRepo) ListTemplates(ctx context.Context, workspaceID uuid.UUID) ([]ContractTemplate, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, workspace_id, name, category, content_html, variables, is_preset, version, created_at, updated_at
		FROM contract_templates WHERE workspace_id = $1 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ContractTemplate
	for rows.Next() {
		var t ContractTemplate
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Category, &t.ContentHTML,
			&t.Variables, &t.IsPreset, &t.Version, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (r *ContractRepo) UpdateTemplate(ctx context.Context, t *ContractTemplate) error {
	t.UpdatedAt = time.Now().UTC()
	t.Version++
	_, err := r.DB.Exec(ctx, `
		UPDATE contract_templates SET name=$1, category=$2, content_html=$3, variables=$4, version=$5, updated_at=$6
		WHERE id=$7 AND workspace_id=$8`,
		t.Name, t.Category, t.ContentHTML, t.Variables, t.Version, t.UpdatedAt,
		t.ID, t.WorkspaceID,
	)
	return err
}

// Contract methods

const contractCols = `id, workspace_id, contact_id, template_id, title, content_html, status, total_value_paisa, signed_at, signer_ip, signer_user_agent, signature_data, expires_at, event_id, created_at, updated_at`

func scanContract(row pgx.Row) (Contract, error) {
	var c Contract
	err := row.Scan(&c.ID, &c.WorkspaceID, &c.ContactID, &c.TemplateID,
		&c.Title, &c.ContentHTML, &c.Status, &c.TotalValuePaisa,
		&c.SignedAt, &c.SignerIP, &c.SignerUserAgent, &c.SignatureData,
		&c.ExpiresAt, &c.EventID, &c.CreatedAt, &c.UpdatedAt)
	return c, err
}

func (r *ContractRepo) Create(ctx context.Context, c *Contract) error {
	c.ID = uuid.New()
	now := time.Now().UTC()
	c.CreatedAt = now
	c.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO contracts (`+contractCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		c.ID, c.WorkspaceID, c.ContactID, c.TemplateID,
		c.Title, c.ContentHTML, c.Status, c.TotalValuePaisa,
		c.SignedAt, c.SignerIP, c.SignerUserAgent, c.SignatureData,
		c.ExpiresAt, c.EventID, c.CreatedAt, c.UpdatedAt,
	)
	return err
}

func (r *ContractRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (Contract, error) {
	row := r.DB.QueryRow(ctx,
		`SELECT `+contractCols+` FROM contracts WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return scanContract(row)
}

func (r *ContractRepo) List(ctx context.Context, workspaceID uuid.UUID, status string, limit int) ([]Contract, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := `SELECT ` + contractCols + ` FROM contracts WHERE workspace_id = $1`
	args := []any{workspaceID}
	idx := 2
	if status != "" {
		query += fmt.Sprintf(` AND status = $%d`, idx)
		args = append(args, status)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, idx)
	args = append(args, limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Contract
	for rows.Next() {
		var c Contract
		if err := rows.Scan(&c.ID, &c.WorkspaceID, &c.ContactID, &c.TemplateID,
			&c.Title, &c.ContentHTML, &c.Status, &c.TotalValuePaisa,
			&c.SignedAt, &c.SignerIP, &c.SignerUserAgent, &c.SignatureData,
			&c.ExpiresAt, &c.EventID, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *ContractRepo) UpdateStatus(ctx context.Context, workspaceID, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE contracts SET status=$1, updated_at=$2 WHERE id=$3 AND workspace_id=$4`,
		status, time.Now().UTC(), id, workspaceID)
	return err
}

// RecordSignature records an e-signature on a contract.
func (r *ContractRepo) RecordSignature(ctx context.Context, workspaceID, id uuid.UUID, signatureData string, signerIP net.IP, userAgent string) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE contracts SET status='signed', signed_at=$1, signer_ip=$2, signer_user_agent=$3,
		       signature_data=$4, updated_at=$1
		WHERE id=$5 AND workspace_id=$6`,
		now, signerIP, userAgent, signatureData, id, workspaceID)
	return err
}
