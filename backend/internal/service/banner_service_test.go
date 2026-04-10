package service

// banner_service_test.go — pure-logic tests for banner input validation.
// Repo-backed CRUD paths are covered by integration tests.

import (
	"errors"
	"testing"
	"time"
)

func TestValidateBannerInput_RejectsEmptyTitle(t *testing.T) {
	in := BannerInput{Title: "  "}
	if err := validateBannerInput(in); !errors.Is(err, ErrBannerTitleRequired) {
		t.Errorf("want ErrBannerTitleRequired, got %v", err)
	}
}

func TestValidateBannerInput_AcceptsTitleOnly(t *testing.T) {
	in := BannerInput{Title: "Summer Sale"}
	if err := validateBannerInput(in); err != nil {
		t.Errorf("valid banner should pass, got %v", err)
	}
}

func TestValidateBannerInput_RejectsInvertedWindow(t *testing.T) {
	now := time.Now()
	later := now.Add(time.Hour)
	in := BannerInput{
		Title:       "Inverted",
		ActiveFrom:  &later,
		ActiveUntil: &now,
	}
	if err := validateBannerInput(in); !errors.Is(err, ErrBannerInvalidWindow) {
		t.Errorf("want ErrBannerInvalidWindow, got %v", err)
	}
}

func TestValidateBannerInput_RejectsEqualWindow(t *testing.T) {
	t0 := time.Now()
	in := BannerInput{
		Title:       "Same",
		ActiveFrom:  &t0,
		ActiveUntil: &t0,
	}
	if err := validateBannerInput(in); !errors.Is(err, ErrBannerInvalidWindow) {
		t.Errorf("active_until == active_from should fail, got %v", err)
	}
}

func TestValidateBannerInput_AcceptsOnlyFrom(t *testing.T) {
	now := time.Now()
	in := BannerInput{Title: "From", ActiveFrom: &now}
	if err := validateBannerInput(in); err != nil {
		t.Errorf("only active_from should be valid, got %v", err)
	}
}

func TestValidateBannerInput_AcceptsOnlyUntil(t *testing.T) {
	later := time.Now().Add(time.Hour)
	in := BannerInput{Title: "Until", ActiveUntil: &later}
	if err := validateBannerInput(in); err != nil {
		t.Errorf("only active_until should be valid, got %v", err)
	}
}

func TestValidateBannerInput_AcceptsValidWindow(t *testing.T) {
	now := time.Now()
	later := now.Add(24 * time.Hour)
	in := BannerInput{
		Title:       "Valid",
		ActiveFrom:  &now,
		ActiveUntil: &later,
	}
	if err := validateBannerInput(in); err != nil {
		t.Errorf("valid 24h window should pass, got %v", err)
	}
}
