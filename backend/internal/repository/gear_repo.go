package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GearListing represents a gear rental/sale listing.
type GearListing struct {
	ID                   uuid.UUID       `json:"id"`
	UserID               uuid.UUID       `json:"user_id"`
	WorkspaceID          uuid.UUID       `json:"workspace_id"`
	StateID              int             `json:"state_id"`
	ListingType          string          `json:"listing_type"`
	Title                string          `json:"title"`
	Category             string          `json:"category"`
	Brand                *string         `json:"brand"`
	Model                *string         `json:"model"`
	Condition            *string         `json:"condition"`
	PricePaisa           int64           `json:"price_paisa"`
	Description          *string         `json:"description"`
	Images               json.RawMessage `json:"images"`
	City                 *string         `json:"city"`
	IsPublished          bool            `json:"is_published"`
	IsAvailable          bool            `json:"is_available"`
	AvailabilityCalendar json.RawMessage `json:"availability_calendar"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

type GearFilter struct {
	StateID      *int
	City         string
	Category     string
	Brand        string
	MinPricePaisa *int64
	MaxPricePaisa *int64
	ListingType  string
	Sort         string
	Limit        int
	Cursor       *time.Time
	PublishedOnly bool
}

type GearRepo struct {
	DB *pgxpool.Pool
}

func NewGearRepo(db *pgxpool.Pool) *GearRepo {
	return &GearRepo{DB: db}
}

const gearCols = `id, user_id, workspace_id, state_id, listing_type, title, category, brand, model, condition, price_paisa, description, images, city, is_published, is_available, availability_calendar, created_at, updated_at`

func scanGear(row pgx.Row) (GearListing, error) {
	var g GearListing
	err := row.Scan(
		&g.ID, &g.UserID, &g.WorkspaceID, &g.StateID, &g.ListingType,
		&g.Title, &g.Category, &g.Brand, &g.Model, &g.Condition,
		&g.PricePaisa, &g.Description, &g.Images, &g.City,
		&g.IsPublished, &g.IsAvailable, &g.AvailabilityCalendar,
		&g.CreatedAt, &g.UpdatedAt,
	)
	return g, err
}

func (r *GearRepo) Create(ctx context.Context, g *GearListing) error {
	g.ID = uuid.New()
	now := time.Now().UTC()
	g.CreatedAt = now
	g.UpdatedAt = now
	if g.Images == nil {
		g.Images = json.RawMessage(`[]`)
	}
	if g.AvailabilityCalendar == nil {
		g.AvailabilityCalendar = json.RawMessage(`{}`)
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO gear_listings (`+gearCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
		g.ID, g.UserID, g.WorkspaceID, g.StateID, g.ListingType,
		g.Title, g.Category, g.Brand, g.Model, g.Condition,
		g.PricePaisa, g.Description, g.Images, g.City,
		g.IsPublished, g.IsAvailable, g.AvailabilityCalendar,
		g.CreatedAt, g.UpdatedAt,
	)
	return err
}

func (r *GearRepo) GetByID(ctx context.Context, id uuid.UUID) (GearListing, error) {
	return scanGear(r.DB.QueryRow(ctx, `SELECT `+gearCols+` FROM gear_listings WHERE id = $1`, id))
}

func (r *GearRepo) Update(ctx context.Context, g *GearListing) error {
	g.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE gear_listings SET
			listing_type=$2, title=$3, category=$4, brand=$5, model=$6,
			condition=$7, price_paisa=$8, description=$9, images=$10,
			city=$11, is_published=$12, is_available=$13,
			availability_calendar=$14, updated_at=$15
		WHERE id = $1`,
		g.ID, g.ListingType, g.Title, g.Category, g.Brand, g.Model,
		g.Condition, g.PricePaisa, g.Description, g.Images,
		g.City, g.IsPublished, g.IsAvailable,
		g.AvailabilityCalendar, g.UpdatedAt,
	)
	return err
}

func (r *GearRepo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.DB.Exec(ctx,
		`DELETE FROM gear_listings WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("not found or not owner")
	}
	return nil
}

