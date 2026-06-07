package service

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMarshalJSONMapReturnsTextJSONForJsonbParameters(t *testing.T) {
	payload, err := marshalJSONMap(map[string]any{
		"tier":     "creator",
		"features": []string{"AI face search", "Photo selling"},
	})

	require.NoError(t, err)
	require.JSONEq(t, `{"tier":"creator","features":["AI face search","Photo selling"]}`, payload)
	require.True(t, json.Valid([]byte(payload)))
}
