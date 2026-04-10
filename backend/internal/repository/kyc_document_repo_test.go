package repository

import (
	"errors"
	"testing"
)

// TestValidateKycDocumentType covers the whitelist check used by the repo's
// Create path and the handler's input validation. Table-driven to make it
// obvious which values are accepted and which are rejected — these MUST
// stay in sync with the CHECK constraint in migration 047.
func TestValidateKycDocumentType(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"pan accepted", "pan", false},
		{"gst accepted", "gst", false},
		{"bank_statement accepted", "bank_statement", false},
		{"address_proof accepted", "address_proof", false},
		{"photo_id accepted", "photo_id", false},
		{"empty rejected", "", true},
		{"unknown rejected", "aadhaar", true},
		{"mixed case rejected", "PAN", true},
		{"whitespace rejected", "pan ", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateKycDocumentType(tc.input)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q, got nil", tc.input)
				}
				if !errors.Is(err, ErrInvalidKycDocumentType) {
					t.Fatalf("expected ErrInvalidKycDocumentType, got %v", err)
				}
			} else if err != nil {
				t.Fatalf("expected nil, got error: %v", err)
			}
		})
	}
}

func TestValidateKycStatus(t *testing.T) {
	cases := []struct {
		input   string
		wantErr bool
	}{
		{"pending", false},
		{"approved", false},
		{"rejected", false},
		{"", true},
		{"Approved", true},
		{"paid", true},
	}
	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			err := ValidateKycStatus(tc.input)
			if tc.wantErr && err == nil {
				t.Fatalf("expected error for %q", tc.input)
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
