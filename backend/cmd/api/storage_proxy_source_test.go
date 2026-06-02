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
