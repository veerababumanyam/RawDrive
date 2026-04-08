package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminModerationService_Constructor(t *testing.T) {
	svc := NewAdminModerationService(nil, nil)
	assert.NotNil(t, svc)
	assert.Nil(t, svc.moderationRepo)
	assert.Nil(t, svc.auditLog)
}

func TestNewAdminModerationService_WithAuditLog(t *testing.T) {
	audit := NewAuditLogService(nil)
	svc := NewAdminModerationService(nil, audit)
	assert.NotNil(t, svc)
	assert.Equal(t, audit, svc.auditLog)
}
