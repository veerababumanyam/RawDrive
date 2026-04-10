package handler

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestParseCoverRequest_AcceptsFocalPointObject verifies that the handler
// parses the frontend shape {focal_point: {x, y}} rather than the legacy
// flat {focal_x, focal_y} shape that caused a silent serialization drift
// between frontend and backend (GAL-FR-061).
func TestParseCoverRequest_AcceptsFocalPointObject(t *testing.T) {
	body := []byte(`{"asset_id":"","style_id":"hero-overlay","focal_point":{"x":42.5,"y":67.25}}`)

	req, err := parseCoverRequest(body)
	assert.NoError(t, err)
	assert.Equal(t, "hero-overlay", req.StyleID)
	assert.InDelta(t, 42.5, req.FocalPoint.X, 0.001)
	assert.InDelta(t, 67.25, req.FocalPoint.Y, 0.001)
}

func TestParseCoverRequest_RejectsFocalPointOutOfRange(t *testing.T) {
	body := []byte(`{"style_id":"hero-overlay","focal_point":{"x":-5,"y":50}}`)
	_, err := parseCoverRequest(body)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "focal_point")

	body = []byte(`{"style_id":"hero-overlay","focal_point":{"x":50,"y":120}}`)
	_, err = parseCoverRequest(body)
	assert.Error(t, err)
}

func TestParseCoverRequest_RejectsUnknownStyleID(t *testing.T) {
	body := []byte(`{"style_id":"totally-fake-style","focal_point":{"x":50,"y":50}}`)
	_, err := parseCoverRequest(body)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "invalid style_id")
}

func TestParseCoverRequest_AcceptsAllThirtyStyles(t *testing.T) {
	assert.Equal(t, 30, len(validCoverStyles), "must have exactly 30 cover styles")
	for styleID := range validCoverStyles {
		body := []byte(`{"style_id":"` + styleID + `","focal_point":{"x":50,"y":50}}`)
		_, err := parseCoverRequest(body)
		assert.NoError(t, err, "style %s should be valid", styleID)
	}
}

func TestParseCoverRequest_DefaultsFocalPointToCenter(t *testing.T) {
	// When focal_point is omitted, default to centre (50, 50) so first save is sane.
	body := []byte(`{"style_id":"hero-overlay"}`)
	req, err := parseCoverRequest(body)
	assert.NoError(t, err)
	assert.InDelta(t, 50.0, req.FocalPoint.X, 0.001)
	assert.InDelta(t, 50.0, req.FocalPoint.Y, 0.001)
}

func TestParseCoverRequest_RejectsInvalidJSON(t *testing.T) {
	_, err := parseCoverRequest([]byte(`{not json`))
	assert.Error(t, err)
}
