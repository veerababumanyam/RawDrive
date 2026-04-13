package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var StudioProjectStatuses = []string{
	"inquiry",
	"quoted",
	"reserved",
	"booked",
	"shooting",
	"editing",
	"proofing",
	"delivered",
	"archived",
	"cancelled",
	"lost",
}

// MapDealStageToProjectStatus maps legacy deal stages into photographer-facing project lifecycle states.
func MapDealStageToProjectStatus(stage string) string {
	switch stage {
	case "proposal":
		return "quoted"
	case "negotiation":
		return "reserved"
	case "confirmed":
		return "booked"
	case "in_progress":
		return "editing"
	case "completed":
		return "delivered"
	case "cancelled":
		return "cancelled"
	default:
		return "inquiry"
	}
}

// StudioProject is the canonical commercial job aggregate for Studio CRM.
type StudioProject struct {
	ID                 uuid.UUID  `json:"id"`
	WorkspaceID        uuid.UUID  `json:"workspace_id"`
	ContactID          uuid.UUID  `json:"contact_id"`
	LeadID             *uuid.UUID `json:"lead_id,omitempty"`
	SourceDealID       *uuid.UUID `json:"source_deal_id,omitempty"`
	PackageID          *uuid.UUID `json:"package_id,omitempty"`
	Name               string     `json:"name"`
	ProjectType        string     `json:"project_type"`
	Status             string     `json:"status"`
	EventDate          *time.Time `json:"event_date,omitempty"`
	EventEndDate       *time.Time `json:"event_end_date,omitempty"`
	VenueName          *string    `json:"venue_name,omitempty"`
	VenueAddress       *string    `json:"venue_address,omitempty"`
	City               *string    `json:"city,omitempty"`
	StateCode          *string    `json:"state_code,omitempty"`
	ExpectedValuePaisa int64      `json:"expected_value_paisa"`
	BookedValuePaisa   int64      `json:"booked_value_paisa"`
	BalanceDuePaisa    int64      `json:"balance_due_paisa"`
	ContractStatus     string     `json:"contract_status"`
	GalleryStatus      string     `json:"gallery_status"`
	NextAction         *string    `json:"next_action,omitempty"`
	NextActionDueAt    *time.Time `json:"next_action_due_at,omitempty"`
	Notes              *string    `json:"notes,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
	ArchivedAt         *time.Time `json:"archived_at,omitempty"`
	ContactName        string     `json:"contact_name,omitempty"`
}

type StudioProjectFilter struct {
	WorkspaceID uuid.UUID
	ContactID   *uuid.UUID
	Status      string
	Search      string
	Limit       int
	Cursor      *time.Time
}

type ProjectGallerySummary struct {
	ID          uuid.UUID `json:"id"`
	Title       string    `json:"title"`
	Slug        string    `json:"slug"`
	GalleryType string    `json:"gallery_type"`
	Status      string    `json:"status"`
	PhotoCount  int       `json:"photo_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type ProjectTimelineEntry struct {
	Timestamp time.Time      `json:"timestamp"`
	Type      string         `json:"type"`
	Title     string         `json:"title"`
	Metadata  map[string]any `json:"metadata"`
}

type StudioProjectAggregate struct {
	Project   StudioProject           `json:"project"`
	Contact   *Contact                `json:"contact,omitempty"`
	Inquiry   *Lead                   `json:"inquiry,omitempty"`
	Bookings  []Event                 `json:"bookings"`
	Contracts []Contract              `json:"contracts"`
	Invoices  []Invoice               `json:"invoices"`
	Payments  []Payment               `json:"payments"`
	Galleries []ProjectGallerySummary `json:"galleries"`
	FollowUps []FollowUp              `json:"follow_ups"`
	Timeline  []ProjectTimelineEntry  `json:"timeline"`
}

type StudioProjectRepo struct {
	DB *pgxpool.Pool
}

func NewStudioProjectRepo(db *pgxpool.Pool) *StudioProjectRepo {
	return &StudioProjectRepo{DB: db}
}

const studioProjectCols = `id, workspace_id, contact_id, lead_id, source_deal_id, package_id, name, project_type, status, event_date, event_end_date, venue_name, venue_address, city, state_code, expected_value_paisa, booked_value_paisa, balance_due_paisa, contract_status, gallery_status, next_action, next_action_due_at, notes, created_at, updated_at, archived_at`

