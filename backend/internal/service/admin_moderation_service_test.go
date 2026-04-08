package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminModerationService(t *testing.T) {
	svc := NewAdminModerationService(nil, nil)
	assert.NotNil(t, svc)
}
