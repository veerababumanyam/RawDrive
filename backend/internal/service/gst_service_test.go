package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewGSTService(t *testing.T) {
	svc := NewGSTService()
	assert.NotNil(t, svc)
}

func TestDetermineGSTType(t *testing.T) {
	svc := NewGSTService()

	tests := []struct {
		name              string
		supplierStateCode string
		placeOfSupplyCode string
		expected          string
	}{
		{"same state intra - Maharashtra", "27", "27", "intra"},
		{"same state intra - Karnataka", "29", "29", "intra"},
		{"same state intra - Delhi", "07", "07", "intra"},
		{"different state inter - MH to KA", "27", "29", "inter"},
		{"different state inter - DL to GJ", "07", "24", "inter"},
		{"different state inter - TN to KL", "33", "32", "inter"},
		{"invalid supplier code", "99", "27", ""},
		{"invalid POS code", "27", "99", ""},
		{"both invalid", "00", "99", ""},
		{"empty supplier", "", "27", ""},
		{"empty POS", "27", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := svc.DetermineGSTType(tt.supplierStateCode, tt.placeOfSupplyCode)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetStateByCode(t *testing.T) {
	svc := NewGSTService()

	tests := []struct {
		code     string
		expected string
	}{
		{"27", "Maharashtra"},
		{"29", "Karnataka"},
		{"07", "Delhi"},
		{"33", "Tamil Nadu"},
		{"36", "Telangana"},
		{"38", "Ladakh"},
		{"01", "Jammu and Kashmir"},
		{"99", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			assert.Equal(t, tt.expected, svc.GetStateByCode(tt.code))
		})
	}
}

func TestGetCodeByState(t *testing.T) {
	svc := NewGSTService()

	tests := []struct {
		name     string
		expected string
	}{
		{"Maharashtra", "27"},
		{"maharashtra", "27"},
		{"MAHARASHTRA", "27"},
		{"Karnataka", "29"},
		{"Delhi", "07"},
		{"Tamil Nadu", "33"},
		{"Nonexistent State", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, svc.GetCodeByState(tt.name))
		})
	}
}

func TestAllStates(t *testing.T) {
	svc := NewGSTService()
	states := svc.AllStates()

	// Should have all 37 states/UTs (codes 01-38, with gaps)
	assert.Len(t, states, 38)

	// Verify it's a copy, not a reference
	states["27"] = "Modified"
	assert.Equal(t, "Maharashtra", svc.GetStateByCode("27"))
}

func TestExtractStateCodeFromGSTIN(t *testing.T) {
	svc := NewGSTService()

	tests := []struct {
		name     string
		gstin    string
		expected string
	}{
		{"valid Maharashtra GSTIN", "27AABCU9603R1ZM", "27"},
		{"valid Karnataka GSTIN", "29AABCU9603R1ZM", "29"},
		{"valid Delhi GSTIN", "07AABCU9603R1ZM", "07"},
		{"too short", "27AABCU", ""},
		{"too long", "27AABCU9603R1ZM9", ""},
		{"empty", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, svc.ExtractStateCodeFromGSTIN(tt.gstin))
		})
	}
}