func scanStudioProject(row pgx.Row) (StudioProject, error) {
	var p StudioProject
	err := row.Scan(
		&p.ID, &p.WorkspaceID, &p.ContactID, &p.LeadID, &p.SourceDealID, &p.PackageID,
		&p.Name, &p.ProjectType, &p.Status, &p.EventDate, &p.EventEndDate,
		&p.VenueName, &p.VenueAddress, &p.City, &p.StateCode,
		&p.ExpectedValuePaisa, &p.BookedValuePaisa, &p.BalanceDuePaisa,
		&p.ContractStatus, &p.GalleryStatus, &p.NextAction, &p.NextActionDueAt,
		&p.Notes, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt,
	)
	return p, err
}

func normalizeStudioProject(p *StudioProject) {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	if p.Status == "" {
		p.Status = "inquiry"
	}
	if p.ProjectType == "" {
		p.ProjectType = "other"
	}
	if p.ContractStatus == "" {
		p.ContractStatus = "not_started"
	}
	if p.GalleryStatus == "" {
		p.GalleryStatus = "not_started"
	}
	if p.BookedValuePaisa == 0 && (p.Status == "booked" || p.Status == "shooting" || p.Status == "editing" || p.Status == "proofing" || p.Status == "delivered") {
		p.BookedValuePaisa = p.ExpectedValuePaisa
	}
}

func defaultProjectBalance(p *StudioProject) {
	if p.BalanceDuePaisa != 0 || p.ExpectedValuePaisa <= 0 {
		return
	}
	p.BalanceDuePaisa = p.ExpectedValuePaisa - p.BookedValuePaisa
	if p.BalanceDuePaisa < 0 {
		p.BalanceDuePaisa = 0
	}
}

func (r *StudioProjectRepo) Create(ctx context.Context, p *StudioProject) error {
	normalizeStudioProject(p)
	defaultProjectBalance(p)
	now := time.Now().UTC()
	p.CreatedAt = now
	p.UpdatedAt = now
	_, err := r.DB.Exec(ctx, `
		INSERT INTO studio_projects (`+studioProjectCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
		p.ID, p.WorkspaceID, p.ContactID, p.LeadID, p.SourceDealID, p.PackageID,
		p.Name, p.ProjectType, p.Status, p.EventDate, p.EventEndDate,
		p.VenueName, p.VenueAddress, p.City, p.StateCode,
		p.ExpectedValuePaisa, p.BookedValuePaisa, p.BalanceDuePaisa,
		p.ContractStatus, p.GalleryStatus, p.NextAction, p.NextActionDueAt,
		p.Notes, p.CreatedAt, p.UpdatedAt, p.ArchivedAt,
	)
	return err
}

