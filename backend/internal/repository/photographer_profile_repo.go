package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrPhotographerProfileNotFound = errors.New("photographer profile not found")

type PhotographerProfile struct {
	ProfileID            uuid.UUID       `json:"profile_id"`
	PhotographerID       uuid.UUID       `json:"photographer_id"`
	WorkspaceID          uuid.UUID       `json:"workspace_id"`
	CreatedAt            time.Time       `json:"created_at"`
	UpdatedAt            time.Time       `json:"updated_at"`
	PublishedAt          *time.Time      `json:"published_at,omitempty"`
	Status               string          `json:"status"`
	FirstName            string          `json:"first_name"`
	LastName             string          `json:"last_name"`
	DisplayName          string          `json:"display_name"`
	ProfessionalTitle    string          `json:"professional_title"`
	Tagline              string          `json:"tagline"`
	AvatarURL            string          `json:"avatar_url"`
	AvatarCroppedURL     string          `json:"avatar_cropped_url"`
	AvatarPosition       json.RawMessage `json:"avatar_position"`
	AvatarUploadedAt     *time.Time      `json:"avatar_uploaded_at,omitempty"`
	CoverURL             string          `json:"cover_url"`
	CoverPosition        json.RawMessage `json:"cover_position"`
	ShortBio             string          `json:"short_bio"`
	LongBio              string          `json:"long_bio"`
	PrimaryEmail         string          `json:"primary_email"`
	PrimaryPhone         string          `json:"primary_phone"`
	WhatsappNumber       string          `json:"whatsapp_number"`
	SecondaryEmail       string          `json:"secondary_email"`
	ContactPreferences   json.RawMessage `json:"contact_preferences"`
	PrimaryCity          string          `json:"primary_city"`
	State                string          `json:"state"`
	Country              string          `json:"country"`
	ServiceRadiusKM      *int            `json:"service_radius_km,omitempty"`
	TravelAvailability   string          `json:"travel_availability"`
	CoveredCities        []string        `json:"covered_cities"`
	YearsExperience      *int            `json:"years_experience,omitempty"`
	TotalWeddingsShot    *int            `json:"total_weddings_shot,omitempty"`
	PhotographyStyles    []string        `json:"photography_styles"`
	Specializations      []string        `json:"specializations"`
	LanguagesSpoken      []string        `json:"languages_spoken"`
	Equipment            json.RawMessage `json:"equipment"`
	StartingPrice        *int            `json:"starting_price,omitempty"`
	PriceRangeMax        *int            `json:"price_range_max,omitempty"`
	CustomQuoteAvailable bool            `json:"custom_quote_available"`
	PaymentTerms         string          `json:"payment_terms"`
	DepositRequired      bool            `json:"deposit_required"`
	DepositAmount        *int            `json:"deposit_amount,omitempty"`
	Packages             json.RawMessage `json:"packages"`
	FeaturedGalleries    []uuid.UUID     `json:"featured_galleries"`
	Testimonials         json.RawMessage `json:"testimonials"`
	VideoTestimonials    []string        `json:"video_testimonials"`
	AverageRating        *float64        `json:"average_rating,omitempty"`
	SocialInstagram      string          `json:"social_instagram"`
	SocialFacebook       string          `json:"social_facebook"`
	SocialLinkedin       string          `json:"social_linkedin"`
	SocialYoutube        string          `json:"social_youtube"`
	SocialPinterest      string          `json:"social_pinterest"`
	CustomLinks          json.RawMessage `json:"custom_links"`
	Awards               json.RawMessage `json:"awards"`
	Certifications       json.RawMessage `json:"certifications"`
	FeaturedIn           []string        `json:"featured_in"`
	BusinessName         string          `json:"business_name"`
	GSTNumber            string          `json:"gst_number"`
	BusinessAddress      string          `json:"business_address"`
	PaymentMethods       []string        `json:"payment_methods"`
	IsPublic             bool            `json:"is_public"`
	VisibilityConfig     json.RawMessage `json:"visibility_config"`
	MetaTitle            string          `json:"meta_title"`
	MetaDescription      string          `json:"meta_description"`
	MetaKeywords         []string        `json:"meta_keywords"`
	OGImageURL           string          `json:"og_image_url"`
	URLSlug              string          `json:"url_slug"`
	SelectedTheme        string          `json:"selected_theme"`
	BrandColor           string          `json:"brand_color"`
	LayoutStyle          string          `json:"layout_style"`
	TotalProfileViews    int             `json:"total_profile_views"`
	UniqueVisitors       int             `json:"unique_visitors"`
	LastViewedAt         *time.Time      `json:"last_viewed_at,omitempty"`
}

