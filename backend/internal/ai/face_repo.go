package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

// FaceRepo handles face_clusters table operations.
type FaceRepo struct {
	pool *pgxpool.Pool
}

// NewFaceRepo creates a new FaceRepo.
func NewFaceRepo(pool *pgxpool.Pool) *FaceRepo {
	return &FaceRepo{pool: pool}
}

// StoreFaces inserts multiple face detections in a single batch.
func (r *FaceRepo) StoreFaces(ctx context.Context, faces []*FaceCluster) error {
	if len(faces) == 0 {
		return nil
	}

	batch := &pgx.Batch{}
	for _, fc := range faces {
		if fc.ID == uuid.Nil {
			fc.ID = uuid.New()
		}
		now := time.Now()
		fc.CreatedAt = now
		fc.UpdatedAt = now

		bboxJSON, _ := json.Marshal(fc.BoundingBox)

		batch.Queue(
			`INSERT INTO face_clusters (id, workspace_id, asset_id, gallery_id, face_index,
			 bounding_box, embedding, cluster_label, cluster_name, confidence, source,
			 created_at, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
			fc.ID, fc.WorkspaceID, fc.AssetID, fc.GalleryID, fc.FaceIndex,
			bboxJSON, pgvector.NewVector(fc.Embedding),
			fc.ClusterLabel, fc.ClusterName, fc.Confidence, fc.Source,
			fc.CreatedAt, fc.UpdatedAt,
		)
	}

	br := r.pool.SendBatch(ctx, batch)
	defer br.Close()

	for range faces {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("face repo: store batch: %w", err)
		}
	}
	return nil
}

// GetFacesByAsset returns all faces detected in a given asset.
func (r *FaceRepo) GetFacesByAsset(ctx context.Context, assetID uuid.UUID) ([]*FaceCluster, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters WHERE asset_id = $1 ORDER BY face_index`, assetID)
	if err != nil {
		return nil, fmt.Errorf("face repo: get by asset: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// FindSimilarFaces performs pgvector cosine distance search.
// Returns faces with cosine similarity >= threshold.
func (r *FaceRepo) FindSimilarFaces(ctx context.Context, embedding []float32, workspaceID uuid.UUID, threshold float64, limit int) ([]*FaceCluster, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters
		 WHERE workspace_id = $1
		   AND cluster_label IS NOT NULL
		   AND (embedding <=> $2) <= $3
		 ORDER BY embedding <=> $2 ASC
		 LIMIT $4`,
		workspaceID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// FaceMatch is a FaceCluster row paired with the cosine similarity
// between the query embedding and the face's embedding. Similarity =
// 1 - cosine_distance, so values are in [-1, 1] with 1 = identical.
// Used by SearchByFace (Photo Search) where the cluster decision
// depends on similarity scores across multiple candidates, not on
// any one row in isolation.
type FaceMatch struct {
	Face       *FaceCluster
	Similarity float64
}

// FindSimilarFacesScored is the same as FindSimilarFaces but also
// returns the cosine similarity for each row. Use this when you need
// to rank or vote across the result set (Photo Search), not just
// take the top-1 row. Same workspace + cluster_label filter so
// every returned face has a non-nil ClusterLabel.
func (r *FaceRepo) FindSimilarFacesScored(ctx context.Context, embedding []float32, workspaceID uuid.UUID, threshold float64, limit int) ([]FaceMatch, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at,
		 (embedding <=> $2) AS cos_distance
		 FROM face_clusters
		 WHERE workspace_id = $1
		   AND cluster_label IS NOT NULL
		   AND (embedding <=> $2) <= $3
		 ORDER BY embedding <=> $2 ASC
		 LIMIT $4`,
		workspaceID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar scored: %w", err)
	}
	defer rows.Close()

	matches := make([]FaceMatch, 0, limit)
	for rows.Next() {
		var fc FaceCluster
		var bboxJSON []byte
		var distance float64
		if err := rows.Scan(
			&fc.ID, &fc.WorkspaceID, &fc.AssetID, &fc.GalleryID, &fc.FaceIndex,
			&bboxJSON, &fc.ClusterLabel, &fc.ClusterName, &fc.Confidence,
			&fc.Source, &fc.CreatedAt, &fc.UpdatedAt, &distance,
		); err != nil {
			return nil, fmt.Errorf("face repo: scan scored: %w", err)
		}
		_ = json.Unmarshal(bboxJSON, &fc.BoundingBox)
		matches = append(matches, FaceMatch{
			Face:       &fc,
			Similarity: 1.0 - distance,
		})
	}
	return matches, rows.Err()
}

// FindSimilarFacesInGallery matches an embedding against faces scoped to a single gallery.
// Used by FaceID gallery entry (GAL-FR-107/108): a client uploads a selfie embedding,
// we return matching asset IDs that appear only inside this gallery.
func (r *FaceRepo) FindSimilarFacesInGallery(ctx context.Context, embedding []float32, galleryID uuid.UUID, threshold float64, limit int) ([]*FaceCluster, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, asset_id, gallery_id, face_index, bounding_box,
		 cluster_label, cluster_name, confidence, source, created_at, updated_at
		 FROM face_clusters
		 WHERE gallery_id = $1
		   AND (embedding <=> $2) <= $3
		 ORDER BY embedding <=> $2 ASC
		 LIMIT $4`,
		galleryID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar in gallery: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

// FindSimilarFacesInGalleryScored is the gallery-scoped variant of
// FindSimilarFacesScored. Same return shape (FaceMatch with cosine
// similarity), restricted to faces whose asset is in the supplied
// gallery via gallery_assets, with a non-NULL cluster_label.
//
// Why JOIN through gallery_assets instead of filtering on
// face_clusters.gallery_id: that column is denormalized and frequently
// NULL when the asset was detected via the thumbnail-worker auto-
// enqueue path (it passes nil for the gallery hint). The People-tab
// queries use the same JOIN for the same reason — see
// face_repo.ListClusterAssetIDsInGallery.
//
// Only clustered faces participate (cluster_label IS NOT NULL) — the
// Photo Search caller needs cluster identity to vote across candidates,
// so unclustered noise faces would be useless even if they matched.
func (r *FaceRepo) FindSimilarFacesInGalleryScored(ctx context.Context, embedding []float32, galleryID uuid.UUID, threshold float64, limit int) ([]FaceMatch, error) {
	maxDistance := 1.0 - threshold

	rows, err := r.pool.Query(ctx,
		`SELECT fc.id, fc.workspace_id, fc.asset_id, fc.gallery_id, fc.face_index, fc.bounding_box,
		 fc.cluster_label, fc.cluster_name, fc.confidence, fc.source, fc.created_at, fc.updated_at,
		 (fc.embedding <=> $2) AS cos_distance
		 FROM face_clusters fc
		 INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id
		 WHERE ga.gallery_id = $1
		   AND fc.cluster_label IS NOT NULL
		   AND (fc.embedding <=> $2) <= $3
		 ORDER BY fc.embedding <=> $2 ASC
		 LIMIT $4`,
		galleryID, pgvector.NewVector(embedding), maxDistance, limit)
	if err != nil {
		return nil, fmt.Errorf("face repo: find similar in gallery scored: %w", err)
	}
	defer rows.Close()

	matches := make([]FaceMatch, 0, limit)
	for rows.Next() {
		var fc FaceCluster
		var bboxJSON []byte
		var distance float64
		if err := rows.Scan(
			&fc.ID, &fc.WorkspaceID, &fc.AssetID, &fc.GalleryID, &fc.FaceIndex,
			&bboxJSON, &fc.ClusterLabel, &fc.ClusterName, &fc.Confidence,
			&fc.Source, &fc.CreatedAt, &fc.UpdatedAt, &distance,
		); err != nil {
			return nil, fmt.Errorf("face repo: scan gallery scored: %w", err)
		}
		_ = json.Unmarshal(bboxJSON, &fc.BoundingBox)
		matches = append(matches, FaceMatch{Face: &fc, Similarity: 1.0 - distance})
	}
	return matches, rows.Err()
}

// UpdateClusterAssignment sets cluster_label and cluster_name for a face.
func (r *FaceRepo) UpdateClusterAssignment(ctx context.Context, faceID, clusterLabel uuid.UUID, clusterName string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE face_clusters SET cluster_label = $2, cluster_name = $3, updated_at = now()
		 WHERE id = $1`, faceID, clusterLabel, clusterName)
	if err != nil {
		return fmt.Errorf("face repo: update cluster: %w", err)
	}
	return nil
}

// ClusterAssignment is the resolved outcome of FindOrAssignCluster: the
// canonical cluster label a face was assigned to and the cluster's display
// name (empty for a freshly-minted cluster, the matched cluster's name when a
// similar face already existed).
type ClusterAssignment struct {
	Label uuid.UUID
	Name  string
}

// FindOrAssignCluster atomically performs the no-match → new-cluster decision
// that ClusterFaces used to do non-transactionally. It runs the whole
// find-or-create inside ONE transaction guarded by a Postgres advisory
// transaction lock keyed on the workspace, so two concurrent first-faces of the
// same brand-new person cannot both observe "no cluster" and mint DIFFERENT
// labels (issue #285). The lock is held only for the sub-millisecond cluster
// decision + the single UPDATE — the expensive ML detection happens earlier in
// DetectAndStore, well outside this lock, so the worker is never serialized.
//
// Scope rationale: the lock is keyed on workspace_id (not workspace+embedding
// bucket). A coarse embedding bucket cannot GUARANTEE that two faces of the
// same person hash to the same bucket without a learned LSH; any bucket
// false-negative would re-open the exact duplicate-cluster split this fixes.
// Workspace scope guarantees convergence and only serializes the tiny DB-side
// decision, satisfying the NFR ("narrow ... to avoid serializing the whole
// worker") — the worker's heavy work is unaffected.
//
// Behaviour mirrors the previous inline logic exactly: a match above threshold
// adopts the matched cluster's canonical (alias-resolved) label + name; no
// match mints a new uuid with an empty name. Alias resolution and the manual
// MergeClusters transactional path are unchanged.
func (r *FaceRepo) FindOrAssignCluster(ctx context.Context, faceID uuid.UUID, embedding []float32, workspaceID uuid.UUID, threshold float64) (ClusterAssignment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ClusterAssignment{}, fmt.Errorf("face repo: begin find-or-assign: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	// Serialize concurrent first-face assignments within this workspace. The
	// lock is released automatically on Commit/Rollback (xact-scoped). Keyed on
	// a stable hashtextextended of the workspace UUID so the key space is the
	// whole int8 range and distinct workspaces almost never collide.
	if _, err := tx.Exec(ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
		workspaceID.String()); err != nil {
		return ClusterAssignment{}, fmt.Errorf("face repo: acquire cluster lock: %w", err)
	}

	// Re-run the similarity search INSIDE the lock so a concurrent caller that
	// just committed its new cluster is visible here.
	maxDistance := 1.0 - threshold
	var matchLabel *uuid.UUID
	var matchName string
	err = tx.QueryRow(ctx,
		`SELECT cluster_label, cluster_name
		   FROM face_clusters
		  WHERE workspace_id = $1
		    AND cluster_label IS NOT NULL
		    AND (embedding <=> $2) <= $3
		  ORDER BY embedding <=> $2 ASC
		  LIMIT 1`,
		workspaceID, pgvector.NewVector(embedding), maxDistance,
	).Scan(&matchLabel, &matchName)
	if err != nil && err != pgx.ErrNoRows {
		return ClusterAssignment{}, fmt.Errorf("face repo: find similar (locked): %w", err)
	}

	var assignment ClusterAssignment
	if err != pgx.ErrNoRows && matchLabel != nil {
		// Existing cluster: adopt its canonical label + name (alias-resolved
		// inside the same tx so a concurrently-committed merge is honoured).
		canonical, rerr := r.resolveClusterLabelTx(ctx, tx, workspaceID, *matchLabel)
		if rerr != nil {
			return ClusterAssignment{}, rerr
		}
		assignment = ClusterAssignment{Label: canonical, Name: matchName}
	} else {
		// No match → mint a brand-new cluster label.
		assignment = ClusterAssignment{Label: uuid.New(), Name: ""}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE face_clusters SET cluster_label = $2, cluster_name = $3, updated_at = now()
		 WHERE id = $1`, faceID, assignment.Label, assignment.Name); err != nil {
		return ClusterAssignment{}, fmt.Errorf("face repo: assign cluster (locked): %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return ClusterAssignment{}, fmt.Errorf("face repo: commit find-or-assign: %w", err)
	}
	return assignment, nil
}

// resolveClusterLabelTx is the tx-scoped twin of ResolveClusterLabel: it
// follows manual face identity aliases to the canonical label inside the caller's
// transaction so the lock's snapshot governs the resolution. The standalone
// ResolveClusterLabel (pool-scoped) is unchanged.
func (r *FaceRepo) resolveClusterLabelTx(ctx context.Context, tx pgx.Tx, workspaceID, label uuid.UUID) (uuid.UUID, error) {
	var out uuid.UUID
	err := tx.QueryRow(ctx,
		`WITH RECURSIVE chain(alias_label, canonical_label, depth) AS (
			SELECT alias_label, canonical_label, 1
			FROM face_identity_aliases
			WHERE workspace_id = $1 AND alias_label = $2
			UNION ALL
			SELECT a.alias_label, a.canonical_label, chain.depth + 1
			FROM face_identity_aliases a
			INNER JOIN chain ON a.alias_label = chain.canonical_label
			WHERE a.workspace_id = $1 AND chain.depth < 8
		)
		SELECT canonical_label FROM chain ORDER BY depth DESC LIMIT 1`,
		workspaceID, label).Scan(&out)
	if err == pgx.ErrNoRows {
		return label, nil
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("face repo: resolve cluster label (tx): %w", err)
	}
	return out, nil
}

// ListClusters returns cluster summaries for a workspace, optionally filtered by gallery.
func (r *FaceRepo) ListClusters(ctx context.Context, workspaceID uuid.UUID, galleryID *uuid.UUID) ([]*ClusterSummary, error) {
	// 2026-05-18: gallery scope resolves through gallery_assets (the source
	// of truth for asset → gallery membership), not through the denormalized
	// face_clusters.gallery_id column. The denormalized column is unreliable —
	// it's populated only when the detection job is enqueued with a gallery
	// hint, but the ThumbnailWorker auto-enqueue path (PR-2b) doesn't know
	// which gallery an asset belongs to and passes nil, leaving the column
	// NULL. With gallery_assets as the source of truth a single asset shared
	// across multiple galleries also surfaces the same person in each
	// gallery's People tab, which is the correct behavior.
	// Two parallel correlated subqueries pull the sample asset id AND its
	// bounding box from the SAME row (the highest-confidence face for the
	// cluster). The `, fc2.id ASC` secondary sort ties the two subqueries
	// to the same row even when multiple faces share the top confidence —
	// without it the asset/bbox could come from different rows and the
	// cropped cover would highlight the wrong face on the cover image.
	// SampleBBox was previously never selected, so the front-end's
	// computeCropStyle always saw {x:0,y:0,w:0,h:0} and fell back to
	// object-position:center — the People-tab cover thumbnails rendered
	// the whole photo instead of the face.
	query := `WITH RECURSIVE alias_chain(alias_label, canonical_label, depth) AS (
			SELECT alias_label, canonical_label, 1
			FROM face_identity_aliases
			WHERE workspace_id = $1
			UNION ALL
			SELECT alias_chain.alias_label, a.canonical_label, alias_chain.depth + 1
			FROM alias_chain
			INNER JOIN face_identity_aliases a ON a.alias_label = alias_chain.canonical_label
			WHERE a.workspace_id = $1 AND alias_chain.depth < 8
		),
		resolved_aliases AS (
			SELECT DISTINCT ON (alias_label) alias_label, canonical_label
			FROM alias_chain
			ORDER BY alias_label, depth DESC
		),
		scoped_faces AS (
			SELECT fc.id, fc.asset_id, fc.bounding_box, fc.cluster_label, fc.cluster_name,
			       fc.confidence, COALESCE(ra.canonical_label, fc.cluster_label) AS resolved_label
			FROM face_clusters fc
			LEFT JOIN resolved_aliases ra ON ra.alias_label = fc.cluster_label`

	args := []any{workspaceID}
	if galleryID != nil {
		query += ` INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id AND ga.gallery_id = $2`
		args = append(args, *galleryID)
	}
	query += ` WHERE fc.workspace_id = $1
		   AND fc.cluster_label IS NOT NULL
		),
		clustered AS (
		SELECT resolved_label,
		       (ARRAY_AGG(cluster_name ORDER BY (cluster_label = resolved_label) DESC, confidence DESC, id ASC))[1] AS cluster_name,
		       COUNT(*) AS face_count,
		       COUNT(DISTINCT asset_id) AS asset_count,
		       (ARRAY_AGG(asset_id ORDER BY confidence DESC, id ASC))[1] AS sample_asset_id,
		       (ARRAY_AGG(bounding_box ORDER BY confidence DESC, id ASC))[1] AS sample_bounding_box
		FROM scoped_faces
		GROUP BY resolved_label
		)
		SELECT clustered.resolved_label,
		       clustered.cluster_name,
		       clustered.face_count,
		       clustered.asset_count,
		       clustered.sample_asset_id,
		       clustered.sample_bounding_box,
		       COALESCE(fic.contact_id, '00000000-0000-0000-0000-000000000000'::uuid) AS contact_id,
		       COALESCE(contact.name, '') AS contact_name,
		       contact.email,
		       contact.phone,
		       fic.updated_at
		FROM clustered
		LEFT JOIN face_identity_contacts fic
		  ON fic.workspace_id = $1 AND fic.cluster_label = clustered.resolved_label
		LEFT JOIN contacts contact
		  ON contact.id = fic.contact_id AND contact.workspace_id = $1
		ORDER BY clustered.face_count DESC`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("face repo: list clusters: %w", err)
	}
	defer rows.Close()

	var clusters []*ClusterSummary
	for rows.Next() {
		var cs ClusterSummary
		var bboxBytes []byte
		var contactID uuid.UUID
		var contactName string
		var contactEmail *string
		var contactPhone *string
		var linkedAt *time.Time
		if err := rows.Scan(
			&cs.ClusterLabel, &cs.ClusterName, &cs.FaceCount, &cs.AssetCount, &cs.SampleAssetID, &bboxBytes,
			&contactID, &contactName, &contactEmail, &contactPhone, &linkedAt,
		); err != nil {
			return nil, fmt.Errorf("face repo: scan cluster: %w", err)
		}
		// JSONB stored as BoundingBox struct by StoreFaces (json.Marshal of
		// the struct). Decode back into the struct field; ignore decode
		// errors — a malformed row shouldn't blank out the whole list,
		// just leaves SampleBBox at zero and the UI fall back to centered
		// crop, which is the same behavior as before this column was added.
		if len(bboxBytes) > 0 {
			_ = json.Unmarshal(bboxBytes, &cs.SampleBBox)
		}
		if contactID != uuid.Nil {
			cs.LinkedContact = &FaceIdentityContactSummary{
				ContactID: contactID,
				Name:      contactName,
				Email:     contactEmail,
				Phone:     contactPhone,
				LinkedAt:  linkedAt,
			}
		}
		clusters = append(clusters, &cs)
	}
	return clusters, rows.Err()
}

// GetFaceIndexStatus summarizes upload/index state for a gallery owned by the
// caller's workspace.
func (r *FaceRepo) GetFaceIndexStatus(ctx context.Context, workspaceID, galleryID uuid.UUID) (*FaceIndexStatus, error) {
	var galleryExists bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM galleries
			WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
		)`,
		galleryID, workspaceID,
	).Scan(&galleryExists); err != nil {
		return nil, fmt.Errorf("face repo: check gallery status ownership: %w", err)
	}
	if !galleryExists {
		return nil, ErrGalleryNotFound
	}

	status := &FaceIndexStatus{GalleryID: galleryID}
	if err := r.pool.QueryRow(ctx, `
		WITH gallery_photos AS (
			SELECT a.id, a.status, a.thumbnail_urls
			FROM gallery_assets ga
			JOIN assets a ON a.id = ga.asset_id AND a.deleted_at IS NULL
			WHERE ga.gallery_id = $1
			  AND a.workspace_id = $2
			  AND lower(a.content_type) LIKE 'image/%'
		)
		SELECT
		  COUNT(*)::int AS uploaded_photos,
		  COUNT(*) FILTER (
		    WHERE status = 'ready' AND thumbnail_urls IS NOT NULL AND thumbnail_urls <> '{}'::jsonb
		  )::int AS indexable_photos,
		  COUNT(fc.id)::int AS indexed_faces,
		  COUNT(DISTINCT fc.asset_id)::int AS indexed_photos
		FROM gallery_photos gp
		LEFT JOIN face_clusters fc ON fc.asset_id = gp.id AND fc.workspace_id = $2
	`, galleryID, workspaceID).Scan(
		&status.UploadedPhotos,
		&status.IndexablePhotos,
		&status.IndexedFaces,
		&status.IndexedPhotos,
	); err != nil {
		return nil, fmt.Errorf("face repo: face index status: %w", err)
	}

	clusters, err := r.ListClusters(ctx, workspaceID, &galleryID)
	if err != nil {
		return nil, err
	}
	status.IndexedPeople = len(clusters)
	switch {
	case status.UploadedPhotos == 0:
		status.Status = "empty"
	case status.IndexedFaces == 0 || status.IndexedPeople == 0:
		status.Status = "empty"
	default:
		status.Status = "ready"
	}
	return status, nil
}

// GetClusterContact returns the CRM contact linked to a canonical face identity.
func (r *FaceRepo) GetClusterContact(ctx context.Context, workspaceID, clusterLabel uuid.UUID) (*FaceIdentityContactSummary, error) {
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return nil, err
	}
	return r.getClusterContact(ctx, workspaceID, canonical)
}

func (r *FaceRepo) getClusterContact(ctx context.Context, workspaceID, canonicalLabel uuid.UUID) (*FaceIdentityContactSummary, error) {
	var out FaceIdentityContactSummary
	err := r.pool.QueryRow(ctx,
		`SELECT c.id, c.name, c.email, c.phone, fic.updated_at
		 FROM face_identity_contacts fic
		 JOIN contacts c ON c.id = fic.contact_id AND c.workspace_id = fic.workspace_id
		 WHERE fic.workspace_id = $1 AND fic.cluster_label = $2`,
		workspaceID, canonicalLabel,
	).Scan(&out.ContactID, &out.Name, &out.Email, &out.Phone, &out.LinkedAt)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("face repo: get cluster contact: %w", err)
	}
	return &out, nil
}

// LinkClusterContact links a canonical face identity to an existing workspace
// contact. galleryID is provenance only and may be nil.
func (r *FaceRepo) LinkClusterContact(ctx context.Context, workspaceID, clusterLabel, contactID uuid.UUID, galleryID *uuid.UUID) (*FaceIdentityContactSummary, error) {
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return nil, err
	}

	var clusterExists bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM face_clusters
			WHERE workspace_id = $1 AND cluster_label = $2
		)`,
		workspaceID, canonical,
	).Scan(&clusterExists); err != nil {
		return nil, fmt.Errorf("face repo: check cluster contact link cluster: %w", err)
	}
	if !clusterExists {
		return nil, ErrClusterNotFound
	}

	var contactExists bool
	if err := r.pool.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM contacts
			WHERE id = $1 AND workspace_id = $2
		)`,
		contactID, workspaceID,
	).Scan(&contactExists); err != nil {
		return nil, fmt.Errorf("face repo: check cluster contact link contact: %w", err)
	}
	if !contactExists {
		return nil, ErrContactNotFound
	}

	if galleryID != nil {
		var galleryExists bool
		if err := r.pool.QueryRow(ctx,
			`SELECT EXISTS (
				SELECT 1 FROM galleries
				WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
			)`,
			*galleryID, workspaceID,
		).Scan(&galleryExists); err != nil {
			return nil, fmt.Errorf("face repo: check cluster contact link gallery: %w", err)
		}
		if !galleryExists {
			return nil, ErrGalleryNotFound
		}
	}

	var galleryArg any
	if galleryID != nil {
		galleryArg = *galleryID
	}
	if _, err := r.pool.Exec(ctx,
		`INSERT INTO face_identity_contacts (workspace_id, cluster_label, contact_id, gallery_id, updated_at)
		 VALUES ($1, $2, $3, $4, now())
		 ON CONFLICT (workspace_id, cluster_label)
		 DO UPDATE SET contact_id = EXCLUDED.contact_id,
		               gallery_id = EXCLUDED.gallery_id,
		               updated_at = now()`,
		workspaceID, canonical, contactID, galleryArg,
	); err != nil {
		return nil, fmt.Errorf("face repo: link cluster contact: %w", err)
	}
	return r.getClusterContact(ctx, workspaceID, canonical)
}

