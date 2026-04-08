package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminRevenueService(t *testing.T) {
	svc := NewAdminRevenueService(nil)
	assert.NotNil(t, svc)
}
