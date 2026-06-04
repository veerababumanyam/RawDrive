package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/repository"
)

// ─────────────────────────────────────────────────────────────────────────────
// PUB-CACHE: short-TTL cache for PUBLISHED + OPEN public gallery metadata.
//
// The public read path (GetBySlug / GetByBusinessSubdomainAndSlug) was written
// to always hit the DB: N anonymous views of one open public slug issued N slug
// resolves. These tests prove the short-TTL cache collapses repeated views of a
// single open slug to ONE DB read per TTL, invalidates on publish/settings
// change, and — critically — NEVER caches session-bound (password / private /
// invite-only / unpublished) galleries into the shared cache. Mirrors the
// CACHE-5 (workspace policy) + CACHE-4 (storage analytics) shared-cache seam.
// ─────────────────────────────────────────────────────────────────────────────

// countingSlugResolver is an in-memory stand-in for the GalleryRepo slug-resolve
// path. It counts how many times the DB-backed resolve was actually invoked so a
// test can prove the cache collapses repeated views to one read. The signature
// mirrors the production gallerySlugResolver seam.
type countingSlugResolver struct {
	mu          sync.Mutex
	bySlug      map[string]*repository.Gallery
	byCodeSlug  map[string]*repository.Gallery // key "<code>|<slug>"
	slugReads   int
	scopedReads int
}

func newCountingSlugResolver() *countingSlugResolver {
	return &countingSlugResolver{
		bySlug:     make(map[string]*repository.Gallery),
		byCodeSlug: make(map[string]*repository.Gallery),
	}
}

func (c *countingSlugResolver) GetBySlug(_ context.Context, slug string) (*repository.Gallery, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.slugReads++
	return c.bySlug[slug], nil
}

func (c *countingSlugResolver) GetBySlugScopedByBusinessCode(_ context.Context, code, slug string) (*repository.Gallery, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.scopedReads++
	return c.byCodeSlug[code+"|"+slug], nil
}

func (c *countingSlugResolver) reads() (slug, scoped int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.slugReads, c.scopedReads
}

// Update satisfies the galleryWriter seam so the invalidation test can drive a
// real Update() without a DB. It is a no-op write (the test asserts the cache
// invalidation, not the persistence, which gallery_workspace_test covers).
func (c *countingSlugResolver) Update(_ context.Context, _ *repository.Gallery) error {
	return nil
}

// fakeSharedGalleryCache is the in-memory Valkey stand-in, matching the no-DB
// test convention used by CACHE-5 (fakeSharedPolicyCache). Get/Set/Del over JSON
// bytes mirror the production sharedGalleryCache interface.
type fakeSharedGalleryCache struct {
	mu   sync.Mutex
	data map[string][]byte
	gets int
	sets int
	dels int
}

func newFakeSharedGalleryCache() *fakeSharedGalleryCache {
	return &fakeSharedGalleryCache{data: make(map[string][]byte)}
}

func (f *fakeSharedGalleryCache) Get(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.gets++
	b, ok := f.data[key]
	return b, ok, nil
}

func (f *fakeSharedGalleryCache) Set(_ context.Context, key string, val []byte, _ time.Duration) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sets++
	cp := make([]byte, len(val))
	copy(cp, val)
	f.data[key] = cp
}

func (f *fakeSharedGalleryCache) Del(_ context.Context, key string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.dels++
	delete(f.data, key)
}

func (f *fakeSharedGalleryCache) keyCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.data)
}

// newGalleryServiceForCacheTest builds a GalleryService whose slug-resolve seam
// is the injected counting fake (no DB), so tests can assert how many DB reads
// the public cache actually issues. Mirrors the no-DB construction convention
// used across this package's service tests.
func newGalleryServiceForCacheTest(resolver *countingSlugResolver) *GalleryService {
	return &GalleryService{
		slugResolver: resolver,
		writer:       resolver, // no-op Update so the invalidation test needs no DB
		publicCache:  make(map[string]cachedGallery),
	}
}

func openPublicGallery(slug string) *repository.Gallery {
	now := time.Now()
	return &repository.Gallery{
		ID:          uuid.New(),
		WorkspaceID: uuid.New(),
		Slug:        slug,
		Title:       "Sharma Wedding",
		IsPublished: true,
		AccessMode:  "public",
		UpdatedAt:   now,
		CreatedAt:   now,
	}
}

// RED #1: N anonymous views of one OPEN public slug must collapse to ONE DB read
// per TTL. Without the cache this counts N reads.
func TestPublicGalleryCache_OpenSlug_CollapsesToOneDBRead(t *testing.T) {
	resolver := newCountingSlugResolver()
	g := openPublicGallery("sharma-wedding-a1b2c3d4")
	resolver.bySlug[g.Slug] = g

	svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(newFakeSharedGalleryCache())

	const views = 25
	for i := 0; i < views; i++ {
		got, err := svc.GetBySlug(context.Background(), g.Slug)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, g.ID, got.ID)
	}

	slugReads, _ := resolver.reads()
	assert.Equal(t, 1, slugReads,
		"N=%d views of one open public slug must collapse to exactly 1 DB read within the TTL (PUB-CACHE)", views)
}

