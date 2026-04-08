package repository

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Channel represents a messaging channel.
type Channel struct {
	ID          uuid.UUID `json:"id"`
	WorkspaceID uuid.UUID `json:"workspace_id"`
	Name        string    `json:"name"`
	ChannelType string    `json:"channel_type"`
	CreatedBy   uuid.UUID `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// ChannelMember represents a channel membership.
type ChannelMember struct {
	ChannelID  uuid.UUID  `json:"channel_id"`
	UserID     uuid.UUID  `json:"user_id"`
	Role       string     `json:"role"`
	LastReadAt *time.Time `json:"last_read_at"`
	JoinedAt   time.Time  `json:"joined_at"`
}

// Message represents a chat message.
type Message struct {
	ID              uuid.UUID  `json:"id"`
	WorkspaceID     uuid.UUID  `json:"workspace_id"`
	ChannelID       uuid.UUID  `json:"channel_id"`
	SenderID        uuid.UUID  `json:"sender_id"`
	MessageType     string     `json:"message_type"`
	Body            string     `json:"body"`
	AttachmentURL   *string    `json:"attachment_url"`
	ParentMessageID *uuid.UUID `json:"parent_message_id"`
	IsRead          bool       `json:"is_read"`
	EditedAt        *time.Time `json:"edited_at"`
	DeletedAt       *time.Time `json:"deleted_at"`
	InsertedAt      time.Time  `json:"inserted_at"`
}

// MessagingRepo handles messaging persistence.
type MessagingRepo struct {
	DB *pgxpool.Pool
}

func NewMessagingRepo(db *pgxpool.Pool) *MessagingRepo {
	return &MessagingRepo{DB: db}
}

func (r *MessagingRepo) CreateChannel(ctx context.Context, ch *Channel) error {
	ch.ID = uuid.New()
	ch.CreatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO channels (id, workspace_id, name, channel_type, created_by, created_at)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		ch.ID, ch.WorkspaceID, ch.Name, ch.ChannelType, ch.CreatedBy, ch.CreatedAt,
	)
	return err
}

func (r *MessagingRepo) GetChannel(ctx context.Context, id uuid.UUID) (Channel, error) {
	var ch Channel
	err := r.DB.QueryRow(ctx, `
		SELECT id, workspace_id, name, channel_type, created_by, created_at
		FROM channels WHERE id = $1`, id).Scan(
		&ch.ID, &ch.WorkspaceID, &ch.Name, &ch.ChannelType, &ch.CreatedBy, &ch.CreatedAt,
	)
	return ch, err
}

func (r *MessagingRepo) ListChannels(ctx context.Context, workspaceID uuid.UUID) ([]Channel, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, workspace_id, name, channel_type, created_by, created_at
		FROM channels WHERE workspace_id = $1 ORDER BY created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []Channel
	for rows.Next() {
		var ch Channel
		if err := rows.Scan(&ch.ID, &ch.WorkspaceID, &ch.Name, &ch.ChannelType, &ch.CreatedBy, &ch.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, ch)
	}
	return results, rows.Err()
}

func (r *MessagingRepo) AddMember(ctx context.Context, m *ChannelMember) error {
	m.JoinedAt = time.Now().UTC()
	if m.Role == "" {
		m.Role = "member"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO channel_members (channel_id, user_id, role, last_read_at, joined_at)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (channel_id, user_id) DO NOTHING`,
		m.ChannelID, m.UserID, m.Role, m.LastReadAt, m.JoinedAt,
	)
	return err
}

