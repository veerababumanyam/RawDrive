// Package statepusher implements the in-memory pub/sub fan-out for stream
// state-change events. A NATS-backed adapter can later replace the in-memory
// broker without changing the StatePusher interface.
//
// Scope (M35 Round 2, story 35-2):
//   - Subscribe / Unsubscribe with Last-Event-ID replay from a per-stream ring buffer.
//   - 15-second heartbeat ticker per subscriber (injectable clock for tests).
//   - Multi-subscriber fan-out.
//
// Out of scope here: the HTTP SSE handler (Round 3) and NATS wiring (later wave).
package statepusher

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

// HeartbeatInterval is the cadence at which idle subscribers receive a
// heartbeat event so the SSE transport can keep proxies from closing.
const HeartbeatInterval = 15 * time.Second

// StateEvent is the payload fanned out to subscribers. It is PII-free by
// contract — only state + timestamps + opaque JSON payload (e.g. signed
// playback URL) travel on the wire.
type StateEvent struct {
	ID      string          `json:"id"`
	Kind    string          `json:"kind"` // "state_change" | "heartbeat"
	State   string          `json:"state"`
	At      time.Time       `json:"at"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Clock abstracts time.Now and ticker creation so tests can drive heartbeats
// deterministically.
type Clock interface {
	Now() time.Time
	NewTicker(d time.Duration) Ticker
}

// Ticker is the minimal ticker surface needed by the pusher.
type Ticker interface {
	C() <-chan time.Time
	Stop()
}

// SystemClock is the production Clock backed by the stdlib.
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }
func (SystemClock) NewTicker(d time.Duration) Ticker {
	t := time.NewTicker(d)
	return &sysTicker{t: t}
}

type sysTicker struct{ t *time.Ticker }

func (s *sysTicker) C() <-chan time.Time { return s.t.C }
func (s *sysTicker) Stop()               { s.t.Stop() }

// subscriber is one live consumer attached to a stream.
type subscriber struct {
	id uuid.UUID
	ch chan StateEvent
}

// ringBuffer is a fixed-size FIFO of recent events used to honour
// Last-Event-ID replays after reconnect.
type ringBuffer struct {
	mu     sync.Mutex
	buf    []StateEvent
	size   int
}

func newRingBuffer(size int) *ringBuffer {
	if size <= 0 {
		size = 64
	}
	return &ringBuffer{size: size, buf: make([]StateEvent, 0, size)}
}

func (r *ringBuffer) append(ev StateEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.buf) >= r.size {
		copy(r.buf, r.buf[1:])
		r.buf = r.buf[:len(r.buf)-1]
	}
	r.buf = append(r.buf, ev)
}

// since returns events strictly after the one matching lastEventID. If
// lastEventID is empty or not found, all buffered events are returned.
func (r *ringBuffer) since(lastEventID string) []StateEvent {
	r.mu.Lock()
	defer r.mu.Unlock()
	if lastEventID == "" {
		return nil
	}
	idx := -1
	for i, ev := range r.buf {
		if ev.ID == lastEventID {
			idx = i
			break
		}
	}
	if idx < 0 {
		// Unknown cursor — replay everything we still have buffered.
		out := make([]StateEvent, len(r.buf))
		copy(out, r.buf)
		return out
	}
	tail := r.buf[idx+1:]
	out := make([]StateEvent, len(tail))
	copy(out, tail)
	return out
}

// StatePusher is a per-process in-memory broker keyed by stream id. The public
// surface is concurrency-safe.
type StatePusher struct {
	mu         sync.RWMutex
	subs       map[uuid.UUID]map[uuid.UUID]*subscriber
	buffers    map[uuid.UUID]*ringBuffer
	bufferSize int
	clock      Clock
}

// NewStatePusher constructs an in-memory pusher with the given clock and
// per-stream ring buffer size (e.g. 64).
func NewStatePusher(clock Clock, bufferSize int) *StatePusher {
	if clock == nil {
		clock = SystemClock{}
	}
	return &StatePusher{
		subs:       make(map[uuid.UUID]map[uuid.UUID]*subscriber),
		buffers:    make(map[uuid.UUID]*ringBuffer),
		bufferSize: bufferSize,
		clock:      clock,
	}
}

// Publish records the event in the per-stream ring buffer and fans it out
// to every active subscriber. Slow subscribers are dropped (best-effort,
// non-blocking send) to avoid head-of-line blocking.
func (p *StatePusher) Publish(_ context.Context, streamID uuid.UUID, ev StateEvent) error {
	if ev.ID == "" {
		return errors.New("statepusher: StateEvent.ID required")
	}
	if ev.Kind == "" {
		ev.Kind = "state_change"
	}
	p.mu.Lock()
	buf, ok := p.buffers[streamID]
	if !ok {
		buf = newRingBuffer(p.bufferSize)
		p.buffers[streamID] = buf
	}
	subs := p.subs[streamID]
	// Snapshot subscribers to fan out without holding the lock during sends.
	fan := make([]*subscriber, 0, len(subs))
	for _, s := range subs {
		fan = append(fan, s)
	}
	p.mu.Unlock()

	buf.append(ev)
	for _, s := range fan {
		select {
		case s.ch <- ev:
		default:
			// Slow consumer; drop rather than block. Handler layer is
			// expected to close the connection on backpressure.
		}
	}
	return nil
}

// Subscribe returns a channel that receives state events and heartbeats for
// the given stream. If lastEventID is non-empty, any buffered events after
// that id are replayed to the new subscriber before live events flow.
//
// The returned cleanup func removes the subscriber and stops the heartbeat
// ticker. Cancelling ctx has the same effect asynchronously.
func (p *StatePusher) Subscribe(ctx context.Context, streamID uuid.UUID, lastEventID string) (<-chan StateEvent, func(), error) {
	sub := &subscriber{
		id: uuid.New(),
		ch: make(chan StateEvent, 32),
	}

	p.mu.Lock()
	if _, ok := p.subs[streamID]; !ok {
		p.subs[streamID] = make(map[uuid.UUID]*subscriber)
	}
	p.subs[streamID][sub.id] = sub
	buf := p.buffers[streamID]
	p.mu.Unlock()

	// Replay any missed events before starting the heartbeat loop.
	if buf != nil {
		for _, ev := range buf.since(lastEventID) {
			select {
			case sub.ch <- ev:
			default:
			}
		}
	}

	var once sync.Once
	cleanup := func() {
		once.Do(func() {
			p.mu.Lock()
			if m, ok := p.subs[streamID]; ok {
				delete(m, sub.id)
				if len(m) == 0 {
					delete(p.subs, streamID)
				}
			}
			p.mu.Unlock()
			close(sub.ch)
		})
	}

	// Heartbeat goroutine — emits a heartbeat event on the subscriber's own
	// channel every HeartbeatInterval. Stops on ctx.Done() and runs cleanup.
	ticker := p.clock.NewTicker(HeartbeatInterval)
	go func() {
		defer ticker.Stop()
		defer cleanup()
		for {
			select {
			case <-ctx.Done():
				return
			case t := <-ticker.C():
				hb := StateEvent{
					ID:   "hb-" + t.UTC().Format(time.RFC3339Nano),
					Kind: "heartbeat",
					At:   t.UTC(),
				}
				// Non-blocking: if the subscriber is gone, we'll exit on ctx.
				select {
				case sub.ch <- hb:
				default:
				}
			}
		}
	}()

	return sub.ch, cleanup, nil
}

// SubscriberCount returns the current subscriber count for a stream. Exposed
// for tests and for future ops metrics.
func (p *StatePusher) SubscriberCount(streamID uuid.UUID) int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.subs[streamID])
}
