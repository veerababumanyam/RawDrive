package worker

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/email"
	"github.com/rawdrive/backend/internal/publicurl"
)

// automationEmailSender is the subset of email.GalleryAutomationSender the
// worker needs (interface for testability + nil-safety).
type automationEmailSender interface {
	Send(ctx context.Context, to string, data email.GalleryAutomationData) error
}

// EmailAutomationWorker drives the branded client email drip. It is
// self-seeding: each tick it (1) enqueues ready/reminder/last-chance events for
// published, automation-enabled galleries that don't have them yet, then (2)
// sends any events whose time has come — re-checking publish/expiry/automation
// guards at send time. The unique index on (gallery_id, event_type, recipient)
// makes enqueue idempotent so the same email is never scheduled twice.
type EmailAutomationWorker struct {
	pool             *pgxpool.Pool
	sender           automationEmailSender
	publicBaseURL    string
	pollInterval     time.Duration
	reminderAfter    time.Duration
	lastChanceBefore time.Duration
	stopCh           chan struct{}
}

// NewEmailAutomationWorker constructs the worker. A nil sender disables it (the
// tick becomes a no-op) so deployments without SMTP wired degrade gracefully.
func NewEmailAutomationWorker(pool *pgxpool.Pool, sender automationEmailSender, publicBaseURL string) *EmailAutomationWorker {
	return &EmailAutomationWorker{
		pool:             pool,
		sender:           sender,
		publicBaseURL:    strings.TrimRight(publicBaseURL, "/"),
		pollInterval:     15 * time.Minute,
		reminderAfter:    7 * 24 * time.Hour,
		lastChanceBefore: 3 * 24 * time.Hour,
		stopCh:           make(chan struct{}),
	}
}

// Start runs the polling loop.
func (w *EmailAutomationWorker) Start(ctx context.Context) {
	log.Println("email automation worker: started")
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	w.tick(ctx)
	for {
		select {
		case <-ctx.Done():
			log.Println("email automation worker: stopped (context cancelled)")
			return
		case <-w.stopCh:
			log.Println("email automation worker: stopped")
			return
		case <-ticker.C:
			w.tick(ctx)
		}
	}
}

// Stop signals shutdown.
func (w *EmailAutomationWorker) Stop() { close(w.stopCh) }

func (w *EmailAutomationWorker) tick(ctx context.Context) {
	if w.sender == nil || w.publicBaseURL == "" {
		return // not configured — nothing to do
	}
	w.seed(ctx)
	w.sendDue(ctx)
}

