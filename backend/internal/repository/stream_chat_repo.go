package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// StreamChat represents a chat message in a live stream.
type StreamChat struct {
	ID          uuid.UUID  `json:"id"`
	StreamID    uuid.UUID  `json:"stream_id"`
	UserName    string     `json:"user_name"`
	UserID      *uuid.UUID `json:"user_id,omitempty"`
	Message     string     `json:"message"`
	MessageType string     `json:"message_type"`
	IsMuted     bool       `json:"is_muted"`
	CreatedAt   time.Time  `json:"created_at"`
}

// StreamChatRepo handles stream chat database operations.
type StreamChatRepo struct {
	DB *pgxpool.Pool
}

func NewStreamChatRepo(db *pgxpool.Pool) *StreamChatRepo {
	return &StreamChatRepo{DB: db}
}

func (r *StreamChatRepo) Create(ctx context.Context, msg *StreamChat) error {
	msg.ID = uuid.New()
	msg.CreatedAt = time.Now()

	_, err := r.DB.Exec(ctx,
		`INSERT INTO stream_chats (id, stream_id, user_name, user_id, message, message_type, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		msg.ID, msg.StreamID, msg.UserName, msg.UserID, msg.Message, msg.MessageType, msg.CreatedAt)
	return err
}

func (r *StreamChatRepo) ListByStream(ctx context.Context, streamID uuid.UUID, limit, offset int) ([]StreamChat, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	rows, err := r.DB.Query(ctx,
		`SELECT id, stream_id, user_name, user_id, message, message_type, is_muted, created_at
		 FROM stream_chats
		 WHERE stream_id = $1 AND is_muted = false
		 ORDER BY created_at ASC
		 LIMIT $2 OFFSET $3`,
		streamID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []StreamChat
	for rows.Next() {
		var m StreamChat
		if err := rows.Scan(&m.ID, &m.StreamID, &m.UserName, &m.UserID, &m.Message,
			&m.MessageType, &m.IsMuted, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}
	return messages, rows.Err()
}

func (r *StreamChatRepo) MuteUser(ctx context.Context, streamID uuid.UUID, userName string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE stream_chats SET is_muted = true WHERE stream_id = $1 AND user_name = $2`,
		streamID, userName)
	return err
}

func (r *StreamChatRepo) DeleteMessage(ctx context.Context, messageID uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `DELETE FROM stream_chats WHERE id = $1`, messageID)
	return err
}
