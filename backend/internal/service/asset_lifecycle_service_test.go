package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAssetLifecycleService(t *testing.T) {
	svc := NewAssetLifecycleService(nil, nil, nil)
	assert.NotNil(t, svc)
}

func TestCanTransition(t *testing.T) {
	tests := []struct {
		name     string
		from     LifecycleState
		to       LifecycleState
		expected bool
	}{
		{"active to archived", StateActive, StateArchived, true},
		{"active to hidden", StateActive, StateHidden, true},
		{"active to locked", StateActive, StateLocked, true},
		{"active to deleted", StateActive, StateDeleted, true},
		{"archived to active", StateArchived, StateActive, true},
		{"archived to deleted", StateArchived, StateDeleted, true},
		{"archived to locked", StateArchived, StateLocked, false},
		{"locked to active", StateLocked, StateActive, true},
		{"locked to deleted", StateLocked, StateDeleted, false},
		{"deleted to active", StateDeleted, StateActive, true},
		{"deleted to archived", StateDeleted, StateArchived, false},
		{"hidden to active", StateHidden, StateActive, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, CanTransition(tt.from, tt.to))
		})
	}
}

func TestLifecycleState_Constants(t *testing.T) {
	assert.Equal(t, LifecycleState("active"), StateActive)
	assert.Equal(t, LifecycleState("archived"), StateArchived)
	assert.Equal(t, LifecycleState("hidden"), StateHidden)
	assert.Equal(t, LifecycleState("locked"), StateLocked)
	assert.Equal(t, LifecycleState("deleted"), StateDeleted)
}
