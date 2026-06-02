package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/rawdrive/backend/internal/middleware"
	"github.com/rawdrive/backend/internal/repository"
	"github.com/rawdrive/backend/internal/service"
	"github.com/rawdrive/backend/internal/storage"
	"github.com/rawdrive/backend/internal/upload/credit"
	"github.com/rawdrive/backend/internal/upload/gate"
)

const tusVersion = "1.0.0"

// F-013 (M17 wave 6): TUS extension set. Wave 5 shipped the multipart
// storage primitives; wave 6 wires them into this handler and advertises
// the spec-compliant extension list so clients can negotiate creation-
// with-upload, expiration, and per-chunk checksum verification.
const tusExtension = "creation,creation-with-upload,expiration,checksum,termination"

// defaultSessionTTL is the default expiration window for a TUS session.
// Operators can override it through the UPLOAD_SESSION_TTL_HOURS env var
// (fallback used when platform_settings cannot be consulted from the
// wiring layer — wave 6 keeps things simple; wave 7+ reads from the DB).
const defaultSessionTTL = 24 * time.Hour

// defaultMaxUploadBytes is the fallback Tus-Max-Size header value when
// UPLOAD_MAX_BYTES env var is not set. 2 GiB matches pre-wave-6 behavior.
const defaultMaxUploadBytes int64 = 2 * 1024 * 1024 * 1024

const (
	clientSideMediaScheme             = "rawdrive-e2ee-v1"
	clientSideMediaAlgorithm          = "AES-256-GCM"
	clientSideMediaStorageContentType = "application/vnd.rawdrive.encrypted"
	clientSideMediaAssetAlgo          = "client-side-aes-256-gcm"
	clientSideMediaAssetVersion       = 1
	clientSideMediaWaitingStatus      = "waiting_derivatives"
)

var ErrEncryptedMediaHashMismatch = errors.New("encrypted media ciphertext hash mismatch")

// setTUSHeaders adds the standard TUS protocol headers to every response.
// maxBytes is resolved once at handler construction from env and cached on
// the handler so we do not re-read env on every request.
func (h *ChunkedUploadHandler) setTUSHeaders(w http.ResponseWriter) {
	w.Header().Set("Tus-Resumable", tusVersion)
	w.Header().Set("Tus-Version", tusVersion)
	w.Header().Set("Tus-Extension", tusExtension)
	w.Header().Set("Tus-Max-Size", strconv.FormatInt(h.maxUploadBytes, 10))
}

// UploadSessionStore is the narrow subset of repository.UploadSessionsRepo
// methods the handler actually calls. Declaring it here (instead of
// importing the repo directly) lets tests inject an in-memory fake without
// spinning up a Postgres pool, while the real *repository.UploadSessionsRepo
// satisfies the interface by structural typing.
type UploadSessionStore interface {
	Create(ctx context.Context, s *repository.UploadSession) error
	GetByTUSUploadID(ctx context.Context, tusUploadID string) (*repository.UploadSession, error)
	UpdateOffset(ctx context.Context, tusUploadID string, newOffset int64) error
	AppendPartETag(ctx context.Context, tusUploadID string, part repository.UploadPartETag) error
	MarkCompleted(ctx context.Context, tusUploadID string) error
	Delete(ctx context.Context, tusUploadID string) error
}

// galleryResolver resolves a gallery by id for the CreateSession workspace
// ownership check. Satisfied by *repository.GalleryRepo.GetByID.
//
// S3-G4 / AREA-UPLOADER-3: a session may carry a destination gallery_id so
// finalize can link the asset server-side. Before persisting that id we must
// confirm the gallery belongs to the caller's workspace — otherwise a client
// could bind its upload to a gallery in another tenant and (after the
// DB-level join still rejected the link) at minimum poison the session row.
type galleryResolver interface {
	GetByID(ctx context.Context, id uuid.UUID) (*repository.Gallery, error)
}

// albumResolver resolves an album by id for the CreateSession check.
// Satisfied by *repository.AlbumRepo.GetByID. The album's parent gallery must
// match the (already-validated) destination gallery so an album in another
// gallery — or another tenant — cannot be bound to the session.
type albumResolver interface {
	GetByID(ctx context.Context, id uuid.UUID) (*repository.Album, error)
}

// GalleryLinker links a finalized asset into a gallery server-side. Satisfied
// by *repository.GalleryAssetRepo.LinkFinalizedAsset. The link is assigned the
// next sort_order within the gallery (S3-G5) and is idempotent (ON CONFLICT DO
// NOTHING) so the legacy client addAssetToGallery call still succeeds
// harmlessly when both paths run.
type GalleryLinker interface {
	LinkFinalizedAsset(ctx context.Context, galleryID, assetID, workspaceID uuid.UUID) error
}

// TermsGate reports whether a user has accepted the active Terms of Service.
// Satisfied by *service.TermsService. CreateSession consults it (when wired) so
// no upload — image or slideshow audio — proceeds until the photographer has
// accepted the copyright/IP terms. The activeVersion return is surfaced in the
// 403 payload so the client can show the right version in its acceptance modal.
type TermsGate interface {
	HasAcceptedActive(ctx context.Context, userID uuid.UUID) (accepted bool, activeVersion string, err error)
}

// ChunkedUploadHandler implements the TUS v1.0.0 resumable upload protocol.
// Clients POST to /uploads to create an upload session, then PATCH chunks.
//
// F-013 (M17 wave 6) — direct-to-R2 streaming rewrite:
//   - Session state lives in upload_sessions (Postgres) so sessions survive
//     API container restarts and multi-instance deployments.
//   - Chunks flow straight to R2 via storage.MultipartCapable — there is
//     no temp file on disk (F-008 hard law).
//   - Per-chunk Upload-Checksum header verification rejects tampered
//     chunks with HTTP 460 before they land in R2.
//   - A per-session in-memory streamState holds the rolling SHA-256 and
//     the first/last 64 bytes for the F-003 finalize hash verification and
//     M16 Tier D format spot-check. If the API restarts mid-upload the
//     in-memory state is lost; finalize falls back to re-reading the
//     composed R2 object to recompute the hash (cold path).
//
// The M16 E47-S5 Tier D validation hook is preserved: validationSvc runs
// at session create time (ValidateForSessionCreate) and at finalize time
// (hash verify + header/trailer spot-check). Wire it via WithValidation;
// nil means validation is disabled (legacy fixtures / test rigs).
type ChunkedUploadHandler struct {
	uploadSvc *service.UploadService
	assetRepo *repository.AssetRepo
	store     storage.Provider
	sessions  UploadSessionStore

	// maxUploadBytes is the Tus-Max-Size ceiling and the per-session total
	// size upper bound. Read once from env at construction.
	maxUploadBytes int64

	// streamStates holds per-session in-memory progress needed for the
	// F-003 hash verification and Tier D spot-check. Keyed by tus upload ID.
	// Lost on restart — finalize cold path handles that case.
	streamStates sync.Map // map[string]*sessionStreamState

	// M16 E47-S5: optional Tier D validation hook. Wired via WithValidation().
	// Nil means validation is disabled (legacy behavior).
	validationSvc service.UploadManifestValidation

	// storageAccountingSvc is the workspace storage quota tracker. Wired
	// via WithStorageAccounting(). Calls to RecordUpload from finalizeUpload
	// are best-effort: an accounting failure is logged but does not fail
	// the upload itself. Added 2026-04-12 after UAT surfaced a real bug —
	// the chunked upload path never updated workspace_storage, so the
	// dashboard KPI and quota enforcement saw zero regardless of actual
	// usage.
	storageAccountingSvc *service.StorageAccounting

	encryptionEnabled bool
	encryptionAlgo    string
	encryptionVersion int

	clientSideEncryptionRequired bool

	// M40 / Upload Credit Meter: optional upload credit gate. Wired via
	// WithUploadCredit(). Defaults to a NoopGate so every call site can
	// be branch-free — ReserveForSession, Consume, and Refund all
	// no-op under NoopGate. Flip to LiveGate from main.go when the
	// streaming.upload_credit_pill_v1 flag is on.
	creditGate gate.UploadCreditGate

	// S3-G4 / AREA-UPLOADER-3: optional gallery-linkage wiring. When all
	// three are set (via WithGalleryLinkage), CreateSession accepts an
	// optional gallery_id (+ album_id), validates it belongs to the caller's
	// workspace, and persists it on the session; finalizeUpload then links
	// the finalized asset into the gallery server-side (atomic, idempotent),
	// so association never depends on a post-finalize client call. All nil =
	// feature off: CreateSession ignores any gallery_id in the request and
	// finalize performs no link (legacy client-link flow unchanged).
	galleries     galleryResolver
	albums        albumResolver
	galleryLinker GalleryLinker

	// termsGate, when wired via WithTermsGate, blocks CreateSession until the
	// uploading user has accepted the active Terms of Service. Nil = feature
	// off (legacy/tests): no terms enforcement.
	termsGate TermsGate

	// assetCreateFn, when non-nil, overrides h.assetRepo.Create as the asset
	// insert used by finalizeUpload. This exists purely so unit tests can
	// drive the asset-persist + server-side-link path without a live Postgres
	// pool (the concrete *repository.AssetRepo cannot be made to fail or be
	// observed in a unit test). Production never sets it — finalize falls back
	// to h.assetRepo.Create.
	assetCreateFn func(context.Context, *repository.Asset) error
}

