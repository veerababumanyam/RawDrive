package repository

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNewDesignTemplateRepo(t *testing.T) {
	repo := NewDesignTemplateRepo(nil)
	assert.NotNil(t, repo)
}

func TestDesignTemplateDefaultConfig(t *testing.T) {
	tpl := DesignTemplate{
		Name: "Wedding Classic",
	}
	assert.Equal(t, "Wedding Classic", tpl.Name)
	assert.Empty(t, tpl.Config)
}
