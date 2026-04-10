package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// KycDocument is the persisted record for a dealer KYC upload. The actual
// file lives in R2 at StorageKey; this row stores metadata + review state.
type KycDocument struct {
	ID              uuid.UUID  `json:"id"`
	DealerID        uuid.UUID  `json:"dealer_id"`
	DocumentType    string     `json:"document_type"`
	StorageKey      string     `json:"storage_key"`
	Filename        string     `json:"filename"`
	Status          string     `json:"status"`
	RejectionReason *string    `json:"rejection_reason,omitempty"`
	UploadedAt      time.Time  `json:"uploaded_at"`
	ReviewedAt      *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy      *uuid.UUID `json:"reviewed_by,omitempty"`
}

// KycDocumentRepo persists dealer KYC document metadata.
type KycDocumentRepo struct {
	DB *pgxpool.Pool
}

func NewKycDocumentRepo(db *pgxpool.Pool) *KycDocumentRepo {
	return &KycDocumentRepo{DB: db}
}

// Whitelists kept in sync with the CHECK constraints in migration 047.
var (
	AllowedKycDocumentTypes = map[string]bool{
		"pan":            true,
		"gst":            true,
		"bank_statement": true,
		"address_proof":  true,
		"photo_id":       true,
	}
	AllowedKycStatuses = map[string]bool{
		"pending":  true,
		"approved": true,
		"rejected": true,
	}
)

// ErrInvalidKycDocumentType is returned when the document_type is not in the whitelist.
var ErrInvalidKycDocumentType = errors.New("kyc: invalid document_type")

// ErrInvalidKycStatus is returned when the status is not in the whitelist.
var ErrInvalidKycStatus = errors.New("kyc: invalid status")

// ValidateDocumentType returns nil if t is in the allowed set.
func ValidateKycDocumentType(t string) error {
	if !AllowedKycDocumentTypes[t] {
		return fmt.Errorf("%w: %q", ErrInvalidKycDocumentType, t)
	}
	return nil
}

// ValidateKycStatus returns nil if s is in the allowed set.
func ValidateKycStatus(s string) error {
	if !AllowedKycStatuses[s] {
		return fmt.Errorf("%w: %q", ErrInvalidKycStatus, s)
	}
	return nil
}

// Create inserts a new kyc_documents row. The caller is responsible for
// uploading the file to R2 first and passing the resulting storage_key.
func (r *KycDocumentRepo) Create(ctx context.Context, d *KycDocument) error {
	if err := ValidateKycDocumentType(d.DocumentType); err != nil {
		return err
	}
	if d.Status == "" {
		d.Status = "pending"
	}
	if err := ValidateKycStatus(d.Status); err != nil {
		return err
	}
	d.ID = uuid.New()
	d.UploadedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO kyc_documents (id, dealer_id, document_type, storage_key, filename, status, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, d.ID, d.DealerID, d.DocumentType, d.StorageKey, d.Filename, d.Status, d.UploadedAt)
	return err
}

// ListByDealer returns all KYC documents for a dealer, newest first.
func (r *KycDocumentRepo) ListByDealer(ctx context.Context, dealerID uuid.UUID) ([]KycDocument, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, dealer_id, document_type, storage_key, filename, status,
		       rejection_reason, uploaded_at, reviewed_at, reviewed_by
		FROM kyc_documents
		WHERE dealer_id = $1
		ORDER BY uploaded_at DESC
	`, dealerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []KycDocument
	for rows.Next() {
		var d KycDocument
		if err := rows.Scan(&d.ID, &d.DealerID, &d.DocumentType, &d.StorageKey,
			&d.Filename, &d.Status, &d.RejectionReason, &d.UploadedAt,
			&d.ReviewedAt, &d.ReviewedBy); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetByID returns a single KYC document. Returns pgx.ErrNoRows if not found.
func (r *KycDocumentRepo) GetByID(ctx context.Context, id uuid.UUID) (KycDocument, error) {
	var d KycDocument
	err := r.DB.QueryRow(ctx, `
		SELECT id, dealer_id, document_type, storage_key, filename, status,
		       rejection_reason, uploaded_at, reviewed_at, reviewed_by
		FROM kyc_documents
		WHERE id = $1
	`, id).Scan(&d.ID, &d.DealerID, &d.DocumentType, &d.StorageKey,
		&d.Filename, &d.Status, &d.RejectionReason, &d.UploadedAt,
		&d.ReviewedAt, &d.ReviewedBy)
	return d, err
}

// UpdateStatus transitions a document's review status. reason is only stored
// when status == "rejected"; it is ignored (and set to NULL) for "approved".
func (r *KycDocumentRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status string, reason *string, reviewerID uuid.UUID) error {
	if err := ValidateKycStatus(status); err != nil {
		return err
	}
	// Null out the reason on approvals so we don't leak a stale rejection note.
	var storedReason *string
	if status == "rejected" {
		storedReason = reason
	}
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE kyc_documents
		SET status = $2,
		    rejection_reason = $3,
		    reviewed_at = $4,
		    reviewed_by = $5
		WHERE id = $1
	`, id, status, storedReason, now, reviewerID)
	return err
}