// sessionStreamState is the in-memory working set for an in-flight upload.
// It exists alongside the durable upload_sessions row so each PATCH can
// compute a rolling SHA-256 (needed for F-003 finalize verification) and
// buffer the head/tail bytes (needed for the M16 Tier D format spot-check)
// without storing the full upload on disk.
type sessionStreamState struct {
	mu          sync.Mutex
	hasher      hash.Hash
	head        []byte // first up-to-64 bytes
	tail        []byte // last up-to-64 bytes (sliding window across chunks)
	storageKey  string
	multipartID string
	nextPart    int32 // 1-indexed — TUS expects sequential PATCH, R2 needs sequential part numbers
	// M40: carries the credit reservation from CreateSession through
	// finalizeUpload / Cancel so Consume or Refund can settle the
	// ledger entry without re-reading DB state. Nil when the feature
	// flag is off (NoopGate returns a disabled-feature handle that we
	// still store here so call sites are branch-free).
	reservation *gate.ReservationHandle
}

func newStreamState(storageKey, multipartID string, reservation *gate.ReservationHandle) *sessionStreamState {
	return &sessionStreamState{
		hasher:      sha256.New(),
		head:        make([]byte, 0, 64),
		tail:        make([]byte, 0, 64),
		storageKey:  storageKey,
		multipartID: multipartID,
		nextPart:    1,
		reservation: reservation,
	}
}

// absorbChunk updates the rolling hash and head/tail windows with the
// given chunk bytes. Must be called with s.mu held. Chunks larger than
// 64 bytes overwrite the entire tail window; smaller chunks slide it.
func (s *sessionStreamState) absorbChunk(chunk []byte) {
	s.hasher.Write(chunk)

	// Head: capture the first 64 bytes across chunk boundaries.
	if len(s.head) < 64 {
		need := 64 - len(s.head)
		if need > len(chunk) {
			need = len(chunk)
		}
		s.head = append(s.head, chunk[:need]...)
	}

	// Tail: keep the most recent up-to-64 bytes seen across all chunks.
	if len(chunk) >= 64 {
		s.tail = append(s.tail[:0], chunk[len(chunk)-64:]...)
		return
	}
	combined := append([]byte{}, s.tail...)
	combined = append(combined, chunk...)
	if len(combined) > 64 {
		combined = combined[len(combined)-64:]
	}
	s.tail = combined
}

// NewChunkedUploadHandler creates a new TUS handler wired to the durable
// session store. The store argument MUST be a storage.Provider that ALSO
// implements storage.MultipartCapable (currently S3Driver in production).
// Handlers type-assert when they need multipart; non-multipart providers
// fall back to a 503 path. sessions is the UploadSessionStore — the real
// *repository.UploadSessionsRepo satisfies it structurally.
func NewChunkedUploadHandler(
	uploadSvc *service.UploadService,
	assetRepo *repository.AssetRepo,
	store storage.Provider,
	sessions UploadSessionStore,
) *ChunkedUploadHandler {
	maxBytes := defaultMaxUploadBytes
	if raw := os.Getenv("UPLOAD_MAX_BYTES"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil && parsed > 0 {
			maxBytes = parsed
		}
	}
	return &ChunkedUploadHandler{
		uploadSvc:      uploadSvc,
		assetRepo:      assetRepo,
		store:          store,
		sessions:       sessions,
		maxUploadBytes: maxBytes,
		// Default to NoopGate so WithUploadCredit is purely opt-in.
		// Existing callers (and tests) get feature-off behaviour
		// automatically until main.go wires in a LiveGate.
		creditGate: gate.NewNoopGate(),
	}
}

// WithUploadCredit wires the M40 upload credit gate. Pass a LiveGate
// when the feature flag streaming.upload_credit_pill_v1 is on, or a
// NoopGate (the default) to disable the meter. Returns the same
// handler for chainable construction.
func (h *ChunkedUploadHandler) WithUploadCredit(g gate.UploadCreditGate) *ChunkedUploadHandler {
	if g == nil {
		h.creditGate = gate.NewNoopGate()
		return h
	}
	h.creditGate = g
	return h
}

// WithValidation wires the M16 E47-S5 Tier D validation hook. Returns the
// same handler for chainable construction.
func (h *ChunkedUploadHandler) WithValidation(
	validationSvc service.UploadManifestValidation,
) *ChunkedUploadHandler {
	h.validationSvc = validationSvc
	return h
}

// WithStorageAccounting wires the workspace storage quota tracker.
// finalizeUpload will call RecordUpload after a successful asset row insert
// so the dashboard KPI and quota enforcement see live usage. The call is
// best-effort — an accounting failure is logged but does not fail the
// upload itself. Returns the same handler for chainable construction.
func (h *ChunkedUploadHandler) WithStorageAccounting(
	storageAccountingSvc *service.StorageAccounting,
) *ChunkedUploadHandler {
	h.storageAccountingSvc = storageAccountingSvc
	return h
}

// WithGalleryLinkage wires the S3-G4 / AREA-UPLOADER-3 server-side gallery
// linkage. When set, CreateSession accepts an optional gallery_id (+ album_id)
// in the request body, validates the gallery belongs to the caller's workspace
// (and the album, if any, belongs to that gallery), and persists the target on
// the session row; finalizeUpload then links the finalized asset into the
// gallery itself. galleryLinker is the only strictly-required dependency for
// the finalize-time link; galleries/albums are used for the create-time
// validation. Passing any nil leaves the feature off (legacy client-link flow).
// Returns the same handler for chainable construction.
func (h *ChunkedUploadHandler) WithGalleryLinkage(
	galleries galleryResolver,
	albums albumResolver,
	linker GalleryLinker,
) *ChunkedUploadHandler {
	h.galleries = galleries
	h.albums = albums
	h.galleryLinker = linker
	return h
}

// WithTermsGate wires the photographer Terms-of-Service acceptance gate. When
// set, CreateSession rejects uploads with 403 TERMS_NOT_ACCEPTED until the user
// has accepted the active terms version. Passing nil leaves the feature off.
// Returns the same handler for chainable construction.
func (h *ChunkedUploadHandler) WithTermsGate(g TermsGate) *ChunkedUploadHandler {
	h.termsGate = g
	return h
}

func (h *ChunkedUploadHandler) WithEncryptionMetadata(enabled bool, algo string, version int) *ChunkedUploadHandler {
	h.encryptionEnabled = enabled
	h.encryptionAlgo = algo
	h.encryptionVersion = version
	return h
}

func (h *ChunkedUploadHandler) WithClientSideEncryptionRequired(required bool) *ChunkedUploadHandler {
	h.clientSideEncryptionRequired = required
	return h
}

// RegisterRoutes adds chunked upload routes.
func (h *ChunkedUploadHandler) RegisterRoutes(r chi.Router) {
	r.Post("/api/v1/uploads", h.CreateSession)
	r.Patch("/api/v1/uploads/{uploadId}", h.UploadChunk)
	r.Head("/api/v1/uploads/{uploadId}", h.GetOffset)
	r.Delete("/api/v1/uploads/{uploadId}", h.Cancel)
}

// sessionTTL returns the effective session TTL. Reads the
// UPLOAD_SESSION_TTL_HOURS env var, falls back to defaultSessionTTL.
func sessionTTL() time.Duration {
	if raw := os.Getenv("UPLOAD_SESSION_TTL_HOURS"); raw != "" {
		if h, err := strconv.Atoi(raw); err == nil && h > 0 {
			return time.Duration(h) * time.Hour
		}
	}
	return defaultSessionTTL
}

