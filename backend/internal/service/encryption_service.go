package service

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"log/slog"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rawdrive/backend/internal/storage"
)

type EncryptionService struct {
	pool   *pgxpool.Pool
	store  storage.Provider
	kek    []byte
	logger *slog.Logger
}

func NewEncryptionService(pool *pgxpool.Pool, store storage.Provider) *EncryptionService {
	kekB64 := os.Getenv("ENCRYPTION_MASTER_KEY")
	if kekB64 == "" {
		slog.Default().Warn("ENCRYPTION_MASTER_KEY not set — app-level encryption disabled")
		return nil
	}
	kek, err := base64.StdEncoding.DecodeString(kekB64)
	if err != nil || len(kek) != 32 {
		slog.Default().Error("ENCRYPTION_MASTER_KEY must be 32 bytes base64-encoded")
		return nil
	}
	return &EncryptionService{pool: pool, store: store, kek: kek, logger: slog.Default().With("component", "encryption-service")}
}

func (s *EncryptionService) GenerateDEK(ctx context.Context, workspaceID uuid.UUID) (uuid.UUID, error) {
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		return uuid.Nil, fmt.Errorf("encryption: generate DEK: %w", err)
	}
	encryptedDEK, err := s.encryptWithKEK(dek)
	if err != nil {
		return uuid.Nil, fmt.Errorf("encryption: wrap DEK: %w", err)
	}
	keyID := uuid.New()
	_, err = s.pool.Exec(ctx,
		`INSERT INTO encryption_keys (id, workspace_id, encrypted_dek, key_version, algorithm) VALUES ($1, $2, $3, COALESCE((SELECT MAX(key_version) FROM encryption_keys WHERE workspace_id = $2), 0) + 1, 'AES-256-GCM')`,
		keyID, workspaceID, encryptedDEK)
	if err != nil {
		return uuid.Nil, fmt.Errorf("encryption: store DEK: %w", err)
	}
	return keyID, nil
}

func (s *EncryptionService) GetActiveDEK(ctx context.Context, workspaceID uuid.UUID) (uuid.UUID, []byte, error) {
	var keyID uuid.UUID
	var encryptedDEK string
	err := s.pool.QueryRow(ctx, `SELECT id, encrypted_dek FROM encryption_keys WHERE workspace_id = $1 ORDER BY key_version DESC LIMIT 1`, workspaceID).Scan(&keyID, &encryptedDEK)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("encryption: get DEK: %w", err)
	}
	dek, err := s.decryptWithKEK(encryptedDEK)
	if err != nil {
		return uuid.Nil, nil, fmt.Errorf("encryption: unwrap DEK: %w", err)
	}
	return keyID, dek, nil
}

func (s *EncryptionService) EncryptFile(ctx context.Context, workspaceID uuid.UUID, plaintext io.Reader) (io.Reader, uuid.UUID, error) {
	keyID, dek, err := s.GetActiveDEK(ctx, workspaceID)
	if err != nil {
		keyID, err = s.GenerateDEK(ctx, workspaceID)
		if err != nil {
			return nil, uuid.Nil, err
		}
		keyID, dek, err = s.GetActiveDEK(ctx, workspaceID)
		if err != nil {
			return nil, uuid.Nil, err
		}
	}
	data, err := io.ReadAll(plaintext)
	if err != nil {
		return nil, uuid.Nil, fmt.Errorf("encryption: read plaintext: %w", err)
	}
	block, err := aes.NewCipher(dek)
	if err != nil {
		return nil, uuid.Nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, uuid.Nil, err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, uuid.Nil, err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, data, nil)
	return bytes.NewReader(ciphertext), keyID, nil
}

func (s *EncryptionService) DecryptFile(ctx context.Context, keyID uuid.UUID, cipherReader io.Reader) (io.Reader, error) {
	var encryptedDEK string
	err := s.pool.QueryRow(ctx, `SELECT encrypted_dek FROM encryption_keys WHERE id = $1`, keyID).Scan(&encryptedDEK)
	if err != nil {
		return nil, fmt.Errorf("encryption: get key: %w", err)
	}
	dek, err := s.decryptWithKEK(encryptedDEK)
	if err != nil {
		return nil, err
	}
	ciphertext, err := io.ReadAll(cipherReader)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(dek)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("encryption: ciphertext too short")
	}
	nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, fmt.Errorf("encryption: decrypt: %w", err)
	}
	return bytes.NewReader(plaintext), nil
}

func (s *EncryptionService) encryptWithKEK(data []byte) (string, error) {
	block, err := aes.NewCipher(s.kek)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(aesGCM.Seal(nonce, nonce, data, nil)), nil
}

func (s *EncryptionService) decryptWithKEK(encoded string) ([]byte, error) {
	ct, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(s.kek)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := aesGCM.NonceSize()
	if len(ct) < ns {
		return nil, fmt.Errorf("ciphertext too short")
	}
	return aesGCM.Open(nil, ct[:ns], ct[ns:], nil)
}
