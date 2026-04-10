package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

type AdminExportService struct {
	userRepo    *repository.AdminUserRepo
	revenueRepo *repository.AdminRevenueRepo
}

func NewAdminExportService(userRepo *repository.AdminUserRepo, revenueRepo *repository.AdminRevenueRepo) *AdminExportService {
	return &AdminExportService{userRepo: userRepo, revenueRepo: revenueRepo}
}

func (s *AdminExportService) ExportUsersCSV(ctx context.Context, filter repository.AdminUserFilter, writer io.Writer) error {
	result, err := s.userRepo.List(ctx, filter)
	if err != nil {
		return fmt.Errorf("listing users for export: %w", err)
	}
	w := csv.NewWriter(writer)
	defer w.Flush()
	if err := w.Write([]string{"ID", "Email", "FullName", "PlatformRole", "Status", "CreatedAt"}); err != nil {
		return err
	}
	for _, u := range result.Items {
		if err := w.Write([]string{u.ID.String(), u.Email, u.FullName, u.PlatformRole, u.Status, u.CreatedAt.Format(time.RFC3339)}); err != nil {
			return err
		}
	}
	return nil
}

func (s *AdminExportService) ExportRevenueCSV(ctx context.Context, from, to time.Time, granularity string, writer io.Writer) error {
	series, err := s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
	if err != nil {
		return fmt.Errorf("fetching revenue series: %w", err)
	}
	w := csv.NewWriter(writer)
	defer w.Flush()
	if err := w.Write([]string{"Date", "Revenue", "Subscriptions", "Churn"}); err != nil {
		return err
	}
	for _, t := range series {
		if err := w.Write([]string{t.Date.Format("2006-01-02"), fmt.Sprintf("%d", t.Revenue), fmt.Sprintf("%d", t.Subscriptions), fmt.Sprintf("%d", t.Churn)}); err != nil {
			return err
		}
	}
	return nil
}