// The in-process (no shared backing) path must also collapse repeated reads —
// single-node deploys still get the cache.
func TestPublicGalleryCache_OpenSlug_CollapsesInProcess(t *testing.T) {
	resolver := newCountingSlugResolver()
	g := openPublicGallery("veera-engagement-deadbeef")
	resolver.bySlug[g.Slug] = g

	svc := newGalleryServiceForCacheTest(resolver) // no WithSharedCache

	for i := 0; i < 10; i++ {
		got, err := svc.GetBySlug(context.Background(), g.Slug)
		require.NoError(t, err)
		require.NotNil(t, got)
	}
	slugReads, _ := resolver.reads()
	assert.Equal(t, 1, slugReads, "in-process cache must also collapse repeated open-slug reads")
}

// RED #2: a publish / settings change (Update) must invalidate the cached entry
// so the next view re-reads the DB and serves the new metadata.
func TestPublicGalleryCache_Update_InvalidatesEntry(t *testing.T) {
	resolver := newCountingSlugResolver()
	g := openPublicGallery("studio-shoot-11223344")
	resolver.bySlug[g.Slug] = g
	svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(newFakeSharedGalleryCache())

	// Warm the cache.
	_, err := svc.GetBySlug(context.Background(), g.Slug)
	require.NoError(t, err)
	_, err = svc.GetBySlug(context.Background(), g.Slug)
	require.NoError(t, err)
	slugReads, _ := resolver.reads()
	require.Equal(t, 1, slugReads, "precondition: warmed cache served the 2nd read")

	// Photographer edits the gallery title; Update must invalidate the slug key.
	g.Title = "Sharma Wedding — Final Selects"
	require.NoError(t, svc.Update(context.Background(), g))

	// Next view must re-read the DB (cache was invalidated).
	got, err := svc.GetBySlug(context.Background(), g.Slug)
	require.NoError(t, err)
	require.NotNil(t, got)
	slugReads, _ = resolver.reads()
	assert.Equal(t, 2, slugReads,
		"Update() must invalidate the cached slug so the next view re-reads the DB (PUB-CACHE invalidation)")
}

// CONFIDENTIALITY GUARD: a password-protected gallery must NEVER enter the
// shared cache — its body is session-bound (PERF-HDR). Repeated views must hit
// the DB every time, and the shared cache must stay empty.
func TestPublicGalleryCache_PasswordProtected_NotCached(t *testing.T) {
	resolver := newCountingSlugResolver()
	pwd := "bcrypt-hash"
	g := openPublicGallery("private-shoot-55667788")
	g.PasswordHash = &pwd
	resolver.bySlug[g.Slug] = g

	fake := newFakeSharedGalleryCache()
	svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(fake)

	for i := 0; i < 5; i++ {
		_, err := svc.GetBySlug(context.Background(), g.Slug)
		require.NoError(t, err)
	}
	slugReads, _ := resolver.reads()
	assert.Equal(t, 5, slugReads, "password-protected gallery must NOT be cached (every view hits the DB)")
	assert.Equal(t, 0, fake.keyCount(), "a session-bound gallery must NEVER enter the shared cache")
}

// CONFIDENTIALITY GUARD: a private / invite-only gallery must NEVER be shared-cached.
func TestPublicGalleryCache_PrivateMode_NotCached(t *testing.T) {
	for _, mode := range []string{"private", "invite-only"} {
		t.Run(mode, func(t *testing.T) {
			resolver := newCountingSlugResolver()
			g := openPublicGallery("invite-shoot-99aabbcc")
			g.AccessMode = mode
			resolver.bySlug[g.Slug] = g
			fake := newFakeSharedGalleryCache()
			svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(fake)

			for i := 0; i < 3; i++ {
				_, err := svc.GetBySlug(context.Background(), g.Slug)
				require.NoError(t, err)
			}
			slugReads, _ := resolver.reads()
			assert.Equal(t, 3, slugReads, "%s gallery must not be cached", mode)
			assert.Equal(t, 0, fake.keyCount(), "%s gallery must never enter the shared cache", mode)
		})
	}
}

// CONFIDENTIALITY GUARD: an UNPUBLISHED gallery must never be cached (drafts).
func TestPublicGalleryCache_Unpublished_NotCached(t *testing.T) {
	resolver := newCountingSlugResolver()
	g := openPublicGallery("draft-shoot-ddee0011")
	g.IsPublished = false
	resolver.bySlug[g.Slug] = g
	fake := newFakeSharedGalleryCache()
	svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(fake)

	for i := 0; i < 3; i++ {
		_, err := svc.GetBySlug(context.Background(), g.Slug)
		require.NoError(t, err)
	}
	slugReads, _ := resolver.reads()
	assert.Equal(t, 3, slugReads, "unpublished gallery must not be cached")
	assert.Equal(t, 0, fake.keyCount(), "unpublished gallery must never enter the shared cache")
}

