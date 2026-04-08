package ai

import (
	"context"
	"log"

	"github.com/google/uuid"
)

// SpendService handles spend cap enforcement and alert dispatch.
type SpendService struct {
	spendRepo  *SpendRepo
	configRepo *ConfigRepo
}

// NewSpendService creates a SpendService.
func NewSpendService(spendRepo *SpendRepo, configRepo *ConfigRepo) *SpendService {
	return &SpendService{spendRepo: spendRepo, configRepo: configRepo}
}

// CapEnforcementResult is the outcome of a pre-call spend check.
type CapEnforcementResult struct {
	Allowed        bool    `json:"allowed"`
	RemainingPaisa int64   `json:"remaining_paisa"` // -1 if no cap
	CapUsedPercent float64 `json:"cap_used_percent"`
	ShouldAlert80  bool    `json:"-"`
	ShouldAlert100 bool    `json:"-"`
}

// CheckAndEnforce evaluates whether an AI operation costing estimatedPaisa can proceed.
// Fail-open: if the DB is unreachable, returns Allowed=true with a warning log.
func (s *SpendService) CheckAndEnforce(ctx context.Context, workspaceID uuid.UUID, estimatedPaisa int64) (*CapEnforcementResult, error) {
	cfg, err := s.configRepo.GetByWorkspace(ctx, workspaceID)
	if err != nil {
		log.Printf("spend service: get config failed (fail-open): %v", err)
		return &CapEnforcementResult{Allowed: true, RemainingPaisa: -1}, nil
	}
	if cfg == nil || cfg.MonthlyCapPaisa <= 0 {
		return &CapEnforcementResult{Allowed: true, RemainingPaisa: -1}, nil
	}

	summary, err := s.spendRepo.GetMonthlySummary(ctx, workspaceID, timeNow())
	if err != nil {
		log.Printf("spend service: get summary failed (fail-open): %v", err)
		return &CapEnforcementResult{Allowed: true, RemainingPaisa: -1}, nil
	}

	projectedTotal := summary.TotalPaisa + estimatedPaisa
	remaining := cfg.MonthlyCapPaisa - projectedTotal
	if remaining < 0 {
		remaining = 0
	}
	capUsed := float64(projectedTotal) * 100 / float64(cfg.MonthlyCapPaisa)

	result := &CapEnforcementResult{
		Allowed:        projectedTotal <= cfg.MonthlyCapPaisa,
		RemainingPaisa: remaining,
		CapUsedPercent: capUsed,
		ShouldAlert80:  capUsed >= 80 && !cfg.Alert80Sent,
		ShouldAlert100: capUsed >= 100 && !cfg.Alert100Sent,
	}

	return result, nil
}

// RecordUsageWithCapCheck logs usage and fires alert side-effects if thresholds crossed.
// This is the single call point every AI feature should use after a successful Gemini response.
func (s *SpendService) RecordUsageWithCapCheck(ctx context.Context, entry *AIUsageLog) error {
	// Log usage (non-fatal on failure — the AI call already succeeded)
	if err := s.spendRepo.LogUsage(ctx, entry); err != nil {
		log.Printf("spend service: log usage failed (non-fatal): %v", err)
		return nil
	}

	// Check thresholds for alerts
	cfg, err := s.configRepo.GetByWorkspace(ctx, entry.WorkspaceID)
	if err != nil || cfg == nil || cfg.MonthlyCapPaisa <= 0 {
		return nil
	}

	summary, err := s.spendRepo.GetMonthlySummary(ctx, entry.WorkspaceID, timeNow())
	if err != nil {
		return nil
	}

	pct := float64(summary.TotalPaisa) * 100 / float64(cfg.MonthlyCapPaisa)

	if pct >= 80 && !cfg.Alert80Sent {
		if err := s.configRepo.MarkAlert80Sent(ctx, entry.WorkspaceID); err != nil {
			log.Printf("spend service: mark alert 80 failed: %v", err)
		} else {
			log.Printf("spend service: workspace %s reached 80%% of AI spend cap", entry.WorkspaceID)
		}
	}

	if pct >= 100 && !cfg.Alert100Sent {
		if err := s.configRepo.MarkAlert100Sent(ctx, entry.WorkspaceID); err != nil {
			log.Printf("spend service: mark alert 100 failed: %v", err)
		} else {
			log.Printf("spend service: workspace %s reached 100%% of AI spend cap", entry.WorkspaceID)
		}
	}

	return nil
}

// GetSpendSummary returns current + previous month for comparison.
func (s *SpendService) GetSpendSummary(ctx context.Context, workspaceID uuid.UUID) (*SpendSummary, *SpendSummary, error) {
	now := timeNow()
	current, err := s.spendRepo.GetMonthlySummary(ctx, workspaceID, now)
	if err != nil {
		return nil, nil, err
	}
	prevMonth := now.AddDate(0, -1, 0)
	previous, err := s.spendRepo.GetMonthlySummary(ctx, workspaceID, prevMonth)
	if err != nil {
		return current, nil, nil // previous month failure is non-fatal
	}
	return current, previous, nil
}
