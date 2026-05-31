package handler

import (
	"os"
	"strings"
	"testing"
)

func TestGalleryHandler_ObjectRoutesResolveWorkspaceScopedGallery(t *testing.T) {
	source := readHandlerSource(t, "gallery_handler.go")

	for _, fn := range []string{
		"GetByID",
		"SoftDelete",
		"AddAsset",
		"ReorderAssets",
		"RemoveAsset",
		"Timeline",
		"ListAssets",
		"TriggerFaceScan",
	} {
		body := functionBody(t, source, "func (h *GalleryHandler) "+fn)
		if !strings.Contains(body, "requireGalleryInWorkspace") {
			t.Fatalf("%s must resolve the gallery through requireGalleryInWorkspace before serving a gallery-scoped route", fn)
		}
	}
}

func TestAlbumHandler_ObjectRoutesResolveWorkspaceScopedAlbum(t *testing.T) {
	source := readHandlerSource(t, "album_handler.go")

	for _, fn := range []string{
		"Create",
		"List",
		"GetByID",
		"Breadcrumb",
		"ListAssets",
		"AddAssets",
		"Delete",
	} {
		body := functionBody(t, source, "func (h *AlbumHandler) "+fn)
		if !strings.Contains(body, "requireAlbumInWorkspace") && !strings.Contains(body, "requireGalleryInWorkspace") {
			t.Fatalf("%s must resolve its gallery/album through a workspace-scoped authorization helper", fn)
		}
	}
}

func readHandlerSource(t *testing.T, name string) string {
	t.Helper()
	b, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	return string(b)
}

func functionBody(t *testing.T, source, signaturePrefix string) string {
	t.Helper()
	start := strings.Index(source, signaturePrefix)
	if start < 0 {
		t.Fatalf("missing function %q", signaturePrefix)
	}
	open := strings.Index(source[start:], "{")
	if open < 0 {
		t.Fatalf("missing body for %q", signaturePrefix)
	}
	i := start + open
	depth := 0
	for ; i < len(source); i++ {
		switch source[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return source[start : i+1]
			}
		}
	}
	t.Fatalf("unterminated body for %q", signaturePrefix)
	return ""
}
