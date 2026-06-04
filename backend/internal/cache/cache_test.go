package cache_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/rawdrive/backend/internal/cache"
)

func TestGetMiss_RecordsMiss(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	if _, ok := c.Get("absent"); ok {
		t.Fatalf("expected miss on absent key")
	}
	hits, misses := c.Stats()
	if hits != 0 || misses != 1 {
		t.Fatalf("want hits=0 misses=1, got hits=%d misses=%d", hits, misses)
	}
}

func TestSetGet_RecordsHit(t *testing.T) {
	c := cache.New[string]("test", time.Minute)
	c.Set("k", "v")
	got, ok := c.Get("k")
	if !ok || got != "v" {
		t.Fatalf("want (v,true), got (%q,%v)", got, ok)
	}
	hits, misses := c.Stats()
	if hits != 1 || misses != 0 {
		t.Fatalf("want hits=1 misses=0, got hits=%d misses=%d", hits, misses)
	}
}

func TestGet_ExpiredIsMiss(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	c.SetTTL("k", 7, time.Millisecond)
	time.Sleep(10 * time.Millisecond)
	if _, ok := c.Get("k"); ok {
		t.Fatalf("expired entry must be a miss")
	}
	_, misses := c.Stats()
	if misses != 1 {
		t.Fatalf("expired read must count as a miss, got misses=%d", misses)
	}
}

func TestTTLBoundary_ValidWhileBeforeExpiry(t *testing.T) {
	// An entry with a long TTL must be a hit immediately after Set.
	c := cache.New[int]("test", time.Hour)
	c.Set("k", 42)
	if v, ok := c.Get("k"); !ok || v != 42 {
		t.Fatalf("entry within TTL must be a hit, got (%d,%v)", v, ok)
	}
}

func TestDelete_Invalidates(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	c.Set("k", 1)
	c.Delete("k")
	if _, ok := c.Get("k"); ok {
		t.Fatalf("deleted key must miss")
	}
	if c.Len() != 0 {
		t.Fatalf("delete must remove the entry, len=%d", c.Len())
	}
	// Deleting an absent key is a no-op.
	c.Delete("never")
}

func TestGetOrLoad_LoadsOnMissThenCaches(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	calls := 0
	loader := func(context.Context) (int, error) {
		calls++
		return 99, nil
	}
	v, err := c.GetOrLoad(context.Background(), "k", loader)
	if err != nil || v != 99 {
		t.Fatalf("first load: want (99,nil), got (%d,%v)", v, err)
	}
	v, err = c.GetOrLoad(context.Background(), "k", loader)
	if err != nil || v != 99 {
		t.Fatalf("second load: want (99,nil), got (%d,%v)", v, err)
	}
	if calls != 1 {
		t.Fatalf("loader must run once (read-through), ran %d times", calls)
	}
}

func TestGetOrLoad_ErrorNotCached(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	boom := errors.New("boom")
	calls := 0
	loader := func(context.Context) (int, error) {
		calls++
		return 0, boom
	}
	if _, err := c.GetOrLoad(context.Background(), "k", loader); !errors.Is(err, boom) {
		t.Fatalf("want boom, got %v", err)
	}
	// A loader error must NOT be cached: the next call re-invokes the loader.
	if _, err := c.GetOrLoad(context.Background(), "k", loader); !errors.Is(err, boom) {
		t.Fatalf("want boom on retry, got %v", err)
	}
	if calls != 2 {
		t.Fatalf("loader error must not be cached, loader ran %d times (want 2)", calls)
	}
}

func TestNamespacing_NoCollision(t *testing.T) {
	a := cache.New[string]("ns.a", time.Minute)
	b := cache.New[string]("ns.b", time.Minute)
	a.Set("same", "from-a")
	b.Set("same", "from-b")
	if v, _ := a.Get("same"); v != "from-a" {
		t.Fatalf("namespace a leaked, got %q", v)
	}
	if v, _ := b.Get("same"); v != "from-b" {
		t.Fatalf("namespace b leaked, got %q", v)
	}
}

func TestLen(t *testing.T) {
	c := cache.New[int]("test", time.Minute)
	if c.Len() != 0 {
		t.Fatalf("fresh cache len must be 0, got %d", c.Len())
	}
	c.Set("a", 1)
	c.Set("b", 2)
	if c.Len() != 2 {
		t.Fatalf("len must be 2, got %d", c.Len())
	}
}

