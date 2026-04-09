package ai

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type BurstService struct {
	pool   *pgxpool.Pool
	logger *slog.Logger
}

func NewBurstService(pool *pgxpool.Pool) *BurstService {
	return &BurstService{pool: pool, logger: slog.Default().With("component", "burst-service")}
}

type burstCandidate struct {
	AssetID     uuid.UUID
	CaptureDate time.Time
	CameraModel string
}

func (s *BurstService) GroupByTimeSimilarity(ctx context.Context, galleryID uuid.UUID, timeWindowSec int) (int, error) {
	if timeWindowSec <= 0 {
		timeWindowSec = 3
	}
	window := time.Duration(timeWindowSec) * time.Second

	rows, err := s.pool.Query(ctx,
		`SELECT a.id, a.capture_date, COALESCE(a.exif_data->>'model', '')
		 FROM gallery_assets ga JOIN assets a ON a.id = ga.asset_id
		 WHERE ga.gallery_id = $1 AND a.deleted_at IS NULL AND a.capture_date IS NOT NULL AND a.content_type LIKE 'image/%'
		 ORDER BY a.capture_date ASC`, galleryID)
	if err != nil {
		return 0, fmt.Errorf("burst service: query assets: %w", err)
	}
	defer rows.Close()

	var candidates []burstCandidate
	for rows.Next() {
		var c burstCandidate
		if err := rows.Scan(&c.AssetID, &c.CaptureDate, &c.CameraModel); err != nil {
			return 0, fmt.Errorf("burst service: scan: %w", err)
		}
		candidates = append(candidates, c)
	}
	if len(candidates) < 2 {
		return 0, nil
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].CaptureDate.Before(candidates[j].CaptureDate)
	})

	var groups [][]burstCandidate
	current := []burstCandidate{candidates[0]}
	for i := 1; i < len(candidates); i++ {
		prev := candidates[i-1]
		curr := candidates[i]
		gap := curr.CaptureDate.Sub(prev.CaptureDate)
		sameCamera := curr.CameraModel == prev.CameraModel || curr.CameraModel == "" || prev.CameraModel == ""
		if gap <= window && sameCamera {
			current = append(current, curr)
		} else {
			if len(current) >= 2 {
				groups = append(groups, current)
			}
			current = []burstCandidate{curr}
		}
	}
	if len(current) >= 2 {
		groups = append(groups, current)
	}

	groupsCreated := 0
	for _, group := range groups {
		groupID := uuid.New()
		name := fmt.Sprintf("Burst %s (%d shots)", group[0].CaptureDate.Format("15:04:05"), len(group))
		_, err := s.pool.Exec(ctx,
			`INSERT INTO burst_groups (id, gallery_id, name, asset_count, created_at) VALUES ($1, $2, $3, $4, now()) ON CONFLICT DO NOTHING`,
			groupID, galleryID, name, len(group))
		if err != nil {
			s.logger.Error("failed to create burst group", "error", err)
			continue
		}
		for _, c := range group {
			s.pool.Exec(ctx, `UPDATE assets SET burst_group_id = $1 WHERE id = $2`, groupID, c.AssetID)
		}
		groupsCreated++
	}
	return groupsCreated, nil
}