// CreateSession creates a new upload session. POST /api/v1/uploads
func (h *ChunkedUploadHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	workspaceID, ok := getWorkspaceID(r)
	if !ok {
		http.Error(w, `{"error":"missing workspace_id"}`, http.StatusBadRequest)
		return
	}
	userID, _ := getUserID(r)

	// Terms gate (hard enforcement). A photographer must have accepted the
	// active Terms of Service — the copyright/IP, rights-warranty, and
	// indemnification clauses — before ANY upload, whether a photo or a
	// slideshow audio track (both funnel through this endpoint). Checked first,
	// before any credit/storage reservation, so a block is a clean 4xx with
	// nothing to unwind. The frontend pre-checks acceptance to avoid a
	// failed-upload flash, but this is the authority. Fail closed on a lookup
	// error with a 500 (not a 403) so a transient failure never wrongly tells
	// the client the user has not accepted.
	if h.termsGate != nil {
		accepted, activeVersion, err := h.termsGate.HasAcceptedActive(r.Context(), userID)
		if err != nil {
			internalError(w, "", "terms_check_failed", err)
			return
		}
		if !accepted {
			respondJSON(w, http.StatusForbidden, map[string]interface{}{
				"error":         "TERMS_NOT_ACCEPTED",
				"message":       "You must accept the Terms of Service before uploading.",
				"terms_version": activeVersion,
			})
			return
		}
	}

	var input struct {
		Filename        string                      `json:"filename"`
		ContentType     string                      `json:"content_type"`
		TotalSize       int64                       `json:"total_size"`
		ChunkSize       int64                       `json:"chunk_size"`
		ScanManifest    *service.UploadScanManifest `json:"scan_manifest,omitempty"`
		MediaEncryption map[string]interface{}      `json:"media_encryption,omitempty"`
		SourceMetadata  map[string]interface{}      `json:"source_metadata,omitempty"`
		// S3-G4 / AREA-UPLOADER-3: optional destination so finalize can link
		// the asset server-side. Validated against the caller's workspace
		// below; ignored when gallery linkage is not wired.
		GalleryID *uuid.UUID `json:"gallery_id,omitempty"`
		AlbumID   *uuid.UUID `json:"album_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, `{"error":"invalid json"}`, http.StatusBadRequest)
		return
	}

	if _, ok := service.StillImageFormatFromContentType(input.ContentType); !ok {
		respondJSON(w, http.StatusUnprocessableEntity, map[string]interface{}{
			"error":   "UNSUPPORTED_UPLOAD_TYPE",
			"message": "photo galleries accept still-image uploads only",
		})
		return
	}

	// E2EE: client-side media encryption manifest validation. When the
	// workspace requires client-side encryption, reject uploads that omit the
	// manifest; otherwise validate any supplied manifest before reserving
	// credit/storage so a bad manifest is a clean 4xx with nothing to unwind.
	mediaEncryptionPresent := len(input.MediaEncryption) > 0
	if h.clientSideEncryptionRequired && !mediaEncryptionPresent {
		respondJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":   "MEDIA_ENCRYPTION_REQUIRED",
			"message": "client-side media encryption metadata is required",
		})
		return
	}
	if mediaEncryptionPresent {
		if err := validateClientSideMediaManifest(input.MediaEncryption, input.TotalSize); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]interface{}{
				"error":   "MEDIA_ENCRYPTION_INVALID",
				"message": err.Error(),
			})
			return
		}
	}

	// S3-G4 / AREA-UPLOADER-3: resolve + validate the optional destination
	// BEFORE reserving any credit/storage, so a bad gallery_id is a clean 4xx
	// with nothing to unwind. The gallery (and album, if any) must belong to
	// the caller's workspace; a cross-workspace or missing target returns 404
	// so a foreign id's existence is never disclosed. When gallery linkage is
	// not wired, any gallery_id in the request is ignored and the session
	// behaves as the legacy client-link flow.
	var sessionGalleryID, sessionAlbumID *uuid.UUID
	if h.galleryLinker != nil && input.GalleryID != nil {
		if h.galleries == nil {
			internalError(w, "", "gallery_resolver_missing", errors.New("gallery linkage wired without resolver"))
			return
		}
		gallery, err := h.galleries.GetByID(r.Context(), *input.GalleryID)
		if err != nil {
			internalError(w, "", "gallery_lookup_failed", err)
			return
		}
		if gallery == nil || gallery.WorkspaceID != workspaceID {
			http.Error(w, `{"error":"gallery not found"}`, http.StatusNotFound)
			return
		}
		sessionGalleryID = input.GalleryID

		if input.AlbumID != nil {
			if h.albums == nil {
				internalError(w, "", "album_resolver_missing", errors.New("album id supplied without resolver"))
				return
			}
			album, err := h.albums.GetByID(r.Context(), *input.AlbumID)
			if err != nil {
				internalError(w, "", "album_lookup_failed", err)
				return
			}
			// The album must live in the destination gallery (which we already
			// proved belongs to this workspace), so this also enforces tenancy.
			if album == nil || album.GalleryID != *input.GalleryID {
				http.Error(w, `{"error":"album not found"}`, http.StatusNotFound)
				return
			}
			sessionAlbumID = input.AlbumID
		}
	}

	// M16 E47-S5: Tier D upload manifest validation gate. Preserved across
	// the wave 6 rewrite — reject block-decision manifests and missing
	// manifests (in strict mode) before any R2 call happens.
	if h.validationSvc != nil {
		mode, err := h.validationSvc.WorkspacePolicyMode(r.Context(), workspaceID)
		if err != nil {
			// F-053: log the raw DB error server-side; return a generic
			// message so Postgres table/column/constraint text is not
			// disclosed. Keep the POLICY_LOOKUP_FAILED code for the client.
			log.Printf("chunked_upload: policy_lookup_failed workspace=%s err=%v", workspaceID, err)
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error":   "POLICY_LOOKUP_FAILED",
				"message": "could not verify upload policy; please retry",
			})
			return
		}
		if err := h.validationSvc.ValidateForSessionCreate(r.Context(), mode, input.ScanManifest); err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]interface{}{
				"error":   err.Error(),
				"message": "upload manifest validation failed",
			})
			return
		}
	}

	if input.TotalSize <= 0 || input.TotalSize > h.maxUploadBytes {
		http.Error(w, fmt.Sprintf(`{"error":"total_size must be between 1 byte and %d bytes"}`, h.maxUploadBytes), http.StatusBadRequest)
		return
	}
	if input.ChunkSize <= 0 {
		input.ChunkSize = 5 * 1024 * 1024 // default 5MB
	}

	uploadUUID := uuid.New()
	uploadID := uploadUUID.String()

	storageReserved := false
	if h.storageAccountingSvc != nil {
		if qErr := h.storageAccountingSvc.ReserveUpload(r.Context(), workspaceID, input.TotalSize); qErr != nil {
			if errors.Is(qErr, service.ErrStorageQuotaExceeded) {
				respondJSON(w, http.StatusForbidden, map[string]interface{}{
					"error":   "storage_quota_exceeded",
					"message": "Your workspace has exceeded its storage quota. Please upgrade your plan or delete unused assets.",
				})
				return
			}
			respondJSON(w, http.StatusInternalServerError, map[string]interface{}{
				"error":   "quota_check_failed",
				"message": "could not verify storage quota; please retry",
			})
			return
		}
		storageReserved = true
	}
	releaseStorageReservation := func(reason string) {
		if storageReserved && h.storageAccountingSvc != nil {
			if err := h.storageAccountingSvc.ReleaseUploadReservation(r.Context(), workspaceID, input.TotalSize); err != nil {
				log.Printf("chunked_upload: release storage reservation failed upload=%s reason=%s err=%v", uploadID, reason, err)
			}
			storageReserved = false
		}
	}

	// M40: reserve the upload credit BEFORE any other mandatory-infra
	// guard. Insufficient balance must reach the user as a 400 without
	// depending on sessions/storage wiring — the gate decision is a
	// user-level product behaviour, not an infra concern. When the
	// feature flag is off main.go wires a NoopGate, so this call is a
	// pure pass-through (no ledger write, no balance check). On
	// enterprise workspaces with the unlimited flag, the ledger still
	// posts an unlimited_passthrough entry for audit.
	//
	// Cost is fixed at 1 credit per upload for M40 v1 (per-upload meter,
	// see feature-prd.md §4 Decision 1). Per-derivative pricing is out
	// of scope.
	// M41 FR-UCRT-07/08: read the resolved plan tier from the tenant
	// middleware chain and forward it to the gate. Enterprise workspaces
	// short-circuit to an unlimited_passthrough ledger entry (0 credits
	// debited) instead of hitting the balance gate; all other tiers take
	// the normal reserve path. Missing plan tier defaults to empty string
	// → EnterpriseUnlimited stays false → balance gate enforced. This
	// fail-closed default is deliberate: a transient plan-tier lookup
	// failure must never silently upgrade a standard workspace.
	planTier := middleware.PlanTierFromContext(r.Context())
	enterpriseUnlimited := planTier == "enterprise"

	creditReservation, credErr := h.creditGate.ReserveForSession(r.Context(), gate.ReserveRequest{
		WorkspaceID:         workspaceID,
		UploadSessionID:     uploadUUID,
		Cost:                1,
		IdempotencyKey:      fmt.Sprintf("session:%s", uploadID),
		CreatedBy:           uuidPtr(userID),
		PlanCode:            planTier,
		EnterpriseUnlimited: enterpriseUnlimited,
	})
	if credErr != nil {
		releaseStorageReservation("credit-reservation-failed")
		// InsufficientBalanceDetails: surface as 400 with the structured
		// frontend payload so useUpload can open the recharge modal.
		var details *credit.InsufficientBalanceDetails
		if errors.As(credErr, &details) {
			respondJSON(w, http.StatusBadRequest, gate.InsufficientCreditsResponse(details))
			return
		}
		internalError(w, uploadID, "credit_reservation_failed", credErr)
		return
	}

	// Sessions store is mandatory — the direct-R2 path needs durable state.
	// Fail loudly if main.go forgot to wire the repo. If the credit gate
	// already ran (and succeeded) but we can't persist the session, the
	// LiveGate's reservation will eventually be cleaned up by
	// ExpireAbandoned after the TTL.
	if h.sessions == nil {
		releaseStorageReservation("sessions-store-missing")
		http.Error(w, `{"error":"upload sessions store not wired"}`, http.StatusInternalServerError)
		return
	}

	// Build the storage key from workspaceID + the TUS upload ID so both
	// CreateSession and finalize can derive the same R2 key without
	// needing to read back the DB-generated session row id. The asset row
	// eventually gets a fresh uuid.New() at finalize time — the storage
	// key intentionally does NOT mirror asset.ID since nothing in the
	// codebase parses StorageKey, it is used as an opaque R2 key.
	ext := filepath.Ext(input.Filename)
	if ext == "" {
		parts := strings.Split(input.ContentType, "/")
		if len(parts) == 2 {
			ext = "." + parts[1]
		}
	}
	storageKey := fmt.Sprintf("%s/%s/original%s", workspaceID.String(), uploadID, ext)

	// Initiate the R2 multipart upload so the per-chunk PATCH path has an
	// upload ID to stream parts into. Non-multipart providers (e.g. unit
	// tests that pass a plain storage.Provider) return a 503 — callers
	// must upgrade to a MultipartCapable provider.
	mpc, ok := h.store.(storage.MultipartCapable)
	if !ok {
		releaseStorageReservation("multipart-unsupported")
		http.Error(w, `{"error":"storage backend does not support multipart uploads"}`, http.StatusServiceUnavailable)
		return
	}
	storageContentType := input.ContentType
	if mediaEncryptionPresent {
		storageContentType = clientSideMediaStorageContentType
	}
	r2UploadID, err := mpc.CreateMultipartUpload(r.Context(), storageKey, storageContentType)
	if err != nil {
		releaseStorageReservation("multipart-create-failed")
		internalError(w, uploadID, "create_multipart_upload_failed", err)
		return
	}

	expiresAt := time.Now().UTC().Add(sessionTTL())

	// Serialize the manifest for the scan_manifest column (nullable jsonb).
	var manifestBytes []byte
	if input.ScanManifest != nil {
		if b, err := json.Marshal(input.ScanManifest); err == nil {
			manifestBytes = b
		}
	}
	var mediaEncryptionBytes []byte
	if mediaEncryptionPresent {
		if b, err := json.Marshal(input.MediaEncryption); err == nil {
			mediaEncryptionBytes = b
		}
	}
	var sourceMetadataBytes []byte
	if len(input.SourceMetadata) > 0 {
		if b, err := json.Marshal(input.SourceMetadata); err == nil {
			sourceMetadataBytes = b
		}
	}

	row := &repository.UploadSession{
		WorkspaceID:         workspaceID,
		UserID:              userID,
		TUSUploadID:         uploadID,
		Filename:            input.Filename,
		ContentType:         input.ContentType,
		TotalSize:           input.TotalSize,
		UploadOffset:        0,
		ChunkSize:           input.ChunkSize,
		R2MultipartUploadID: &r2UploadID,
		ExpiresAt:           expiresAt,
		ScanManifest:        manifestBytes,
		MediaEncryption:     mediaEncryptionBytes,
		SourceMetadata:      sourceMetadataBytes,
		// S3-G4 / AREA-UPLOADER-3: persist the validated destination so
		// finalize can link the asset server-side. nil when not supplied
		// or the feature is not wired.
		GalleryID: sessionGalleryID,
		AlbumID:   sessionAlbumID,
	}

	// M40-DB-001: persist the reservation id so cold-path restart can
	// rebuild the credit handle instead of falling back to TTL cleanup.
	// Only set when the feature is actually on; NoopGate returns a
	// disabled handle with uuid.Nil which we deliberately skip so the
	// FK points at a real ledger row or nothing at all.
	if creditReservation != nil && creditReservation.FeatureEnabled && creditReservation.ReservationID != uuid.Nil {
		resID := creditReservation.ReservationID
		row.CreditReservationID = &resID
	}
	if err := h.sessions.Create(r.Context(), row); err != nil {
		// Best-effort: abort the R2 multipart we just started so we don't
		// leak storage state on a DB write failure.
		_ = mpc.AbortMultipartUpload(r.Context(), storageKey, r2UploadID)
		releaseStorageReservation("persist-session-failed")
		internalError(w, uploadID, "persist_upload_session_failed", err)
		return
	}

	// Seed the in-memory stream state for the rolling hash + head/tail.
	// creditReservation may be a disabled-feature handle (NoopGate) —
	// that is safe to carry through, Consume/Refund no-op.
	h.streamStates.Store(uploadID, newStreamState(storageKey, r2UploadID, creditReservation))

	h.setTUSHeaders(w)
	w.Header().Set("Location", fmt.Sprintf("/api/v1/uploads/%s", uploadID))
	w.Header().Set("Upload-Offset", "0")
	w.Header().Set("Upload-Length", strconv.FormatInt(input.TotalSize, 10))
	w.Header().Set("Upload-Expires", expiresAt.Format(time.RFC1123))
	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"upload_id":  uploadID,
		"chunk_size": input.ChunkSize,
		"offset":     0,
	})
}

// UploadChunk appends a chunk to an existing session. PATCH /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	row, err := h.sessions.GetByTUSUploadID(r.Context(), uploadID)
	if err != nil {
		if errors.Is(err, repository.ErrUploadSessionNotFound) {
			http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
			return
		}
		internalError(w, uploadID, "session_lookup_failed", err)
		return
	}

	// Parse Upload-Offset header. TUS 1.0.0 §5.3 makes the header MANDATORY on
	// PATCH and requires a 409 when it does not match the server's current
	// offset. F-064: the header was previously gated behind `if offsetStr !=
	// ""`, so an absent header skipped validation entirely and an
	// unparseable one was silently ignored (parseErr swallowed) — both
	// removed the offset-ordering guard. Enforce it: 400 when the header is
	// absent or malformed, 409 on mismatch.
	offsetStr := r.Header.Get("Upload-Offset")
	if offsetStr == "" {
		http.Error(w, `{"error":"Upload-Offset header required"}`, http.StatusBadRequest)
		return
	}
	offset, parseErr := strconv.ParseInt(offsetStr, 10, 64)
	if parseErr != nil {
		http.Error(w, `{"error":"Upload-Offset header invalid"}`, http.StatusBadRequest)
		return
	}
	if offset != row.UploadOffset {
		http.Error(w, fmt.Sprintf(`{"error":"offset mismatch: expected %d, got %d"}`, row.UploadOffset, offset), http.StatusConflict)
		return
	}

	// Buffer the chunk into memory so we can verify the Upload-Checksum
	// header BEFORE forwarding bytes to R2. Chunks are bounded by the
	// client's ChunkSize (default 5MB); the memory cost is intentional
	// and acceptable versus the hard law of "no local disk I/O".
	//
	// M40-PERF-001: cap a single PATCH body at ChunkSize + 64 KiB slack
	// (HTTP headers, TUS metadata padding) so a rogue client cannot
	// OOM the API pod by declaring a huge Content-Length. MaxBytesReader
	// converts over-limit reads into a 413 via io.ReadAll's err path;
	// we surface that as HTTP 413 specifically so clients can distinguish
	// chunk-too-large from other IO failures.
	const perChunkSlack = 64 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, row.ChunkSize+perChunkSlack)
	chunk, err := io.ReadAll(r.Body)
	if err != nil {
		// MaxBytesReader returns *http.MaxBytesError on overflow; unwrap to
		// keep the branch readable even if Go vendors a different sentinel.
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			http.Error(w, fmt.Sprintf(`{"error":"chunk exceeds ChunkSize + %d byte slack"}`, perChunkSlack), http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, `{"error":"failed to read chunk body"}`, http.StatusInternalServerError)
		return
	}

	// Per-chunk checksum verification. The Upload-Checksum header format
	// per TUS spec is "<algorithm> <base64-digest>". Only sha256 is
	// supported today. Missing header = opt out. Mismatches return HTTP
	// 460 (TUS "Checksum Mismatch") with no state change.
	if checksum := r.Header.Get("Upload-Checksum"); checksum != "" {
		if code, err := verifyUploadChecksum(chunk, checksum); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), code)
			return
		}
	}

	// Look up the in-memory stream state. If it is missing (API restart
	// mid-upload) we rebuild a fresh one — this is safe because the
	// rolling hash is only used at finalize, and finalize has a cold-path
	// re-hash that re-reads the completed R2 object when the in-memory
	// hash is unreliable. Seed the state marked "rehydrated" so finalize
	// knows to trust the cold path instead.
	stateI, loaded := h.streamStates.Load(uploadID)
	if !loaded {
		// Rehydrate: we know the storage key from the row, but we do not
		// know the R2 upload ID from the in-memory state. Recover both
		// from the DB row so finalize can complete.
		storageKey, mpID := deriveKeyAndUploadID(row)
		if mpID == "" {
			http.Error(w, `{"error":"session has no R2 multipart upload id"}`, http.StatusInternalServerError)
			return
		}
		// Cold-path recovery: M40-DB-001 lets us reconstruct the
		// reservation handle from upload_sessions.credit_reservation_id.
		// If the column is NULL (feature was off at CreateSession time,
		// or enterprise unlimited_passthrough that we intentionally skip
		// persisting) we pass nil and let Consume/Refund no-op — the TTL
		// sweeper unwinds anything left pending.
		var coldReservation *gate.ReservationHandle
		if row.CreditReservationID != nil && *row.CreditReservationID != uuid.Nil {
			coldReservation = &gate.ReservationHandle{
				ReservationID:  *row.CreditReservationID,
				FeatureEnabled: true,
			}
		}
		fresh := newStreamState(storageKey, mpID, coldReservation)
		// Mark the fresh hasher as unreliable by setting it to nil. Finalize
		// reads nil hasher = cold path re-read from R2.
		fresh.hasher = nil
		// The next part number needs to account for parts that were already
		// uploaded before restart. Count them from r2_part_etags.
		fresh.nextPart = int32(countExistingParts(row.R2PartETags)) + 1
		h.streamStates.Store(uploadID, fresh)
		stateI = fresh
	}
	state := stateI.(*sessionStreamState)

	// F-023: read the part number and the keys WITHOUT mutating the rolling
	// hash or committing nextPart yet. TUS serializes PATCHes for a session
	// via the Upload-Offset check above (the offset only advances after a
	// fully-successful chunk), so the same partNumber is reserved for the
	// retry of a failed chunk. If UploadPart fails we return 500 without
	// having advanced nextPart or written the chunk bytes into the rolling
	// SHA-256 — a client retry at the same offset then re-processes the
	// chunk EXACTLY ONCE. Previously absorbChunk + nextPart++ ran before
	// UploadPart, so a transient B2/network failure followed by a TUS retry
	// double-absorbed the same bytes, corrupting the rolling hash and
	// forcing finalize into ErrScanHashMismatch (refund + delete).
	state.mu.Lock()
	partNumber := state.nextPart
	storageKey := state.storageKey
	mpID := state.multipartID
	state.mu.Unlock()

	// Stream the chunk to R2 via multipart UploadPart.
	mpc, ok := h.store.(storage.MultipartCapable)
	if !ok {
		http.Error(w, `{"error":"storage backend does not support multipart uploads"}`, http.StatusServiceUnavailable)
		return
	}
	etag, err := mpc.UploadPart(r.Context(), storageKey, mpID, partNumber, bytes.NewReader(chunk), int64(len(chunk)))
	if err != nil {
		internalError(w, uploadID, "upload_part_failed", err)
		return
	}

	// Compute this chunk's SHA-256 for durable part manifest (not the
	// rolling full-file hash — that is kept separately in streamState).
	chunkHash := sha256.Sum256(chunk)
	part := repository.UploadPartETag{
		PartNumber: int(partNumber),
		ETag:       etag,
		Size:       int64(len(chunk)),
		SHA256:     hex.EncodeToString(chunkHash[:]),
	}
	if err := h.sessions.AppendPartETag(r.Context(), uploadID, part); err != nil {
		internalError(w, uploadID, "record_part_etag_failed", err)
		return
	}

	newOffset := row.UploadOffset + int64(len(chunk))
	if err := h.sessions.UpdateOffset(r.Context(), uploadID, newOffset); err != nil {
		internalError(w, uploadID, "update_offset_failed", err)
		return
	}

	// F-023: only NOW — after the part is durably persisted (R2 UploadPart),
	// recorded (AppendPartETag) and the offset has advanced in the DB
	// (UpdateOffset) — commit the part number and fold the chunk into the
	// rolling hash + head/tail windows. Doing it here (rather than before
	// UploadPart) means any failure above returns 500 with the in-memory
	// state untouched AND the DB offset unchanged, so a TUS client retry at
	// the same offset passes the offset check and re-processes the chunk
	// EXACTLY ONCE. R2 UploadPart for a given part number is idempotent
	// (last write wins), so the retry overwrites the same part rather than
	// appending a duplicate. Previously absorbChunk + nextPart++ ran before
	// UploadPart, so a transient B2/network failure followed by a retry
	// double-absorbed the same bytes, corrupting the rolling SHA-256 and
	// forcing finalize into ErrScanHashMismatch (refund + delete). Only
	// update the rolling hash if we have a reliable hasher (i.e. we did not
	// rehydrate after restart; rehydrated sessions use the finalize
	// cold-path re-read instead).
	state.mu.Lock()
	state.nextPart++
	if state.hasher != nil {
		state.absorbChunk(chunk)
	}
	state.mu.Unlock()

	h.setTUSHeaders(w)
	w.Header().Set("Upload-Offset", strconv.FormatInt(newOffset, 10))

	// Finalize when the upload hits the declared total size.
	if newOffset >= row.TotalSize {
		// Refresh the row so scan_manifest + size info is current.
		finalRow, err := h.sessions.GetByTUSUploadID(r.Context(), uploadID)
		if err != nil {
			internalError(w, uploadID, "session_refresh_failed", err)
			return
		}
		result, err := h.finalizeUpload(r.Context(), finalRow, state)
		if err != nil {
			// F-003 / F-004: map M16 Tier D scan errors to 422. Any other
			// finalize error stays 500.
			if errors.Is(err, ErrEncryptedMediaHashMismatch) {
				logRefundFailure(uploadID, "encrypted-media-hash-mismatch",
					h.creditGate.Refund(r.Context(), state.reservation,
						fmt.Sprintf("refund:%s:e2ee-hash", uploadID),
						"encrypted-media-hash-mismatch"))
				http.Error(w, `{"error":"ENCRYPTED_MEDIA_HASH_MISMATCH"}`, http.StatusUnprocessableEntity)
				return
			}
			if errors.Is(err, service.ErrScanHashMismatch) {
				// M40: the upload was charged; a hash mismatch means the
				// bytes never made it intact. Refund the reservation so
				// the user isn't billed for a failed upload. This is the
				// stream-hash-fail refund case in feature-prd.md §4.
				logRefundFailure(uploadID, "stream-hash-fail",
					h.creditGate.Refund(r.Context(), state.reservation,
						fmt.Sprintf("refund:%s:hashfail", uploadID),
						"stream-hash-fail"))
				http.Error(w, `{"error":"SCAN_HASH_MISMATCH"}`, http.StatusUnprocessableEntity)
				return
			}
			if errors.Is(err, service.ErrScanManifestInvalid) {
				logRefundFailure(uploadID, "scan-manifest-invalid",
					h.creditGate.Refund(r.Context(), state.reservation,
						fmt.Sprintf("refund:%s:manifest", uploadID),
						"scan-manifest-invalid"))
				http.Error(w, `{"error":"SCAN_MANIFEST_INVALID"}`, http.StatusUnprocessableEntity)
				return
			}
			if errors.Is(err, service.ErrScanManifestRequired) {
				logRefundFailure(uploadID, "scan-manifest-required",
					h.creditGate.Refund(r.Context(), state.reservation,
						fmt.Sprintf("refund:%s:manifest-required", uploadID),
						"scan-manifest-required"))
				http.Error(w, `{"error":"SCAN_MANIFEST_REQUIRED"}`, http.StatusUnprocessableEntity)
				return
			}
			// Any other finalize error refunds too — user isn't charged for
			// infra failures (feature-prd.md §4 Decision 3).
			logRefundFailure(uploadID, "infra-failure",
				h.creditGate.Refund(r.Context(), state.reservation,
					fmt.Sprintf("refund:%s:infra", uploadID),
					"infra-failure"))
			internalError(w, uploadID, "finalize_failed", err)
			return
		}
		// Success: convert the reservation into a terminal consume entry.
		// Best-effort — a Consume failure after a successful upload must
		// not regress the upload. ExpireAbandoned will eventually settle
		// the ledger if Consume dropped on the floor.
		if cerr := h.creditGate.Consume(r.Context(), state.reservation,
			fmt.Sprintf("consume:%s", uploadID)); cerr != nil {
			// Log-level concern: the asset exists in R2 and the DB, but
			// the ledger entry didn't settle. Not user-visible.
			log.Printf("m40: credit consume on finalize failed upload=%s err=%v", uploadID, cerr)
		}
		h.streamStates.Delete(uploadID)
		respondJSON(w, http.StatusOK, result)
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"upload_id": uploadID,
		"offset":    newOffset,
		"complete":  false,
	})
}

