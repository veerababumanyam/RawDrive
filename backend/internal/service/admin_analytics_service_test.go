package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminAnalyticsService(t *testing.T) {
	svc := NewAdminAnalyticsService(nil)
	assert.NotNil(t, svc)
}
