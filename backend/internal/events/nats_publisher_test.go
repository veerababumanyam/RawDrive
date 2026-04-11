package events

// ISSUE-003 (brownfield P1, infra-drift): NATS JetStream is
// provisioned by docker-compose.yml but no backend code consumes
// it. Every event goes through the in-process logEventPublisher
// stub, which silently drops events on restart and breaks any
// downstream assumption of durable delivery. These tests pin the
// NATSPublisher contract that replaces the stub when EVENT_BROKER=nats.

import (
	"context"
	"errors"
	"testing"

	"github.com/nats-io/nats.go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeJetStreamPublisher captures a single Publish call so tests
// can assert on the arguments the NATSPublisher forwards.
type fakeJetStreamPublisher struct {
	called     bool
	subject    string
	data       []byte
	returnAck  *nats.PubAck
	returnErr  error
	callsCount int
}

func (f *fakeJetStreamPublisher) Publish(subj string, data []byte, _ ...nats.PubOpt) (*nats.PubAck, error) {
	f.called = true
	f.callsCount++
	f.subject = subj
	f.data = append(f.data[:0], data...)
	return f.returnAck, f.returnErr
}

// TestNATSPublisher_PublishForwardsSubjectAndData is the primary
// happy-path gate. A Publish call on NATSPublisher must reach the
// underlying JetStream client with the exact subject and data the
// caller supplied.
func TestNATSPublisher_PublishForwardsSubjectAndData(t *testing.T) {
	fake := &fakeJetStreamPublisher{returnAck: &nats.PubAck{Stream: "RAWDRIVE_EVENTS"}}
	p := &NATSPublisher{js: fake}

	err := p.Publish(context.Background(), "rawdrive.workspace.created", []byte(`{"id":"ws_123"}`))
	require.NoError(t, err)
	assert.True(t, fake.called, "underlying JetStream publisher must be invoked")
	assert.Equal(t, "rawdrive.workspace.created", fake.subject)
	assert.Equal(t, []byte(`{"id":"ws_123"}`), fake.data)
	assert.Equal(t, 1, fake.callsCount)
}

// TestNATSPublisher_PublishPropagatesError ensures the wrapping
// does not swallow publish failures. A failed JetStream ack must
// bubble up so callers can react (retry, enter degraded mode, etc).
func TestNATSPublisher_PublishPropagatesError(t *testing.T) {
	wantErr := errors.New("jetstream: no responders available")
	fake := &fakeJetStreamPublisher{returnErr: wantErr}
	p := &NATSPublisher{js: fake}

	err := p.Publish(context.Background(), "rawdrive.asset.uploaded", []byte(`{}`))
	require.Error(t, err)
	assert.ErrorIs(t, err, wantErr, "underlying publisher error must propagate")
}

// TestNATSPublisher_PublishRespectsContextCancellation pins the
// context-aware behavior: a cancelled context short-circuits the
// publish without hitting the JetStream client. This is important
// for shutdown sequences where we want to drain rather than block.
func TestNATSPublisher_PublishRespectsContextCancellation(t *testing.T) {
	fake := &fakeJetStreamPublisher{}
	p := &NATSPublisher{js: fake}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := p.Publish(ctx, "rawdrive.test.cancelled", []byte("x"))
	require.Error(t, err)
	assert.ErrorIs(t, err, context.Canceled)
	assert.False(t, fake.called, "cancelled context must short-circuit before the publish call")
}