func (r *MessagingRepo) ListMembers(ctx context.Context, channelID uuid.UUID) ([]ChannelMember, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT channel_id, user_id, role, last_read_at, joined_at
		FROM channel_members WHERE channel_id = $1`, channelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []ChannelMember
	for rows.Next() {
		var m ChannelMember
		if err := rows.Scan(&m.ChannelID, &m.UserID, &m.Role, &m.LastReadAt, &m.JoinedAt); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

func (r *MessagingRepo) CreateMessage(ctx context.Context, msg *Message) error {
	msg.ID = uuid.New()
	msg.InsertedAt = time.Now().UTC()
	if msg.MessageType == "" {
		msg.MessageType = "text"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO messages (id, workspace_id, channel_id, sender_id, message_type, body, attachment_url, parent_message_id, is_read, edited_at, deleted_at, inserted_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		msg.ID, msg.WorkspaceID, msg.ChannelID, msg.SenderID,
		msg.MessageType, msg.Body, msg.AttachmentURL, msg.ParentMessageID,
		msg.IsRead, msg.EditedAt, msg.DeletedAt, msg.InsertedAt,
	)
	return err
}

func (r *MessagingRepo) GetMessage(ctx context.Context, id uuid.UUID) (Message, error) {
	var msg Message
	err := r.DB.QueryRow(ctx, `
		SELECT id, workspace_id, channel_id, sender_id, message_type, body, attachment_url, parent_message_id, is_read, edited_at, deleted_at, inserted_at
		FROM messages WHERE id = $1`, id).Scan(
		&msg.ID, &msg.WorkspaceID, &msg.ChannelID, &msg.SenderID,
		&msg.MessageType, &msg.Body, &msg.AttachmentURL, &msg.ParentMessageID,
		&msg.IsRead, &msg.EditedAt, &msg.DeletedAt, &msg.InsertedAt,
	)
	return msg, err
}

func (r *MessagingRepo) ListMessages(ctx context.Context, channelID uuid.UUID, limit int, cursor *time.Time) ([]Message, error) {
	if limit <= 0 || limit > 50 {
		limit = 50
	}
	var query string
	var args []any
	if cursor != nil {
		query = `SELECT id, workspace_id, channel_id, sender_id, message_type, body, attachment_url, parent_message_id, is_read, edited_at, deleted_at, inserted_at
			FROM messages WHERE channel_id = $1 AND deleted_at IS NULL AND inserted_at < $2
			ORDER BY inserted_at DESC LIMIT $3`
		args = []any{channelID, *cursor, limit}
	} else {
		query = `SELECT id, workspace_id, channel_id, sender_id, message_type, body, attachment_url, parent_message_id, is_read, edited_at, deleted_at, inserted_at
			FROM messages WHERE channel_id = $1 AND deleted_at IS NULL
			ORDER BY inserted_at DESC LIMIT $2`
		args = []any{channelID, limit}
	}
	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.WorkspaceID, &msg.ChannelID, &msg.SenderID,
			&msg.MessageType, &msg.Body, &msg.AttachmentURL, &msg.ParentMessageID,
			&msg.IsRead, &msg.EditedAt, &msg.DeletedAt, &msg.InsertedAt); err != nil {
			return nil, err
		}
		results = append(results, msg)
	}
	return results, rows.Err()
}

func (r *MessagingRepo) EditMessage(ctx context.Context, id uuid.UUID, newBody string) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx,
		`UPDATE messages SET body = $2, edited_at = $3 WHERE id = $1`,
		id, newBody, now)
	return err
}

func (r *MessagingRepo) DeleteMessage(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx,
		`UPDATE messages SET deleted_at = $2 WHERE id = $1`,
		id, now)
	return err
}

func (r *MessagingRepo) SearchMessages(ctx context.Context, workspaceID uuid.UUID, query string) ([]Message, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, workspace_id, channel_id, sender_id, message_type, body, attachment_url, parent_message_id, is_read, edited_at, deleted_at, inserted_at
		FROM messages
		WHERE search_vector @@ plainto_tsquery('english', $1)
		AND workspace_id = $2
		AND deleted_at IS NULL
		ORDER BY inserted_at DESC LIMIT 50`, query, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.ID, &msg.WorkspaceID, &msg.ChannelID, &msg.SenderID,
			&msg.MessageType, &msg.Body, &msg.AttachmentURL, &msg.ParentMessageID,
			&msg.IsRead, &msg.EditedAt, &msg.DeletedAt, &msg.InsertedAt); err != nil {
			return nil, err
		}
		results = append(results, msg)
	}
	return results, rows.Err()
}

