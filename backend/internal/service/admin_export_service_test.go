package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminExportService_Constructor(t *testing.T) {
	svc := NewAdminExportService(nil, nil)
	assert.NotNil(t, svc)
	assert.Nil(t, svc.userRepo)
	assert.Nil(t, svc.revenueRepo)
}