// seed enqueues the drip for galleries that are published + automation-enabled +
// have a client email + don't already have a "ready" event.
func (w *EmailAutomationWorker) seed(ctx context.Context) {
	rows, err := w.pool.Query(ctx, `
		SELECT g.id, COALESCE(g.published_at, g.created_at), g.expires_at, c.email
		FROM galleries g
		JOIN contacts c ON c.id = COALESCE(g.primary_contact_id, g.contact_id)
		WHERE g.is_published = true
		  AND g.deleted_at IS NULL
		  AND COALESCE(g.email_automation_enabled, true) = true
		  AND COALESCE(c.email, '') <> ''
		  AND NOT EXISTS (
		      SELECT 1 FROM gallery_email_events e
		      WHERE e.gallery_id = g.id AND e.event_type = 'ready'
		  )
		LIMIT 200`)
	if err != nil {
		log.Printf("email automation worker: seed query: %v", err)
		return
	}
	type candidate struct {
		id          uuid.UUID
		publishedAt time.Time
		expiresAt   *time.Time
		email       string
	}
	var candidates []candidate
	for rows.Next() {
		var c candidate
		if err := rows.Scan(&c.id, &c.publishedAt, &c.expiresAt, &c.email); err != nil {
			rows.Close()
			log.Printf("email automation worker: seed scan: %v", err)
			return
		}
		candidates = append(candidates, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		log.Printf("email automation worker: seed rows: %v", err)
		return
	}

	now := time.Now().UTC()
	for _, c := range candidates {
		w.enqueue(ctx, c.id, "ready", c.email, c.publishedAt)
		w.enqueue(ctx, c.id, "reminder", c.email, c.publishedAt.Add(w.reminderAfter))
		// last-chance only when there is a future expiry to warn about.
		if c.expiresAt != nil && c.expiresAt.After(now) {
			w.enqueue(ctx, c.id, "last_chance", c.email, c.expiresAt.Add(-w.lastChanceBefore))
		}
	}
}

func (w *EmailAutomationWorker) enqueue(ctx context.Context, galleryID uuid.UUID, eventType, recipient string, scheduledFor time.Time) {
	_, err := w.pool.Exec(ctx, `
		INSERT INTO gallery_email_events (gallery_id, event_type, recipient, scheduled_for)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (gallery_id, event_type, recipient) DO NOTHING`,
		galleryID, eventType, recipient, scheduledFor,
	)
	if err != nil {
		log.Printf("email automation worker: enqueue %s for %s: %v", eventType, galleryID, err)
	}
}

// emailClaimLease bounds how long a claimed-but-unfinished event stays out of
// the claimable set. It must exceed the worst-case send time so a slow SMTP send
// is never re-claimed by another instance, while still letting a crashed
// worker's row be re-claimed reasonably soon. Sends are synchronous and quick;
// 10m is comfortably safe and well under the 15m poll interval.
const emailClaimLease = 10 * time.Minute

// dueEmailEvent is a claimed, hydrated email event ready to send.
type dueEmailEvent struct {
	id             uuid.UUID
	eventType      string
	recipient      string
	title          string
	slug           string
	expiresAt      *time.Time
	published      bool
	automationOn   bool
	deletedAt      *time.Time
	studioName     string
	accent         string
	brandingPublic bool
	logoAssetID    string
}

// claimDue atomically claims up to `limit` pending, due email events and returns
// them hydrated with their gallery + workspace branding. The claim flips
// claimed_at = now() inside a single UPDATE ... WHERE id IN (SELECT ... FOR
// UPDATE SKIP LOCKED) statement, so two workers (or two overlapping ticks) can
// never claim — and therefore never double-send — the same event. Rows whose
// claim lease has gone stale (a crashed worker) are re-claimed. This replaces
// the previous list-then-mark scan that marked a row sent/failed only AFTER the
// SMTP send, leaving a wide window for a duplicate send.
func (w *EmailAutomationWorker) claimDue(ctx context.Context, limit int) ([]dueEmailEvent, error) {
	rows, err := w.pool.Query(ctx, `
		UPDATE gallery_email_events e
		SET claimed_at = now()
		FROM galleries g, workspaces w
		WHERE e.gallery_id = g.id
		  AND w.id = g.workspace_id
		  AND e.id IN (
		      SELECT id FROM gallery_email_events
		      WHERE sent_at IS NULL
		        AND status = 'pending'
		        AND scheduled_for <= now()
		        AND (claimed_at IS NULL OR claimed_at < now() - make_interval(secs => $1))
		      ORDER BY scheduled_for
		      LIMIT $2
		      FOR UPDATE SKIP LOCKED
		  )
		RETURNING e.id, e.event_type, e.recipient,
		          g.title, g.slug, g.expires_at, g.is_published,
		          COALESCE(g.email_automation_enabled, true), g.deleted_at,
		          COALESCE(NULLIF(w.brand_name, ''), w.name, ''),
		          COALESCE(w.brand_accent_color, ''),
		          COALESCE(w.public_branding_enabled, true),
		          COALESCE(w.logo_asset_id::text, '')`,
		emailClaimLease.Seconds(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []dueEmailEvent
	for rows.Next() {
		var d dueEmailEvent
		if err := rows.Scan(&d.id, &d.eventType, &d.recipient, &d.title, &d.slug, &d.expiresAt,
			&d.published, &d.automationOn, &d.deletedAt, &d.studioName, &d.accent, &d.brandingPublic, &d.logoAssetID); err != nil {
			return nil, err
		}
		items = append(items, d)
	}
	return items, rows.Err()
}

// sendDue claims due events and sends each, re-checking publish/expiry/
// automation guards at send time.
func (w *EmailAutomationWorker) sendDue(ctx context.Context) {
	items, err := w.claimDue(ctx, 50)
	if err != nil {
		log.Printf("email automation worker: claim due: %v", err)
		return
	}

	now := time.Now().UTC()
	for _, d := range items {
		// Re-check guards at send time.
		if !d.published || d.deletedAt != nil || !d.automationOn {
			w.mark(ctx, d.id, "skipped", "gallery no longer eligible")
			continue
		}
		expired := d.expiresAt != nil && d.expiresAt.Before(now)
		if expired && d.eventType != "last_chance" {
			// ready/reminder are pointless once the gallery has expired.
			w.mark(ctx, d.id, "skipped", "gallery expired")
			continue
		}

		link := publicurl.Gallery(w.publicBaseURL, d.slug)
		logoURL := ""
		if d.brandingPublic && d.logoAssetID != "" {
			logoURL = fmt.Sprintf("%s/api/v1/public/galleries/%s/branding/logo", publicurl.Base(w.publicBaseURL), url.PathEscape(d.slug))
		}
		expiryLabel := ""
		if d.expiresAt != nil {
			expiryLabel = d.expiresAt.Format("January 2, 2006")
		}

		if err := w.sender.Send(ctx, d.recipient, email.GalleryAutomationData{
			EventType:    d.eventType,
			GalleryTitle: d.title,
			GalleryLink:  link,
			StudioName:   d.studioName,
			AccentColor:  d.accent,
			LogoURL:      logoURL,
			ExpiryLabel:  expiryLabel,
		}); err != nil {
			log.Printf("email automation worker: send %s to %s: %v", d.eventType, d.recipient, err)
			w.mark(ctx, d.id, "failed", err.Error())
			continue
		}
		w.mark(ctx, d.id, "sent", "")
	}
}

func (w *EmailAutomationWorker) mark(ctx context.Context, id uuid.UUID, status, errMsg string) {
	var sentAt interface{}
	if status == "sent" {
		sentAt = time.Now().UTC()
	}
	var lastErr interface{}
	if errMsg != "" {
		lastErr = errMsg
	}
	if _, err := w.pool.Exec(ctx,
		`UPDATE gallery_email_events SET status = $2, sent_at = $3, last_error = $4 WHERE id = $1`,
		id, status, sentAt, lastErr,
	); err != nil {
		log.Printf("email automation worker: mark %s=%s: %v", id, status, err)
	}
}
