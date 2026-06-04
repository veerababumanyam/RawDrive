package main

import (
	"os"
	"strings"
	"testing"
)

func TestStorageProxyScopesAuthenticatedKeysToWorkspace(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(b)
	handler := functionBodyFromSource(t, source, `r.Get("/storage/*"`)

	if !strings.Contains(handler, "claims, err := jwtSvc.ParseAccessToken") {
		t.Fatalf("storage proxy must retain parsed JWT claims instead of discarding them")
	}
	if !strings.Contains(handler, "auth.AccessTokenFromRequest") {
		t.Fatalf("storage proxy must read bearer tokens from Authorization/cookie helper")
	}
	if strings.Contains(handler, `r.URL.Query().Get("token")`) {
		t.Fatalf("storage proxy must not accept bearer access tokens from query strings")
	}
	if !strings.Contains(handler, "storageKeyBelongsToWorkspace") {
		t.Fatalf("storage proxy must verify authenticated object keys belong to claims.WorkspaceID")
	}
}

func TestStorageKeyWorkspaceResolverCoversOriginalsAndDerivatives(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(b)
	body := functionBodyFromSource(t, source, "func storageKeyBelongsToWorkspace")

	for _, fragment := range []string{
		"SELECT EXISTS",
		"assets",
		"asset_derivatives",
		"workspace_id",
		"storage_key",
	} {
		if !strings.Contains(body, fragment) {
			t.Fatalf("storageKeyBelongsToWorkspace must query %q", fragment)
		}
	}
}

// TestStorageProxyCacheHeadersRespectE2EE is the PERF-HDR regression guard for
// the /storage/* proxy. Content-addressed derivatives served anonymously on the
// public-thumbnail path are immutable and may be browser/shared-cached
// (public, immutable); everything that flows through the authed/workspace-scoped
// or token-gated branch (which includes E2EE-gated and .enc encrypted content)
// MUST stay private so encrypted/authed bytes never become public-cacheable.
func TestStorageProxyCacheHeadersRespectE2EE(t *testing.T) {
	b, err := os.ReadFile("main.go")
	if err != nil {
		t.Fatalf("read main.go: %v", err)
	}
	source := string(b)
	handler := functionBodyFromSource(t, source, `r.Get("/storage/*"`)

	// Anonymous, content-addressed public thumbnails are immutable: emit a
	// shared-cacheable, immutable policy so browsers/CDNs can cache them.
	if !strings.Contains(handler, "public, max-age=86400, immutable") {
		t.Fatalf("storage proxy must serve anonymous public thumbnails as public, max-age=86400, immutable")
	}
	// Authed / token-gated / encrypted content must remain private — never
	// public-cacheable. The existing private policy must still be present.
	if !strings.Contains(handler, "private, max-age=3600") {
		t.Fatalf("storage proxy must keep authed/encrypted content private (private, max-age=3600)")
	}
	// The public policy must be gated on the anonymous-public-thumbnail decision,
	// not emitted unconditionally — otherwise encrypted/authed bytes would leak a
	// public cache directive.
	if !strings.Contains(handler, "isPublicThumbnail") {
		t.Fatalf("storage proxy cache policy must branch on isPublicThumbnail so E2EE/authed content stays private")
	}
}

// TestEdgeDeliveryCacheHeaderImmutable pins the canonical immutable policy on the
// edge-delivery handler so the proxy's policy stays consistent with it.
func TestEdgeDeliveryCacheHeaderImmutable(t *testing.T) {
	b, err := os.ReadFile("../../internal/handler/edge_delivery_handler.go")
	if err != nil {
		t.Fatalf("read edge_delivery_handler.go: %v", err)
	}
	if !strings.Contains(string(b), "public, max-age=86400, immutable") {
		t.Fatalf("edge delivery must remain the canonical public, max-age=86400, immutable policy")
	}
}

func functionBodyFromSource(t *testing.T, source, signaturePrefix string) string {
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
