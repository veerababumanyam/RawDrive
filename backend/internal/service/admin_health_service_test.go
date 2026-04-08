package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminHealthService(t *testing.T) {
	svc := NewAdminHealthService(nil)
	assert.NotNil(t, svc)
}
