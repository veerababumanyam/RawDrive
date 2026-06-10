package handler

import (
	"encoding/json"
	"testing"
)

func TestDecodeGallerySlideshowIntervalMS(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		raw       string
		want      int
		wantError bool
	}{
		{name: "minimum", raw: `2000`, want: 2000},
		{name: "default", raw: `5000`, want: 5000},
		{name: "maximum", raw: `15000`, want: 15000},
		{name: "too fast", raw: `1999`, wantError: true},
		{name: "too slow", raw: `15001`, wantError: true},
		{name: "invalid type", raw: `"5000"`, wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := decodeGallerySlideshowIntervalMS(json.RawMessage(tt.raw))
			if tt.wantError {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}