// GetOffset returns the current offset. HEAD /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) GetOffset(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	row, err := h.sessions.GetByTUSUploadID(r.Context(), uploadID)
	if err != nil {
		if errors.Is(err, repository.ErrUploadSessionNotFound) {
			http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
			return
		}
		internalError(w, uploadID, "session_lookup_failed", err)
		return
	}

	h.setTUSHeaders(w)
	w.Header().Set("Upload-Offset", strconv.FormatInt(row.UploadOffset, 10))
	w.Header().Set("Upload-Length", strconv.FormatInt(row.TotalSize, 10))
	w.Header().Set("Upload-Expires", row.ExpiresAt.UTC().Format(time.RFC1123))
	w.WriteHeader(http.StatusOK)
}

// Cancel removes an upload session. DELETE /api/v1/uploads/{uploadId}
func (h *ChunkedUploadHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	uploadID := chi.URLParam(r, "uploadId")
	row, err := h.sessions.GetByTUSUploadID(r.Context(), uploadID)
	if err != nil {
		if errors.Is(err, repository.ErrUploadSessionNotFound) {
			http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
			return
		}
		internalError(w, uploadID, "session_lookup_failed", err)
		return
	}

	storageKey, mpID := deriveKeyAndUploadID(row)
	if mpID != "" {
		if mpc, ok := h.store.(storage.MultipartCapable); ok {
			// Best-effort abort — R2 treats the call as idempotent so
			// logging (not failing) on error is appropriate.
			_ = mpc.AbortMultipartUpload(r.Context(), storageKey, mpID)
		}
	}

	if err := h.sessions.Delete(r.Context(), uploadID); err != nil {
		internalError(w, uploadID, "delete_session_failed", err)
		return
	}
	if h.storageAccountingSvc != nil {
		if err := h.storageAccountingSvc.ReleaseUploadReservation(r.Context(), row.WorkspaceID, row.TotalSize); err != nil {
			log.Printf("chunked_upload: release storage reservation on cancel failed upload=%s err=%v", uploadID, err)
		}
	}

	// M40: refund the reservation so the user isn't charged for a
	// cancelled upload (feature-prd.md §4 Decision 3 refund policy —
	// user-cancel is always refunded). Best-effort: even if Refund
	// fails, the session is already deleted; ExpireAbandoned will
	// clean up the dangling ledger entry after the TTL.
	if stateI, ok := h.streamStates.Load(uploadID); ok {
		if state, ok := stateI.(*sessionStreamState); ok && state != nil {
			if rerr := h.creditGate.Refund(r.Context(), state.reservation,
				fmt.Sprintf("refund:%s:cancel", uploadID),
				"user-cancel"); rerr != nil {
				log.Printf("m40: credit refund on cancel failed upload=%s err=%v", uploadID, rerr)
			}
		}
	}
	h.streamStates.Delete(uploadID)
	w.WriteHeader(http.StatusNoContent)
}

