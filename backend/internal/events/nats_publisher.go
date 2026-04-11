// Package events implements transport-level event publishing for
// the RawDrive backend. ISSUE-003 (brownfield P1, infra-drift): the
// docker-compose stack provisioned NATS 2 with JetStream but the
// backend had zero references to nats.Connect or JetStream — every
// published event went through an in-process stub that silently
// dropped messages on restart. This package wires a real
// JetStream-backed EventPublisher that main.go selects via the
// EVENT_BROKER env flag.
//
// The public EventPublisher contract is the same shape already
// declared by handler.EventPublisher, onboarding.EventPublisher and
// workspace.EventPublisher: a single Publish(ctx, subject, data) method.
// NATSPublisher satisfies all three structurally, so the in-process
// stub can be swapped in main.go without touching service signatures.
package events

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
)

// jetStreamPublisher is the minimal subset of
// nats.JetStreamContext that this package uses. Defined as an
// interface so unit tests can inject a fake without opening a
// socket or standing up a broker.
type jetStreamPublisher interface {
	Publish(subj string, data []byte, opts ...nats.PubOpt) (*nats.PubAck, error)
}

// NATSPublisher publishes events to NATS JetStream. Construction
// dials the broker and ensures the RAWDRIVE_EVENTS stream exists.
// Publish blocks until JetStream acknowledges the message or until
// the NATS client's AckWait timeout elapses. See the Publish method
// doc for the exact context semantics — the ctx is honoured before
// dispatch but cannot interrupt an in-flight publish.
type NATSPublisher struct {
	conn *nats.Conn
	js   jetStreamPublisher
}

// StreamName is the JetStream stream that captures RawDrive events.
// Any subject beginning with "rawdrive." is retained. Operators can
// tune retention and storage on the stream itself (via `nats stream
// edit`) without touching application code.
const StreamName = "RAWDRIVE_EVENTS"

// SubjectPrefix is the wildcard the stream captures. Callers MUST
// publish under this prefix or the message will be dropped at the
// stream filter.
const SubjectPrefix = "rawdrive."

// NewNATSPublisher connects to the NATS server at url, obtains a
// JetStream context, and best-effort ensures the RAWDRIVE_EVENTS
// stream exists. If the stream already exists with a different
// configuration, the existing config wins — we never mutate an
// operator's retention/storage choices.
//
// The initial connect is verified synchronously: after nats.Connect
// returns, we check conn.Status() == nats.CONNECTED before handing a
// publisher back. Without this check, the NATS client's infinite
// reconnect loop (MaxReconnects(-1)) would let nats.Connect return
// successfully while the underlying TCP session was still retrying —
// callers would then get an apparently-working publisher whose every
// Publish call blocks or errors. Failing fast at construction is
// worth the extra round-trip.
func NewNATSPublisher(url string) (*NATSPublisher, error) {
	conn, err := nats.Connect(url,
		nats.Name("rawdrive-backend"),
		nats.ReconnectWait(2*time.Second),
		nats.MaxReconnects(-1),
	)
	if err != nil {
		return nil, fmt.Errorf("nats connect %q: %w", url, err)
	}

	// Guard against nats.Connect returning a client that is still
	// cycling through its reconnect loop. CONNECTED is the only
	// status that means "the TCP + CONNECT + INFO handshake all
	// completed successfully and the client is ready to publish."
	if status := conn.Status(); status != nats.CONNECTED {
		conn.Close()
		return nil, fmt.Errorf("nats connect %q: client status is %v, expected CONNECTED", url, status)
	}

	js, err := conn.JetStream()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("nats jetstream context: %w", err)
	}

	// Best-effort stream provisioning. If the stream already exists
	// we leave it alone. If creation fails for any other reason we
	// still return the publisher and log the warning — a stream that
	// an operator will create shortly should not block startup.
	if _, err := js.StreamInfo(StreamName); errors.Is(err, nats.ErrStreamNotFound) {
		if _, addErr := js.AddStream(&nats.StreamConfig{
			Name:      StreamName,
			Subjects:  []string{SubjectPrefix + ">"},
			Retention: nats.LimitsPolicy,
			MaxAge:    7 * 24 * time.Hour,
			Storage:   nats.FileStorage,
		}); addErr != nil {
			log.Printf("NATS: failed to provision stream %q (operator may need to create it): %v", StreamName, addErr)
		} else {
			log.Printf("NATS: provisioned stream %q with subject filter %q>", StreamName, SubjectPrefix)
		}
	} else if err != nil {
		log.Printf("NATS: stream-info check for %q failed (continuing): %v", StreamName, err)
	}

	return &NATSPublisher{conn: conn, js: js}, nil
}

// Publish implements the EventPublisher contract expected by the
// handler, onboarding, and workspace packages. Returns an error if
// the context is already cancelled, if the subject does not start
// with SubjectPrefix, if JetStream refuses the message, or if the
// publish ack is not received.
//
// Context semantics: the ctx is checked for cancellation BEFORE the
// publish is dispatched but CANNOT interrupt an in-flight publish.
// js.Publish is a synchronous call that blocks on the JetStream
// server's ack (or the NATS client's default AckWait of 30s) and
// does not observe ctx.Done(). Callers that need hard cancellation
// during the publish must race Publish against ctx.Done() themselves
// in a goroutine, or use a future async variant of this method.
//
// Subject validation: the stream filter for RAWDRIVE_EVENTS is
// "rawdrive.>", so any subject that does not start with SubjectPrefix
// will be rejected by the server with a cryptic "no stream matches
// subject" error. We check the prefix at the boundary instead, so
// typos like "RawDrive.asset.uploaded" (wrong case) or
// "asset.uploaded" (missing prefix) produce a clear error message.
func (p *NATSPublisher) Publish(ctx context.Context, subject string, data []byte) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if !strings.HasPrefix(subject, SubjectPrefix) {
		return fmt.Errorf("nats publish: subject %q must start with %q to match the RAWDRIVE_EVENTS stream filter", subject, SubjectPrefix)
	}
	if _, err := p.js.Publish(subject, data); err != nil {
		return fmt.Errorf("nats publish %q: %w", subject, err)
	}
	return nil
}

// Close tears down the NATS connection. Intended to be called from
// main.go during shutdown via a defer. Safe to call on a nil
// receiver so callers need not guard.
func (p *NATSPublisher) Close() {
	if p == nil || p.conn == nil {
		return
	}
	p.conn.Close()
}