func (r *StudioProjectRepo) CreateFromDeal(ctx context.Context, d Deal) error {
	project := StudioProject{
		ID:                 uuid.New(),
		WorkspaceID:        d.WorkspaceID,
		ContactID:          d.ContactID,
		SourceDealID:       &d.ID,
		Name:               d.Title,
		Status:             MapDealStageToProjectStatus(d.Stage),
		ExpectedValuePaisa: d.AmountPaisa,
		BalanceDuePaisa:    d.AmountPaisa - d.AdvancePaisa,
		EventDate:          d.EventDate,
		VenueName:          d.Venue,
		Notes:              d.Notes,
		CreatedAt:          d.CreatedAt,
		UpdatedAt:          d.UpdatedAt,
	}
	if d.EventType != nil && *d.EventType != "" {
		project.ProjectType = *d.EventType
	} else {
		project.ProjectType = "other"
	}
	if project.BalanceDuePaisa < 0 {
		project.BalanceDuePaisa = 0
	}
	if project.Status == "booked" || project.Status == "editing" || project.Status == "delivered" {
		project.BookedValuePaisa = d.AmountPaisa
	}
	project.ContractStatus = "not_started"
	project.GalleryStatus = "not_started"
	if project.CreatedAt.IsZero() {
		project.CreatedAt = time.Now().UTC()
	}
	if project.UpdatedAt.IsZero() {
		project.UpdatedAt = project.CreatedAt
	}

	_, err := r.DB.Exec(ctx, `
		INSERT INTO studio_projects (`+studioProjectCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
		ON CONFLICT DO NOTHING`,
		project.ID, project.WorkspaceID, project.ContactID, project.LeadID, project.SourceDealID, project.PackageID,
		project.Name, project.ProjectType, project.Status, project.EventDate, project.EventEndDate,
		project.VenueName, project.VenueAddress, project.City, project.StateCode,
		project.ExpectedValuePaisa, project.BookedValuePaisa, project.BalanceDuePaisa,
		project.ContractStatus, project.GalleryStatus, project.NextAction, project.NextActionDueAt,
		project.Notes, project.CreatedAt, project.UpdatedAt, project.ArchivedAt,
	)
	return err
}

func (r *StudioProjectRepo) GetByID(ctx context.Context, workspaceID, id uuid.UUID) (StudioProject, error) {
	row := r.DB.QueryRow(ctx, `SELECT `+studioProjectCols+` FROM studio_projects WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	return scanStudioProject(row)
}

func (r *StudioProjectRepo) List(ctx context.Context, f StudioProjectFilter) ([]StudioProject, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	query := `SELECT ` + prefixedStudioProjectCols("sp") + `, COALESCE(c.name, '') AS contact_name
		FROM studio_projects sp
		LEFT JOIN contacts c ON c.id = sp.contact_id AND c.workspace_id = sp.workspace_id
		WHERE sp.workspace_id = $1`
	args := []any{f.WorkspaceID}
	idx := 2
	if f.ContactID != nil {
		query += fmt.Sprintf(` AND sp.contact_id = $%d`, idx)
		args = append(args, *f.ContactID)
		idx++
	}
	if f.Status != "" {
		query += fmt.Sprintf(` AND sp.status = $%d`, idx)
		args = append(args, f.Status)
		idx++
	}
	if f.Search != "" {
		query += fmt.Sprintf(` AND (sp.name ILIKE $%d OR c.name ILIKE $%d OR sp.city ILIKE $%d)`, idx, idx, idx)
		args = append(args, "%"+f.Search+"%")
		idx++
	}
	if f.Cursor != nil {
		query += fmt.Sprintf(` AND sp.updated_at < $%d`, idx)
		args = append(args, *f.Cursor)
		idx++
	}
	query += fmt.Sprintf(` ORDER BY sp.event_date NULLS LAST, sp.updated_at DESC LIMIT $%d`, idx)
	args = append(args, f.Limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	projects := []StudioProject{}
	for rows.Next() {
		var p StudioProject
		if err := rows.Scan(
			&p.ID, &p.WorkspaceID, &p.ContactID, &p.LeadID, &p.SourceDealID, &p.PackageID,
			&p.Name, &p.ProjectType, &p.Status, &p.EventDate, &p.EventEndDate,
			&p.VenueName, &p.VenueAddress, &p.City, &p.StateCode,
			&p.ExpectedValuePaisa, &p.BookedValuePaisa, &p.BalanceDuePaisa,
			&p.ContractStatus, &p.GalleryStatus, &p.NextAction, &p.NextActionDueAt,
			&p.Notes, &p.CreatedAt, &p.UpdatedAt, &p.ArchivedAt, &p.ContactName,
		); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}
	return projects, rows.Err()
}

func prefixedStudioProjectCols(alias string) string {
	cols := []string{
		"id", "workspace_id", "contact_id", "lead_id", "source_deal_id", "package_id",
		"name", "project_type", "status", "event_date", "event_end_date", "venue_name",
		"venue_address", "city", "state_code", "expected_value_paisa", "booked_value_paisa",
		"balance_due_paisa", "contract_status", "gallery_status", "next_action",
		"next_action_due_at", "notes", "created_at", "updated_at", "archived_at",
	}
	out := ""
	for i, col := range cols {
		if i > 0 {
			out += ", "
		}
		out += alias + "." + col
	}
	return out
}

func (r *StudioProjectRepo) Update(ctx context.Context, p *StudioProject) error {
	normalizeStudioProject(p)
	p.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE studio_projects SET
			contact_id=$1, lead_id=$2, package_id=$3, name=$4, project_type=$5, status=$6,
			event_date=$7, event_end_date=$8, venue_name=$9, venue_address=$10, city=$11,
			state_code=$12, expected_value_paisa=$13, booked_value_paisa=$14,
			balance_due_paisa=$15, contract_status=$16, gallery_status=$17, next_action=$18,
			next_action_due_at=$19, notes=$20, updated_at=$21, archived_at=$22
		WHERE id=$23 AND workspace_id=$24`,
		p.ContactID, p.LeadID, p.PackageID, p.Name, p.ProjectType, p.Status,
		p.EventDate, p.EventEndDate, p.VenueName, p.VenueAddress, p.City,
		p.StateCode, p.ExpectedValuePaisa, p.BookedValuePaisa,
		p.BalanceDuePaisa, p.ContractStatus, p.GalleryStatus, p.NextAction,
		p.NextActionDueAt, p.Notes, p.UpdatedAt, p.ArchivedAt,
		p.ID, p.WorkspaceID,
	)
	return err
}

func (r *StudioProjectRepo) GetAggregate(ctx context.Context, workspaceID, id uuid.UUID) (StudioProjectAggregate, error) {
	project, err := r.GetByID(ctx, workspaceID, id)
	if err != nil {
		return StudioProjectAggregate{}, err
	}
	agg := StudioProjectAggregate{Project: project}

	if contact, err := scanContact(r.DB.QueryRow(ctx, `SELECT `+contactCols+` FROM contacts WHERE id=$1 AND workspace_id=$2`, project.ContactID, workspaceID)); err == nil {
		agg.Contact = &contact
	}
	if project.LeadID != nil {
		if lead, err := scanLead(r.DB.QueryRow(ctx, `SELECT `+leadCols+` FROM leads WHERE id=$1 AND workspace_id=$2`, *project.LeadID, workspaceID)); err == nil {
			agg.Inquiry = &lead
		}
	}

	if agg.Bookings, err = r.listEventsByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	if agg.Contracts, err = r.listContractsByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	if agg.Invoices, err = r.listInvoicesByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	if agg.Payments, err = r.listPaymentsByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	if agg.Galleries, err = r.listGalleriesByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	if agg.FollowUps, err = r.listFollowUpsByProject(ctx, workspaceID, id); err != nil {
		return StudioProjectAggregate{}, err
	}
	agg.Timeline = buildProjectTimeline(agg)
	return agg, nil
}

func (r *StudioProjectRepo) listEventsByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]Event, error) {
	rows, err := r.DB.Query(ctx, `SELECT `+eventCols+` FROM events WHERE workspace_id=$1 AND project_id=$2 ORDER BY start_at ASC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.Title, &e.EventType,
			&e.StartAt, &e.EndAt, &e.AllDay, &e.Location,
			&e.ContactID, &e.DealID, &e.ProjectID, &e.Status, &e.RecurrenceRule,
			&e.BufferBeforeMin, &e.BufferAfterMin, &e.Color, &e.Notes,
			&e.CreatedAt, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) listContractsByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]Contract, error) {
	rows, err := r.DB.Query(ctx, `SELECT `+contractCols+` FROM contracts WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Contract{}
	for rows.Next() {
		contract, err := scanContract(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, contract)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) listInvoicesByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]Invoice, error) {
	rows, err := r.DB.Query(ctx, `SELECT `+invoiceCols+` FROM invoices WHERE workspace_id=$1 AND project_id=$2 ORDER BY created_at DESC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Invoice{}
	for rows.Next() {
		invoice, err := scanInvoice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, invoice)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) listPaymentsByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]Payment, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, workspace_id, invoice_id, project_id, amount_paisa, method, reference_number, payment_date, notes, created_at
		FROM payments WHERE workspace_id=$1 AND project_id=$2 ORDER BY payment_date DESC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Payment{}
	for rows.Next() {
		var p Payment
		if err := rows.Scan(&p.ID, &p.WorkspaceID, &p.InvoiceID, &p.ProjectID, &p.AmountPaisa, &p.Method, &p.ReferenceNumber, &p.PaymentDate, &p.Notes, &p.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) listGalleriesByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]ProjectGallerySummary, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT g.id, g.title, g.slug, g.gallery_type, g.status, COALESCE(ac.photo_count, 0)::int, g.created_at
		FROM galleries g
		LEFT JOIN (
			SELECT gallery_id, COUNT(*) AS photo_count
			FROM gallery_assets
			GROUP BY gallery_id
		) ac ON ac.gallery_id = g.id
		WHERE g.workspace_id=$1 AND g.project_id=$2 AND g.deleted_at IS NULL
		ORDER BY g.created_at DESC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProjectGallerySummary{}
	for rows.Next() {
		var g ProjectGallerySummary
		if err := rows.Scan(&g.ID, &g.Title, &g.Slug, &g.GalleryType, &g.Status, &g.PhotoCount, &g.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) listFollowUpsByProject(ctx context.Context, workspaceID, projectID uuid.UUID) ([]FollowUp, error) {
	rows, err := r.DB.Query(ctx, `SELECT `+followUpCols+` FROM follow_ups WHERE workspace_id=$1 AND project_id=$2 ORDER BY due_at ASC`, workspaceID, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FollowUp{}
	for rows.Next() {
		var f FollowUp
		if err := rows.Scan(&f.ID, &f.WorkspaceID, &f.LeadID, &f.ContactID, &f.DealID, &f.ProjectID, &f.AssignedTo, &f.Type, &f.DueAt, &f.Notes, &f.Status, &f.CompletedAt, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (r *StudioProjectRepo) LinkGallery(ctx context.Context, workspaceID, projectID, galleryID uuid.UUID) error {
	project, err := r.GetByID(ctx, workspaceID, projectID)
	if err != nil {
		return err
	}
	tag, err := r.DB.Exec(ctx, `
		UPDATE galleries
		SET project_id=$1, contact_id=$2, updated_at=now()
		WHERE id=$3 AND workspace_id=$4 AND deleted_at IS NULL`, projectID, project.ContactID, galleryID, workspaceID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

func buildProjectTimeline(agg StudioProjectAggregate) []ProjectTimelineEntry {
	entries := []ProjectTimelineEntry{{
		Timestamp: agg.Project.CreatedAt,
		Type:      "project_created",
		Title:     "Project created: " + agg.Project.Name,
		Metadata:  map[string]any{"project_id": agg.Project.ID.String(), "status": agg.Project.Status},
	}}
	for _, booking := range agg.Bookings {
		entries = append(entries, ProjectTimelineEntry{
			Timestamp: booking.CreatedAt,
			Type:      "booking_created",
			Title:     "Booking created: " + booking.Title,
			Metadata:  map[string]any{"event_id": booking.ID.String(), "start_at": booking.StartAt.Format(time.RFC3339)},
		})
	}
	for _, invoice := range agg.Invoices {
		entries = append(entries, ProjectTimelineEntry{
			Timestamp: invoice.CreatedAt,
			Type:      "invoice_created",
			Title:     "Invoice created: " + invoice.InvoiceNumber,
			Metadata:  map[string]any{"invoice_id": invoice.ID.String(), "total_paisa": invoice.TotalPaisa, "status": invoice.Status},
		})
	}
	for _, contract := range agg.Contracts {
		entries = append(entries, ProjectTimelineEntry{
			Timestamp: contract.CreatedAt,
			Type:      "contract_created",
			Title:     "Contract created: " + contract.Title,
			Metadata:  map[string]any{"contract_id": contract.ID.String(), "status": contract.Status},
		})
	}
	for _, gallery := range agg.Galleries {
		entries = append(entries, ProjectTimelineEntry{
			Timestamp: gallery.CreatedAt,
			Type:      "gallery_linked",
			Title:     "Gallery linked: " + gallery.Title,
			Metadata:  map[string]any{"gallery_id": gallery.ID.String(), "status": gallery.Status},
		})
	}
	for _, followUp := range agg.FollowUps {
		entries = append(entries, ProjectTimelineEntry{
			Timestamp: followUp.CreatedAt,
			Type:      "follow_up_created",
			Title:     "Follow-up created: " + followUp.Type,
			Metadata:  map[string]any{"follow_up_id": followUp.ID.String(), "due_at": followUp.DueAt.Format(time.RFC3339), "status": followUp.Status},
		})
	}
	sortProjectTimelineDesc(entries)
	return entries
}

func sortProjectTimelineDesc(entries []ProjectTimelineEntry) {
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
