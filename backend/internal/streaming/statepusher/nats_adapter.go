// NATS JetStream adapter for StatePusher.
//
// Production runs N app pods behind a load balancer. The in-memory
// StatePusher fan-outs only to subscribers attached to the same pod
// that called Publish — viewers connected to pod B will never see a
// state change emitted on pod A. NATSStatePusher closes that gap by
// fan-out to BOTH the local in-memory broker (for low-latency same-pod
// delivery) AND a NATS JetStream subject (for cross-pod delivery).
//
// Each pod independently subscribes to the NATS subject for any stream
// it has live SSE viewers on. Inbound NATS messages are re-published
// into the local broker so that the Subscribe semantics (replay,
// heartbeat, slow-consumer drop) remain identical to the in-memory
// implementation. The subscriber never sees the difference.
//
// Failure mode: if the NATS publish fails (broker down, network blip),
// we still complete the local Publish — single-pod delivery degrades
// gracefully to "works for viewers on the publishing pod" rather than
// blocking the entire stream-state pipeline.
package statepusher

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/google/uuid"
)

// NATSMessage is the minimal envelope a subscriber implementation must
// surface for each delivered JetStream message. Seq is the monotonic
// stream sequence used to honour Last-Event-ID style replay (we map the
// last-known StateEvent.ID to a stored sequence on the consumer side).
type NATSMessage struct {
	Subject string
	Data    []byte
	Seq     uint64
}

// NATSPublisher is the publish-side seam. The production implementation
// is a thin wrapper around nats.JetStreamContext.Publish; tests inject
// a fake that records or fails calls deterministically.
type NATSPublisher interface {
	Publish(ctx context.Context, subject string, data []byte) error
}

// NATSSubscriber is the subscribe-side seam. startSeq=0 means "live
// only — no replay"; startSeq>0 means "deliver from this sequence
// forward" so reconnecting clients can recover events emitted on
// other pods while they were disconnected.
//
// The returned channel is closed by the cancel func or when ctx is
// done. Implementations must not block the channel — slow consumers
// are dropped consistent with the in-memory broker contract.
type NATSSubscriber interface {
	Subscribe(ctx context.Context, subject string, startSeq uint64) (<-chan NATSMessage, func(), error)
}

// SubjectFunc maps a stream UUID to the NATS subject carrying its
// state events. Default: "rawdrive.stream.<uuid>.state". The prefix
// matches the RAWDRIVE_EVENTS JetStream filter ("rawdrive.>") so the
// existing stream config requires no changes.
type SubjectFunc func(streamID uuid.UUID) string

// DefaultSubject builds the canonical state-pusher subject for a stream.
func DefaultSubject(streamID uuid.UUID) string {
	return fmt.Sprintf("rawdrive.stream.%s.state", streamID.String())
}

// NATSStatePusher is a StatePusher-compatible facade that bridges the
// in-process broker with a JetStream-backed subject so events fan out
// across pods. It composes (does not replace) the local StatePusher so
// in-process subscribers keep their low-latency delivery path.
type NATSStatePusher struct {
	pub       NATSPublisher
	sub       NATSSubscriber
	subjectFn SubjectFunc
	local     *StatePusher
	logger    *slog.Logger

	// bridges tracks per-stream NATS subscriptions so we don't open
	// duplicate consumers for streams that already have a local viewer.
	mu      sync.Mutex
	bridges map[uuid.UUID]*natsBridge

	// lastSeq tracks the NATS stream sequence of the most recent message
	// delivered for each stream id so a reconnecting subscriber can ask
	// JetStream to resume from the right place.
	lastSeq map[uuid.UUID]uint64
}

type natsBridge struct {
	cancel   func()
	refCount int
}

// NewNATSStatePusher constructs the adapter. local must be non-nil — it
// is the source of truth for in-pod subscriber fan-out and ring-buffer
// replay. pub and sub may be the same underlying NATS connection
// surfaced through two interfaces; tests inject fakes.
func NewNATSStatePusher(pub NATSPublisher, sub NATSSubscriber, local *StatePusher) *NATSStatePusher {
	if local == nil {
		panic("statepusher: NewNATSStatePusher requires a non-nil local StatePusher")
	}
	return &NATSStatePusher{
		pub:       pub,
		sub:       sub,
		subjectFn: DefaultSubject,
		local:     local,
		logger:    slog.Default(),
		bridges:   make(map[uuid.UUID]*natsBridge),
		lastSeq:   make(map[uuid.UUID]uint64),
	}
}

// WithSubjectFunc overrides the default subject builder. Useful for
// multi-tenant subject sharding or for tests.
func (p *NATSStatePusher) WithSubjectFunc(fn SubjectFunc) *NATSStatePusher {
	if fn != nil {
		p.subjectFn = fn
	}
	return p
}

// WithLogger overrides the default slog logger.
func (p *NATSStatePusher) WithLogger(l *slog.Logger) *NATSStatePusher {
	if l != nil {
		p.logger = l
	}
	return p
}

