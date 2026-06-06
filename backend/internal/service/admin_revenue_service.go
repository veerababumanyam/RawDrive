package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/rawdrive/backend/internal/repository"
)

type RevenueDashboard struct {
	MRRPaisa         int64                     `json:"mrr_paisa"`
	ARRPaisa         int64                     `json:"arr_paisa"`
	ChurnRate        float64                   `json:"churn_rate"`
	LTVPaisa         int64                     `json:"ltv_paisa"`
	ARPUPaisa        int64                     `json:"arpu_paisa"`
	TotalSubscribers int64                     `json:"total_subscribers"`
	StateBreakdown   []repository.StateRevenue `json:"state_breakdown"`
}

type AdminRevenueService struct {
	revenueRepo *repository.AdminRevenueRepo
	pdf         *PDFService
	reportEmail RevenueReportEmailSender
}

func NewAdminRevenueService(revenueRepo *repository.AdminRevenueRepo) *AdminRevenueService {
	return &AdminRevenueService{revenueRepo: revenueRepo, pdf: NewPDFService()}
}

// RevenueReportEmailSender is satisfied by *email.NotificationSender without
// importing the email package into the service layer.
type RevenueReportEmailSender interface {
	Send(ctx context.Context, to, subject, body, actionURL string) error
}

type RevenueReportAttachmentEmailSender interface {
	SendWithAttachment(ctx context.Context, to, subject, body, actionURL, attachmentName, attachmentContentType string, attachment []byte) error
}

var (
	ErrRevenueStateNotFound       = errors.New("revenue state not found")
	ErrRevenueReportEmailDisabled = errors.New("revenue report email disabled")
	ErrRevenueReportDealerMissing = errors.New("revenue report dealer missing")
	ErrRevenueReportDealerNoEmail = errors.New("revenue report dealer email missing")
)

type AdminRevenueReportDealer struct {
	DealerID          uuid.UUID `json:"dealer_id"`
	BusinessName      string    `json:"business_name"`
	Email             string    `json:"email"`
	CommissionRatePct float64   `json:"commission_rate_pct"`
}

type AdminRevenueRecord struct {
	StateID          int    `json:"state_id"`
	StateName        string `json:"state_name"`
	District         string `json:"district"`
	RevenuePaisa     int64  `json:"revenue_paisa"`
	SubscriberCount  int64  `json:"subscriber_count"`
	DealerSharePaisa int64  `json:"dealer_share_paisa"`
}

type AdminRevenueRecordsResponse struct {
	StateID                  int                       `json:"state_id"`
	StateName                string                    `json:"state_name"`
	District                 string                    `json:"district,omitempty"`
	GeneratedAt              time.Time                 `json:"generated_at"`
	DefaultCommissionRatePct float64                   `json:"default_commission_rate_pct"`
	TotalRevenuePaisa        int64                     `json:"total_revenue_paisa"`
	TotalSubscribers         int64                     `json:"total_subscribers"`
	TotalDealerSharePaisa    int64                     `json:"total_dealer_share_paisa"`
	Dealer                   *AdminRevenueReportDealer `json:"dealer,omitempty"`
	Records                  []AdminRevenueRecord      `json:"records"`
}

type AdminRevenueReportEmailResponse struct {
	SentTo       string `json:"sent_to"`
	DealerID     string `json:"dealer_id"`
	BusinessName string `json:"business_name"`
}

func (s *AdminRevenueService) WithPDFService(pdf *PDFService) *AdminRevenueService {
	if pdf != nil {
		s.pdf = pdf
	}
	return s
}

func (s *AdminRevenueService) WithReportEmailSender(sender RevenueReportEmailSender) *AdminRevenueService {
	s.reportEmail = sender
	return s
}