// UnlinkClusterContact clears the CRM contact link for a face identity.
func (r *FaceRepo) UnlinkClusterContact(ctx context.Context, workspaceID, clusterLabel uuid.UUID) error {
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx,
		`DELETE FROM face_identity_contacts WHERE workspace_id = $1 AND cluster_label = $2`,
		workspaceID, canonical,
	)
	if err != nil {
		return fmt.Errorf("face repo: unlink cluster contact: %w", err)
	}
	return nil
}

// ListClusterAssetIDs returns distinct asset IDs that contain at least one
// face assigned to the given cluster label, scoped to the workspace so
// cross-workspace leakage is impossible at the DB layer.
//
// Used by the face filter endpoint (E8-S3 "FaceID filter") and the smart
// album smart-filter evaluator to resolve face_cluster_label → asset list.
func (r *FaceRepo) ListClusterAssetIDs(ctx context.Context, workspaceID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return nil, err
	}
	labels, err := r.clusterLabelsForCanonical(ctx, workspaceID, canonical)
	if err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT asset_id
		 FROM face_clusters
		 WHERE workspace_id = $1 AND cluster_label = ANY($2)
		 ORDER BY asset_id`,
		workspaceID, labels)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster assets: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("face repo: scan cluster asset: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListClusterAssetIDsInGallery is the gallery-scoped variant of
// ListClusterAssetIDs. It returns DISTINCT asset_ids for the cluster
// label, filtered to a single gallery. Used by the public People tab
// (PR-3b) to ensure a guest viewer of one gallery cannot enumerate the
// same person's photos across OTHER galleries in the workspace —
// cross-gallery leakage is a real concern when one person (e.g. a
// vendor photographer) attends multiple weddings the studio hosts.
func (r *FaceRepo) ListClusterAssetIDsInGallery(ctx context.Context, workspaceID, galleryID, clusterLabel uuid.UUID) ([]uuid.UUID, error) {
	// JOIN through gallery_assets — same reason as ListClusters above:
	// face_clusters.gallery_id is denormalized and frequently NULL when
	// the asset was detected via the auto-enqueue path. gallery_assets
	// is the source of truth.
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return nil, err
	}
	labels, err := r.clusterLabelsForCanonical(ctx, workspaceID, canonical)
	if err != nil {
		return nil, err
	}
	rows, err := r.pool.Query(ctx,
		`SELECT DISTINCT fc.asset_id
		 FROM face_clusters fc
		 INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id
		 WHERE fc.workspace_id = $1
		   AND ga.gallery_id = $2
		   AND fc.cluster_label = ANY($3)
		 ORDER BY fc.asset_id`,
		workspaceID, galleryID, labels)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster assets in gallery: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("face repo: scan gallery cluster asset: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ListClusterFaces returns face rows in a cluster for photographer review.
// When galleryID is supplied, gallery membership is resolved through
// gallery_assets so denormalized face_clusters.gallery_id gaps do not hide
// faces that belong to the opened gallery.
func (r *FaceRepo) ListClusterFaces(ctx context.Context, workspaceID, clusterLabel uuid.UUID, galleryID *uuid.UUID) ([]*FaceCluster, error) {
	canonical, err := r.ResolveClusterLabel(ctx, workspaceID, clusterLabel)
	if err != nil {
		return nil, err
	}
	labels, err := r.clusterLabelsForCanonical(ctx, workspaceID, canonical)
	if err != nil {
		return nil, err
	}
	query := `SELECT fc.id, fc.workspace_id, fc.asset_id, fc.gallery_id, fc.face_index, fc.bounding_box,
		 fc.cluster_label, fc.cluster_name, fc.confidence, fc.source, fc.created_at, fc.updated_at
		 FROM face_clusters fc`
	args := []any{workspaceID, labels}
	if galleryID != nil {
		query += ` INNER JOIN gallery_assets ga ON ga.asset_id = fc.asset_id AND ga.gallery_id = $3`
		args = append(args, *galleryID)
	}
	query += ` WHERE fc.workspace_id = $1
		   AND fc.cluster_label = ANY($2)
		 ORDER BY fc.confidence DESC, fc.asset_id, fc.face_index`

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster faces: %w", err)
	}
	defer rows.Close()

	return scanFaces(rows)
}

func (r *FaceRepo) clusterLabelsForCanonical(ctx context.Context, workspaceID, canonicalLabel uuid.UUID) ([]uuid.UUID, error) {
	rows, err := r.pool.Query(ctx,
		`WITH RECURSIVE aliases(label, depth) AS (
			SELECT alias_label, 1
			FROM face_identity_aliases
			WHERE workspace_id = $1 AND canonical_label = $2
			UNION ALL
			SELECT a.alias_label, aliases.depth + 1
			FROM face_identity_aliases a
			INNER JOIN aliases ON a.canonical_label = aliases.label
			WHERE a.workspace_id = $1 AND aliases.depth < 8
		)
		SELECT $2::uuid AS label
		UNION
		SELECT label FROM aliases`,
		workspaceID, canonicalLabel)
	if err != nil {
		return nil, fmt.Errorf("face repo: list cluster aliases: %w", err)
	}
	defer rows.Close()

	labels := []uuid.UUID{canonicalLabel}
	seen := map[uuid.UUID]struct{}{canonicalLabel: {}}
	for rows.Next() {
		var label uuid.UUID
		if err := rows.Scan(&label); err != nil {
			return nil, fmt.Errorf("face repo: scan cluster alias: %w", err)
		}
		if _, ok := seen[label]; ok {
			continue
		}
		seen[label] = struct{}{}
		labels = append(labels, label)
	}
	return labels, rows.Err()
}

// DeleteFacesByAsset removes all face rows for an asset.
func (r *FaceRepo) DeleteFacesByAsset(ctx context.Context, assetID uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM face_clusters WHERE asset_id = $1`, assetID)
	return err
}