func (r *MessagingRepo) GetUnreadCount(ctx context.Context, channelID, userID uuid.UUID) (int, error) {
	var lastRead *time.Time
	err := r.DB.QueryRow(ctx,
		`SELECT last_read_at FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
		channelID, userID).Scan(&lastRead)
	if err != nil {
		return 0, err
	}
	var count int
	if lastRead != nil {
		err = r.DB.QueryRow(ctx,
			`SELECT COUNT(*) FROM messages WHERE channel_id = $1 AND inserted_at > $2 AND deleted_at IS NULL AND sender_id != $3`,
			channelID, *lastRead, userID).Scan(&count)
	} else {
		err = r.DB.QueryRow(ctx,
			`SELECT COUNT(*) FROM messages WHERE channel_id = $1 AND deleted_at IS NULL AND sender_id != $2`,
			channelID, userID).Scan(&count)
	}
	return count, err
}

func (r *MessagingRepo) MarkChannelRead(ctx context.Context, channelID, userID uuid.UUID) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx,
		`UPDATE channel_members SET last_read_at = $3 WHERE channel_id = $1 AND user_id = $2`,
		channelID, userID, now)
	return err
}

var mentionRegex = regexp.MustCompile(`@<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>`)

// ParseMentions extracts user UUIDs from @<uuid> patterns in message body.
func ParseMentions(body string) []uuid.UUID {
	matches := mentionRegex.FindAllStringSubmatch(body, -1)
	var uuids []uuid.UUID
	seen := make(map[string]bool)
	for _, match := range matches {
		if len(match) > 1 && !seen[match[1]] {
			if id, err := uuid.Parse(match[1]); err == nil {
				uuids = append(uuids, id)
				seen[match[1]] = true
			}
		}
	}
	return uuids
}

// DeleteOldMessages deletes messages older than the given duration, excluding client conversation messages.
func (r *MessagingRepo) DeleteOldMessages(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-olderThan)
	tag, err := r.DB.Exec(ctx, `
		DELETE FROM messages
		WHERE inserted_at < $1
		AND channel_id NOT IN (
			SELECT id FROM channels WHERE channel_type = 'client'
		)`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// ModerationItem represents an item in the moderation queue.
type ModerationItem struct {
	ID          uuid.UUID  `json:"id"`
	ContentType string     `json:"content_type"`
	ContentID   uuid.UUID  `json:"content_id"`
	WorkspaceID uuid.UUID  `json:"workspace_id"`
	Reason      string     `json:"reason"`
	ReporterID  *uuid.UUID `json:"reporter_id"`
	Status      string     `json:"status"`
	ReviewedBy  *uuid.UUID `json:"reviewed_by"`
	ReviewedAt  *time.Time `json:"reviewed_at"`
	Notes       *string    `json:"notes"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ModerationRule represents a configurable moderation rule.
type ModerationRule struct {
	ID          uuid.UUID       `json:"id"`
	ContentType string          `json:"content_type"`
	RuleType    string          `json:"rule_type"`
	Config      json.RawMessage `json:"config"`
	IsActive    bool            `json:"is_active"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// ModerationRepo handles moderation persistence.
type ModerationRepo struct {
	DB *pgxpool.Pool
}

func NewModerationRepo(db *pgxpool.Pool) *ModerationRepo {
	return &ModerationRepo{DB: db}
}

func (r *ModerationRepo) CreateItem(ctx context.Context, item *ModerationItem) error {
	item.ID = uuid.New()
	item.CreatedAt = time.Now().UTC()
	if item.Status == "" {
		item.Status = "pending"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO moderation_queue (id, content_type, content_id, workspace_id, reason, reporter_id, status, reviewed_by, reviewed_at, notes, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		item.ID, item.ContentType, item.ContentID, item.WorkspaceID,
		item.Reason, item.ReporterID, item.Status, item.ReviewedBy,
		item.ReviewedAt, item.Notes, item.CreatedAt,
	)
	return err
}

func (r *ModerationRepo) ListPending(ctx context.Context) ([]ModerationItem, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, content_type, content_id, workspace_id, reason, reporter_id, status, reviewed_by, reviewed_at, notes, created_at
		FROM moderation_queue WHERE status = 'pending' ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []ModerationItem
	for rows.Next() {
		var item ModerationItem
		if err := rows.Scan(&item.ID, &item.ContentType, &item.ContentID, &item.WorkspaceID,
			&item.Reason, &item.ReporterID, &item.Status, &item.ReviewedBy,
			&item.ReviewedAt, &item.Notes, &item.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *ModerationRepo) ResolveItem(ctx context.Context, id, reviewerID uuid.UUID, action string, notes *string) error {
	now := time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE moderation_queue SET status = $2, reviewed_by = $3, reviewed_at = $4, notes = $5
		WHERE id = $1`,
		id, action, reviewerID, now, notes)
	return err
}

func (r *ModerationRepo) GetRules(ctx context.Context, contentType string) ([]ModerationRule, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, content_type, rule_type, config, is_active, created_at, updated_at
		FROM moderation_rules WHERE content_type = $1 AND is_active = true`, contentType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []ModerationRule
	for rows.Next() {
		var rule ModerationRule
		if err := rows.Scan(&rule.ID, &rule.ContentType, &rule.RuleType, &rule.Config,
			&rule.IsActive, &rule.CreatedAt, &rule.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, rule)
	}
	return results, rows.Err()
}

// ScreenContent checks text against keyword rules for the given content type.
// Returns true if the content should be flagged.
func (r *ModerationRepo) ScreenContent(ctx context.Context, contentType, text string) (bool, error) {
	rules, err := r.GetRules(ctx, contentType)
	if err != nil {
		return false, err
	}
	lowerText := strings.ToLower(text)
	for _, rule := range rules {
		if rule.RuleType == "keyword" {
			var config struct {
				Keywords []string `json:"keywords"`
			}
			if err := json.Unmarshal(rule.Config, &config); err != nil {
				continue
			}
			for _, kw := range config.Keywords {
				if strings.Contains(lowerText, strings.ToLower(kw)) {
					return true, nil
				}
			}
		}
	}
	return false, nil
}

