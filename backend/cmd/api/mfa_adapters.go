package main

import (
	"context"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/auth"
	"github.com/rawdrive/backend/internal/repository"
)

// F-007 (M17 wave 2): adapters between repository.UserMFA* types and
// the auth.MFA* interfaces. The two packages can't share the same row
// type without creating an import cycle (auth → repository would be a
// new dep, and repository already depends on auth for refresh sessions).

type mfaEnrollmentStoreAdapter struct {
	repo *repository.UserMFAEnrollmentsRepo
}

func (a *mfaEnrollmentStoreAdapter) Create(ctx context.Context, row *auth.MFAEnrollmentRow) error {
	return a.repo.Create(ctx, &repository.UserMFAEnrollment{
		UserID:               row.UserID,
		TOTPSecretCT:         row.TOTPSecretCT,
		TOTPSecretDEKWrapped: row.TOTPSecretDEKWrapped,
		TOTPIssuer:           row.TOTPIssuer,
	})
}

func (a *mfaEnrollmentStoreAdapter) GetByUserID(ctx context.Context, userID uuid.UUID) (*auth.MFAEnrollmentRow, error) {
	e, err := a.repo.GetByUserID(ctx, userID)
	if err != nil {
		if err == repository.ErrMFAEnrollmentNotFound {
			return nil, auth.ErrMFANotEnrolled
		}
		return nil, err
	}
	return &auth.MFAEnrollmentRow{
		ID:                   e.ID,
		UserID:               e.UserID,
		TOTPSecretCT:         e.TOTPSecretCT,
		TOTPSecretDEKWrapped: e.TOTPSecretDEKWrapped,
		TOTPIssuer:           e.TOTPIssuer,
		EnrolledAt:           e.EnrolledAt,
		LastVerifiedAt:       e.LastVerifiedAt,
		DisabledAt:           e.DisabledAt,
	}, nil
}

func (a *mfaEnrollmentStoreAdapter) UpdateLastVerified(ctx context.Context, userID uuid.UUID) error {
	return a.repo.UpdateLastVerified(ctx, userID)
}

func (a *mfaEnrollmentStoreAdapter) Delete(ctx context.Context, userID uuid.UUID) error {
	return a.repo.Delete(ctx, userID)
}

type mfaRecoveryCodeStoreAdapter struct {
	repo *repository.UserMFARecoveryCodesRepo
}

func (a *mfaRecoveryCodeStoreAdapter) BulkInsert(ctx context.Context, userID uuid.UUID, hashes []string) error {
	return a.repo.BulkInsert(ctx, userID, hashes)
}

func (a *mfaRecoveryCodeStoreAdapter) DeleteAll(ctx context.Context, userID uuid.UUID) error {
	return a.repo.DeleteAll(ctx, userID)
}

func (a *mfaRecoveryCodeStoreAdapter) CountActive(ctx context.Context, userID uuid.UUID) (int, error) {
	return a.repo.CountActive(ctx, userID)
}

// ListActive mirrors repository.UserMFARecoveryCodesRepo.ListActive but
// shrinks the row shape to the minimum the auth handler needs (id +
// hash). The auth package cannot import repository without creating an
// import cycle, so this adapter does the narrowing here.
func (a *mfaRecoveryCodeStoreAdapter) ListActive(ctx context.Context, userID uuid.UUID) ([]auth.MFARecoveryCodeHashRow, error) {
	rows, err := a.repo.ListActive(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]auth.MFARecoveryCodeHashRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, auth.MFARecoveryCodeHashRow{
			ID:       row.ID,
			CodeHash: row.CodeHash,
		})
	}
	return out, nil
}

// MarkConsumed passes through to the repository's atomic consume method.
// The repository uses UPDATE ... WHERE consumed_at IS NULL so a
// concurrent second consume of the same code returns an error and
// prevents double-use.
func (a *mfaRecoveryCodeStoreAdapter) MarkConsumed(ctx context.Context, id uuid.UUID) error {
	return a.repo.MarkConsumed(ctx, id)
}
