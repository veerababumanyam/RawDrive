package handler

import (
	"strings"
	"testing"
)

// gallery_authz_census_test.go — census (not sample) of tenant-ownership
// enforcement across every gallery-scoped owner handler. Born from the
// 2026-05-31 integration audit, which found ~12 handlers serving objects by
// URL id with no workspace check (cross-tenant IDOR).
//
// Each gallery-id-addressed owner method MUST resolve the gallery through the
// shared guardGalleryWorkspace guard; each asset-id-addressed owner method MUST
// resolve the asset through guardAssetWorkspace. These are source-level
// assertions (fast, deterministic, regression-proof) that complement the
// per-handler behavioral cross-tenant tests. They intentionally fail until the
// remediation lands so the closure is provable.
//
// Child-id-addressed mutations (share-link Revoke by linkId, proofing
// UpdateStatus by selectionId, download GetJob by jobId, banner Update/Delete
// by bannerId, proofing-session updates by sessionId/selectionId) resolve their
// parent gallery a handler-specific way and are covered by behavioral tests,
// not this source census.

func TestAuthz_GalleryScopedOwnerMethodsGuardWorkspace(t *testing.T) {
	type fileCensus struct {
		file    string
		recv    string
		methods []string
	}
	cases := []fileCensus{
		{"gallery_access_handler.go", "GalleryAccessHandler", []string{
			"SetPassword", "SetAccessMode", "ViewAsClient", "GetAccessLogs", "SetProofingDeadline",
		}},
		{"share_link_handler.go", "ShareLinkHandler", []string{
			"Create", "ListByGallery",
		}},
		{"proofing_handler.go", "ProofingHandler", []string{
			"ListByGallery", "ExportCSV",
		}},
		{"proofing_session_handler.go", "ProofingSessionHandler", []string{
			"CreateSession", "ListSessions",
		}},
		{"gallery_analytics_handler.go", "GalleryAnalyticsHandler", []string{
			"GetSummary", "GetDailyStats", "GetDeviceBreakdown", "GetDownloadVelocity",
			"GetShareChannels", "GetTopViews", "GetTopDownloads",
		}},
		{"download_handler.go", "DownloadHandler", []string{
			"CreateJob", "ListJobs", "GetAudit", "GetAuditCSV", "DownloadZIP",
		}},
		{"gallery_favorites_handler.go", "GalleryFavoritesHandler", []string{
			"Summarize",
		}},
		{"gallery_cover_handler.go", "GalleryCoverHandler", []string{
			"UpdateCover",
		}},
		{"gallery_design_handler.go", "GalleryDesignHandler", []string{
			"GetDesign", "UpdateDesign", "UpdateEmbeddedVideos",
		}},
	}

	for _, fc := range cases {
		source := readHandlerSource(t, fc.file)
		for _, m := range fc.methods {
			sig := "func (h *" + fc.recv + ") " + m
			if !strings.Contains(source, sig) {
				t.Errorf("%s: method %s not found (signature %q) — census needs updating or method renamed", fc.file, m, sig)
				continue
			}
			body := functionBodyTolerant(source, sig)
			if !strings.Contains(body, "guardGalleryWorkspace") {
				t.Errorf("%s.%s must enforce tenant ownership via guardGalleryWorkspace before serving a gallery-scoped route (cross-tenant IDOR otherwise)", fc.recv, m)
			}
		}
	}
}

func TestAuthz_AssetScopedOwnerMethodsGuardWorkspace(t *testing.T) {
	type fileCensus struct {
		file    string
		recv    string
		methods []string
	}
	cases := []fileCensus{
		{"asset_handler.go", "AssetHandler", []string{"GetByID", "Download", "SoftDelete"}},
		{"edge_delivery_handler.go", "EdgeDeliveryHandler", []string{"ServeDerivative"}},
	}
	for _, fc := range cases {
		source := readHandlerSource(t, fc.file)
		for _, m := range fc.methods {
			sig := "func (h *" + fc.recv + ") " + m
			if !strings.Contains(source, sig) {
				t.Errorf("%s: method %s not found (signature %q)", fc.file, m, sig)
				continue
			}
			body := functionBodyTolerant(source, sig)
			if !strings.Contains(body, "guardAssetWorkspace") {
				t.Errorf("%s.%s must enforce tenant ownership via guardAssetWorkspace (workspace-scoped asset lookup) before serving (cross-tenant IDOR otherwise)", fc.recv, m)
			}
		}
	}
}

// functionBodyTolerant extracts a function body without failing the test when
// the signature is absent (the census loop reports that separately), so one
// missing method never masks the rest of the census.
func functionBodyTolerant(source, signaturePrefix string) string {
	start := strings.Index(source, signaturePrefix)
	if start < 0 {
		return ""
	}
	open := strings.Index(source[start:], "{")
	if open < 0 {
		return ""
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
	return ""
}
