package brownfield_test

// ISSUE-003 smoke test: publish an event through the real
// events.NATSPublisher implementation to the compose NATS
// JetStream container and verify the message lands in the
// RAWDRIVE_EVENTS stream by reading it back via a pull consumer.
//
// When NATS is not reachable at localhost:4222 the test skips
// cleanly. When NATS accepts the TCP connection but does not send
// the INFO line within 2 seconds (classic hung-container symptom)
// the test also skips so it cannot deadlock the test binary.

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nats-io/nats.go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/rawdrive/backend/internal/events"
)

const natsHostPort = "127.0.0.1:4222"

// natsReachable returns true iff TCP connects AND the NATS server
// sends an INFO line (which starts with "INFO ") within 2 seconds.
// A port-open-but-no-protocol state skips.
func natsReachable(t *testing.T) bool {
	t.Helper()
	d := net.Dialer{Timeout: 2 * time.Second}
	conn, err := d.Dial("tcp", natsHostPort)
	if err != nil {
		return false
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	buf := make([]byte, 5)
	n, err := conn.Read(buf)
	if err != nil || n < 5 {
		return false
	}
	return string(buf[:5]) == "INFO "
}

// TestIssue003_NATS_PublishReachesStream is the end-to-end smoke
// test for the NATS publisher. It uses the REAL
// events.NewNATSPublisher constructor (which connects, provisions
// the stream if needed, and returns a ready publisher) and then
// verifies the published message lands in the RAWDRIVE_EVENTS
// stream by reading it back with a pull subscription.
func TestIssue003_NATS_PublishReachesStream(t *testing.T) {
	if !natsReachable(t) {
		t.Skip("nats not reachable at 127.0.0.1:4222 (compose down or container hung)")
	}

	pub, err := events.NewNATSPublisher("nats://" + natsHostPort)
	require.NoError(t, err, "construct NATSPublisher")
	t.Cleanup(pub.Close)

	// Use a unique subject per run so we never collide with other
	// test runs or leftover stream state.
	testID := uuid.New().String()
	subject := events.SubjectPrefix + "brownfield.smoke." + testID
	payload := []byte(`{"smoke":"` + testID + `"}`)

	err = pub.Publish(context.Background(), subject, payload)
	require.NoError(t, err, "Publish to JetStream")

	// Verify by subscribing with an ephemeral pull consumer bound
	// to the exact subject and reading the last message.
	nc, err := nats.Connect("nats://" + natsHostPort)
	require.NoError(t, err)
	t.Cleanup(func() { nc.Close() })

	js, err := nc.JetStream()
	require.NoError(t, err)

	sub, err := js.PullSubscribe(subject, "brownfield-smoke-"+testID[:8],
		nats.BindStream(events.StreamName),
		nats.DeliverAll(),
	)
	require.NoError(t, err, "create pull subscription")
	t.Cleanup(func() { _ = sub.Unsubscribe() })

	msgs, err := sub.Fetch(1, nats.MaxWait(3*time.Second))
	require.NoError(t, err, "fetch from JetStream")
	require.Len(t, msgs, 1)

	assert.Equal(t, subject, msgs[0].Subject)
	assert.Equal(t, payload, msgs[0].Data)
	require.NoError(t, msgs[0].Ack())
}
