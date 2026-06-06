package publicurl

import (
	"net/url"
	"strings"
)

const DefaultBaseURL = "https://rawdrive.in"

// Base returns the origin that should be used in public, client-facing links.
// Loopback origins are preserved for local development; RawDrive subdomains
// collapse to the apex so production links never expose workspace hosts.
func Base(configured string) string {
	base := strings.TrimRight(strings.TrimSpace(configured), "/")
	if base == "" {
		return DefaultBaseURL
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.Scheme == "" || parsed.Hostname() == "" {
		return DefaultBaseURL
	}
	host := strings.ToLower(parsed.Hostname())
	if isLoopbackHost(host) {
		return base
	}
	if host == "rawdrive.in" {
		return DefaultBaseURL
	}
	if host == "www.rawdrive.in" {
		return DefaultBaseURL
	}
	if strings.HasSuffix(host, ".rawdrive.in") {
		return DefaultBaseURL
	}
	return base
}

func Gallery(base, slug string) string {
	if strings.TrimSpace(slug) == "" {
		return ""
	}
	return Base(base) + "/g/" + url.PathEscape(slug)
}

func GalleryShare(base, slug, token string) string {
	galleryURL := Gallery(base, slug)
	if galleryURL == "" {
		return ""
	}
	return galleryURL + "?share=" + url.QueryEscape(token)
}

func Profile(base, slug string) string {
	if strings.TrimSpace(slug) == "" {
		return ""
	}
	return Base(base) + "/p/" + url.PathEscape(slug)
}

func isLoopbackHost(host string) bool {
	return host == "localhost" ||
		host == "127.0.0.1" ||
		host == "::1" ||
		strings.HasSuffix(host, ".localhost")
}
