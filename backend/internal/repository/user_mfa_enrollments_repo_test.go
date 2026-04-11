package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// F-007 (M17 wave 2): user MFA enrollment repo tests.
// Unit tests only — DB integration tests live in backend/tests/ and use
// testcontainers. These tests exercise the constructor, input validation
// (nil pool, empty fields), and the error-sentinel plumbing.

func TestNewUserMFAEnrollmentsRepo(t *testing.T) {
	repo := NewUserMFAEnrollmentsRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestUserMFAEnrollment_ZeroValue(t *testing.T) {
	e := UserMFAEnrollment{}
	assert.Equal(t, uuid.Nil, e.ID)
	assert.Equal(t, uuid.Nil, e.UserID)
	assert.Nil(t, e.TOTPSecretCT)
	assert.Nil(t, e.TOTPSecretDEKWrapped)
	assert.Empty(t, e.TOTPIssuer)
	assert.Nil(t, e.LastVerifiedAt)
	assert.Nil(t, e.DisabledAt)
}

func TestUserMFAEnrollment_FieldsSet(t *testing.T) {
	id := uuid.New()
	userID := uuid.New()
	e := UserMFAEnrollment{
		ID:                   id,
		UserID:               userID,
		TOTPSecretCT:         []byte("encrypted-bytes"),
		TOTPSecretDEKWrapped: []byte("wrapped-dek"),
		TOTPIssuer:           "RawDrive",
	}
	assert.Equal(t, id, e.ID)
	assert.Equal(t, userID, e.UserID)
	assert.Equal(t, []byte("encrypted-bytes"), e.TOTPSecretCT)
	assert.Equal(t, []byte("wrapped-dek"), e.TOTPSecretDEKWrapped)
	assert.Equal(t, "RawDrive", e.TOTPIssuer)
}

func TestUserMFAEnrollmentsRepo_CreateValidation(t *testing.T) {
	// Constructor validation runs before any DB touch. Nil pool is fine
	// here because the guard clauses return early.
	repo := NewUserMFAEnrollmentsRepo(nil)
	ctx := t.Context()

	cases := []struct {
		name    string
		input   *UserMFAEnrollment
		wantErr string
	}{
		{"nil enrollment", nil, "nil enrollment"},
		{"zero user_id", &UserMFAEnrollment{
			TOTPSecretCT:         []byte("ct"),
			TOTPSecretDEKWrapped: []byte("dek"),
			TOTPIssuer:           "RawDrive",
		}, "user_id required"},
		{"empty ciphertext", &UserMFAEnrollment{
			UserID:               uuid.New(),
			TOTPSecretDEKWrapped: []byte("dek"),
			TOTPIssuer:           "RawDrive",
		}, "totp_secret_ct required"},
		{"empty wrapped dek", &UserMFAEnrollment{
			UserID:       uuid.New(),
			TOTPSecretCT: []byte("ct"),
			TOTPIssuer:   "RawDrive",
		}, "totp_secret_dek_wrapped required"},
		{"empty issuer", &UserMFAEnrollment{
			UserID:               uuid.New(),
			TOTPSecretCT:         []byte("ct"),
			TOTPSecretDEKWrapped: []byte("dek"),
		}, "totp_issuer required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := repo.Create(ctx, tc.input)
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tc.wantErr)
		})
	}
}