// finalizeUpload composes the R2 multipart upload, verifies the manifest
// against the actual uploaded bytes (F-003), persists the scan metadata
// onto the asset row (F-004), and marks the session complete. It is
// reached only from UploadChunk when upload_offset >= total_size.
func (h *ChunkedUploadHandler) finalizeUpload(
	ctx context.Context,
	row *repository.UploadSession,
	state *sessionStreamState,
) (map[string]interface{}, error) {
	if row == nil {
		return nil, errors.New("nil session row")
	}
	if state == nil {
		return nil, errors.New("nil stream state")
	}

	// Decode the persisted part etags so we can rebuild the ordered
	// CompletedPart slice for R2 CompleteMultipartUpload.
	var parts []repository.UploadPartETag
	if len(row.R2PartETags) > 0 {
		if err := json.Unmarshal(row.R2PartETags, &parts); err != nil {
			return nil, fmt.Errorf("decode part etags: %w", err)
		}
	}
	if len(parts) == 0 {
		return nil, errors.New("no parts uploaded")
	}

	storageKey, mpID := deriveKeyAndUploadID(row)
	if mpID == "" {
		return nil, errors.New("session has no R2 multipart upload id")
	}
	releaseReservation := func(reason string) {
		if h.storageAccountingSvc != nil {
			if err := h.storageAccountingSvc.ReleaseUploadReservation(ctx, row.WorkspaceID, row.TotalSize); err != nil {
				log.Printf("chunked_upload: release storage reservation after %s upload=%s err=%v", reason, row.TUSUploadID, err)
			}
		}
	}

	mpc, ok := h.store.(storage.MultipartCapable)
	if !ok {
		return nil, storage.ErrMultipartNotSupported
	}

	completed := make([]storage.CompletedPart, 0, len(parts))
	for _, p := range parts {
		completed = append(completed, storage.CompletedPart{
			PartNumber: int32(p.PartNumber),
			ETag:       p.ETag,
		})
	}
	if err := mpc.CompleteMultipartUpload(ctx, storageKey, mpID, completed); err != nil {
		return nil, fmt.Errorf("complete multipart: %w", err)
	}

	// Decode the scan manifest from the DB row so F-003 / F-004 can
	// verify + persist.
	var manifest *service.UploadScanManifest
	if len(row.ScanManifest) > 0 {
		manifest = &service.UploadScanManifest{}
		if err := json.Unmarshal(row.ScanManifest, manifest); err != nil {
			// F-021: a corrupt scan_manifest on the row is a data-integrity
			// problem, not a user error. CompleteMultipartUpload has already
			// assembled the full object in storage above, and the
			// multipart-abort sweeper is a no-op once Complete succeeds, so
			// returning here without deleting would orphan the binary
			// forever with no DB row to reclaim it. Delete the assembled
			// object before surfacing the error, mirroring the
			// resolveFinalizeDigest (843) and verifyManifestAtFinalize (848)
			// cleanup paths. Best-effort: the Delete outcome does not change
			// the error returned to the caller.
			_ = h.store.Delete(ctx, storageKey)
			releaseReservation("manifest-decode-failure")
			return nil, fmt.Errorf("decode scan manifest: %w", err)
		}
	}

	// Compute the full-file hash for F-003 verification.
	fullHashHex, head, tail, err := h.resolveFinalizeDigest(ctx, state, storageKey)
	if err != nil {
		_ = h.store.Delete(ctx, storageKey)
		releaseReservation("digest-failure")
		return nil, fmt.Errorf("compute finalize digest: %w", err)
	}

	mediaManifest, mediaEncrypted, err := decodeClientSideMediaManifest(row.MediaEncryption)
	if err != nil {
		_ = h.store.Delete(ctx, storageKey)
		releaseReservation("media-manifest-decode-failure")
		return nil, err
	}
	sourceMetadata := decodeSourceMetadata(row.SourceMetadata)
	if mediaEncrypted {
		if err := verifyClientSideMediaDigest(mediaManifest, fullHashHex, row.TotalSize); err != nil {
			_ = h.store.Delete(ctx, storageKey)
			releaseReservation("encrypted-media-verify-failure")
			return nil, err
		}
	} else {
		if err := h.verifyUploadBytesAtFinalize(ctx, row.ContentType, fullHashHex, head, tail, manifest); err != nil {
			_ = h.store.Delete(ctx, storageKey)
			releaseReservation("verify-failure")
			return nil, err
		}
	}

	// Create the asset row. Tests may pass a nil assetRepo to exercise the
	// streaming path without a live DB; treat that as an explicit opt-out.
	assetStatus := service.InitialAssetStatus(row.ContentType)
	assetIsEncrypted := h.encryptionEnabled
	assetEncryptionVersion := h.encryptionVersion
	var assetEncryptionAlgo *string
	if h.encryptionAlgo != "" {
		assetEncryptionAlgo = &h.encryptionAlgo
	}
	if mediaEncrypted {
		assetStatus = clientSideMediaWaitingStatus
		assetIsEncrypted = true
		assetEncryptionVersion = clientSideMediaAssetVersion
		algo := clientSideMediaAssetAlgo
		assetEncryptionAlgo = &algo
	}
	asset := &repository.Asset{
		ID:                uuid.New(),
		WorkspaceID:       row.WorkspaceID,
		Filename:          row.Filename,
		ContentType:       row.ContentType,
		SizeBytes:         row.TotalSize,
		StorageKey:        storageKey,
		StorageDriver:     "r2",
		Status:            assetStatus,
		UploadedBy:        uuidPtr(row.UserID),
		ExifData:          sourceMetadata,
		ThumbnailURLs:     map[string]string{},
		IsEncrypted:       assetIsEncrypted,
		EncryptionAlgo:    assetEncryptionAlgo,
		EncryptionVersion: assetEncryptionVersion,
		MediaEncryption:   mediaManifest,
	}
	applyScanMetadata(asset, manifest)
	assetPersisted := false
	createFn := h.assetCreateFn
	if createFn == nil && h.assetRepo != nil {
		createFn = h.assetRepo.Create
	}
	if createFn != nil {
		if err := h.persistAssetOrCleanup(ctx, asset, storageKey, createFn); err != nil {
			releaseReservation("asset-persist-failure")
			return nil, err
		}
		assetPersisted = true
	}

	// S3-G4 / AREA-UPLOADER-3: link the finalized asset into its destination
	// gallery SERVER-SIDE, in the same flow as the asset insert, so the
	// association never depends on a best-effort client call surviving the
	// post-finalize round-trip. The link assigns sort_order = MAX+1 within the
	// gallery (S3-G5) and is idempotent (ON CONFLICT DO NOTHING), so the legacy
	// client addAssetToGallery call still succeeds harmlessly when both fire.
	//
	// This runs only when the asset was actually persisted, the session carries
	// a gallery_id (validated against the workspace at CreateSession) AND the
	// linker is wired. A link failure is NOT fatal to the upload: the asset
	// exists in storage + DB and was charged, so failing the whole finalize
	// here would force a refund + delete of a perfectly good object. We log
	// loudly instead — the asset is still reachable via the workspace asset
	// list, and the legacy client retry converges it.
	if assetPersisted && h.galleryLinker != nil && row.GalleryID != nil {
		if err := h.galleryLinker.LinkFinalizedAsset(ctx, *row.GalleryID, asset.ID, row.WorkspaceID); err != nil {
			log.Printf("chunked_upload: server-side gallery link failed (non-fatal) upload=%s asset=%s gallery=%s err=%v",
				row.TUSUploadID, asset.ID, *row.GalleryID, err)
		}
	}

	// Move the create-session reservation into durable used_bytes. This keeps
	// quota enforcement atomic across concurrent TUS sessions while preserving
	// the dashboard/storage analytics contract from RecordUpload.
	if h.storageAccountingSvc != nil {
		if err := h.storageAccountingSvc.CommitUploadReservation(ctx, row.WorkspaceID, row.TotalSize, 0); err != nil {
			_ = h.store.Delete(ctx, storageKey)
			if h.assetRepo != nil {
				_ = h.assetRepo.SoftDelete(ctx, asset.ID)
			}
			return nil, fmt.Errorf("commit storage reservation: %w", err)
		}
	}

	if err := h.sessions.MarkCompleted(ctx, row.TUSUploadID); err != nil {
		// Not fatal — log-worthy but the upload did succeed. Return the
		// result so the client is not left retrying. M40-SIL-001: log so
		// the upload-session cleanup worker can't silently misclassify the
		// row as abandoned after a successful finalize.
		log.Printf("m40: mark completed failed upload=%s err=%v", row.TUSUploadID, err)
	}

	return map[string]interface{}{
		"asset":       asset,
		"upload_id":   row.TUSUploadID,
		"sha256":      fullHashHex,
		"complete":    true,
		"storage_key": storageKey,
	}, nil
}

