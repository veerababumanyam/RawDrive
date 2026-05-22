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

// FreelancerListing represents a freelancer marketplace listing.
type FreelancerListing struct {
	ID                   uuid.UUID       `json:"id"`
	UserID               uuid.UUID       `json:"user_id"`
	WorkspaceID          uuid.UUID       `json:"workspace_id"`
	StateID              int             `json:"state_id"`
	Title                string          `json:"title"`
	Specializations      []string        `json:"specializations"`
	City                 *string         `json:"city"`
	DailyRatePaisa       *int64          `json:"daily_rate_paisa"`
	Description          *string         `json:"description"`
	PortfolioGalleryID   *uuid.UUID      `json:"portfolio_gallery_id"`
	AvailabilityCalendar json.RawMessage `json:"availability_calendar"`
	IsPublished          bool            `json:"is_published"`
	RatingAvg            *float64        `json:"rating_avg"`
	ReviewCount          int             `json:"review_count"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
}

// FreelancerFilter contains search filters for freelancer listings.
type FreelancerFilter struct {
	StateID        *int
	City           string
	District       string
	Specialization string
	MinRatePaisa   *int64
	MaxRatePaisa   *int64
	Sort           string
	Limit          int
	Cursor         *time.Time
	PublishedOnly  bool
}

// FreelancerRepo handles freelancer listing persistence.
type FreelancerRepo struct {
	DB *pgxpool.Pool
}

func NewFreelancerRepo(db *pgxpool.Pool) *FreelancerRepo {
	return &FreelancerRepo{DB: db}
}

const freelancerCols = `id, user_id, workspace_id, state_id, title, specializations, city, daily_rate_paisa, description, portfolio_gallery_id, availability_calendar, is_published, rating_avg, review_count, created_at, updated_at`

func scanFreelancer(row pgx.Row) (FreelancerListing, error) {
	var f FreelancerListing
	err := row.Scan(
		&f.ID, &f.UserID, &f.WorkspaceID, &f.StateID, &f.Title,
		&f.Specializations, &f.City, &f.DailyRatePaisa, &f.Description,
		&f.PortfolioGalleryID, &f.AvailabilityCalendar, &f.IsPublished,
		&f.RatingAvg, &f.ReviewCount, &f.CreatedAt, &f.UpdatedAt,
	)
	return f, err
}

func (r *FreelancerRepo) Create(ctx context.Context, f *FreelancerListing) error {
	f.ID = uuid.New()
	now := time.Now().UTC()
	f.CreatedAt = now
	f.UpdatedAt = now
	if f.AvailabilityCalendar == nil {
		f.AvailabilityCalendar = json.RawMessage(`{}`)
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO freelancer_listings (`+freelancerCols+`)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		f.ID, f.UserID, f.WorkspaceID, f.StateID, f.Title,
		f.Specializations, f.City, f.DailyRatePaisa, f.Description,
		f.PortfolioGalleryID, f.AvailabilityCalendar, f.IsPublished,
		f.RatingAvg, f.ReviewCount, f.CreatedAt, f.UpdatedAt,
	)
	return err
}

func (r *FreelancerRepo) GetByID(ctx context.Context, id uuid.UUID) (FreelancerListing, error) {
	return scanFreelancer(r.DB.QueryRow(ctx,
		`SELECT `+freelancerCols+` FROM freelancer_listings WHERE id = $1`, id))
}

func (r *FreelancerRepo) GetByUserID(ctx context.Context, userID, wsID uuid.UUID) (FreelancerListing, error) {
	return scanFreelancer(r.DB.QueryRow(ctx,
		`SELECT `+freelancerCols+` FROM freelancer_listings WHERE user_id = $1 AND workspace_id = $2`, userID, wsID))
}

func (r *FreelancerRepo) Update(ctx context.Context, f *FreelancerListing) error {
	f.UpdatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		UPDATE freelancer_listings SET
			title=$2, specializations=$3, city=$4, daily_rate_paisa=$5,
			description=$6, portfolio_gallery_id=$7, availability_calendar=$8,
			is_published=$9, updated_at=$10
		WHERE id = $1`,
		f.ID, f.Title, f.Specializations, f.City, f.DailyRatePaisa,
		f.Description, f.PortfolioGalleryID, f.AvailabilityCalendar,
		f.IsPublished, f.UpdatedAt,
	)
	return err
}

