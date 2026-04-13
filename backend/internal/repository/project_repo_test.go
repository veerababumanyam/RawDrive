package repository

import "testing"

func TestMapDealStageToProjectStatus(t *testing.T) {
	tests := []struct {
		stage string
		want  string
	}{
		{stage: "proposal", want: "quoted"},
		{stage: "negotiation", want: "reserved"},
		{stage: "confirmed", want: "booked"},
		{stage: "in_progress", want: "editing"},
		{stage: "completed", want: "delivered"},
		{stage: "cancelled", want: "cancelled"},
		{stage: "", want: "inquiry"},
		{stage: "unknown", want: "inquiry"},
	}

	for _, tt := range tests {
		t.Run(tt.stage, func(t *testing.T) {
			if got := MapDealStageToProjectStatus(tt.stage); got != tt.want {
				t.Fatalf("MapDealStageToProjectStatus(%q) = %q, want %q", tt.stage, got, tt.want)
			}
		})
	}
}

func TestStudioProjectStatusLabelsAreCanonical(t *testing.T) {
	want := []string{
		"inquiry",
		"quoted",
		"reserved",
		"booked",
		"shooting",
		"editing",
		"proofing",
		"delivered",
		"archived",
		"cancelled",
		"lost",
	}

	if len(StudioProjectStatuses) != len(want) {
		t.Fatalf("StudioProjectStatuses length = %d, want %d", len(StudioProjectStatuses), len(want))
	}
	for i, status := range want {
		if StudioProjectStatuses[i] != status {
			t.Fatalf("StudioProjectStatuses[%d] = %q, want %q", i, StudioProjectStatuses[i], status)
		}
	}
}
