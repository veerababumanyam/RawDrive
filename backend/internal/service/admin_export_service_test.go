package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewAdminExportService(t *testing.T) {
	svc := NewAdminExportService(nil, nil)
	assert.NotNil(t, svc)
}