func (r *GearRepo) List(ctx context.Context, filter GearFilter) ([]GearListing, error) {
	var args []interface{}
	var conditions []string
	argN := 1

	if filter.PublishedOnly {
		conditions = append(conditions, "is_published = true")
	}
	if filter.StateID != nil {
		conditions = append(conditions, fmt.Sprintf("state_id = $%d", argN))
		args = append(args, *filter.StateID)
		argN++
	}
	if filter.City != "" {
		conditions = append(conditions, fmt.Sprintf("city ILIKE $%d", argN))
		args = append(args, "%"+filter.City+"%")
		argN++
	}
	if filter.Category != "" {
		conditions = append(conditions, fmt.Sprintf("category = $%d", argN))
		args = append(args, filter.Category)
		argN++
	}
	if filter.Brand != "" {
		conditions = append(conditions, fmt.Sprintf("brand ILIKE $%d", argN))
		args = append(args, "%"+filter.Brand+"%")
		argN++
	}
	if filter.ListingType != "" {
		conditions = append(conditions, fmt.Sprintf("listing_type = $%d", argN))
		args = append(args, filter.ListingType)
		argN++
	}
	if filter.MinPricePaisa != nil {
		conditions = append(conditions, fmt.Sprintf("price_paisa >= $%d", argN))
		args = append(args, *filter.MinPricePaisa)
		argN++
	}
	if filter.MaxPricePaisa != nil {
		conditions = append(conditions, fmt.Sprintf("price_paisa <= $%d", argN))
		args = append(args, *filter.MaxPricePaisa)
		argN++
	}
	if filter.Cursor != nil {
		conditions = append(conditions, fmt.Sprintf("created_at < $%d", argN))
		args = append(args, *filter.Cursor)
		argN++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	orderBy := "ORDER BY created_at DESC"
	if filter.Sort == "price" {
		orderBy = "ORDER BY price_paisa ASC"
	}

	limit := 50
	if filter.Limit > 0 && filter.Limit <= 50 {
		limit = filter.Limit
	}

	query := fmt.Sprintf(`SELECT %s FROM gear_listings %s %s LIMIT %d`,
		gearCols, where, orderBy, limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []GearListing
	for rows.Next() {
		var g GearListing
		if err := rows.Scan(
			&g.ID, &g.UserID, &g.WorkspaceID, &g.StateID, &g.ListingType,
			&g.Title, &g.Category, &g.Brand, &g.Model, &g.Condition,
			&g.PricePaisa, &g.Description, &g.Images, &g.City,
			&g.IsPublished, &g.IsAvailable, &g.AvailabilityCalendar,
			&g.CreatedAt, &g.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, g)
	}
	return results, rows.Err()
}

// ListByOwner returns all gear listings owned by the given user (published and unpublished).
func (r *GearRepo) ListByOwner(ctx context.Context, userID uuid.UUID) ([]GearListing, error) {
	rows, err := r.DB.Query(ctx,
		`SELECT `+gearCols+` FROM gear_listings WHERE user_id = $1 ORDER BY created_at DESC`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []GearListing
	for rows.Next() {
		var g GearListing
		if err := rows.Scan(
			&g.ID, &g.UserID, &g.WorkspaceID, &g.StateID, &g.ListingType,
			&g.Title, &g.Category, &g.Brand, &g.Model, &g.Condition,
			&g.PricePaisa, &g.Description, &g.Images, &g.City,
			&g.IsPublished, &g.IsAvailable, &g.AvailabilityCalendar,
			&g.CreatedAt, &g.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, g)
	}
	return results, rows.Err()
}

// GearBooking represents a gear rental booking.
type GearBooking struct {
	ID            uuid.UUID       `json:"id"`
	GearListingID uuid.UUID      `json:"gear_listing_id"`
	RenterID      uuid.UUID      `json:"renter_id"`
	OwnerID       uuid.UUID      `json:"owner_id"`
	StartDate     time.Time       `json:"start_date"`
	EndDate       time.Time       `json:"end_date"`
	TotalPaisa    int64           `json:"total_paisa"`
	DepositPaisa  int64           `json:"deposit_paisa"`
	Status        string          `json:"status"`
	OwnerMessage  *string         `json:"owner_message"`
	RenterMessage *string         `json:"renter_message"`
	ReturnPhotos  json.RawMessage `json:"return_photos"`
	DisputeReason *string         `json:"dispute_reason"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

func (r *GearRepo) CreateBooking(ctx context.Context, b *GearBooking) error {
	b.ID = uuid.New()
	now := time.Now().UTC()
	b.CreatedAt = now
	b.UpdatedAt = now
	if b.Status == "" {
		b.Status = "pending"
	}
	if b.ReturnPhotos == nil {
		b.ReturnPhotos = json.RawMessage(`[]`)
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO gear_bookings (id, gear_listing_id, renter_id, owner_id, start_date, end_date, total_paisa, deposit_paisa, status, owner_message, renter_message, return_photos, dispute_reason, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
		b.ID, b.GearListingID, b.RenterID, b.OwnerID,
		b.StartDate, b.EndDate, b.TotalPaisa, b.DepositPaisa,
		b.Status, b.OwnerMessage, b.RenterMessage, b.ReturnPhotos,
		b.DisputeReason, b.CreatedAt, b.UpdatedAt,
	)
	return err
}

func (r *GearRepo) GetBooking(ctx context.Context, id uuid.UUID) (GearBooking, error) {
	var b GearBooking
	err := r.DB.QueryRow(ctx, `
		SELECT id, gear_listing_id, renter_id, owner_id, start_date, end_date, total_paisa, deposit_paisa, status, owner_message, renter_message, return_photos, dispute_reason, created_at, updated_at
		FROM gear_bookings WHERE id = $1`, id).Scan(
		&b.ID, &b.GearListingID, &b.RenterID, &b.OwnerID,
		&b.StartDate, &b.EndDate, &b.TotalPaisa, &b.DepositPaisa,
		&b.Status, &b.OwnerMessage, &b.RenterMessage, &b.ReturnPhotos,
		&b.DisputeReason, &b.CreatedAt, &b.UpdatedAt,
	)
	return b, err
}

func (r *GearRepo) UpdateBookingStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE gear_bookings SET status = $2, updated_at = $3 WHERE id = $1`,
		id, status, time.Now().UTC())
	return err
}

// BookingConflictCheck returns true when an existing booking for the given
// gear listing overlaps the [start, end] range and is in an active/reserving
// state (pending, approved, or active). Uses the standard half-open range
// overlap test: existing.start_date <= end AND existing.end_date >= start.
// Added to close the M5 gap audit item on date-conflict detection.
func (r *GearRepo) BookingConflictCheck(ctx context.Context, gearID uuid.UUID, start, end time.Time) (bool, error) {
	var count int
	err := r.DB.QueryRow(ctx, `
		SELECT COUNT(*) FROM gear_bookings
		WHERE gear_listing_id = $1
		  AND status IN ('pending', 'approved', 'active')
		  AND start_date <= $3
		  AND end_date >= $2`,
		gearID, start, end).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *GearRepo) ListBookingsByRenter(ctx context.Context, renterID uuid.UUID) ([]GearBooking, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, gear_listing_id, renter_id, owner_id, start_date, end_date, total_paisa, deposit_paisa, status, owner_message, renter_message, return_photos, dispute_reason, created_at, updated_at
		FROM gear_bookings WHERE renter_id = $1 ORDER BY created_at DESC`, renterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []GearBooking
	for rows.Next() {
		var b GearBooking
		if err := rows.Scan(&b.ID, &b.GearListingID, &b.RenterID, &b.OwnerID,
			&b.StartDate, &b.EndDate, &b.TotalPaisa, &b.DepositPaisa,
			&b.Status, &b.OwnerMessage, &b.RenterMessage, &b.ReturnPhotos,
			&b.DisputeReason, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, b)
	}
	return results, rows.Err()
}