type ProfileGallery struct {
	ID              uuid.UUID         `json:"id"`
	Title           string            `json:"title"`
	Slug            string            `json:"slug"`
	Description     string            `json:"description"`
	GalleryType     string            `json:"gallery_type"`
	IsPublished     bool              `json:"is_published"`
	Status          string            `json:"status"`
	CoverThumbnails map[string]string `json:"cover_thumbnails,omitempty"`
}

type PhotographerProfileRepo struct {
	pool *pgxpool.Pool
}

func NewPhotographerProfileRepo(pool *pgxpool.Pool) *PhotographerProfileRepo {
	return &PhotographerProfileRepo{pool: pool}
}

const photographerProfileSelect = `
	SELECT profile_id, photographer_id, workspace_id, created_at, updated_at, published_at, status,
	       COALESCE(first_name, ''), COALESCE(last_name, ''), display_name, COALESCE(professional_title, ''), COALESCE(tagline, ''),
	       COALESCE(avatar_url, ''), COALESCE(avatar_cropped_url, ''), avatar_position, avatar_uploaded_at,
	       COALESCE(cover_url, ''), cover_position, COALESCE(short_bio, ''), COALESCE(long_bio, ''),
	       COALESCE(primary_email, ''), COALESCE(primary_phone, ''), COALESCE(whatsapp_number, ''), COALESCE(secondary_email, ''),
	       contact_preferences, COALESCE(primary_city, ''), COALESCE(state, ''), COALESCE(country, ''),
	       service_radius_km, COALESCE(travel_availability, ''), covered_cities,
	       years_experience, total_weddings_shot, photography_styles, specializations, languages_spoken, equipment,
	       starting_price, price_range_max, custom_quote_available, COALESCE(payment_terms, ''), deposit_required, deposit_amount,
	       packages, featured_galleries, testimonials, video_testimonials, average_rating,
	       COALESCE(social_instagram, ''), COALESCE(social_facebook, ''), COALESCE(social_linkedin, ''),
	       COALESCE(social_youtube, ''), COALESCE(social_pinterest, ''), custom_links,
	       awards, certifications, featured_in, COALESCE(business_name, ''), COALESCE(gst_number, ''),
	       COALESCE(business_address, ''), payment_methods, is_public, visibility_config,
	       COALESCE(meta_title, ''), COALESCE(meta_description, ''), meta_keywords, COALESCE(og_image_url, ''),
	       COALESCE(url_slug, ''), selected_theme, COALESCE(brand_color, ''), layout_style,
	       total_profile_views, unique_visitors, last_viewed_at
	  FROM photographer_profiles`