func (r *FreelancerRepo) Delete(ctx context.Context, id, userID uuid.UUID) error {
	tag, err := r.DB.Exec(ctx,
		`DELETE FROM freelancer_listings WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("not found or not owner")
	}
	return nil
}

func (r *FreelancerRepo) List(ctx context.Context, filter FreelancerFilter) ([]FreelancerListing, error) {
	var args []interface{}
	var conditions []string
	argN := 1

	if filter.PublishedOnly {
		conditions = append(conditions, fmt.Sprintf("is_published = true"))
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
	if filter.District != "" {
		conditions = append(conditions, fmt.Sprintf("district ILIKE $%d", argN))
		args = append(args, "%"+filter.District+"%")
		argN++
	}
	if filter.Specialization != "" {
		conditions = append(conditions, fmt.Sprintf("$%d = ANY(specializations)", argN))
		args = append(args, filter.Specialization)
		argN++
	}
	if filter.MinRatePaisa != nil {
		conditions = append(conditions, fmt.Sprintf("daily_rate_paisa >= $%d", argN))
		args = append(args, *filter.MinRatePaisa)
		argN++
	}
	if filter.MaxRatePaisa != nil {
		conditions = append(conditions, fmt.Sprintf("daily_rate_paisa <= $%d", argN))
		args = append(args, *filter.MaxRatePaisa)
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
	if filter.Sort == "rating" {
		orderBy = "ORDER BY rating_avg DESC NULLS LAST"
	} else if filter.Sort == "rate" {
		orderBy = "ORDER BY daily_rate_paisa ASC NULLS LAST"
	}

	limit := 50
	if filter.Limit > 0 && filter.Limit <= 50 {
		limit = filter.Limit
	}

	query := fmt.Sprintf(`SELECT %s FROM freelancer_listings %s %s LIMIT %d`,
		freelancerCols, where, orderBy, limit)

	rows, err := r.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []FreelancerListing
	for rows.Next() {
		var f FreelancerListing
		if err := rows.Scan(
			&f.ID, &f.UserID, &f.WorkspaceID, &f.StateID, &f.Title,
			&f.Specializations, &f.City, &f.DailyRatePaisa, &f.Description,
			&f.PortfolioGalleryID, &f.AvailabilityCalendar, &f.IsPublished,
			&f.RatingAvg, &f.ReviewCount, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, f)
	}
	return results, rows.Err()
}

// MarketplaceInquiry represents an inquiry sent to a freelancer or gear owner.
type MarketplaceInquiry struct {
	ID              uuid.UUID  `json:"id"`
	InquiryType     string     `json:"type"`
	ListingID       uuid.UUID  `json:"listing_id"`
	FromUserID      uuid.UUID  `json:"from_user_id"`
	ToUserID        uuid.UUID  `json:"to_user_id"`
	Message         string     `json:"message"`
	EventDate       *time.Time `json:"event_date"`
	DurationDays    *int       `json:"duration_days"`
	Status          string     `json:"status"`
	ReplyMessage    *string    `json:"reply_message,omitempty"`
	// Populated by ListInquiries JOIN — not stored in the inquiries table.
	FromUserName  *string `json:"from_user_name,omitempty"`
	FromUserEmail *string `json:"from_user_email,omitempty"`
	ToUserName    *string `json:"to_user_name,omitempty"`
	ToUserEmail   *string `json:"to_user_email,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

func (r *FreelancerRepo) CreateInquiry(ctx context.Context, inq *MarketplaceInquiry) error {
	inq.ID = uuid.New()
	now := time.Now().UTC()
	inq.CreatedAt = now
	inq.UpdatedAt = now
	if inq.Status == "" {
		inq.Status = "sent"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO marketplace_inquiries (id, inquiry_type, listing_id, from_user_id, to_user_id, message, event_date, duration_days, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		inq.ID, inq.InquiryType, inq.ListingID, inq.FromUserID, inq.ToUserID,
		inq.Message, inq.EventDate, inq.DurationDays, inq.Status, inq.CreatedAt, inq.UpdatedAt,
	)
	return err
}

func (r *FreelancerRepo) ListInquiries(ctx context.Context, userID uuid.UUID) ([]MarketplaceInquiry, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT mi.id, mi.inquiry_type, mi.listing_id, mi.from_user_id, mi.to_user_id,
		       mi.message, mi.event_date, mi.duration_days, mi.status, mi.reply_message,
		       u_from.display_name, u_from.email,
		       u_to.display_name, u_to.email,
		       mi.created_at, mi.updated_at
		FROM marketplace_inquiries mi
		LEFT JOIN users u_from ON u_from.id = mi.from_user_id
		LEFT JOIN users u_to   ON u_to.id   = mi.to_user_id
		WHERE mi.from_user_id = $1 OR mi.to_user_id = $1
		ORDER BY mi.created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []MarketplaceInquiry
	for rows.Next() {
		var inq MarketplaceInquiry
		if err := rows.Scan(&inq.ID, &inq.InquiryType, &inq.ListingID, &inq.FromUserID,
			&inq.ToUserID, &inq.Message, &inq.EventDate, &inq.DurationDays,
			&inq.Status, &inq.ReplyMessage,
			&inq.FromUserName, &inq.FromUserEmail,
			&inq.ToUserName, &inq.ToUserEmail,
			&inq.CreatedAt, &inq.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, inq)
	}
	return results, rows.Err()
}

func (r *FreelancerRepo) UpdateInquiryStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE marketplace_inquiries SET status = $2, updated_at = $3 WHERE id = $1`,
		id, status, time.Now().UTC())
	return err
}

// ReplyInquiry sets reply_message and transitions status to "replied".
func (r *FreelancerRepo) ReplyInquiry(ctx context.Context, id uuid.UUID, replyMsg string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE marketplace_inquiries SET reply_message = $2, status = 'replied', updated_at = $3 WHERE id = $1`,
		id, replyMsg, time.Now().UTC())
	return err
}

// InquiryMessage is one message in a per-inquiry conversation thread.
type InquiryMessage struct {
	ID         uuid.UUID `json:"id"`
	InquiryID  uuid.UUID `json:"inquiry_id"`
	SenderID   uuid.UUID `json:"sender_id"`
	SenderName *string   `json:"sender_name,omitempty"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// GetInquiryByID fetches a single inquiry record (no JOINs).
func (r *FreelancerRepo) GetInquiryByID(ctx context.Context, id uuid.UUID) (MarketplaceInquiry, error) {
	var inq MarketplaceInquiry
	err := r.DB.QueryRow(ctx, `
		SELECT id, inquiry_type, listing_id, from_user_id, to_user_id,
		       message, event_date, duration_days, status, reply_message,
		       created_at, updated_at
		FROM marketplace_inquiries WHERE id = $1`, id).Scan(
		&inq.ID, &inq.InquiryType, &inq.ListingID, &inq.FromUserID, &inq.ToUserID,
		&inq.Message, &inq.EventDate, &inq.DurationDays, &inq.Status, &inq.ReplyMessage,
		&inq.CreatedAt, &inq.UpdatedAt,
	)
	return inq, err
}

// GetInquiryMessages returns all thread messages for an inquiry, oldest first.
func (r *FreelancerRepo) GetInquiryMessages(ctx context.Context, inquiryID uuid.UUID) ([]InquiryMessage, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT im.id, im.inquiry_id, im.sender_id, u.display_name, im.body, im.created_at
		FROM inquiry_messages im
		LEFT JOIN users u ON u.id = im.sender_id
		WHERE im.inquiry_id = $1
		ORDER BY im.created_at ASC`, inquiryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []InquiryMessage
	for rows.Next() {
		var m InquiryMessage
		if err := rows.Scan(&m.ID, &m.InquiryID, &m.SenderID, &m.SenderName, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, m)
	}
	return results, rows.Err()
}

// CreateInquiryMessage inserts one new message into the inquiry thread.
func (r *FreelancerRepo) CreateInquiryMessage(ctx context.Context, msg *InquiryMessage) error {
	msg.ID = uuid.New()
	msg.CreatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO inquiry_messages (id, inquiry_id, sender_id, body, created_at)
		VALUES ($1, $2, $3, $4, $5)`,
		msg.ID, msg.InquiryID, msg.SenderID, msg.Body, msg.CreatedAt,
	)
	return err
}

// HireRequest represents a hire request for a freelancer.
type HireRequest struct {
	ID                uuid.UUID  `json:"id"`
	ListingID         uuid.UUID  `json:"listing_id"`
	RequesterID       uuid.UUID  `json:"requester_id"`
	FreelancerID      uuid.UUID  `json:"freelancer_id"`
	EventDetails      *string    `json:"event_details"`
	EventDate         *time.Time `json:"event_date"`
	CompensationPaisa *int64     `json:"compensation_paisa"`
	Requirements      *string    `json:"requirements"`
	Status            string     `json:"status"`
	Message           *string    `json:"message"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

func (r *FreelancerRepo) CreateHireRequest(ctx context.Context, h *HireRequest) error {
	h.ID = uuid.New()
	now := time.Now().UTC()
	h.CreatedAt = now
	h.UpdatedAt = now
	if h.Status == "" {
		h.Status = "sent"
	}
	_, err := r.DB.Exec(ctx, `
		INSERT INTO hire_requests (id, listing_id, requester_id, freelancer_id, event_details, event_date, compensation_paisa, requirements, status, message, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		h.ID, h.ListingID, h.RequesterID, h.FreelancerID,
		h.EventDetails, h.EventDate, h.CompensationPaisa, h.Requirements,
		h.Status, h.Message, h.CreatedAt, h.UpdatedAt,
	)
	return err
}

func (r *FreelancerRepo) GetHireRequest(ctx context.Context, id uuid.UUID) (HireRequest, error) {
	var h HireRequest
	err := r.DB.QueryRow(ctx, `
		SELECT id, listing_id, requester_id, freelancer_id, event_details, event_date, compensation_paisa, requirements, status, message, created_at, updated_at
		FROM hire_requests WHERE id = $1`, id).Scan(
		&h.ID, &h.ListingID, &h.RequesterID, &h.FreelancerID,
		&h.EventDetails, &h.EventDate, &h.CompensationPaisa, &h.Requirements,
		&h.Status, &h.Message, &h.CreatedAt, &h.UpdatedAt,
	)
	return h, err
}

func (r *FreelancerRepo) UpdateHireStatus(ctx context.Context, id uuid.UUID, status string) error {
	_, err := r.DB.Exec(ctx,
		`UPDATE hire_requests SET status = $2, updated_at = $3 WHERE id = $1`,
		id, status, time.Now().UTC())
	return err
}

func (r *FreelancerRepo) ListHireRequestsByRequester(ctx context.Context, requesterID uuid.UUID) ([]HireRequest, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, listing_id, requester_id, freelancer_id, event_details, event_date, compensation_paisa, requirements, status, message, created_at, updated_at
		FROM hire_requests WHERE requester_id = $1 ORDER BY created_at DESC`, requesterID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []HireRequest
	for rows.Next() {
		var h HireRequest
		if err := rows.Scan(&h.ID, &h.ListingID, &h.RequesterID, &h.FreelancerID,
			&h.EventDetails, &h.EventDate, &h.CompensationPaisa, &h.Requirements,
			&h.Status, &h.Message, &h.CreatedAt, &h.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, h)
	}
	return results, rows.Err()
}

func (r *FreelancerRepo) ListHireRequestsByFreelancer(ctx context.Context, freelancerID uuid.UUID) ([]HireRequest, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, listing_id, requester_id, freelancer_id, event_details, event_date, compensation_paisa, requirements, status, message, created_at, updated_at
		FROM hire_requests WHERE freelancer_id = $1 ORDER BY created_at DESC`, freelancerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []HireRequest
	for rows.Next() {
		var h HireRequest
		if err := rows.Scan(&h.ID, &h.ListingID, &h.RequesterID, &h.FreelancerID,
			&h.EventDetails, &h.EventDate, &h.CompensationPaisa, &h.Requirements,
			&h.Status, &h.Message, &h.CreatedAt, &h.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, h)
	}
	return results, rows.Err()
}

// FreelancerReview represents a review for a freelancer.
type FreelancerReview struct {
	ID         uuid.UUID `json:"id"`
	ListingID  uuid.UUID `json:"listing_id"`
	ReviewerID uuid.UUID `json:"reviewer_id"`
	BookingID  *uuid.UUID `json:"booking_id"`
	Rating     int       `json:"rating"`
	ReviewText *string   `json:"review_text"`
	CreatedAt  time.Time `json:"created_at"`
}

func (r *FreelancerRepo) CreateReview(ctx context.Context, rev *FreelancerReview) error {
	rev.ID = uuid.New()
	rev.CreatedAt = time.Now().UTC()
	_, err := r.DB.Exec(ctx, `
		INSERT INTO freelancer_reviews (id, listing_id, reviewer_id, booking_id, rating, review_text, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		rev.ID, rev.ListingID, rev.ReviewerID, rev.BookingID, rev.Rating, rev.ReviewText, rev.CreatedAt,
	)
	if err != nil {
		return err
	}
	// Recalculate rating average
	_, err = r.DB.Exec(ctx, `
		UPDATE freelancer_listings SET
			rating_avg = (SELECT AVG(rating)::decimal(3,2) FROM freelancer_reviews WHERE listing_id = $1),
			review_count = (SELECT COUNT(*) FROM freelancer_reviews WHERE listing_id = $1)
		WHERE id = $1`, rev.ListingID)
	return err
}

func (r *FreelancerRepo) ListReviews(ctx context.Context, listingID uuid.UUID) ([]FreelancerReview, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, listing_id, reviewer_id, booking_id, rating, review_text, created_at
		FROM freelancer_reviews WHERE listing_id = $1 ORDER BY created_at DESC`, listingID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []FreelancerReview
	for rows.Next() {
		var rev FreelancerReview
		if err := rows.Scan(&rev.ID, &rev.ListingID, &rev.ReviewerID, &rev.BookingID,
			&rev.Rating, &rev.ReviewText, &rev.CreatedAt); err != nil {
			return nil, err
		}
		results = append(results, rev)
	}
	return results, rows.Err()
}
