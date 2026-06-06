package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNormalizeBillingAnalyticsWindowDays(t *testing.T) {
	assert.Equal(t, 30, normalizeBillingAnalyticsWindowDays(0))
	assert.Equal(t, 30, normalizeBillingAnalyticsWindowDays(-5))
	assert.Equal(t, 7, normalizeBillingAnalyticsWindowDays(7))
	assert.Equal(t, 365, normalizeBillingAnalyticsWindowDays(800))
}