func (s *AdminRevenueService) GetDashboard(ctx context.Context, from, to time.Time, stateID *uuid.UUID) (*RevenueDashboard, error) {
	metrics, err := s.revenueRepo.GetMetrics(ctx, from, to, stateID)
	if err != nil {
		return nil, fmt.Errorf("fetching revenue metrics: %w", err)
	}
	// The admin revenue page renders MRR/ARR, Subscribers, and a
	// state-breakdown table in one go. Previously the dashboard only
	// returned the metrics row and the page had to either call two more
	// endpoints or render "undefined" — which is exactly what it did
	// until the 2026-04-12 UAT caught it. Aggregating the state bucket
	// and a subscriber count here turns one /admin/revenue call into a
	// complete payload.
	state, err := s.revenueRepo.GetByState(ctx, from, to)
	if err != nil {
		return nil, fmt.Errorf("fetching state breakdown: %w", err)
	}
	// Preserve the old empty-but-non-nil contract: the frontend defaults
	// state_breakdown to [] and will happily iterate, but nil would be
	// encoded as JSON null and produce a .map() crash on the client.
	if state == nil {
		state = []repository.StateRevenue{}
	}
	return &RevenueDashboard{
		MRRPaisa:         metrics.MRR,
		ARRPaisa:         metrics.ARR,
		ChurnRate:        metrics.ChurnRate,
		LTVPaisa:         metrics.LTV,
		ARPUPaisa:        metrics.ARPU,
		TotalSubscribers: metrics.TotalSubscribers,
		StateBreakdown:   state,
	}, nil
}

func (s *AdminRevenueService) GetTimeSeries(ctx context.Context, from, to time.Time, granularity string) ([]repository.RevenueTimeSeries, error) {
	return s.revenueRepo.GetTimeSeries(ctx, from, to, granularity)
}

func (s *AdminRevenueService) GetStateBreakdown(ctx context.Context, from, to time.Time) ([]repository.StateRevenue, error) {
	return s.revenueRepo.GetByState(ctx, from, to)
}

func (s *AdminRevenueService) GetRevenueRecords(ctx context.Context, stateID int, district string) (*AdminRevenueRecordsResponse, error) {
	if s == nil || s.revenueRepo == nil {
		return nil, errors.New("admin revenue service unavailable")
	}
	district = strings.TrimSpace(district)

	stateName, err := s.revenueRepo.GetStateName(ctx, stateID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrRevenueStateNotFound
		}
		return nil, err
	}

	var dealer *AdminRevenueReportDealer
	commissionRatePct := DefaultDealerReportCommissionRatePct
	if repoDealer, err := s.revenueRepo.GetApprovedDealerForState(ctx, stateID, DefaultDealerReportCommissionRatePct); err != nil {
		if !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
	} else if repoDealer != nil {
		commissionRatePct = repoDealer.CommissionRatePct
		dealer = &AdminRevenueReportDealer{
			DealerID:          repoDealer.DealerID,
			BusinessName:      repoDealer.BusinessName,
			Email:             repoDealer.Email,
			CommissionRatePct: repoDealer.CommissionRatePct,
		}
	}

	rows, err := s.revenueRepo.GetRecordsByStateDistrict(ctx, stateID, district)
	if err != nil {
		return nil, err
	}

	records := make([]AdminRevenueRecord, 0, len(rows))
	var totalRevenue, totalShare, totalSubscribers int64
	for _, row := range rows {
		share := calculateRevenueSharePaisa(row.Revenue, commissionRatePct)
		records = append(records, AdminRevenueRecord{
			StateID:          row.StateID,
			StateName:        row.StateName,
			District:         row.District,
			RevenuePaisa:     row.Revenue,
			SubscriberCount:  row.SubscriberCount,
			DealerSharePaisa: share,
		})
		totalRevenue += row.Revenue
		totalShare += share
		totalSubscribers += row.SubscriberCount
	}

	return &AdminRevenueRecordsResponse{
		StateID:                  stateID,
		StateName:                stateName,
		District:                 district,
		GeneratedAt:              time.Now().UTC(),
		DefaultCommissionRatePct: DefaultDealerReportCommissionRatePct,
		TotalRevenuePaisa:        totalRevenue,
		TotalSubscribers:         totalSubscribers,
		TotalDealerSharePaisa:    totalShare,
		Dealer:                   dealer,
		Records:                  records,
	}, nil
}

func (s *AdminRevenueService) RenderRevenueRecordsPDF(ctx context.Context, stateID int, district string) ([]byte, *AdminRevenueRecordsResponse, error) {
	report, err := s.GetRevenueRecords(ctx, stateID, district)
	if err != nil {
		return nil, nil, err
	}
	renderer := s.pdf
	if renderer == nil {
		renderer = NewPDFService()
	}
	body := buildRevenueReportText(report)
	pdf, err := renderer.RenderText(body)
	if err != nil {
		return nil, nil, err
	}
	return pdf, report, nil
}

