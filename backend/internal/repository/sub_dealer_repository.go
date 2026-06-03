package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SubDealer struct {
	ID           uuid.UUID `json:"id"`
	DealerID     uuid.UUID `json:"dealer_id"`
	StateID      int       `json:"state_id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Phone        string    `json:"phone"`
	CityDistrict string    `json:"city_district"`
	Status       string    `json:"status"`
	Notes        string    `json:"notes"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateSubDealerInput struct {
	DealerID     uuid.UUID
	StateID      int
	Name         string
	Email        string
	Phone        string
	CityDistrict string
	Notes        string
}

type SubDealerRepo struct {
	DB *pgxpool.Pool
}

func NewSubDealerRepo(db *pgxpool.Pool) *SubDealerRepo {
	return &SubDealerRepo{DB: db}
}

func (r *SubDealerRepo) ListByDealerID(ctx context.Context, dealerID uuid.UUID) ([]SubDealer, error) {
	rows, err := r.DB.Query(ctx, `
		SELECT id, dealer_id, state_id,
		       COALESCE(name, '') AS name,
		       COALESCE(email, '') AS email,
		       COALESCE(phone, '') AS phone,
		       city_district,
		       status,
		       COALESCE(notes, '') AS notes,
		       created_at, updated_at
		FROM sub_dealers
		WHERE dealer_id = $1
		ORDER BY city_district, name
	`, dealerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []SubDealer
	for rows.Next() {
		var sd SubDealer
		if err := rows.Scan(
			&sd.ID, &sd.DealerID, &sd.StateID,
			&sd.Name, &sd.Email, &sd.Phone,
			&sd.CityDistrict, &sd.Status, &sd.Notes,
			&sd.CreatedAt, &sd.UpdatedAt,
		); err != nil {
			return nil, err
		}
		result = append(result, sd)
	}
	return result, rows.Err()
}

func (r *SubDealerRepo) Create(ctx context.Context, in CreateSubDealerInput) (*SubDealer, error) {
	var sd SubDealer
	err := r.DB.QueryRow(ctx, `
		INSERT INTO sub_dealers (dealer_id, state_id, name, email, phone, city_district, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, dealer_id, state_id,
		          COALESCE(name, '') AS name,
		          COALESCE(email, '') AS email,
		          COALESCE(phone, '') AS phone,
		          city_district, status,
		          COALESCE(notes, '') AS notes,
		          created_at, updated_at
	`,
		in.DealerID, in.StateID, in.Name, in.Email, in.Phone, in.CityDistrict, in.Notes,
	).Scan(
		&sd.ID, &sd.DealerID, &sd.StateID,
		&sd.Name, &sd.Email, &sd.Phone,
		&sd.CityDistrict, &sd.Status, &sd.Notes,
		&sd.CreatedAt, &sd.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &sd, nil
}
