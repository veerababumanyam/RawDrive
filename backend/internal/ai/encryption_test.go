package ai

import (
	"crypto/rand"
	"testing"
)

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}

	plaintext := []byte("sk-test-gemini-api-key-1234567890")

	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if encrypted == string(plaintext) {
		t.Fatal("encrypted should differ from plaintext")
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if string(decrypted) != string(plaintext) {
		t.Fatalf("round-trip mismatch: got %q, want %q", decrypted, plaintext)
	}
}

func TestEncrypt_WrongKeyLength(t *testing.T) {
	_, err := Encrypt([]byte("test"), []byte("short"))
	if err == nil {
		t.Fatal("expected error for short key")
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	rand.Read(key1)
	rand.Read(key2)

	encrypted, err := Encrypt([]byte("secret"), key1)
	if err != nil {
		t.Fatal(err)
	}

	_, err = Decrypt(encrypted, key2)
	if err == nil {
		t.Fatal("expected error decrypting with wrong key")
	}
}

func TestDecrypt_InvalidBase64(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)
	_, err := Decrypt("not-valid-base64!!!", key)
	if err == nil {
		t.Fatal("expected error for invalid base64")
	}
}

func TestEncrypt_EmptyPlaintext(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)

	encrypted, err := Encrypt([]byte(""), key)
	if err != nil {
		t.Fatalf("Encrypt empty: %v", err)
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt empty: %v", err)
	}

	if string(decrypted) != "" {
		t.Fatalf("expected empty, got %q", decrypted)
	}
}

func TestMaskKey(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"AIzaSyD1234567890abcdef", "AIza...cdef"},
		{"short", "****"},
		{"12345678", "****"},
		{"123456789", "1234...6789"},
	}
	for _, tt := range tests {
		got := MaskKey(tt.input)
		if got != tt.want {
			t.Errorf("MaskKey(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
