package service

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeShareAccessMode_DefaultsAndRejectsUnsupportedModes(t *testing.T) {
	mode, err := NormalizeShareAccessMode("", false)
	require.NoError(t, err)
	assert.Equal(t, AccessPublic, mode)

	mode, err = NormalizeShareAccessMode("", true)
	require.NoError(t, err)
	assert.Equal(t, AccessPIN, mode)

	mode, err = NormalizeShareAccessMode(" EMAIL ", false)
	require.NoError(t, err)
	assert.Equal(t, AccessEmail, mode)

	_, err = NormalizeShareAccessMode("anyone-with-a-secret-spreadsheet", false)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported share link access_mode")
}

func TestShareEmailCredentialAllowed_SupportsJSONAndNativeStringSlices(t *testing.T) {
	assert.True(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []interface{}{"Client@Example.com", "family@example.com"},
	}, " client@example.com "))

	assert.True(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []string{"family@example.com"},
	}, "FAMILY@example.com"))

	assert.False(t, shareEmailCredentialAllowed(map[string]interface{}{
		"allowed_emails": []interface{}{"family@example.com"},
	}, "other@example.com"))

	assert.False(t, shareEmailCredentialAllowed(map[string]interface{}{}, "client@example.com"))
}
