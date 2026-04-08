package service

import (
	"testing"
)

func TestPANValidation(t *testing.T) {
	valid := []string{"ABCDE1234F", "ZZZZZ9999Z"}
	invalid := []string{"abcde1234f", "ABC123", "ABCDE12345", "12345ABCDE"}

	for _, pan := range valid {
		if !panRegex.MatchString(pan) {
			t.Errorf("expected valid PAN: %s", pan)
		}
	}
	for _, pan := range invalid {
		if panRegex.MatchString(pan) {
			t.Errorf("expected invalid PAN: %s", pan)
		}
	}
}

func TestGSTINValidation(t *testing.T) {
	valid := []string{"22AAAAA0000A1Z5"}
	invalid := []string{"invalid", "22AAAAA0000A1Z", "123"}

	for _, gstin := range valid {
		if !gstinRegex.MatchString(gstin) {
			t.Errorf("expected valid GSTIN: %s", gstin)
		}
	}
	for _, gstin := range invalid {
		if gstinRegex.MatchString(gstin) {
			t.Errorf("expected invalid GSTIN: %s", gstin)
		}
	}
}