// persistAssetOrCleanup inserts the asset row via create and, on failure,
// deletes the already-assembled storage object before returning the wrapped
// error.
//
// F-005: by the time finalizeUpload reaches the asset insert,
// CompleteMultipartUpload has already assembled the full object in storage.
// If the assets row insert fails (e.g. a transient Postgres write error) the
// object would be orphaned forever — the multipart-abort sweeper is a no-op
// after Complete succeeded, so it can never reclaim the composed binary. We
// therefore delete the object here, mirroring the cleanup performed on the
// resolveFinalizeDigest and verifyManifestAtFinalize failure paths. The
// Delete is best-effort: its outcome does not change the error surfaced to
// the caller (which must still see the original create failure).
func (h *ChunkedUploadHandler) persistAssetOrCleanup(
	ctx context.Context,
	asset *repository.Asset,
	storageKey string,
	create func(context.Context, *repository.Asset) error,
) error {
	if err := create(ctx, asset); err != nil {
		_ = h.store.Delete(ctx, storageKey)
		return fmt.Errorf("create asset: %w", err)
	}
	return nil
}

// resolveFinalizeDigest returns the full-file SHA-256 hex plus the head
// and tail byte slices needed for the format spot-check. Fast path: use
// the in-memory rolling hash when state.hasher is non-nil. Cold path:
// re-read the composed R2 object from storage and compute the digest
// afresh — used after an API restart dropped the rolling state.
func (h *ChunkedUploadHandler) resolveFinalizeDigest(
	ctx context.Context,
	state *sessionStreamState,
	storageKey string,
) (string, []byte, []byte, error) {
	state.mu.Lock()
	hasher := state.hasher
	head := append([]byte{}, state.head...)
	tail := append([]byte{}, state.tail...)
	state.mu.Unlock()

	if hasher != nil {
		return hex.EncodeToString(hasher.Sum(nil)), head, tail, nil
	}

	// Cold path — rolling hash lost (e.g. API restart mid-upload). Re-read
	// the composed object from R2 and hash it.
	rc, err := h.store.Get(ctx, storageKey)
	if err != nil {
		return "", nil, nil, fmt.Errorf("cold-path Get: %w", err)
	}
	defer rc.Close()
	fresh := sha256.New()
	// Capture head/tail while streaming.
	var freshHead []byte
	var freshTail []byte
	buf := make([]byte, 32*1024)
	for {
		n, rerr := rc.Read(buf)
		if n > 0 {
			fresh.Write(buf[:n])
			if len(freshHead) < 64 {
				need := 64 - len(freshHead)
				if need > n {
					need = n
				}
				freshHead = append(freshHead, buf[:need]...)
			}
			// Sliding tail across the whole stream.
			if n >= 64 {
				freshTail = append(freshTail[:0], buf[n-64:n]...)
			} else {
				combined := append([]byte{}, freshTail...)
				combined = append(combined, buf[:n]...)
				if len(combined) > 64 {
					combined = combined[len(combined)-64:]
				}
				freshTail = combined
			}
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return "", nil, nil, fmt.Errorf("cold-path read: %w", rerr)
		}
	}
	return hex.EncodeToString(fresh.Sum(nil)), freshHead, freshTail, nil
}

