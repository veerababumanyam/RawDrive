package handler

import "testing"

func TestPublicStudioBusinessCodeFromSubdomain(t *testing.T) {
	tests := []struct {
		name      string
		subdomain string
		want      string
	}{
		{name: "valid studio subdomain", subdomain: "kaveri-stories-a1b2c3d4", want: "a1b2c3d4"},
		{name: "invalid short code", subdomain: "kaveri-stories-a1b2", want: ""},
		{name: "missing hyphen delimiter", subdomain: "kaveristoriesa1b2c3d4", want: ""},
		{name: "uppercase is rejected", subdomain: "kaveri-stories-A1B2C3D4", want: ""},
		{name: "empty", subdomain: "", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := publicStudioBusinessCodeFromSubdomain(tt.subdomain); got != tt.want {
				t.Fatalf("publicStudioBusinessCodeFromSubdomain(%q) = %q, want %q", tt.subdomain, got, tt.want)
			}
		})
	}
}