// Publish fans the event out to (1) the local broker so same-pod
// subscribers see it immediately and (2) NATS so other pods can bridge
// it into their own brokers. A NATS failure is logged but does NOT
// fail the call — local delivery still succeeds. The local broker is
// the ID-required validator, so we publish locally first.
func (p *NATSStatePusher) Publish(ctx context.Context, streamID uuid.UUID, ev StateEvent) error {
	if err := p.local.Publish(ctx, streamID, ev); err != nil {
		return err
	}
	if p.pub == nil {
		return nil
	}
	data, err := json.Marshal(ev)
	if err != nil {
		// Local already has the event; surface the marshal error so
		// callers know cross-pod delivery did not happen.
		return fmt.Errorf("statepusher: marshal event for NATS: %w", err)
	}
	subject := p.subjectFn(streamID)
	if err := p.pub.Publish(ctx, subject, data); err != nil {
		// Soft failure — log and continue. Same-pod viewers still see
		// the event via the local broker; cross-pod viewers will miss
		// this one until NATS recovers.
		p.logger.Warn("statepusher: NATS publish failed; falling back to local-only delivery",
			"stream_id", streamID.String(),
			"subject", subject,
			"event_id", ev.ID,
			"err", err,
		)
		return nil
	}
	return nil
}

// Subscribe attaches a local subscriber and ensures a NATS bridge is
// running for this stream so cross-pod events are forwarded into the
// local broker. The returned cleanup decrements the bridge ref-count
// and tears the NATS subscription down once the last subscriber leaves.
//
// lastEventID semantics: if the local ring buffer still contains the
// referenced event, replay happens out of memory exactly as before. If
// the cursor is unknown locally (e.g. it was emitted on another pod),
// we ask the NATS subscriber to resume from the last sequence we have
// observed for this stream so the bridge can backfill the gap.
func (p *NATSStatePusher) Subscribe(ctx context.Context, streamID uuid.UUID, lastEventID string) (<-chan StateEvent, func(), error) {
	ch, localCleanup, err := p.local.Subscribe(ctx, streamID, lastEventID)
	if err != nil {
		return nil, nil, err
	}

	if p.sub == nil {
		return ch, localCleanup, nil
	}

	bridgeCleanup, err := p.ensureBridge(streamID, lastEventID)
	if err != nil {
		// Don't fail the subscribe — local delivery still works.
		p.logger.Warn("statepusher: NATS bridge unavailable; local-only delivery",
			"stream_id", streamID.String(),
			"err", err,
		)
		return ch, localCleanup, nil
	}

	cleanup := func() {
		bridgeCleanup()
		localCleanup()
	}
	return ch, cleanup, nil
}

// ensureBridge starts a single NATS subscription per stream id and
// re-publishes inbound messages into the local broker. Subsequent
// Subscribe calls share the bridge via a refcount so we don't open
// N JetStream consumers for N viewers of the same live stream.
func (p *NATSStatePusher) ensureBridge(streamID uuid.UUID, lastEventID string) (func(), error) {
	p.mu.Lock()
	if b, ok := p.bridges[streamID]; ok {
		b.refCount++
		p.mu.Unlock()
		return p.releaseBridge(streamID), nil
	}

	startSeq := uint64(0)
	if lastEventID != "" {
		// We don't have a local seq for an unknown id; 0 means "live
		// only" which is the safe default for bridging.
		startSeq = p.lastSeq[streamID]
	}
	subject := p.subjectFn(streamID)
	p.mu.Unlock()

	ctx, cancel := context.WithCancel(context.Background())
	msgs, natsCancel, err := p.sub.Subscribe(ctx, subject, startSeq)
	if err != nil {
		cancel()
		return nil, err
	}

	p.mu.Lock()
	p.bridges[streamID] = &natsBridge{
		cancel: func() {
			natsCancel()
			cancel()
		},
		refCount: 1,
	}
	p.mu.Unlock()

	go p.runBridge(streamID, subject, msgs)
	return p.releaseBridge(streamID), nil
}

func (p *NATSStatePusher) releaseBridge(streamID uuid.UUID) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			p.mu.Lock()
			b, ok := p.bridges[streamID]
			if !ok {
				p.mu.Unlock()
				return
			}
			b.refCount--
			if b.refCount <= 0 {
				delete(p.bridges, streamID)
				p.mu.Unlock()
				b.cancel()
				return
			}
			p.mu.Unlock()
		})
	}
}

// runBridge forwards NATS messages into the local broker. Each message
// is decoded as a StateEvent and re-published locally. To avoid a
// publish→NATS→bridge→publish loop, the bridge calls local.Publish
// directly (bypassing the NATSStatePusher.Publish that would re-emit
// to NATS).
func (p *NATSStatePusher) runBridge(streamID uuid.UUID, subject string, msgs <-chan NATSMessage) {
	for m := range msgs {
		var ev StateEvent
		if err := json.Unmarshal(m.Data, &ev); err != nil {
			p.logger.Warn("statepusher: drop malformed NATS message",
				"stream_id", streamID.String(),
				"subject", subject,
				"err", err,
			)
			continue
		}
		if ev.ID == "" {
			// local.Publish would reject this; skip silently.
			continue
		}
		p.mu.Lock()
		if m.Seq > p.lastSeq[streamID] {
			p.lastSeq[streamID] = m.Seq
		}
		p.mu.Unlock()
		if err := p.local.Publish(context.Background(), streamID, ev); err != nil {
			p.logger.Warn("statepusher: local re-publish from NATS failed",
				"stream_id", streamID.String(),
				"event_id", ev.ID,
				"err", err,
			)
		}
	}
}
