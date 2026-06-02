package migrations_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestM149_MigrationFilesExist(t *testing.T) {
	dir := migrationDir(t)

	for _, suffix := range []string{".up.sql", ".down.sql"} {
		path := filepath.Join(dir, "149_face_clusters_embedding_512"+suffix)
		t.Run(filepath.Base(path), func(t *testing.T) {
			info, err := os.Stat(path)
			require.NoError(t, err, "migration file must exist")
			assert.Greater(t, info.Size(), int64(0), "migration must not be empty")
		})
	}
}

func TestM149_UpWidensFaceEmbeddingTo512(t *testing.T) {
	dir := migrationDir(t)

	original, err := os.ReadFile(filepath.Join(dir, "017_pgvector_face_clusters.up.sql"))
	require.NoError(t, err)
	assert.Contains(t, string(original), "embedding      vector(128) NOT NULL",
		"committed migration 017 must remain historical; the fix is append-only")

	body, err := os.ReadFile(filepath.Join(dir, "149_face_clusters_embedding_512.up.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_face_clusters_embedding_hnsw")
	assert.Contains(t, content, "TRUNCATE TABLE face_clusters",
		"128-d derived face rows must be discarded before widening")
	assert.Contains(t, content, "ALTER TABLE face_clusters ALTER COLUMN embedding TYPE vector(512)")
	assert.Contains(t, content, "ALTER COLUMN source SET DEFAULT 'insightface'")
	assert.Contains(t, content, "CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw")
	assert.Contains(t, content, "vector_cosine_ops")
}

func TestM149_DownNarrowsFaceEmbeddingWithDerivedDataDrop(t *testing.T) {
	dir := migrationDir(t)
	body, err := os.ReadFile(filepath.Join(dir, "149_face_clusters_embedding_512.down.sql"))
	require.NoError(t, err)
	content := string(body)

	assert.Contains(t, content, "DROP INDEX IF EXISTS idx_face_clusters_embedding_hnsw")
	assert.Contains(t, content, "TRUNCATE TABLE face_clusters",
		"512-d derived face rows must be discarded before narrowing")
	assert.Contains(t, content, "ALTER TABLE face_clusters ALTER COLUMN embedding TYPE vector(128)")
	assert.Contains(t, content, "ALTER COLUMN source SET DEFAULT 'gemini'")
	assert.Contains(t, content, "CREATE INDEX IF NOT EXISTS idx_face_clusters_embedding_hnsw")
}
