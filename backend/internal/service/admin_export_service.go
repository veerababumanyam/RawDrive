package service

import (
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/rawdrive/backend/internal/repository"
)

type adminRevenueExportRepo interface {
	GetTimeSeries(ctx context.Context, from, to time.Time, granularity string) ([]repository.RevenueTimeSeries, error)
}

type AdminExportService struct {
	userRepo    *repository.AdminUserRepo
	revenueRepo adminRevenueExportRepo
	pdf         *PDFService
}

func NewAdminExportService(userRepo *repository.AdminUserRepo, revenueRepo *repository.AdminRevenueRepo) *AdminExportService {
	var revenueExportRepo adminRevenueExportRepo
	if revenueRepo != nil {
		revenueExportRepo = revenueRepo
	}
	return &AdminExportService{userRepo: userRepo, revenueRepo: revenueExportRepo, pdf: NewPDFService()}
}

func (s *AdminExportService) WithRevenueRepoForTest(repo adminRevenueExportRepo) *AdminExportService {
	s.revenueRepo = repo
	return s
}

func (s *AdminExportService) WithPDFService(pdf *PDFService) *AdminExportService {
	if pdf != nil {
		s.pdf = pdf
	}
	return s
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
	if s == nil || s.revenueRepo == nil {
		return fmt.Errorf("revenue export repo unavailable")
	}
	series, err := s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
	if err != nil {
		return fmt.Errorf("fetching revenue series: %w", err)
	}
	w := csv.NewWriter(writer)
	defer w.Flush()
	if err := w.Write([]string{"Period", "Revenue", "Subscriptions", "Churn"}); err != nil {
		return err
	}
	for _, t := range series {
		if err := w.Write([]string{t.Period, fmt.Sprintf("%d", t.Revenue), fmt.Sprintf("%d", t.Subscribers), fmt.Sprintf("%d", t.Churn)}); err != nil {
			return err
		}
	}
	return nil
}

func (s *AdminExportService) ExportRevenuePDF(ctx context.Context, from, to time.Time, granularity string) ([]byte, error) {
	if s == nil || s.revenueRepo == nil {
		return nil, fmt.Errorf("revenue export repo unavailable")
	}
	series, err := s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
	if err != nil {
		return nil, fmt.Errorf("fetching revenue series: %w", err)
	}
	renderer := s.pdf
	if renderer == nil {
		renderer = NewPDFService()
	}
	return renderer.RenderText(buildRevenueExportText(from, to, granularity, series))
}

func buildRevenueExportText(from, to time.Time, granularity string, series []repository.RevenueTimeSeries) string {
	var b strings.Builder
	fmt.Fprintf(&b, "RawDrive Revenue Export\n")
	fmt.Fprintf(&b, "Generated: %s\n", time.Now().UTC().Format(time.RFC3339))
	fmt.Fprintf(&b, "From: %s\n", from.UTC().Format(time.RFC3339))
	fmt.Fprintf(&b, "To: %s\n", to.UTC().Format(time.RFC3339))
	fmt.Fprintf(&b, "Granularity: %s\n\n", granularity)
	fmt.Fprintf(&b, "Period | Revenue | Subscriptions | Churn\n")
	fmt.Fprintf(&b, "----------------------------------------\n")
	if len(series) == 0 {
		fmt.Fprintf(&b, "No revenue records found for this range.\n")
		return b.String()
	}
	for _, row := range series {
		fmt.Fprintf(&b, "%s | %s | %d | %d\n",
			row.Period,
			formatReportINR(row.Revenue),
			row.Subscribers,
			row.Churn,
		)
	}
	return b.String()
}
