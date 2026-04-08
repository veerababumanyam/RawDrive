package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAuditLogService(t *testing.T) {
	svc := NewAuditLogService(nil)
	assert.NotNil(t, svc)
}