// verifyManifestAtFinalize runs the F-003 hash verification and the M16
// Tier D format spot-check against caller-provided head/tail buffers.
// No-op when the manifest or validator is absent (legacy behavior).
func (h *ChunkedUploadHandler) verifyManifestAtFinalize(
	_ context.Context,
	computedHashHex string,
	head, tail []byte,
	manifest *service.UploadScanManifest,
) error {
	if manifest == nil || h.validationSvc == nil {
		return nil
	}
	if manifest.SHA256 == "" {
		return service.ErrScanManifestInvalid
	}
	if !strings.EqualFold(computedHashHex, manifest.SHA256) {
		return service.ErrScanHashMismatch
	}
	if err := service.VerifyHeaderTrailerBytes(head, tail, manifest.DetectedFormat); err != nil {
		return err
	}
	return nil
}

func (h *ChunkedUploadHandler) verifyUploadBytesAtFinalize(
	ctx context.Context,
	contentType string,
	computedHashHex string,
	head, tail []byte,
	manifest *service.UploadScanManifest,
) error {
	if manifest != nil && h.validationSvc != nil {
		return h.verifyManifestAtFinalize(ctx, computedHashHex, head, tail, manifest)
	}

	format, ok := service.StillImageFormatFromContentType(contentType)
	if !ok {
		return service.ErrScanHashMismatch
	}
	switch format {
	case "jpeg", "png", "webp", "gif":
		return service.VerifyHeaderTrailerBytes(head, tail, format)
	default:
		// RAW/HEIC/TIFF/AVIF require the desktop/source-side scanner before
		// server fallback decoding ships. The API accepts their session only
		// when a scanner manifest is present; without one, fail closed.
		return service.ErrScanManifestRequired
	}
}

func validateClientSideMediaManifest(manifest map[string]interface{}, totalSize int64) error {
	if len(manifest) == 0 {
		return errors.New("media_encryption is required")
	}
	if stringField(manifest, "scheme") != clientSideMediaScheme {
		return fmt.Errorf("scheme must be %q", clientSideMediaScheme)
	}
	if stringField(manifest, "algorithm") != clientSideMediaAlgorithm {
		return fmt.Errorf("algorithm must be %q", clientSideMediaAlgorithm)
	}
	keyID := stringField(manifest, "key_id")
	if keyID == "" {
		return errors.New("key_id is required")
	}
	if err := validateClientSideMediaKeyID(keyID); err != nil {
		return err
	}
	if stringField(manifest, "object_type") == "" {
		return errors.New("object_type is required")
	}
	iv := stringField(manifest, "iv_b64")
	if iv == "" {
		return errors.New("iv_b64 is required")
	}
	ivBytes, err := decodeFlexibleBase64(iv)
	if err != nil {
		return fmt.Errorf("iv_b64 is invalid: %w", err)
	}
	if len(ivBytes) != 12 {
		return errors.New("iv_b64 must decode to a 96-bit AES-GCM nonce")
	}
	cipherHash := stringField(manifest, "ciphertext_sha256")
	if len(cipherHash) != 64 {
		return errors.New("ciphertext_sha256 must be 64 hex characters")
	}
	if _, err := hex.DecodeString(cipherHash); err != nil {
		return fmt.Errorf("ciphertext_sha256 is invalid: %w", err)
	}
	if totalSize > 0 {
		if declared, ok := int64Field(manifest, "ciphertext_size"); ok && declared != totalSize {
			return fmt.Errorf("ciphertext_size %d does not match total_size %d", declared, totalSize)
		}
	}
	return nil
}

