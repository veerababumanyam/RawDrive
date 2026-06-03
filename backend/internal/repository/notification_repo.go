package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Notification represents an in-app/email/push notification.
type Notification struct {
	ID               uuid.UUID  `json:"id"`
	UserID           uuid.UUID  `json:"user_id"`
	WorkspaceID      *uuid.UUID `json:"workspace_id"`
	NotificationType string     `json:"notification_type"`
	Title            string     `json:"title"`
	Body             *string    `json:"body"`
	ActionURL        *string    `json:"action_url"`
	Channel          string     `json:"channel"`
	IsRead           bool       `json:"is_read"`
	ReadAt           *time.Time `json:"read_at"`
	CreatedAt        time.Time  `json:"created_at"`
}

// NotificationPreference represents per-category notification settings.
type NotificationPreference struct {
	ID              uuid.UUID `json:"id"`
	UserID          uuid.UUID `json:"user_id"`
	Category        string    `json:"category"`
	EmailEnabled    bool      `json:"email_enabled"`
	PushEnabled     bool      `json:"push_enabled"`
	InAppEnabled    bool      `json:"in_app_enabled"`
	WhatsappEnabled bool      `json:"whatsapp_enabled"`
	DigestMode      string    `json:"digest_mode"`
	QuietHoursStart *string   `json:"quiet_hours_start"`
	QuietHoursEnd   *string   `json:"quiet_hours_end"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type NotificationRepo struct {
	DB *pgxpool.Pool
}

func NewNotificationRepo(db *pgxpool.Pool) *NotificationRepo {
	return &NotificationRepo{DB: db}
}

const notifCols = `id, user_id, workspace_id, notification_type, title, body, action_url, channel, is_read, read_at, created_at`

func scanNotification(row pgx.Row) (Notification, error) {
	var n Notification
	err := row.Scan(&n.ID, &n.UserID, &n.WorkspaceID, &n.NotificationType,
		&n.Title, &n.Body, &n.ActionURL, &n.Channel, &n.IsRead, &n.ReadAt, &n.CreatedAt)
	return n, err
}

func (r *NotificationRepo) Create(ctx context.Context, n *Notification) error {
	n.ID = uuid.New()
	n.CreatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO notifications (`+notifCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		n.ID, n.UserID, n.WorkspaceID, n.NotificationType,
		n.Title, n.Body, n.ActionURL, n.Channel, n.IsRead, n.ReadAt, n.CreatedAt,
	)
	return err
}

func (r *NotificationRepo) ListByUser(ctx context.Context, userID uuid.UUID, unreadOnly bool, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := `SELECT ` + notifCols + ` FROM notifications WHERE user_id = $1`
	args := []any{userID}
	idx := 2
	if unreadOnly {
		query += ` AND is_read = false`
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, idx)
	args = append(args, limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Notification
	for rows.Next() {
		var n Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.WorkspaceID, &n.NotificationType,
			&n.Title, &n.Body, &n.ActionURL, &n.Channel, &n.IsRead, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *NotificationRepo) MarkRead(ctx context.Context, userID, id uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE notifications SET is_read=true, read_at=$1 WHERE id=$2 AND user_id=$3`,
		time.Now().UTC(), id, userID)
	return err
}

func (r *NotificationRepo) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := r.DB.Exec(ctx, `
		UPDATE notifications SET is_read=true, read_at=$1 WHERE user_id=$2 AND is_read=false`,
		time.Now().UTC(), userID)
	return err
}

func (r *NotificationRepo) GetPreferences(ctx context.Context, userID uuid.UUID) ([]NotificationPreference, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, user_id, category, email_enabled, push_enabled, in_app_enabled,
		       whatsapp_enabled, digest_mode, quiet_hours_start, quiet_hours_end, created_at, updated_at
		FROM notification_preferences WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotificationPreference
	for rows.Next() {
		var p NotificationPreference
		if err := rows.Scan(&p.ID, &p.UserID, &p.Category, &p.EmailEnabled,
			&p.PushEnabled, &p.InAppEnabled, &p.WhatsappEnabled,
			&p.DigestMode, &p.QuietHoursStart, &p.QuietHoursEnd,
			&p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *NotificationRepo) UpsertPreference(ctx context.Context, p *NotificationPreference) error {
	p.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO notification_preferences (id, user_id, category, email_enabled, push_enabled, in_app_enabled,
		       whatsapp_enabled, digest_mode, quiet_hours_start, quiet_hours_end, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (user_id, category) DO UPDATE SET
		       email_enabled=$4, push_enabled=$5, in_app_enabled=$6,
		       whatsapp_enabled=$7, digest_mode=$8, quiet_hours_start=$9, quiet_hours_end=$10, updated_at=$12`,
		uuid.New(), p.UserID, p.Category, p.EmailEnabled, p.PushEnabled, p.InAppEnabled,
		p.WhatsappEnabled, p.DigestMode, p.QuietHoursStart, p.QuietHoursEnd,
		time.Now().UTC(), p.UpdatedAt,
	)
	return err
}