func (r *PhotographerProfileRepo) GetByOwner(ctx context.Context, photographerID, workspaceID uuid.UUID) (*PhotographerProfile, error) {
	row := r.pool.QueryRow(ctx, photographerProfileSelect+`
		WHERE photographer_id = $1 AND workspace_id = $2`, photographerID, workspaceID)
	profile, err := scanPhotographerProfile(row)
	if err != nil {
		return nil, err
	}
	if err := r.applyWorkspaceBusinessProfile(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (r *PhotographerProfileRepo) GetByID(ctx context.Context, profileID uuid.UUID) (*PhotographerProfile, error) {
	row := r.pool.QueryRow(ctx, photographerProfileSelect+`
		WHERE profile_id = $1`, profileID)
	profile, err := scanPhotographerProfile(row)
	if err != nil {
		return nil, err
	}
	if err := r.applyWorkspaceBusinessProfile(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (r *PhotographerProfileRepo) GetPublishedBySlug(ctx context.Context, slug string) (*PhotographerProfile, error) {
	row := r.pool.QueryRow(ctx, photographerProfileSelect+`
		WHERE lower(url_slug) = lower($1)
		  AND status = 'published'
		  AND is_public = true`, slug)
	profile, err := scanPhotographerProfile(row)
	if err != nil {
		return nil, err
	}
	if err := r.applyWorkspaceBusinessProfile(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (r *PhotographerProfileRepo) SlugOwner(ctx context.Context, slug string) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.pool.QueryRow(ctx, `
		SELECT profile_id
		  FROM photographer_profiles
		 WHERE lower(url_slug) = lower($1)
		 LIMIT 1`, slug).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrPhotographerProfileNotFound
		}
		return uuid.Nil, err
	}
	return id, nil
}

func (r *PhotographerProfileRepo) Upsert(ctx context.Context, p *PhotographerProfile) (*PhotographerProfile, error) {
	normalizePhotographerProfile(p)
	row := r.pool.QueryRow(ctx, `
		INSERT INTO photographer_profiles (
			profile_id, photographer_id, workspace_id, published_at, status,
			first_name, last_name, professional_title, tagline,
			avatar_url, avatar_cropped_url, avatar_position, avatar_uploaded_at,
			cover_url, cover_position, short_bio, long_bio,
			primary_email, primary_phone, whatsapp_number, secondary_email, contact_preferences,
			primary_city, state, country, service_radius_km, travel_availability, covered_cities,
			years_experience, total_weddings_shot, photography_styles, specializations, languages_spoken, equipment,
			starting_price, price_range_max, custom_quote_available, payment_terms, deposit_required, deposit_amount,
			packages, featured_galleries, testimonials, video_testimonials, average_rating,
			social_instagram, social_facebook, social_linkedin, social_youtube, social_pinterest, custom_links,
			awards, certifications, featured_in, business_name, gst_number, business_address, payment_methods,
			is_public, visibility_config, meta_title, meta_description, meta_keywords, og_image_url, url_slug,
			selected_theme, brand_color, layout_style
		) VALUES (
			$1, $2, $3, $4, $5,
			NULLIF($6, ''), NULLIF($7, ''), NULLIF($8, ''), NULLIF($9, ''),
			NULLIF($10, ''), NULLIF($11, ''), $12::jsonb, $13,
			NULLIF($14, ''), $15::jsonb, NULLIF($16, ''), NULLIF($17, ''),
			NULLIF($18, ''), NULLIF($19, ''), NULLIF($20, ''), NULLIF($21, ''), $22::jsonb,
			NULLIF($23, ''), NULLIF($24, ''), NULLIF($25, ''), $26, NULLIF($27, ''), $28::text[],
			$29, $30, $31::text[], $32::text[], $33::text[], $34::jsonb,
			$35, $36, $37, NULLIF($38, ''), $39, $40,
			$41::jsonb, $42::uuid[], $43::jsonb, $44::text[], $45,
			NULLIF($46, ''), NULLIF($47, ''), NULLIF($48, ''), NULLIF($49, ''), NULLIF($50, ''), $51::jsonb,
			$52::jsonb, $53::jsonb, $54::text[], NULLIF($55, ''), NULLIF($56, ''), NULLIF($57, ''), $58::text[],
			$59, $60::jsonb, NULLIF($61, ''), NULLIF($62, ''), $63::text[], NULLIF($64, ''), NULLIF($65, ''),
			$66, NULLIF($67, ''), $68
		)
		ON CONFLICT (workspace_id, photographer_id) DO UPDATE SET
			updated_at = now(),
			published_at = EXCLUDED.published_at,
			status = EXCLUDED.status,
			first_name = EXCLUDED.first_name,
			last_name = EXCLUDED.last_name,
			professional_title = EXCLUDED.professional_title,
			tagline = EXCLUDED.tagline,
			avatar_url = EXCLUDED.avatar_url,
			avatar_cropped_url = EXCLUDED.avatar_cropped_url,
			avatar_position = EXCLUDED.avatar_position,
			avatar_uploaded_at = EXCLUDED.avatar_uploaded_at,
			cover_url = EXCLUDED.cover_url,
			cover_position = EXCLUDED.cover_position,
			short_bio = EXCLUDED.short_bio,
			long_bio = EXCLUDED.long_bio,
			primary_email = EXCLUDED.primary_email,
			primary_phone = EXCLUDED.primary_phone,
			whatsapp_number = EXCLUDED.whatsapp_number,
			secondary_email = EXCLUDED.secondary_email,
			contact_preferences = EXCLUDED.contact_preferences,
			primary_city = EXCLUDED.primary_city,
			state = EXCLUDED.state,
			country = EXCLUDED.country,
			service_radius_km = EXCLUDED.service_radius_km,
			travel_availability = EXCLUDED.travel_availability,
			covered_cities = EXCLUDED.covered_cities,
			years_experience = EXCLUDED.years_experience,
			total_weddings_shot = EXCLUDED.total_weddings_shot,
			photography_styles = EXCLUDED.photography_styles,
			specializations = EXCLUDED.specializations,
			languages_spoken = EXCLUDED.languages_spoken,
			equipment = EXCLUDED.equipment,
			starting_price = EXCLUDED.starting_price,
			price_range_max = EXCLUDED.price_range_max,
			custom_quote_available = EXCLUDED.custom_quote_available,
			payment_terms = EXCLUDED.payment_terms,
			deposit_required = EXCLUDED.deposit_required,
			deposit_amount = EXCLUDED.deposit_amount,
			packages = EXCLUDED.packages,
			featured_galleries = EXCLUDED.featured_galleries,
			testimonials = EXCLUDED.testimonials,
			video_testimonials = EXCLUDED.video_testimonials,
			average_rating = EXCLUDED.average_rating,
			social_instagram = EXCLUDED.social_instagram,
			social_facebook = EXCLUDED.social_facebook,
			social_linkedin = EXCLUDED.social_linkedin,
			social_youtube = EXCLUDED.social_youtube,
			social_pinterest = EXCLUDED.social_pinterest,
			custom_links = EXCLUDED.custom_links,
			awards = EXCLUDED.awards,
			certifications = EXCLUDED.certifications,
			featured_in = EXCLUDED.featured_in,
			business_name = EXCLUDED.business_name,
			gst_number = EXCLUDED.gst_number,
			business_address = EXCLUDED.business_address,
			payment_methods = EXCLUDED.payment_methods,
			is_public = EXCLUDED.is_public,
			visibility_config = EXCLUDED.visibility_config,
			meta_title = EXCLUDED.meta_title,
			meta_description = EXCLUDED.meta_description,
			meta_keywords = EXCLUDED.meta_keywords,
			og_image_url = EXCLUDED.og_image_url,
			url_slug = EXCLUDED.url_slug,
			selected_theme = EXCLUDED.selected_theme,
			brand_color = EXCLUDED.brand_color,
			layout_style = EXCLUDED.layout_style
		RETURNING profile_id, photographer_id, workspace_id, created_at, updated_at, published_at, status,
	       COALESCE(first_name, ''), COALESCE(last_name, ''), display_name, COALESCE(professional_title, ''), COALESCE(tagline, ''),
	       COALESCE(avatar_url, ''), COALESCE(avatar_cropped_url, ''), avatar_position, avatar_uploaded_at,
	       COALESCE(cover_url, ''), cover_position, COALESCE(short_bio, ''), COALESCE(long_bio, ''),
	       COALESCE(primary_email, ''), COALESCE(primary_phone, ''), COALESCE(whatsapp_number, ''), COALESCE(secondary_email, ''),
	       contact_preferences, COALESCE(primary_city, ''), COALESCE(state, ''), COALESCE(country, ''),
	       service_radius_km, COALESCE(travel_availability, ''), covered_cities,
	       years_experience, total_weddings_shot, photography_styles, specializations, languages_spoken, equipment,
	       starting_price, price_range_max, custom_quote_available, COALESCE(payment_terms, ''), deposit_required, deposit_amount,
	       packages, featured_galleries, testimonials, video_testimonials, average_rating,
	       COALESCE(social_instagram, ''), COALESCE(social_facebook, ''), COALESCE(social_linkedin, ''),
	       COALESCE(social_youtube, ''), COALESCE(social_pinterest, ''), custom_links,
	       awards, certifications, featured_in, COALESCE(business_name, ''), COALESCE(gst_number, ''),
	       COALESCE(business_address, ''), payment_methods, is_public, visibility_config,
	       COALESCE(meta_title, ''), COALESCE(meta_description, ''), meta_keywords, COALESCE(og_image_url, ''),
	       COALESCE(url_slug, ''), selected_theme, COALESCE(brand_color, ''), layout_style,
	       total_profile_views, unique_visitors, last_viewed_at`,
		p.ProfileID, p.PhotographerID, p.WorkspaceID, p.PublishedAt, p.Status,
		p.FirstName, p.LastName, p.ProfessionalTitle, p.Tagline,
		p.AvatarURL, p.AvatarCroppedURL, string(p.AvatarPosition), p.AvatarUploadedAt,
		p.CoverURL, string(p.CoverPosition), p.ShortBio, p.LongBio,
		p.PrimaryEmail, p.PrimaryPhone, p.WhatsappNumber, p.SecondaryEmail, string(p.ContactPreferences),
		p.PrimaryCity, p.State, p.Country, p.ServiceRadiusKM, p.TravelAvailability, p.CoveredCities,
		p.YearsExperience, p.TotalWeddingsShot, p.PhotographyStyles, p.Specializations, p.LanguagesSpoken, string(p.Equipment),
		p.StartingPrice, p.PriceRangeMax, p.CustomQuoteAvailable, p.PaymentTerms, p.DepositRequired, p.DepositAmount,
		string(p.Packages), p.FeaturedGalleries, string(p.Testimonials), p.VideoTestimonials, p.AverageRating,
		p.SocialInstagram, p.SocialFacebook, p.SocialLinkedin, p.SocialYoutube, p.SocialPinterest, string(p.CustomLinks),
		string(p.Awards), string(p.Certifications), p.FeaturedIn, p.BusinessName, p.GSTNumber, p.BusinessAddress, p.PaymentMethods,
		p.IsPublic, string(p.VisibilityConfig), p.MetaTitle, p.MetaDescription, p.MetaKeywords, p.OGImageURL, p.URLSlug,
		p.SelectedTheme, p.BrandColor, p.LayoutStyle,
	)
	profile, err := scanPhotographerProfile(row)
	if err != nil {
		return nil, err
	}
	if err := r.applyWorkspaceBusinessProfile(ctx, profile); err != nil {
		return nil, err
	}
	return profile, nil
}

func (r *PhotographerProfileRepo) RecordView(ctx context.Context, profileID uuid.UUID, visitorHash, source, userAgent string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO photographer_profile_view_events (profile_id, visitor_hash, source, user_agent)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))`,
		profileID, visitorHash, source, userAgent,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE photographer_profiles
		   SET total_profile_views = total_profile_views + 1,
		       unique_visitors = (
		         SELECT COUNT(DISTINCT visitor_hash)::int
		           FROM photographer_profile_view_events
		          WHERE profile_id = $1
		       ),
		       last_viewed_at = now()
		 WHERE profile_id = $1`, profileID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *PhotographerProfileRepo) UpdateCategoryGalleries(ctx context.Context, profileID uuid.UUID, raw json.RawMessage) (*PhotographerProfile, error) {
	if len(raw) == 0 || !json.Valid(raw) {
		return nil, fmt.Errorf("invalid category galleries json")
	}
	tag, err := r.pool.Exec(ctx, `
		UPDATE photographer_profiles
		   SET category_galleries = $2::jsonb,
		       updated_at = now()
		 WHERE profile_id = $1`, profileID, string(raw))
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrPhotographerProfileNotFound
	}
	return r.GetByID(ctx, profileID)
}

