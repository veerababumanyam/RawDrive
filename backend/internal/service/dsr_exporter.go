package service

// dsr_exporter.go — slice 3k (B-X1): concrete SubjectDataExporter for the
// DSR "access" (data-portability) path.
//
// The DSRService (dsr_service.go) declares the SubjectDataExporter interface
// but, until this file landed, NO production implementation was wired — only
// test fakes existed, so a real "access" DSR failed with "exporter not
// configured". The erasure path (dsr_eraser.go) was implemented and already
// removes a subject's biometric face rows (via assets → face_clusters FK
// cascade), but the *portability* obligation for that special-category data
// was neither implemented nor tested.
//
// This exporter builds the access bundle. For a workspace user (userID set)
// it resolves the workspace(s) they own or are a member of and includes the
// face-cluster metadata held there as the portability projection
// (FaceExportRecord: cluster identity, bbox, quality/confidence, source,
// provenance, timestamps — NEVER raw embeddings or image bytes). Visitor-only
// subjects (email, no users row) own no workspace and therefore carry no
// face-cluster data of their own.
//
// The bundle is intentionally a flat map[string]any so DSRService can marshal
// it verbatim. Additional subject data sources (galleries, proofing, consent,
// audit) can be folded into the same map by future slices; this slice closes
// the biometric gap the 3k audit flagged.

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rawdrive/backend/internal/ai"
)

// FaceExportSource is the narrow surface the exporter needs to pull a
// workspace's face data. *ai.FaceRepo satisfies it. Declared here so tests can
// inject a fake without a live pgvector DB.
type FaceExportSource interface {
	ListFaceDataForExport(ctx context.Context, workspaceID uuid.UUID) ([]ai.FaceExportRecord, error)
}

// DSRExporter is the production SubjectDataExporter.
type DSRExporter struct {
	pool  *pgxpool.Pool
	faces FaceExportSource
}

// NewDSRExporter builds the exporter. pool resolves the subject → workspace
// mapping; faces pulls the per-workspace biometric portability projection.
func NewDSRExporter(pool *pgxpool.Pool, faces FaceExportSource) *DSRExporter {
	return &DSRExporter{pool: pool, faces: faces}
}

// ExportSubjectData implements SubjectDataExporter. It returns a bundle that
// always carries the subject identity and, for workspace users, the
// face-cluster metadata held across their workspace(s).
func (e *DSRExporter) ExportSubjectData(ctx context.Context, email string, userID *uuid.UUID) (map[string]any, error) {
	bundle := map[string]any{
		"subject_email": email,
	}
	if userID != nil {
		bundle["subject_user_id"] = userID.String()
	}

	// Biometric (special-category) portability: face-cluster metadata held in
	// the subject's workspace(s). Visitor-only subjects own no workspace, so
	// this is empty for them.
	faceData := make([]ai.FaceExportRecord, 0)
	if userID != nil && e.faces != nil {
		workspaceIDs, err := e.subjectWorkspaceIDs(ctx, *userID)
		if err != nil {
			return nil, fmt.Errorf("dsr export: resolve subject workspaces: %w", err)
		}
		for _, wsID := range workspaceIDs {
			recs, err := e.faces.ListFaceDataForExport(ctx, wsID)
			if err != nil {
				return nil, fmt.Errorf("dsr export: face data for workspace %s: %w", wsID, err)
			}
			faceData = append(faceData, recs...)
		}
	}
	bundle["face_clusters"] = faceData

	return bundle, nil
}

// subjectWorkspaceIDs returns the distinct workspaces a user owns or is a
// member of. The two sources are unioned so a user who is both owner and a
// member row of the same workspace is counted once.
func (e *DSRExporter) subjectWorkspaceIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	rows, err := e.pool.Query(ctx, `
		SELECT id FROM workspaces WHERE owner_id = $1
		UNION
		SELECT workspace_id FROM workspace_members WHERE user_id = $1`,
		userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
