package passwordpolicy

import (
	"strings"
	"testing"
)

func TestValidateBcryptInput(t *testing.T) {
	if err := ValidateBcryptInput("password", strings.Repeat("x", MaxBcryptInputBytes)); err != nil {
		t.Fatalf("boundary input should pass: %v", err)
	}

	err := ValidateBcryptInput("password", strings.Repeat("x", MaxBcryptInputBytes+1))
	if err == nil {
		t.Fatal("expected over-bcrypt-limit input to fail")
	}
	if got, want := err.Error(), "password must be at most 72 characters"; got != want {
		t.Fatalf("ValidateBcryptInput error = %q, want %q", got, want)
	}
}