// DeleteFacesByAssetAndSource removes only the face rows for an asset that were
// produced by a given source (e.g. "client"). The client-face-index ingest
// (epic slice 1) calls this before re-storing so a re-POST is idempotent
// WITHOUT clobbering server-side ("insightface") detections on the same asset.
func (r *FaceRepo) DeleteFacesByAssetAndSource(ctx context.Context, assetID uuid.UUID, source string) error {
	_, err := r.pool.Exec(ctx,
		`DELETE FROM face_clusters WHERE asset_id = $1 AND source = $2`, assetID, source)
	return err
}

// MergeClusters moves all faces from src cluster to dst cluster within a workspace.
func (r *FaceRepo) MergeClusters(ctx context.Context, workspaceID, srcLabel, dstLabel uuid.UUID, dstName string) (int, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("face repo: begin merge clusters: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	if _, err := tx.Exec(ctx,
		`INSERT INTO face_identity_aliases (workspace_id, alias_label, canonical_label, reason, updated_at)
		 VALUES ($1, $2, $3, 'manual_merge', now())
		 ON CONFLICT (workspace_id, alias_label)
		 DO UPDATE SET canonical_label = EXCLUDED.canonical_label,
		               reason = EXCLUDED.reason,
		               updated_at = now()`,
		workspaceID, srcLabel, dstLabel); err != nil {
		return 0, fmt.Errorf("face repo: upsert cluster alias: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`UPDATE face_clusters SET cluster_label = $3, cluster_name = $4, updated_at = now()
		 WHERE workspace_id = $1 AND cluster_label = $2`,
		workspaceID, srcLabel, dstLabel, dstName)
	if err != nil {
		return 0, fmt.Errorf("face repo: merge clusters: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("face repo: commit merge clusters: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// SplitCluster creates a new cluster label for specified face IDs. The face IDs
// must all belong to the caller's workspace and source cluster, and the split
// cannot empty the original cluster.
func (r *FaceRepo) SplitCluster(ctx context.Context, workspaceID, sourceLabel uuid.UUID, faceIDs []uuid.UUID, newLabel uuid.UUID, newName string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("face repo: begin split cluster: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after Commit

	var total int
	if err := tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM face_clusters WHERE workspace_id = $1 AND cluster_label = $2`,
		workspaceID, sourceLabel).Scan(&total); err != nil {
		return fmt.Errorf("face repo: count source cluster: %w", err)
	}
	if total == 0 {
		return ErrClusterNotFound
	}

	seen := make(map[uuid.UUID]struct{}, len(faceIDs))
	unique := make([]uuid.UUID, 0, len(faceIDs))
	for _, fid := range faceIDs {
		if _, ok := seen[fid]; ok {
			continue
		}
		seen[fid] = struct{}{}
		unique = append(unique, fid)

		var exists bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (
				SELECT 1 FROM face_clusters
				WHERE id = $1 AND workspace_id = $2 AND cluster_label = $3
			)`,
			fid, workspaceID, sourceLabel).Scan(&exists); err != nil {
			return fmt.Errorf("face repo: check split face %s: %w", fid, err)
		}
		if !exists {
			return ErrNonMemberFace
		}
	}
	if len(unique) >= total {
		return ErrSplitWouldEmpty
	}

	for _, fid := range unique {
		if _, err := tx.Exec(ctx,
			`UPDATE face_clusters SET cluster_label = $2, cluster_name = $3, updated_at = now()
			 WHERE id = $1 AND workspace_id = $4 AND cluster_label = $5`,
			fid, newLabel, newName, workspaceID, sourceLabel); err != nil {
			return fmt.Errorf("face repo: split face %s: %w", fid, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("face repo: commit split cluster: %w", err)
	}
	return nil
}

// ResolveClusterLabel follows manual face identity aliases and returns the
// canonical label. If no alias exists, the input label is already canonical.
func (r *FaceRepo) ResolveClusterLabel(ctx context.Context, workspaceID, label uuid.UUID) (uuid.UUID, error) {
	var out uuid.UUID
	err := r.pool.QueryRow(ctx,
		`WITH RECURSIVE chain(alias_label, canonical_label, depth) AS (
			SELECT alias_label, canonical_label, 1
			FROM face_identity_aliases
			WHERE workspace_id = $1 AND alias_label = $2
			UNION ALL
			SELECT a.alias_label, a.canonical_label, chain.depth + 1
			FROM face_identity_aliases a
			INNER JOIN chain ON a.alias_label = chain.canonical_label
			WHERE a.workspace_id = $1 AND chain.depth < 8
		)
		SELECT canonical_label FROM chain ORDER BY depth DESC LIMIT 1`,
		workspaceID, label).Scan(&out)
	if err == pgx.ErrNoRows {
		return label, nil
	}
	if err != nil {
		return uuid.Nil, fmt.Errorf("face repo: resolve cluster label: %w", err)
	}
	return out, nil
}

func scanFaces(rows pgx.Rows) ([]*FaceCluster, error) {
	var faces []*FaceCluster
	for rows.Next() {
		var fc FaceCluster
		var bboxJSON []byte
		if err := rows.Scan(
			&fc.ID, &fc.WorkspaceID, &fc.AssetID, &fc.GalleryID, &fc.FaceIndex,
			&bboxJSON, &fc.ClusterLabel, &fc.ClusterName, &fc.Confidence,
			&fc.Source, &fc.CreatedAt, &fc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("face repo: scan: %w", err)
		}
		_ = json.Unmarshal(bboxJSON, &fc.BoundingBox)
		faces = append(faces, &fc)
	}
	return faces, rows.Err()
}
