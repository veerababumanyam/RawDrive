package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// F-007 (M17 wave 2): recovery codes repo unit tests.

func TestNewUserMFARecoveryCodesRepo(t *testing.T) {
	repo := NewUserMFARecoveryCodesRepo(nil)
	assert.NotNil(t, repo)
	assert.Nil(t, repo.pool)
}

func TestUserMFARecoveryCode_ZeroValue(t *testing.T) {
	c := UserMFARecoveryCode{}
	assert.Equal(t, uuid.Nil, c.ID)
	assert.Equal(t, uuid.Nil, c.UserID)
	assert.Empty(t, c.CodeHash)
	assert.Nil(t, c.ConsumedAt)
}

func TestUserMFARecoveryCodesRepo_BulkInsertValidation(t *testing.T) {
	repo := NewUserMFARecoveryCodesRepo(nil)
	ctx := t.Context()

	t.Run("zero user_id", func(t *testing.T) {
		err := repo.BulkInsert(ctx, uuid.Nil, []string{"$2a$10$hash"})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "user_id required")
	})

	t.Run("empty hashes", func(t *testing.T) {
		err := repo.BulkInsert(ctx, uuid.New(), nil)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "at least one hash required")
	})

	t.Run("empty hash in batch", func(t *testing.T) {
		err := repo.BulkInsert(ctx, uuid.New(), []string{"$2a$10$one", "", "$2a$10$three"})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "empty hash in batch")
	})
}