func (r *PhotographerProfileRepo) ListFeaturedGalleries(ctx context.Context, workspaceID uuid.UUID, ids []uuid.UUID) ([]ProfileGallery, error) {
	if len(ids) == 0 {
		return []ProfileGallery{}, nil
	}
	rows, err := r.pool.Query(ctx, `
		SELECT g.id, g.title, g.slug, COALESCE(g.description, ''), g.gallery_type, g.is_published, g.status,
		       cover_asset.thumbnail_urls
		  FROM unnest($2::uuid[]) WITH ORDINALITY wanted(id, ord)
		  JOIN galleries g ON g.id = wanted.id
		  LEFT JOIN LATERAL (
		    SELECT a.thumbnail_urls
		      FROM gallery_assets ga
		      JOIN assets a ON a.id = ga.asset_id
		     WHERE ga.gallery_id = g.id
		       AND a.deleted_at IS NULL
		     ORDER BY
		       CASE WHEN g.cover_asset_id IS NOT NULL AND a.id = g.cover_asset_id THEN 0 ELSE 1 END,
		       ga.is_hero DESC,
		       ga.sort_order ASC,
		       ga.added_at ASC
		     LIMIT 1
		  ) cover_asset ON true
		 WHERE g.workspace_id = $1
		   AND g.deleted_at IS NULL
		   AND g.is_published = true
		   AND g.status <> 'archived'
		 ORDER BY wanted.ord`, workspaceID, ids)
	if err != nil {
		return nil, fmt.Errorf("list featured profile galleries: %w", err)
	}
	defer rows.Close()

	var out []ProfileGallery
	for rows.Next() {
		var g ProfileGallery
		var thumbs *map[string]string
		if err := rows.Scan(&g.ID, &g.Title, &g.Slug, &g.Description, &g.GalleryType, &g.IsPublished, &g.Status, &thumbs); err != nil {
			return nil, err
		}
		if thumbs != nil {
			g.CoverThumbnails = *thumbs
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (r *PhotographerProfileRepo) applyWorkspaceBusinessProfile(ctx context.Context, p *PhotographerProfile) error {
	if p == nil || p.WorkspaceID == uuid.Nil {
		return nil
	}
	row := r.pool.QueryRow(ctx, `
		SELECT COALESCE(name, ''), COALESCE(brand_name, ''), COALESCE(gstin, ''),
		       COALESCE(address_line1, ''), COALESCE(address_line2, ''),
		       COALESCE(city, ''), COALESCE(postal_code, ''), COALESCE(invoice_terms, '')
		  FROM workspaces
		 WHERE id = $1`, p.WorkspaceID)
	var name, brandName, gstin, addressLine1, addressLine2, city, postalCode, invoiceTerms string
	if err := row.Scan(&name, &brandName, &gstin, &addressLine1, &addressLine2, &city, &postalCode, &invoiceTerms); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	}
	p.BusinessName = linkedWorkspaceBusinessName(name, brandName, p.BusinessName)
	p.GSTNumber = firstNonBlank(gstin, p.GSTNumber)
	p.BusinessAddress = linkedWorkspaceBusinessAddress(
		p.BusinessAddress,
		addressLine1,
		addressLine2,
		city,
		postalCode,
	)
	p.PaymentTerms = firstNonBlank(invoiceTerms, p.PaymentTerms)
	var minPaisa, maxPaisa int64
	if err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(MIN(base_price_paisa), 0), COALESCE(MAX(base_price_paisa), 0)
		  FROM service_packages
		 WHERE workspace_id = $1
		   AND active = TRUE
		   AND base_price_paisa > 0`, p.WorkspaceID).Scan(&minPaisa, &maxPaisa); err != nil {
		return err
	}
	p.StartingPrice, p.PriceRangeMax = linkedWorkspacePriceRange(
		p.StartingPrice,
		p.PriceRangeMax,
		minPaisa,
		maxPaisa,
	)
	return nil
}

func linkedWorkspaceBusinessName(workspaceName, brandName, fallback string) string {
	return firstNonBlank(brandName, workspaceName, fallback)
}

func linkedWorkspaceBusinessAddress(fallback string, parts ...string) string {
	addressParts := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			addressParts = append(addressParts, trimmed)
		}
	}
	if len(addressParts) == 0 {
		return strings.TrimSpace(fallback)
	}
	return strings.Join(addressParts, "\n")
}

func linkedWorkspacePriceRange(fallbackStart, fallbackMax *int, minPaisa, maxPaisa int64) (*int, *int) {
	if minPaisa <= 0 {
		return fallbackStart, fallbackMax
	}
	startingPrice := int(minPaisa / 100)
	if maxPaisa > minPaisa {
		maxPrice := int(maxPaisa / 100)
		return &startingPrice, &maxPrice
	}
	return &startingPrice, nil
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

type profileScanner interface {
	Scan(dest ...any) error
}

func scanPhotographerProfile(row profileScanner) (*PhotographerProfile, error) {
	var p PhotographerProfile
	err := row.Scan(
		&p.ProfileID, &p.PhotographerID, &p.WorkspaceID, &p.CreatedAt, &p.UpdatedAt, &p.PublishedAt, &p.Status,
		&p.FirstName, &p.LastName, &p.DisplayName, &p.ProfessionalTitle, &p.Tagline,
		&p.AvatarURL, &p.AvatarCroppedURL, &p.AvatarPosition, &p.AvatarUploadedAt,
		&p.CoverURL, &p.CoverPosition, &p.ShortBio, &p.LongBio,
		&p.PrimaryEmail, &p.PrimaryPhone, &p.WhatsappNumber, &p.SecondaryEmail,
		&p.ContactPreferences, &p.PrimaryCity, &p.State, &p.Country,
		&p.ServiceRadiusKM, &p.TravelAvailability, &p.CoveredCities,
		&p.YearsExperience, &p.TotalWeddingsShot, &p.PhotographyStyles, &p.Specializations, &p.LanguagesSpoken, &p.Equipment,
		&p.StartingPrice, &p.PriceRangeMax, &p.CustomQuoteAvailable, &p.PaymentTerms, &p.DepositRequired, &p.DepositAmount,
		&p.Packages, &p.FeaturedGalleries, &p.Testimonials, &p.VideoTestimonials, &p.AverageRating,
		&p.SocialInstagram, &p.SocialFacebook, &p.SocialLinkedin, &p.SocialYoutube, &p.SocialPinterest, &p.CustomLinks,
		&p.Awards, &p.Certifications, &p.FeaturedIn, &p.BusinessName, &p.GSTNumber, &p.BusinessAddress,
		&p.PaymentMethods, &p.IsPublic, &p.VisibilityConfig,
		&p.MetaTitle, &p.MetaDescription, &p.MetaKeywords, &p.OGImageURL, &p.URLSlug,
		&p.SelectedTheme, &p.BrandColor, &p.LayoutStyle,
		&p.TotalProfileViews, &p.UniqueVisitors, &p.LastViewedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPhotographerProfileNotFound
		}
		return nil, err
	}
	normalizePhotographerProfile(&p)
	return &p, nil
}

func normalizePhotographerProfile(p *PhotographerProfile) {
	if p.ProfileID == uuid.Nil {
		p.ProfileID = uuid.New()
	}
	if p.Status == "" {
		p.Status = "draft"
	}
	p.AvatarPosition = jsonWithDefault(p.AvatarPosition, `{"x":0,"y":0,"zoom":1,"aspect":1}`)
	p.CoverPosition = jsonWithDefault(p.CoverPosition, `{"x":0,"y":0,"zoom":1}`)
	p.ContactPreferences = jsonWithDefault(p.ContactPreferences, `{}`)
	p.Equipment = jsonWithDefault(p.Equipment, `{}`)
	p.Packages = jsonWithDefault(p.Packages, `[]`)
	p.Testimonials = jsonWithDefault(p.Testimonials, `[]`)
	p.CustomLinks = jsonWithDefault(p.CustomLinks, `[]`)
	p.Awards = jsonWithDefault(p.Awards, `[]`)
	p.Certifications = jsonWithDefault(p.Certifications, `[]`)
	p.VisibilityConfig = jsonWithDefault(p.VisibilityConfig, `{"show_profile_photo":true,"show_name":true,"show_tagline":true,"show_location":true,"show_bio":true,"show_galleries":true,"show_reviews":true,"show_pricing":false,"show_email":true,"show_phone":false,"show_whatsapp":true,"show_socials":true,"show_awards":true,"show_services":true,"show_equipment":false,"show_custom_links":true}`)
	if p.Country == "" {
		p.Country = "India"
	}
	if p.SelectedTheme == "" {
		p.SelectedTheme = "minimal"
	}
	if p.BrandColor == "" {
		p.BrandColor = "#10576a"
	}
	if p.LayoutStyle == "" {
		p.LayoutStyle = "grid"
	}
	if p.CoveredCities == nil {
		p.CoveredCities = []string{}
	}
	if p.PhotographyStyles == nil {
		p.PhotographyStyles = []string{}
	}
	if p.Specializations == nil {
		p.Specializations = []string{}
	}
	if p.LanguagesSpoken == nil {
		p.LanguagesSpoken = []string{}
	}
	if p.FeaturedGalleries == nil {
		p.FeaturedGalleries = []uuid.UUID{}
	}
	if p.VideoTestimonials == nil {
		p.VideoTestimonials = []string{}
	}
	if p.FeaturedIn == nil {
		p.FeaturedIn = []string{}
	}
	if p.PaymentMethods == nil {
		p.PaymentMethods = []string{}
	}
	if p.MetaKeywords == nil {
		p.MetaKeywords = []string{}
	}
}

func jsonWithDefault(raw json.RawMessage, fallback string) json.RawMessage {
	if len(raw) == 0 || !json.Valid(raw) {
		return json.RawMessage(fallback)
	}
	return raw
}
