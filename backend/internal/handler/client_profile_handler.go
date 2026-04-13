package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ClientProfileHandler serves the 360-degree client profile endpoints,
// aggregating data from contacts, invoices, deals, events, and galleries.
type ClientProfileHandler struct {
	db *pgxpool.Pool
}

func NewClientProfileHandler(db *pgxpool.Pool) *ClientProfileHandler {
	return &ClientProfileHandler{db: db}
}

// ---------- response types ----------

// ProfileContact holds the full contact record including migration-073 fields.
type ProfileContact struct {
	ID                uuid.UUID  `json:"id"`
	WorkspaceID       uuid.UUID  `json:"workspace_id"`
	Name              string     `json:"name"`
	Phone             *string    `json:"phone"`
	Email             *string    `json:"email"`
	ContactType       string     `json:"contact_type"`
	Company           *string    `json:"company"`
	Address           *string    `json:"address"`
	Tags              []string   `json:"tags"`
	Notes             *string    `json:"notes"`
	TotalRevenuePaisa int64      `json:"total_revenue_paisa"`
	WhatsappNumber    *string    `json:"whatsapp_number"`
	GSTIN             *string    `json:"gstin"`
	PAN               *string    `json:"pan"`
	Birthday          *time.Time `json:"birthday"`
	Anniversary       *time.Time `json:"anniversary"`
	ReferralSource    *string    `json:"referral_source"`
	ClientSource      *string    `json:"client_source"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

type ProfileGallery struct {
	ID                uuid.UUID `json:"id"`
	Title             string    `json:"title"`
	PhotoCount        int       `json:"photo_count"`
	Status            string    `json:"status"`
	CoverThumbnailURL *string   `json:"cover_thumbnail_url"`
}

type ProfileInvoice struct {
	ID              uuid.UUID `json:"id"`
	InvoiceNumber   string    `json:"invoice_number"`
	Status          string    `json:"status"`
	TotalPaisa      int64     `json:"total_paisa"`
	AmountPaidPaisa int64     `json:"amount_paid_paisa"`
	CreatedAt       time.Time `json:"created_at"`
}

type ProfileDeal struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Stage       string     `json:"stage"`
	AmountPaisa int64      `json:"amount_paisa"`
	EventType   *string    `json:"event_type"`
	EventDate   *time.Time `json:"event_date"`
}

type ProfileProject struct {
	ID                 uuid.UUID  `json:"id"`
	Name               string     `json:"name"`
	Status             string     `json:"status"`
	ProjectType        string     `json:"project_type"`
	EventDate          *time.Time `json:"event_date"`
	ExpectedValuePaisa int64      `json:"expected_value_paisa"`
	BookedValuePaisa   int64      `json:"booked_value_paisa"`
	BalanceDuePaisa    int64      `json:"balance_due_paisa"`
	ContractStatus     string     `json:"contract_status"`
	GalleryStatus      string     `json:"gallery_status"`
	NextAction         *string    `json:"next_action"`
}

type ProfileEvent struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	EventType string     `json:"event_type"`
	StartAt   time.Time  `json:"start_at"`
	EndAt     time.Time  `json:"end_at"`
	Location  *string    `json:"location"`
	ProjectID *uuid.UUID `json:"project_id"`
}

type ClientProfileResponse struct {
	Contact         ProfileContact   `json:"contact"`
	Galleries       []ProfileGallery `json:"galleries"`
	Invoices        []ProfileInvoice `json:"invoices"`
	Projects        []ProfileProject `json:"projects"`
	Deals           []ProfileDeal    `json:"deals"`
	Events          []ProfileEvent   `json:"events"`
	LifetimeRevenue int64            `json:"lifetime_revenue_paisa"`
}

// TimelineEntry represents one chronological event in the client timeline.
type TimelineEntry struct {
	Timestamp time.Time      `json:"timestamp"`
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Metadata  map[string]any `json:"metadata"`
}

// ---------- handlers ----------

// GetProfile returns the full 360-degree client profile.
func (h *ClientProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contact id"}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	// 1. Fetch contact with migration-073 fields.
	var c ProfileContact
	err = h.db.QueryRow(ctx, `
		SELECT id, workspace_id, name, phone, email, contact_type, company,
		       address::text, tags, notes, total_revenue_paisa,
		       whatsapp_number, gstin, pan, birthday, anniversary,
		       referral_source, client_source,
		       created_at, updated_at
		FROM contacts
		WHERE id = $1 AND workspace_id = $2`, contactID, workspaceID).Scan(
		&c.ID, &c.WorkspaceID, &c.Name, &c.Phone, &c.Email, &c.ContactType,
		&c.Company, &c.Address, &c.Tags, &c.Notes, &c.TotalRevenuePaisa,
		&c.WhatsappNumber, &c.GSTIN, &c.PAN, &c.Birthday, &c.Anniversary,
		&c.ReferralSource, &c.ClientSource,
		&c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		http.Error(w, `{"error":"contact not found"}`, http.StatusNotFound)
		return
	}

	resp := ClientProfileResponse{
		Contact: c,
	}

	// 2. Linked invoices.
	invoiceRows, err := h.db.Query(ctx, `
		SELECT id, invoice_number, status, total_paisa, amount_paid_paisa, created_at
		FROM invoices
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY created_at DESC`, contactID, workspaceID)
	if err == nil {
		defer invoiceRows.Close()
		for invoiceRows.Next() {
			var inv ProfileInvoice
			if scanErr := invoiceRows.Scan(
				&inv.ID, &inv.InvoiceNumber, &inv.Status,
				&inv.TotalPaisa, &inv.AmountPaidPaisa, &inv.CreatedAt,
			); scanErr == nil {
				resp.Invoices = append(resp.Invoices, inv)
			}
		}
	}

	// 3. Linked Studio Projects.
	projectRows, err := h.db.Query(ctx, `
		SELECT id, name, status, project_type, event_date, expected_value_paisa,
		       booked_value_paisa, balance_due_paisa, contract_status, gallery_status, next_action
		FROM studio_projects
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY event_date NULLS LAST, updated_at DESC`, contactID, workspaceID)
	if err == nil {
		defer projectRows.Close()
		for projectRows.Next() {
			var p ProfileProject
			if scanErr := projectRows.Scan(
				&p.ID, &p.Name, &p.Status, &p.ProjectType, &p.EventDate,
				&p.ExpectedValuePaisa, &p.BookedValuePaisa, &p.BalanceDuePaisa,
				&p.ContractStatus, &p.GalleryStatus, &p.NextAction,
			); scanErr == nil {
				resp.Projects = append(resp.Projects, p)
			}
		}
	}

	// 4. Legacy linked deals retained for compatibility.
	dealRows, err := h.db.Query(ctx, `
		SELECT id, title, stage, amount_paisa, event_type, event_date
		FROM deals
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY created_at DESC`, contactID, workspaceID)
	if err == nil {
		defer dealRows.Close()
		for dealRows.Next() {
			var d ProfileDeal
			if scanErr := dealRows.Scan(
				&d.ID, &d.Title, &d.Stage, &d.AmountPaisa,
				&d.EventType, &d.EventDate,
			); scanErr == nil {
				resp.Deals = append(resp.Deals, d)
			}
		}
	}

	// 5. Linked events.
	eventRows, err := h.db.Query(ctx, `
		SELECT id, title, event_type, start_at, end_at, location, project_id
		FROM events
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY start_at DESC`, contactID, workspaceID)
	if err == nil {
		defer eventRows.Close()
		for eventRows.Next() {
			var e ProfileEvent
			if scanErr := eventRows.Scan(
				&e.ID, &e.Title, &e.EventType, &e.StartAt, &e.EndAt, &e.Location, &e.ProjectID,
			); scanErr == nil {
				resp.Events = append(resp.Events, e)
			}
		}
	}

	// 6. Linked galleries. M26 uses direct contact/project links first and
	// keeps existing email-derived activity as a fallback.
	resp.Galleries = h.loadLinkedGalleries(ctx, workspaceID, contactID, c.Email)
	if resp.Invoices == nil {
		resp.Invoices = []ProfileInvoice{}
	}
	if resp.Projects == nil {
		resp.Projects = []ProfileProject{}
	}
	if resp.Deals == nil {
		resp.Deals = []ProfileDeal{}
	}
	if resp.Events == nil {
		resp.Events = []ProfileEvent{}
	}

	// 7. Lifetime revenue: sum of paid invoices for this contact.
	var lifetimeRevenue int64
	_ = h.db.QueryRow(ctx, `
		SELECT COALESCE(SUM(amount_paid_paisa), 0)
		FROM invoices
		WHERE contact_id = $1 AND workspace_id = $2 AND status = 'paid'`,
		contactID, workspaceID).Scan(&lifetimeRevenue)
	resp.LifetimeRevenue = lifetimeRevenue

	respondJSON(w, http.StatusOK, resp)
}

// GetTimeline returns a chronological timeline of all interactions for a contact.
func (h *ClientProfileHandler) GetTimeline(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	contactID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		http.Error(w, `{"error":"invalid contact id"}`, http.StatusBadRequest)
		return
	}
	ctx := r.Context()

	// Verify the contact exists and belongs to this workspace.
	var contactEmail *string
	err = h.db.QueryRow(ctx,
		`SELECT email FROM contacts WHERE id = $1 AND workspace_id = $2`,
		contactID, workspaceID).Scan(&contactEmail)
	if err != nil {
		http.Error(w, `{"error":"contact not found"}`, http.StatusNotFound)
		return
	}

	var timeline []TimelineEntry

	// Deals â€” deal_created
	dealRows, err := h.db.Query(ctx, `
		SELECT id, title, stage, amount_paisa, event_type, created_at
		FROM deals
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY created_at DESC`, contactID, workspaceID)
	if err == nil {
		defer dealRows.Close()
		for dealRows.Next() {
			var id uuid.UUID
			var title, stage string
			var amount int64
			var eventType *string
			var createdAt time.Time
			if scanErr := dealRows.Scan(&id, &title, &stage, &amount, &eventType, &createdAt); scanErr == nil {
				meta := map[string]any{
					"deal_id":      id.String(),
					"stage":        stage,
					"amount_paisa": amount,
				}
				if eventType != nil {
					meta["event_type"] = *eventType
				}
				timeline = append(timeline, TimelineEntry{
					Timestamp: createdAt,
					Type:      "deal_created",
					Title:     "Deal created: " + title,
					Metadata:  meta,
				})
			}
		}
	}

	// Invoices â€” invoice_sent (created_at) and invoice_paid (paid_at)
	invRows, err := h.db.Query(ctx, `
		SELECT id, invoice_number, status, total_paisa, amount_paid_paisa, created_at, paid_at
		FROM invoices
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY created_at DESC`, contactID, workspaceID)
	if err == nil {
		defer invRows.Close()
		for invRows.Next() {
			var id uuid.UUID
			var invNum, status string
			var total, paid int64
			var createdAt time.Time
			var paidAt *time.Time
			if scanErr := invRows.Scan(&id, &invNum, &status, &total, &paid, &createdAt, &paidAt); scanErr == nil {
				timeline = append(timeline, TimelineEntry{
					Timestamp: createdAt,
					Type:      "invoice_sent",
					Title:     "Invoice sent: " + invNum,
					Metadata: map[string]any{
						"invoice_id":  id.String(),
						"total_paisa": total,
						"status":      status,
					},
				})
				if paidAt != nil {
					timeline = append(timeline, TimelineEntry{
						Timestamp: *paidAt,
						Type:      "invoice_paid",
						Title:     "Invoice paid: " + invNum,
						Metadata: map[string]any{
							"invoice_id":        id.String(),
							"amount_paid_paisa": paid,
						},
					})
				}
			}
		}
	}

	// Events â€” booking_created
	eventRows, err := h.db.Query(ctx, `
		SELECT id, title, event_type, start_at, location, created_at
		FROM events
		WHERE contact_id = $1 AND workspace_id = $2
		ORDER BY created_at DESC`, contactID, workspaceID)
	if err == nil {
		defer eventRows.Close()
		for eventRows.Next() {
			var id uuid.UUID
			var title, eventType string
			var startAt, createdAt time.Time
			var location *string
			if scanErr := eventRows.Scan(&id, &title, &eventType, &startAt, &location, &createdAt); scanErr == nil {
				meta := map[string]any{
					"event_id":   id.String(),
					"event_type": eventType,
					"start_at":   startAt.Format(time.RFC3339),
				}
				if location != nil {
					meta["location"] = *location
				}
				timeline = append(timeline, TimelineEntry{
					Timestamp: createdAt,
					Type:      "booking_created",
					Title:     "Booking created: " + title,
					Metadata:  meta,
				})
			}
		}
	}

	h.appendGalleryTimelineEntries(ctx, workspaceID, contactID, contactEmail, &timeline)

	// Sort timeline by timestamp descending.
	sortTimelineDesc(timeline)

	if timeline == nil {
		timeline = []TimelineEntry{}
	}

	respondJSON(w, http.StatusOK, timeline)
}

// sortTimelineDesc sorts timeline entries by Timestamp descending (most recent first).
func sortTimelineDesc(entries []TimelineEntry) {
	// Simple insertion sort â€” timeline entries are typically < 100 items.
	for i := 1; i < len(entries); i++ {
		key := entries[i]
		j := i - 1
		for j >= 0 && entries[j].Timestamp.Before(key.Timestamp) {
			entries[j+1] = entries[j]
			j--
		}
		entries[j+1] = key
	}
}

func normalizedEmail(email *string) (string, bool) {
	if email == nil {
		return "", false
	}
	value := strings.TrimSpace(*email)
	return value, value != ""
}

func (h *ClientProfileHandler) loadLinkedGalleries(ctx context.Context, workspaceID, contactID uuid.UUID, email *string) []ProfileGallery {
	emailValue, hasEmail := normalizedEmail(email)

	rows, err := h.db.Query(ctx, `
		WITH linked_gallery_ids AS (
			SELECT g_direct.id AS gallery_id
			FROM galleries g_direct
			WHERE g_direct.workspace_id = $1
			  AND COALESCE(g_direct.primary_contact_id, g_direct.contact_id) = $3
			UNION
			SELECT cc.gallery_id
			FROM client_conversations cc
			WHERE $4 AND cc.workspace_id = $1 AND lower(cc.client_email) = lower($2)
			UNION
			SELECT ps.gallery_id
			FROM proofing_selections ps
			JOIN galleries g_ps ON g_ps.id = ps.gallery_id
			WHERE $4 AND g_ps.workspace_id = $1 AND lower(ps.client_email) = lower($2)
			UNION
			SELECT pc.gallery_id
			FROM proofing_comments pc
			JOIN galleries g_pc ON g_pc.id = pc.gallery_id
			WHERE $4 AND g_pc.workspace_id = $1 AND lower(pc.author_email) = lower($2)
			UNION
			SELECT aa.gallery_id
			FROM album_approvals aa
			JOIN galleries g_aa ON g_aa.id = aa.gallery_id
			WHERE $4 AND g_aa.workspace_id = $1 AND lower(aa.approved_by_email) = lower($2)
			UNION
			SELECT gal.gallery_id
			FROM gallery_access_logs gal
			JOIN galleries g_gal ON g_gal.id = gal.gallery_id
			WHERE $4 AND g_gal.workspace_id = $1 AND lower(gal.visitor_email) = lower($2)
			UNION
			SELECT go.gallery_id
			FROM gallery_orders go
			WHERE $4 AND go.workspace_id = $1 AND lower(go.client_email) = lower($2)
			UNION
			SELECT gc.gallery_id
			FROM gallery_carts gc
			JOIN galleries g_gc ON g_gc.id = gc.gallery_id
			WHERE $4 AND g_gc.workspace_id = $1 AND lower(gc.client_email) = lower($2)
			UNION
			SELECT de.gallery_id
			FROM download_events de
			JOIN galleries g_de ON g_de.id = de.gallery_id
			WHERE $4 AND g_de.workspace_id = $1 AND lower(de.downloader_email) = lower($2)
			UNION
			SELECT dj.gallery_id
			FROM download_jobs dj
			WHERE $4 AND dj.workspace_id = $1 AND lower(dj.requested_by_email) = lower($2)
		)
		SELECT
			g.id,
			g.title,
			COALESCE(asset_counts.photo_count, 0)::int AS photo_count,
			g.status,
			COALESCE(
				a.thumbnail_urls->>'thumb_md_webp',
				a.thumbnail_urls->>'thumb_lg_webp',
				a.thumbnail_urls->>'display_webp',
				a.thumbnail_urls->>'thumb_sm_webp',
				a.thumbnail_urls->>'thumb_md',
				a.thumbnail_urls->>'md',
				a.thumbnail_urls->>'thumb_sm',
				a.thumbnail_urls->>'sm'
			) AS cover_thumbnail_url
		FROM galleries g
		JOIN linked_gallery_ids l ON l.gallery_id = g.id
		LEFT JOIN assets a ON a.id = g.cover_asset_id
		LEFT JOIN (
			SELECT gallery_id, COUNT(*) AS photo_count
			FROM gallery_assets
			GROUP BY gallery_id
		) asset_counts ON asset_counts.gallery_id = g.id
		WHERE g.workspace_id = $1 AND g.deleted_at IS NULL
		ORDER BY g.created_at DESC
		LIMIT 50`, workspaceID, emailValue, contactID, hasEmail)
	if err != nil {
		return []ProfileGallery{}
	}
	defer rows.Close()

	galleries := []ProfileGallery{}
	for rows.Next() {
		var gallery ProfileGallery
		if scanErr := rows.Scan(&gallery.ID, &gallery.Title, &gallery.PhotoCount, &gallery.Status, &gallery.CoverThumbnailURL); scanErr == nil {
			galleries = append(galleries, gallery)
		}
	}
	if rows.Err() != nil {
		return []ProfileGallery{}
	}
	return galleries
}

func (h *ClientProfileHandler) appendGalleryTimelineEntries(ctx context.Context, workspaceID, contactID uuid.UUID, email *string, timeline *[]TimelineEntry) {
	emailValue, hasEmail := normalizedEmail(email)

	rows, err := h.db.Query(ctx, `
		WITH source AS (
			SELECT g_direct.id AS gallery_id, g_direct.created_at, 'gallery_linked'::text AS event_type, 'Gallery linked'::text AS label
			FROM galleries g_direct
			WHERE g_direct.workspace_id = $1
			  AND COALESCE(g_direct.primary_contact_id, g_direct.contact_id) = $3
			UNION ALL
			SELECT cc.gallery_id, cc.created_at, 'gallery_shared'::text AS event_type, 'Gallery shared'::text AS label
			FROM client_conversations cc
			WHERE $4 AND cc.workspace_id = $1 AND lower(cc.client_email) = lower($2)
			UNION ALL
			SELECT ps.gallery_id, ps.created_at, 'gallery_selection'::text, 'Gallery selection'
			FROM proofing_selections ps
			JOIN galleries g_ps ON g_ps.id = ps.gallery_id
			WHERE $4 AND g_ps.workspace_id = $1 AND lower(ps.client_email) = lower($2)
			UNION ALL
			SELECT pc.gallery_id, pc.created_at, 'gallery_review'::text, 'Gallery review'
			FROM proofing_comments pc
			JOIN galleries g_pc ON g_pc.id = pc.gallery_id
			WHERE $4 AND g_pc.workspace_id = $1 AND lower(pc.author_email) = lower($2)
			UNION ALL
			SELECT aa.gallery_id, aa.created_at, 'album_approved'::text, 'Album approved'
			FROM album_approvals aa
			JOIN galleries g_aa ON g_aa.id = aa.gallery_id
			WHERE $4 AND g_aa.workspace_id = $1 AND lower(aa.approved_by_email) = lower($2)
			UNION ALL
			SELECT gal.gallery_id, gal.created_at, 'gallery_accessed'::text, 'Gallery accessed'
			FROM gallery_access_logs gal
			JOIN galleries g_gal ON g_gal.id = gal.gallery_id
			WHERE $4 AND g_gal.workspace_id = $1 AND lower(gal.visitor_email) = lower($2)
			UNION ALL
			SELECT go.gallery_id, go.created_at, 'gallery_order'::text, 'Gallery order'
			FROM gallery_orders go
			WHERE $4 AND go.workspace_id = $1 AND lower(go.client_email) = lower($2)
			UNION ALL
			SELECT de.gallery_id, de.created_at, 'gallery_download'::text, 'Gallery download'
			FROM download_events de
			JOIN galleries g_de ON g_de.id = de.gallery_id
			WHERE $4 AND g_de.workspace_id = $1 AND lower(de.downloader_email) = lower($2)
		)
		SELECT source.created_at, source.event_type, source.label || ': ' || g.title, g.id
		FROM source
		JOIN galleries g ON g.id = source.gallery_id
		WHERE g.workspace_id = $1 AND g.deleted_at IS NULL
		ORDER BY source.created_at DESC
		LIMIT 100`, workspaceID, emailValue, contactID, hasEmail)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var timestamp time.Time
		var eventType, title string
		var galleryID uuid.UUID
		if scanErr := rows.Scan(&timestamp, &eventType, &title, &galleryID); scanErr == nil {
			*timeline = append(*timeline, TimelineEntry{
				Timestamp: timestamp,
				Type:      eventType,
				Title:     title,
				Metadata: map[string]any{
					"gallery_id": galleryID.String(),
				},
			})
		}
	}
}
