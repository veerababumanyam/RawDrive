package handler

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"os/exec"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/service"
)

// fakeLogoStore captures stored objects so buildWorkspaceLogo can be tested
// without object storage. It satisfies storageProviderPutGet.
type fakeLogoStore struct {
	objects map[string][]byte
}

func newFakeLogoStore() *fakeLogoStore { return &fakeLogoStore{objects: map[string][]byte{}} }

func (f *fakeLogoStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	b, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	f.objects[key] = b
	return nil
}

func TestParseLogoCropPosition_DefaultsToWholeLogo(t *testing.T) {
	pos := parseLogoCropPosition(func(string) string { return "" })
	assert.Equal(t, 0.0, pos.X)
	assert.Equal(t, 0.0, pos.Y)
	assert.Equal(t, 1.0, pos.Zoom, "missing zoom defaults to the fit-to-contain whole logo")
}

func TestParseLogoCropPosition_ParsesProvidedValues(t *testing.T) {
	vals := map[string]string{"x": "0.5", "y": "-0.25", "zoom": "2.5"}
	pos := parseLogoCropPosition(func(k string) string { return vals[k] })
	assert.InDelta(t, 0.5, pos.X, 1e-9)
	assert.InDelta(t, -0.25, pos.Y, 1e-9)
	assert.InDelta(t, 2.5, pos.Zoom, 1e-9)
}

func TestParseLogoCropPosition_RejectsNonPositiveZoom(t *testing.T) {
	vals := map[string]string{"zoom": "0"}
	pos := parseLogoCropPosition(func(k string) string { return vals[k] })
	assert.Equal(t, 1.0, pos.Zoom, "zoom <= 0 falls back to 1 rather than producing an empty crop")
}

func TestWorkspaceLogoStorageKeys_Layout(t *testing.T) {
	wsID := uuid.New()
	logoID := uuid.New()
	original, rendered := workspaceLogoStorageKeys(wsID, logoID, ".png")
	assert.Equal(t, "workspaces/"+wsID.String()+"/logo/"+logoID.String()+"/original.png", original)
	assert.Equal(t, "workspaces/"+wsID.String()+"/logo/"+logoID.String()+"/render.webp", rendered)
	assert.True(t, strings.HasSuffix(rendered, "render.webp"), "rendered mark is always WebP")
}

func TestWorkspaceLogoFilename_NormalizesToWebp(t *testing.T) {
	assert.Equal(t, "Studio Mark.webp", workspaceLogoFilename("Studio Mark.png"))
	assert.Equal(t, "logo.webp", workspaceLogoFilename(""))
	assert.Equal(t, "brand.webp", workspaceLogoFilename("brand"))
}

func TestWorkspaceLogoMetadata_IncludesOriginalKeyAndCrop(t *testing.T) {
	assetID := uuid.New()
	pos := service.LogoCropPosition{X: 0.3, Y: -0.1, Zoom: 1.8}
	md := workspaceLogoMetadata(assetID, "brand.webp", 4096, "ws/render.webp", "ws/original.png", pos)

	assert.Equal(t, assetID.String(), md["asset_id"])
	assert.Equal(t, "image/webp", md["content_type"], "the displayed brand mark is always WebP")
	assert.Equal(t, "s3", md["storage_driver"])
	assert.Equal(t, "ws/render.webp", md["storage_key"])
	assert.Equal(t, "ws/original.png", md["original_storage_key"], "the original key is kept so a re-crop needs no re-upload")
	assert.Equal(t, int64(4096), md["size_bytes"])

	crop, ok := md["crop"].(map[string]interface{})
	require.True(t, ok, "crop position must be persisted for the UI to restore it")
	assert.InDelta(t, 0.3, crop["x"], 1e-9)
	assert.InDelta(t, -0.1, crop["y"], 1e-9)
	assert.InDelta(t, 1.8, crop["zoom"], 1e-9)
}

func TestBuildWorkspaceLogo_RendersWebPAndStoresOriginalPlusRender(t *testing.T) {
	if _, err := exec.LookPath("cwebp"); err != nil {
		t.Skip("cwebp not installed — required to render the WebP brand mark")
	}
	// Synthesize a wide wordmark-shaped logo (the repo's render tests build
	// images in-memory; the tests/photos fixtures are not committed).
	src := image.NewNRGBA(image.Rect(0, 0, 160, 48))
	for y := 0; y < 48; y++ {
		for x := 0; x < 160; x++ {
			src.Set(x, y, color.NRGBA{R: uint8(x), G: uint8(y * 5), B: 120, A: 255})
		}
	}
	var raw bytes.Buffer
	require.NoError(t, jpeg.Encode(&raw, src, &jpeg.Options{Quality: 90}))

	store := newFakeLogoStore()
	wsID := uuid.New()
	logoID := uuid.New()
	pos := service.LogoCropPosition{Zoom: 1}

	renderedKey, originalKey, size, err := buildWorkspaceLogo(
		context.Background(), store, wsID, logoID, raw.Bytes(), "image/jpeg", "studio.jpg", pos,
	)
	require.NoError(t, err)
	assert.Greater(t, size, 0)

	// Both objects were stored under the workspace-scoped keys.
	original, ok := store.objects[originalKey]
	require.True(t, ok, "the original must be stored for re-cropping")
	assert.Equal(t, raw.Bytes(), original, "the original is stored verbatim")

	rendered, ok := store.objects[renderedKey]
	require.True(t, ok, "the rendered brand mark must be stored")
	require.GreaterOrEqual(t, len(rendered), 12)
	assert.Equal(t, "RIFF", string(rendered[:4]), "rendered mark must be WebP")
	assert.Equal(t, "WEBP", string(rendered[8:12]), "rendered mark must be WebP")
	assert.True(t, strings.HasPrefix(originalKey, "workspaces/"+wsID.String()+"/logo/"))
}

func TestBuildWorkspaceLogo_NilStoreIsAnError(t *testing.T) {
	_, _, _, err := buildWorkspaceLogo(context.Background(), nil, uuid.New(), uuid.New(), []byte("x"), "image/png", "a.png", service.LogoCropPosition{Zoom: 1})
	assert.ErrorIs(t, err, errWorkspaceLogoStorageUnavailable)
}
