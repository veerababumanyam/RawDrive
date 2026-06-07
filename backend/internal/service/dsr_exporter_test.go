package service

// dsr_exporter_test.go — slice 3k (B-X1).
//
// Two layers of coverage:
//
//  1. TestDSRExporter_IncludesFaceData (DB-backed): the real DSRExporter,
//     wired to a real *ai.FaceRepo, resolves a workspace user's workspace and
//     includes that workspace's face-cluster metadata in the access bundle —
//     and proves the bundle carries cluster/bbox/quality/source fields but
//     NEVER the raw embedding.
//
//  2. TestDSRExporter_FaceData_Unit (no DB): with a fake FaceExportSource and
//     no DB rows, asserts the bundle always contains a face_clusters key (a
//     present-but-empty list for visitor-only subjects), so the DSRService
//     marshals a complete bundle even when the subject holds no faces.

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/ai"
)

func TestDSRExporter_IncludesFaceData(t *testing.T) {
	pool := getServiceTestPool(t)
	ctx := context.Background()

	// Subject is a workspace owner.
	userID := uuid.New()
	_, err := pool.Exec(ctx,
		`INSERT INTO users (id, email, display_name)
		 VALUES ($1, $2, 'DSR Subject')`,
		userID, "dsr-subject-"+userID.String()[:8]+"@example.test")
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, userID)
	})

	workspaceID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO workspaces (id, name, owner_id) VALUES ($1, $2, $3)`,
		workspaceID, "DSR Export WS "+workspaceID.String()[:8], userID)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM workspaces WHERE id = $1`, workspaceID)
	})

	assetID := uuid.New()
	_, err = pool.Exec(ctx,
		`INSERT INTO assets (id, workspace_id, filename, content_type, size_bytes, storage_key, status)
		 VALUES ($1, $2, $3, 'image/jpeg', 100, $4, 'ready')`,
		assetID, workspaceID, "Wedding (7).jpg",
		workspaceID.String()+"/"+assetID.String()+"/original.jpg")
	require.NoError(t, err)

	faceRepo := ai.NewFaceRepo(pool)
	clusterLabel := uuid.New()
	require.NoError(t, faceRepo.StoreFaces(ctx, []*ai.FaceCluster{{
		WorkspaceID:  workspaceID,
		AssetID:      assetID,
		FaceIndex:    0,
		BoundingBox:  ai.BoundingBox{X: 0.11, Y: 0.22, W: 0.33, H: 0.44},
		Embedding:    exporterEmbedding(),
		ClusterLabel: &clusterLabel,
		ClusterName:  "Bride",
		Confidence:   0.97,
		Source:       "insightface",
	}}))

	exporter := NewDSRExporter(pool, faceRepo)
	bundle, err := exporter.ExportSubjectData(ctx, "dsr-subject@example.test", &userID)
	require.NoError(t, err)

	// Round-trip through JSON the way DSRService.ProcessAccessRequest does,
	// so we assert what a subject actually receives.
	raw, err := json.Marshal(bundle)
	require.NoError(t, err)

	var decoded struct {
		FaceClusters []ai.FaceExportRecord `json:"face_clusters"`
	}
	require.NoError(t, json.Unmarshal(raw, &decoded))
	require.Len(t, decoded.FaceClusters, 1, "the workspace's single face row must be exported")

	rec := decoded.FaceClusters[0]
	require.Equal(t, assetID, rec.AssetID)
	require.NotNil(t, rec.ClusterLabel)
	require.Equal(t, clusterLabel, *rec.ClusterLabel)
	require.Equal(t, "Bride", rec.ClusterName)
	require.InDelta(t, 0.97, rec.Confidence, 0.0001, "quality/confidence must be exported")
	require.Equal(t, "insightface", rec.Source, "detection source must be exported")
	require.InDelta(t, 0.11, rec.BoundingBox.X, 0.0001, "bounding box must be exported")

	// The raw biometric embedding must NEVER appear in the export bundle.
	require.NotContains(t, string(raw), `"embedding"`,
		"face export must not leak the raw embedding vector")
}

// TestDSRExporter_FaceData_Unit pins the bundle shape without a DB: the
// face_clusters key is always present (empty list when the subject holds no
// faces), so DSRService produces a complete bundle for every subject.
func TestDSRExporter_FaceData_Unit(t *testing.T) {
	exporter := NewDSRExporter(nil, &fakeFaceExportSource{})

	// Visitor-only subject (no userID) — no workspace, empty face list, no DB
	// access attempted.
	bundle, err := exporter.ExportSubjectData(context.Background(), "visitor@example.test", nil)
	require.NoError(t, err)

	faces, ok := bundle["face_clusters"]
	require.True(t, ok, "bundle must always carry a face_clusters key")
	list, ok := faces.([]ai.FaceExportRecord)
	require.True(t, ok)
	require.Empty(t, list, "a visitor-only subject holds no workspace face data")
	require.Equal(t, "visitor@example.test", bundle["subject_email"])
}

type fakeFaceExportSource struct {
	recs []ai.FaceExportRecord
	err  error
}

func (f *fakeFaceExportSource) ListFaceDataForExport(_ context.Context, _ uuid.UUID) ([]ai.FaceExportRecord, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.recs, nil
}

func exporterEmbedding() []float32 {
	e := make([]float32, 512)
	e[0] = 0.5
	e[1] = 1
	return e
}
