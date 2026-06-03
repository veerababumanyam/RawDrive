package main

import "testing"

func TestProductionEnv(t *testing.T) {
	for _, value := range []string{"production", "prod", " Production "} {
		if !productionEnv(value) {
			t.Fatalf("productionEnv(%q) = false, want true", value)
		}
	}
	for _, value := range []string{"", "development", "staging"} {
		if productionEnv(value) {
			t.Fatalf("productionEnv(%q) = true, want false", value)
		}
	}
}

func TestRedactUsername(t *testing.T) {
	cases := map[string]string{
		"":                        "<empty>",
		"noreply@rawdrive.in":     "n***@rawdrive.in",
		"operator@example.com":    "o***@example.com",
		"username-without-domain": "<set>",
		"  noreply@rawdrive.in  ": "n***@rawdrive.in",
		"@rawdrive.in":            "***@rawdrive.in",
	}
	for input, expected := range cases {
		if got := redactUsername(input); got != expected {
			t.Fatalf("redactUsername(%q) = %q, want %q", input, got, expected)
		}
	}
}