// ── Backend / JSON fallback ──────────────────────────────────────────────────

// fakeBackend is an in-memory Backend with controllable error behavior.
type fakeBackend struct {
	mu      sync.Mutex
	data    map[string][]byte
	failGet bool
	failSet bool
	getKeys []string // observed keys, to assert namespacing
}

func newFakeBackend() *fakeBackend { return &fakeBackend{data: map[string][]byte{}} }

func (f *fakeBackend) GetJSON(_ context.Context, key string) ([]byte, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.getKeys = append(f.getKeys, key)
	if f.failGet {
		return nil, false, errors.New("backend down")
	}
	b, ok := f.data[key]
	return b, ok, nil
}

func (f *fakeBackend) SetJSON(_ context.Context, key string, data []byte, _ time.Duration) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failSet {
		return errors.New("backend down")
	}
	f.data[key] = data
	return nil
}

type payload struct {
	Name string `json:"name"`
	N    int    `json:"n"`
}

func TestJSON_RoundTripThroughBackend(t *testing.T) {
	be := newFakeBackend()
	c := cache.New[payload]("doc", time.Minute, cache.WithBackend[payload](be))

	if err := c.SetJSON(context.Background(), "k", payload{Name: "x", N: 5}); err != nil {
		t.Fatalf("SetJSON: %v", err)
	}
	// The backend must see the namespaced key.
	be.mu.Lock()
	_, stored := be.data["doc:k"]
	be.mu.Unlock()
	if !stored {
		t.Fatalf("backend should hold namespaced key doc:k")
	}

	// Fresh cache sharing the same backend reads it back through JSON.
	c2 := cache.New[payload]("doc", time.Minute, cache.WithBackend[payload](be))
	got, ok := c2.GetJSON(context.Background(), "k")
	if !ok || got.Name != "x" || got.N != 5 {
		t.Fatalf("want payload{x,5} from backend, got (%+v,%v)", got, ok)
	}
}

func TestJSON_BackendErrorFallsBackToInProc(t *testing.T) {
	be := newFakeBackend()
	c := cache.New[payload]("doc", time.Minute, cache.WithBackend[payload](be))

	// Write lands in-proc even if the backend write fails.
	be.failSet = true
	if err := c.SetJSON(context.Background(), "k", payload{Name: "local", N: 1}); err != nil {
		t.Fatalf("SetJSON must not fail the caller on backend write error, got %v", err)
	}

	// Now reads against a failing backend must fall back to the in-proc value.
	be.failGet = true
	got, ok := c.GetJSON(context.Background(), "k")
	if !ok || got.Name != "local" {
		t.Fatalf("backend error must fall back to in-proc, got (%+v,%v)", got, ok)
	}
}

func TestJSON_BackendMissFallsBackToInProc(t *testing.T) {
	be := newFakeBackend()
	c := cache.New[payload]("doc", time.Minute, cache.WithBackend[payload](be))
	// In-proc only; backend has nothing.
	c.SetTTL("k", payload{Name: "mem", N: 2}, time.Minute)
	be.failGet = false
	got, ok := c.GetJSON(context.Background(), "k")
	if !ok || got.Name != "mem" {
		t.Fatalf("backend miss must fall back to in-proc, got (%+v,%v)", got, ok)
	}
}

func TestJSON_NoBackendIsPureInProc(t *testing.T) {
	c := cache.New[payload]("doc", time.Minute)
	if err := c.SetJSON(context.Background(), "k", payload{Name: "y", N: 3}); err != nil {
		t.Fatalf("SetJSON without backend: %v", err)
	}
	got, ok := c.GetJSON(context.Background(), "k")
	if !ok || got.Name != "y" {
		t.Fatalf("pure in-proc JSON round trip failed, got (%+v,%v)", got, ok)
	}
}

func TestConcurrentAccess_NoRace(t *testing.T) {
	c := cache.New[int]("race", time.Minute)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := "k"
			c.Set(key, i)
			_, _ = c.Get(key)
			_, _ = c.GetOrLoad(context.Background(), "load", func(context.Context) (int, error) {
				return i, nil
			})
			c.Delete(key)
			_ = c.Len()
			_, _ = c.Stats()
		}(i)
	}
	wg.Wait()
}