func (s *AdminRevenueService) EmailRevenueRecordsToDealer(ctx context.Context, stateID int, district string) (*AdminRevenueReportEmailResponse, error) {
	if s.reportEmail == nil {
		return nil, ErrRevenueReportEmailDisabled
	}
	report, err := s.GetRevenueRecords(ctx, stateID, district)
	if err != nil {
		return nil, err
	}
	if report.Dealer == nil {
		return nil, ErrRevenueReportDealerMissing
	}
	if strings.TrimSpace(report.Dealer.Email) == "" {
		return nil, ErrRevenueReportDealerNoEmail
	}

	scope := report.StateName
	if report.District != "" {
		scope += " / " + report.District
	}
	subject := "RawDrive revenue report - " + scope
	body := buildRevenueReportText(report)
	if sender, ok := s.reportEmail.(RevenueReportAttachmentEmailSender); ok {
		renderer := s.pdf
		if renderer == nil {
			renderer = NewPDFService()
		}
		pdf, err := renderer.RenderText(body)
		if err != nil {
			return nil, err
		}
		if err := sender.SendWithAttachment(
			ctx,
			report.Dealer.Email,
			subject,
			body,
			"",
			revenueReportPDFName(report),
			"application/pdf",
			pdf,
		); err != nil {
			return nil, err
		}
	} else {
		if err := s.reportEmail.Send(ctx, report.Dealer.Email, subject, body, ""); err != nil {
			return nil, err
		}
	}
	return &AdminRevenueReportEmailResponse{
		SentTo:       report.Dealer.Email,
		DealerID:     report.Dealer.DealerID.String(),
		BusinessName: report.Dealer.BusinessName,
	}, nil
}

func calculateRevenueSharePaisa(revenuePaisa int64, commissionRatePct float64) int64 {
	if revenuePaisa <= 0 || commissionRatePct <= 0 {
		return 0
	}
	return int64(math.Round(float64(revenuePaisa) * commissionRatePct / 100))
}

func buildRevenueReportText(report *AdminRevenueRecordsResponse) string {
	var b strings.Builder
	scope := report.StateName
	if report.District != "" {
		scope += " / " + report.District
	}
	fmt.Fprintf(&b, "RawDrive Revenue Report\n")
	fmt.Fprintf(&b, "Scope: %s\n", scope)
	fmt.Fprintf(&b, "Generated: %s\n\n", report.GeneratedAt.Format(time.RFC3339))
	fmt.Fprintf(&b, "Total revenue: %s\n", formatReportINR(report.TotalRevenuePaisa))
	fmt.Fprintf(&b, "Subscribers: %d\n", report.TotalSubscribers)
	if report.Dealer != nil {
		fmt.Fprintf(&b, "Dealer: %s\n", report.Dealer.BusinessName)
		fmt.Fprintf(&b, "Dealer email: %s\n", report.Dealer.Email)
		fmt.Fprintf(&b, "Commission rate: %.2f%%\n", report.Dealer.CommissionRatePct)
	} else {
		fmt.Fprintf(&b, "Dealer: Not assigned\n")
		fmt.Fprintf(&b, "Commission rate: %.2f%% default\n", report.DefaultCommissionRatePct)
	}
	fmt.Fprintf(&b, "Projected dealer share: %s\n\n", formatReportINR(report.TotalDealerSharePaisa))
	fmt.Fprintf(&b, "District records\n")
	fmt.Fprintf(&b, "District | Revenue | Subscribers | Dealer share\n")
	fmt.Fprintf(&b, "------------------------------------------------\n")
	if len(report.Records) == 0 {
		fmt.Fprintf(&b, "No revenue records found for this filter.\n")
		return b.String()
	}
	for _, row := range report.Records {
		fmt.Fprintf(&b, "%s | %s | %d | %s\n",
			row.District,
			formatReportINR(row.RevenuePaisa),
			row.SubscriberCount,
			formatReportINR(row.DealerSharePaisa),
		)
	}
	return b.String()
}

func formatReportINR(paisa int64) string {
	rupees := float64(paisa) / 100
	return fmt.Sprintf("INR %.2f", rupees)
}

func revenueReportPDFName(report *AdminRevenueRecordsResponse) string {
	name := "revenue-report-" + revenueReportFilenamePart(report.StateName)
	if report.District != "" {
		name += "-" + revenueReportFilenamePart(report.District)
	}
	return name + ".pdf"
}

func revenueReportFilenamePart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
			lastDash = false
		case r >= '0' && r <= '9':
			b.WriteRune(r)
			lastDash = false
		case !lastDash:
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "report"
	}
	return out
}
