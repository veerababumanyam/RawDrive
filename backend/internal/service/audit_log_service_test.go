package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAuditLogService(t *testing.T) {
	svc := NewAuditLogService(nil)
	assert.NotNil(t, svc)
}

func TestAuditLogService_HasStructuredLogger(t *testing.T) {
	svc := NewAuditLogService(nil)
	assert.NotNil(t, svc.logger, "logger should default to slog.Default()")
}
