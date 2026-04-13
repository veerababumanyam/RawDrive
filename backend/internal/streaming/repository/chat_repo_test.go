package repository_test

// M30 / E100-S4 — ChatRepo unit tests that don't require a live DB.
// Integration tests that exercise RLS are in chat_repo_rls_test.go and
// are gated by the COBOLT_DB_INTEGRATION env flag (they need a running
// Postgres with migration 082 applied).

import (
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"

	"github.com/rawdrive/backend/internal/streaming/repository"
)

func TestReactionKind_IsValid(t *testing.T) {
	assert.True(t, repository.ReactionThumbsUp.IsValid())
	assert.True(t, repository.ReactionHeart.IsValid())
	assert.True(t, repository.ReactionCelebrate.IsValid())
	assert.True(t, repository.ReactionLaugh.IsValid())

	assert.False(t, repository.ReactionKind("").IsValid())
	assert.False(t, repository.ReactionKind("fire").IsValid())
	assert.False(t, repository.ReactionKind("THUMBS_UP").IsValid())
}

func TestEmitReaction_RejectsInvalidKind(t *testing.T) {
	repo := repository.NewChatRepo(nil) // nil pool — we never hit it.
	err := repo.EmitReaction(
		nil, uuid.New(), uuid.New(),
		ptrUUID(uuid.New()), repository.ReactionKind("explode"),
	)
	assert.ErrorIs(t, err, repository.ErrInvalidReaction)
}

func TestEmitReaction_RequiresViewerSessionID(t *testing.T) {
	repo := repository.NewChatRepo(nil)
	err := repo.EmitReaction(
		nil, uuid.New(), uuid.New(),
		nil, // no viewer session
		repository.ReactionThumbsUp,
	)
	assert.ErrorIs(t, err, repository.ErrNoAuthor)
}

func TestPostAsViewer_RejectsEmptyBody(t *testing.T) {
	repo := repository.NewChatRepo(nil)
	_, err := repo.PostAsViewer(nil, uuid.New(), uuid.New(), uuid.New(), "")
	assert.ErrorIs(t, err, repository.ErrEmptyBody)
}

func TestPostAsViewer_RejectsOverlongBody(t *testing.T) {
	repo := repository.NewChatRepo(nil)
	big := strings.Repeat("a", 2001)
	_, err := repo.PostAsViewer(nil, uuid.New(), uuid.New(), uuid.New(), big)
	assert.ErrorIs(t, err, repository.ErrBodyTooLong)
}

func TestPostAsWorkspaceUser_RejectsEmptyBody(t *testing.T) {
	repo := repository.NewChatRepo(nil)
	_, err := repo.PostAsWorkspaceUser(nil, uuid.New(), uuid.New(), uuid.New(), "")
	assert.ErrorIs(t, err, repository.ErrEmptyBody)
}

func TestPostAsWorkspaceUser_RejectsOverlongBody(t *testing.T) {
	repo := repository.NewChatRepo(nil)
	big := strings.Repeat("x", 2001)
	_, err := repo.PostAsWorkspaceUser(nil, uuid.New(), uuid.New(), uuid.New(), big)
	assert.ErrorIs(t, err, repository.ErrBodyTooLong)
}

// Max-length body validation is verified by chat_repo_rls_test.go in the
// integration suite (which uses a real pool); the unit suite keeps to
// paths that don't reach the DB.

func ptrUUID(u uuid.UUID) *uuid.UUID { return &u }