// Cross-node: two services sharing one backing model the two app nodes against
// one Valkey. An open slug warmed on node A must be served from the shared cache
// by node B without B re-reading its DB.
func TestPublicGalleryCache_SharedBacking_PropagatesAcrossNodes(t *testing.T) {
	g := openPublicGallery("crossnode-shoot-22334455")

	resolverA := newCountingSlugResolver()
	resolverA.bySlug[g.Slug] = g
	resolverB := newCountingSlugResolver()
	resolverB.bySlug[g.Slug] = g

	fake := newFakeSharedGalleryCache()
	nodeA := newGalleryServiceForCacheTest(resolverA).WithSharedCache(fake)
	nodeB := newGalleryServiceForCacheTest(resolverB).WithSharedCache(fake)

	// Node A warms the shared cache.
	_, err := nodeA.GetBySlug(context.Background(), g.Slug)
	require.NoError(t, err)

	// Node B serves from the shared backing without hitting its own DB.
	got, err := nodeB.GetBySlug(context.Background(), g.Slug)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, g.ID, got.ID)

	bSlugReads, _ := resolverB.reads()
	assert.Equal(t, 0, bSlugReads,
		"node B must serve an open slug warmed by node A from the shared cache, not its own DB (cross-node)")
}

// CONFIDENTIALITY GUARD (aliasing): the public handler mutates the returned
// gallery's Settings map in place — including, for a session-bound view, a
// per-viewer asset_access_token. The cache MUST return an independent copy each
// read so one viewer's mutation can never bleed into the next viewer's served
// entry. Proven by mutating the first read's Settings and asserting the second
// read is pristine.
func TestPublicGalleryCache_ReturnsIndependentCopy_NoAliasing(t *testing.T) {
	for _, shared := range []bool{false, true} {
		name := "in-process"
		if shared {
			name = "shared-valkey"
		}
		t.Run(name, func(t *testing.T) {
			resolver := newCountingSlugResolver()
			g := openPublicGallery("aliasing-shoot-aa11bb22")
			g.Settings = map[string]interface{}{"max_selections": float64(10)}
			resolver.bySlug[g.Slug] = g

			svc := newGalleryServiceForCacheTest(resolver)
			if shared {
				svc = svc.WithSharedCache(newFakeSharedGalleryCache())
			}

			// Warm the cache (1st read = DB miss, snapshots into the cache).
			_, err := svc.GetBySlug(context.Background(), g.Slug)
			require.NoError(t, err)

			// Viewer A reads from the cache and the handler mutates its Settings
			// with a per-viewer secret.
			viewerA, err := svc.GetBySlug(context.Background(), g.Slug)
			require.NoError(t, err)
			require.NotNil(t, viewerA)
			viewerA.Settings["asset_access_token"] = "viewer-A-secret-token"

			// Viewer B's subsequent cached read must be pristine — A's mutation
			// must not have polluted the cached entry.
			viewerB, err := svc.GetBySlug(context.Background(), g.Slug)
			require.NoError(t, err)
			require.NotNil(t, viewerB)
			_, leaked := viewerB.Settings["asset_access_token"]
			assert.False(t, leaked,
				"a per-viewer mutation on one cached read must NOT leak into the next viewer's read (%s)", name)

			// Each cached read must be a distinct object (no shared pointer).
			assert.NotSame(t, viewerA, viewerB, "each cache read must return an independent gallery (%s)", name)
		})
	}
}

// The business-scoped path (per-business subdomain) must also cache an open
// public gallery, keyed on code+slug so a wrong business code never serves a
// cached row meant for another scope.
func TestPublicGalleryCache_BusinessScoped_CollapsesAndScopes(t *testing.T) {
	resolver := newCountingSlugResolver()
	g := openPublicGallery("biz-shoot-66778899")
	resolver.byCodeSlug["abcd1234|"+g.Slug] = g

	svc := newGalleryServiceForCacheTest(resolver).WithSharedCache(newFakeSharedGalleryCache())

	for i := 0; i < 5; i++ {
		got, err := svc.GetByBusinessSubdomainAndSlug(context.Background(), "studio-abcd1234", g.Slug)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, g.ID, got.ID)
	}
	_, scopedReads := resolver.reads()
	assert.Equal(t, 1, scopedReads, "repeated business-scoped views of one open slug collapse to 1 DB read")

	// A request with the WRONG business code must NOT be served the cached row —
	// it must miss the cache and resolve (to nil) via the scoped DB query.
	got, err := svc.GetByBusinessSubdomainAndSlug(context.Background(), "studio-wrongcode", g.Slug)
	require.NoError(t, err)
	assert.Nil(t, got, "a wrong business code must never be served another scope's cached gallery")
}
