package email

import (
	"strings"
	"testing"
)

func cfgForTest() *SMTPConfig {
	return &SMTPConfig{FromAddress: "noreply@rawdrive.in", FromName: "RawDrive"}
}

func TestComposeGalleryAutomation_ReadyCarriesBrandingAndLink(t *testing.T) {
	msg := string(composeGalleryAutomationMessage(cfgForTest(), "client@example.com", GalleryAutomationData{
		EventType:    "ready",
		GalleryTitle: "Asha & Veer Wedding",
		GalleryLink:  "https://studio.rawdrive.in/g/asha-veer",
		StudioName:   "Lens & Light Studio",
		AccentColor:  "#aa3322",
		LogoURL:      "https://api.rawdrive.in/api/v1/public/galleries/asha-veer/branding/logo",
	}))

	if !strings.Contains(msg, "Subject:") || !strings.Contains(msg, "is ready") {
		t.Errorf("ready subject missing: %s", firstLineWithSubject(msg))
	}
	for _, want := range []string{
		"Lens &amp; Light Studio",                                  // studio name (HTML-escaped)
		"#aa3322",                                                  // accent applied to the CTA
		"https://studio.rawdrive.in/g/asha-veer",                   // gallery link
		"branding/logo",                                            // logo image
		"Content-Type: text/html",                                  // branded HTML email
	} {
		if !strings.Contains(msg, want) {
			t.Errorf("ready email missing %q", want)
		}
	}
}

func TestComposeGalleryAutomation_InvalidAccentFallsBackToDefault(t *testing.T) {
	msg := string(composeGalleryAutomationMessage(cfgForTest(), "c@example.com", GalleryAutomationData{
		EventType:    "ready",
		GalleryTitle: "G",
		GalleryLink:  "https://x/g/y",
		AccentColor:  "javascript:alert(1)", // must NOT be used
	}))
	if strings.Contains(msg, "javascript:alert(1)") {
		t.Error("invalid accent leaked into the email")
	}
	if !strings.Contains(msg, defaultAutomationAccent) {
		t.Error("expected fallback accent colour")
	}
}

func TestComposeGalleryAutomation_LastChanceMentionsExpiry(t *testing.T) {
	msg := string(composeGalleryAutomationMessage(cfgForTest(), "c@example.com", GalleryAutomationData{
		EventType:    "last_chance",
		GalleryTitle: "G",
		GalleryLink:  "https://x/g/y",
		StudioName:   "Studio",
		ExpiryLabel:  "June 30, 2026",
	}))
	if !strings.Contains(msg, "Last chance") {
		t.Error("last_chance subject/headline missing")
	}
	if !strings.Contains(msg, "June 30, 2026") {
		t.Error("last_chance body should mention the expiry date")
	}
}

func TestLooksLikeHexColor(t *testing.T) {
	cases := map[string]bool{
		"#fff": true, "#aabbcc": true, "#AABBCC": true,
		"fff": false, "#ggg": false, "": false, "#12345": false, "red": false,
	}
	for in, want := range cases {
		if got := looksLikeHexColor(in); got != want {
			t.Errorf("looksLikeHexColor(%q)=%v want %v", in, got, want)
		}
	}
}

func firstLineWithSubject(msg string) string {
	for _, line := range strings.Split(msg, "\r\n") {
		if strings.HasPrefix(line, "Subject:") {
			return line
		}
	}
	return "(no subject line)"
}