func validateClientSideMediaKeyID(keyID string) error {
	parts := strings.Split(keyID, ":")
	if len(parts) != 3 || parts[0] != "gallery" || parts[1] == "" {
		return errors.New("key_id must be a versioned gallery key id")
	}
	fingerprint := parts[2]
	if len(fingerprint) != 16 {
		return errors.New("key_id fingerprint must be 16 hex characters")
	}
	if _, err := hex.DecodeString(fingerprint); err != nil {
		return errors.New("key_id fingerprint must be 16 hex characters")
	}
	return nil
}

func decodeClientSideMediaManifest(raw []byte) (map[string]interface{}, bool, error) {
	if len(raw) == 0 {
		return nil, false, nil
	}
	var manifest map[string]interface{}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, false, fmt.Errorf("decode media encryption manifest: %w", err)
	}
	if len(manifest) == 0 {
		return nil, false, nil
	}
	if err := validateClientSideMediaManifest(manifest, 0); err != nil {
		return nil, false, err
	}
	return manifest, true, nil
}

func decodeSourceMetadata(raw []byte) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var metadata map[string]interface{}
	if err := json.Unmarshal(raw, &metadata); err != nil || metadata == nil {
		return map[string]interface{}{}
	}
	return metadata
}

func verifyClientSideMediaDigest(manifest map[string]interface{}, computedHashHex string, totalSize int64) error {
	if !strings.EqualFold(stringField(manifest, "ciphertext_sha256"), computedHashHex) {
		return ErrEncryptedMediaHashMismatch
	}
	if declared, ok := int64Field(manifest, "ciphertext_size"); ok && declared != totalSize {
		return ErrEncryptedMediaHashMismatch
	}
	return nil
}

func stringField(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	if s, ok := m[key].(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func int64Field(m map[string]interface{}, key string) (int64, bool) {
	if m == nil {
		return 0, false
	}
	switch v := m[key].(type) {
	case int:
		return int64(v), true
	case int64:
		return v, true
	case int32:
		return int64(v), true
	case float64:
		if v < 0 || v != float64(int64(v)) {
			return 0, false
		}
		return int64(v), true
	case json.Number:
		n, err := v.Int64()
		return n, err == nil
	default:
		return 0, false
	}
}

func decodeFlexibleBase64(value string) ([]byte, error) {
	encodings := []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	}
	var lastErr error
	for _, enc := range encodings {
		decoded, err := enc.DecodeString(value)
		if err == nil {
			return decoded, nil
		}
		lastErr = err
	}
	return nil, lastErr
}

// applyScanMetadata copies verified scan manifest fields onto the asset row.
// Nil manifest = no-op (legacy uploads).
func applyScanMetadata(asset *repository.Asset, manifest *service.UploadScanManifest) {
	if asset == nil || manifest == nil {
		return
	}
	status := "passed"
	engine := string(manifest.Engine)
	policy := manifest.PolicyVersion
	risk := manifest.RiskScore
	manifestHash := manifest.SHA256

	asset.UploadScanStatus = &status
	asset.UploadScanEngine = &engine
	asset.UploadScanPolicyVersion = &policy
	asset.UploadScanRiskScore = &risk
	asset.UploadScanManifestHash = &manifestHash

	if len(manifest.Findings) > 0 {
		findings := make([]map[string]interface{}, 0, len(manifest.Findings))
		for _, f := range manifest.Findings {
			entry := map[string]interface{}{
				"category": f.Category,
				"severity": f.Severity,
				"message":  f.Message,
			}
			if f.Offset != nil {
				entry["offset"] = *f.Offset
			}
			findings = append(findings, entry)
		}
		asset.UploadScanFindings = findings
	}
}

// ─── helpers ──────────────────────────────────────────────────────────────

// internalError logs the raw error server-side and writes a generic 500 body
// to the client. F-053: handlers previously embedded err.Error() directly in
// 5xx bodies, leaking storage-layer detail (B2 bucket names, object paths,
// multipart upload IDs) and Postgres error text (table/column/constraint
// names) to callers. The opaque error key lets the client distinguish failure
// sites for support without exposing internals; the full error stays in the
// server log keyed by upload ID. Reserve echoing err.Error() for 400-class
// validation where the message is user-actionable and carries no internal
// detail.
func internalError(w http.ResponseWriter, uploadID, errKey string, err error) {
	log.Printf("chunked_upload: %s upload=%s err=%v", errKey, uploadID, err)
	http.Error(w, fmt.Sprintf(`{"error":"internal server error","code":%q}`, errKey), http.StatusInternalServerError)
}

func deriveKeyAndUploadID(row *repository.UploadSession) (string, string) {
	if row == nil {
		return "", ""
	}
	ext := filepath.Ext(row.Filename)
	if ext == "" {
		parts := strings.Split(row.ContentType, "/")
		if len(parts) == 2 {
			ext = "." + parts[1]
		}
	}
	// The storage key pattern must match CreateSession exactly. CreateSession
	// builds the key as "<workspaceID>/<TUSUploadID>/original<ext>" where
	// TUSUploadID is the uuid minted at session creation time and persisted
	// on the row. Earlier revisions of this helper used row.ID (the DB PK),
	// which produced a different key and caused CompleteMultipartUpload to
	// fail with NoSuchUpload whenever finalize ran on a rehydrated state or
	// on a different backend instance than the one that created the
	// session. Always derive from TUSUploadID so CreateSession, UploadChunk,
	// rehydration, and finalize agree on the same key.
	storageKey := fmt.Sprintf("%s/%s/original%s", row.WorkspaceID.String(), row.TUSUploadID, ext)
	mpID := ""
	if row.R2MultipartUploadID != nil {
		mpID = *row.R2MultipartUploadID
	}
	return storageKey, mpID
}

func countExistingParts(partsJSON []byte) int {
	if len(partsJSON) == 0 {
		return 0
	}
	var parts []repository.UploadPartETag
	if err := json.Unmarshal(partsJSON, &parts); err != nil {
		return 0
	}
	return len(parts)
}

// verifyUploadChecksum parses an Upload-Checksum header and compares the
// decoded digest to the actual chunk bytes. Returns (statusCode, error)
// where statusCode is the HTTP status the caller should reply with on
// failure, or 0 on success.
func verifyUploadChecksum(chunk []byte, header string) (int, error) {
	parts := strings.SplitN(strings.TrimSpace(header), " ", 2)
	if len(parts) != 2 {
		return http.StatusBadRequest, errors.New("Upload-Checksum header malformed: expected '<algo> <base64>'")
	}
	algo := strings.ToLower(strings.TrimSpace(parts[0]))
	b64 := strings.TrimSpace(parts[1])
	if algo != "sha256" {
		return http.StatusBadRequest, fmt.Errorf("Upload-Checksum algorithm %q not supported", algo)
	}
	declared, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return http.StatusBadRequest, fmt.Errorf("Upload-Checksum base64 decode: %v", err)
	}
	actual := sha256.Sum256(chunk)
	if !bytes.Equal(declared, actual[:]) {
		return 460, errors.New("Upload-Checksum mismatch")
	}
	return 0, nil
}

func uuidPtr(u uuid.UUID) *uuid.UUID {
	return &u
}

// logRefundFailure surfaces a failed upload-credit refund at ERROR level so
// the credit ledger inconsistency is observable. F-027: the three
// finalize-failure refund paths (stream-hash-fail, scan-manifest-invalid,
// infra-failure) previously discarded the Refund error with `_ =`, so if the
// refund itself failed the user stayed billed for a failed upload with no
// detection path — even though the adjacent success-path Consume already
// logged its failures. The refund reasons carry idempotency keys, so this log
// line is the trigger a reconciliation / retry job needs to settle the
// dangling reservation. No-op when err is nil (the common case) so the log is
// only emitted on an actual failure.
func logRefundFailure(uploadID, reason string, err error) {
	if err == nil {
		return
	}
	log.Printf("m40: credit refund on finalize failed upload=%s reason=%s err=%v", uploadID, reason, err)
}
