package handler

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPublicStudioName(t *testing.T) {
	require.Equal(t, "Veerendra Photography", publicStudioName(publicWorkspaceBranding{
		WorkspaceName: "Workspace Legal Name",
		BrandName:     " Veerendra Photography ",
	}))
	require.Equal(t, "Workspace Legal Name", publicStudioName(publicWorkspaceBranding{
		WorkspaceName: " Workspace Legal Name ",
	}))
	require.Equal(t, "RawDrive", publicStudioName(publicWorkspaceBranding{}))
}
