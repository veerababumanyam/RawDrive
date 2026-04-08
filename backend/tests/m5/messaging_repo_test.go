package m5_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMessagingRepo_CreateChannelAndList(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{
		WorkspaceID: wsID,
		Name:        "general",
		ChannelType: "general",
		CreatedBy:   userID,
	}
	require.NoError(t, repo.CreateChannel(ctx, ch))
	assert.NotEqual(t, uuid.Nil, ch.ID)

	channels, err := repo.ListChannels(ctx, wsID)
	require.NoError(t, err)
	found := false
	for _, c := range channels {
		if c.ID == ch.ID {
			found = true
			assert.Equal(t, "general", c.Name)
		}
	}
	assert.True(t, found)
}

func TestMessagingRepo_AddMemberAndList(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "test-ch", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	member := &repository.ChannelMember{ChannelID: ch.ID, UserID: userID, Role: "admin"}
	require.NoError(t, repo.AddMember(ctx, member))

	members, err := repo.ListMembers(ctx, ch.ID)
	require.NoError(t, err)
	assert.Len(t, members, 1)
	assert.Equal(t, "admin", members[0].Role)
}

func TestMessagingRepo_SendAndListMessages(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "msg-test", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	msg := &repository.Message{
		WorkspaceID: wsID,
		ChannelID:   ch.ID,
		SenderID:    userID,
		MessageType: "text",
		Body:        "Hello World",
	}
	require.NoError(t, repo.CreateMessage(ctx, msg))
	assert.NotEqual(t, uuid.Nil, msg.ID)

	messages, err := repo.ListMessages(ctx, ch.ID, 50, nil)
	require.NoError(t, err)
	assert.NotEmpty(t, messages)
	assert.Equal(t, "Hello World", messages[0].Body)
}

func TestMessagingRepo_EditMessage(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "edit-test", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	msg := &repository.Message{WorkspaceID: wsID, ChannelID: ch.ID, SenderID: userID, Body: "Original"}
	require.NoError(t, repo.CreateMessage(ctx, msg))

	require.NoError(t, repo.EditMessage(ctx, msg.ID, "Edited"))
	got, err := repo.GetMessage(ctx, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, "Edited", got.Body)
	assert.NotNil(t, got.EditedAt)
}

func TestMessagingRepo_DeleteMessage(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "del-test", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	msg := &repository.Message{WorkspaceID: wsID, ChannelID: ch.ID, SenderID: userID, Body: "To delete"}
	require.NoError(t, repo.CreateMessage(ctx, msg))

	require.NoError(t, repo.DeleteMessage(ctx, msg.ID))

	// Soft deleted — should not appear in list
	messages, err := repo.ListMessages(ctx, ch.ID, 50, nil)
	require.NoError(t, err)
	for _, m := range messages {
		assert.NotEqual(t, msg.ID, m.ID, "Deleted message should not appear in list")
	}
}

func TestMessagingRepo_SearchMessages(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "search-test", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	msg := &repository.Message{WorkspaceID: wsID, ChannelID: ch.ID, SenderID: userID, Body: "Photography workflow optimization"}
	require.NoError(t, repo.CreateMessage(ctx, msg))

	results, err := repo.SearchMessages(ctx, wsID, "photography workflow")
	require.NoError(t, err)
	assert.NotEmpty(t, results, "Should find message matching search query")
}

func TestMessagingRepo_UnreadCount(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewMessagingRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	ch := &repository.Channel{WorkspaceID: wsID, Name: "unread-test", ChannelType: "general", CreatedBy: userID}
	require.NoError(t, repo.CreateChannel(ctx, ch))

	// Add member
	member := &repository.ChannelMember{ChannelID: ch.ID, UserID: userID, Role: "member"}
	require.NoError(t, repo.AddMember(ctx, member))

	// Create a second user who sends messages
	otherUser := uuid.New()
	_, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`,
		otherUser, otherUser.String()+"@test.com", "Other")
	require.NoError(t, err)

	msg := &repository.Message{WorkspaceID: wsID, ChannelID: ch.ID, SenderID: otherUser, Body: "Unread msg"}
	require.NoError(t, repo.CreateMessage(ctx, msg))

	count, err := repo.GetUnreadCount(ctx, ch.ID, userID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, count, 1, "Should have at least 1 unread message")

	// Mark as read
	require.NoError(t, repo.MarkChannelRead(ctx, ch.ID, userID))
	count, err = repo.GetUnreadCount(ctx, ch.ID, userID)
	require.NoError(t, err)
	assert.Equal(t, 0, count, "Should have 0 unread after marking as read")
}

func TestParseMentions(t *testing.T) {
	body := "Hey @<550e8400-e29b-41d4-a716-446655440000> and @<6ba7b810-9dad-11d1-80b4-00c04fd430c8> check this"
	mentions := repository.ParseMentions(body)
	assert.Len(t, mentions, 2)
}

func TestModerationRepo_CreateAndListPending(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewModerationRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	item := &repository.ModerationItem{
		ContentType: "message",
		ContentID:   uuid.New(),
		WorkspaceID: wsID,
		Reason:      "reported",
		ReporterID:  &userID,
	}
	require.NoError(t, repo.CreateItem(ctx, item))
	assert.Equal(t, "pending", item.Status)

	pending, err := repo.ListPending(ctx)
	require.NoError(t, err)
	found := false
	for _, p := range pending {
		if p.ID == item.ID {
			found = true
		}
	}
	assert.True(t, found)
}

func TestModerationRepo_ResolveItem(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewModerationRepo(pool)
	ctx := context.Background()
	wsID, userID, _ := setupTestWorkspaceAndUser(t)

	item := &repository.ModerationItem{
		ContentType: "gear_listing",
		ContentID:   uuid.New(),
		WorkspaceID: wsID,
		Reason:      "auto_flagged",
	}
	require.NoError(t, repo.CreateItem(ctx, item))

	notes := "Looks fine"
	require.NoError(t, repo.ResolveItem(ctx, item.ID, userID, "approved", &notes))

	// Should no longer be in pending
	pending, err := repo.ListPending(ctx)
	require.NoError(t, err)
	for _, p := range pending {
		assert.NotEqual(t, item.ID, p.ID, "Resolved item should not be in pending")
	}
}

func TestModerationRepo_ScreenContent_FlagsKeyword(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewModerationRepo(pool)
	ctx := context.Background()

	flagged, err := repo.ScreenContent(ctx, "message", "This is spam content")
	require.NoError(t, err)
	assert.True(t, flagged, "Should flag content containing 'spam'")
}

func TestModerationRepo_ScreenContent_PassesClean(t *testing.T) {
	pool := getTestDB(t)
	repo := repository.NewModerationRepo(pool)
	ctx := context.Background()

	flagged, err := repo.ScreenContent(ctx, "message", "Beautiful wedding photos today")
	require.NoError(t, err)
	assert.False(t, flagged, "Should pass clean content")
}
