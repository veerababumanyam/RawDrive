# ISSUE-003 — NATS JetStream durability verification (operator attestation)

> **Status:** empty scaffold, waiting for operator sign-off.
> **Purpose:** record evidence that the NATS publisher wired in
> commits `64f0ca2` + `c481200` actually persists events across a
> real container restart. The in-repo test
> `TestNATSRealPublisher_Durability` uses `GetLastMsg` on a fresh
> connection as a proxy for durability, which is a legitimate
> correctness signal but not the strictest possible check. A real
> restart-survival run is the operator-level backstop called for by
> `docs/issuestofix.md` item #7 and the brownfield fix wave review
> §5.2.
> **Source procedure:** `docs/brownfield/meta-issues-clarification.md`
> lines 180–209 ("NATS real-broker restart-survival verification").
> Follow those steps and record the outcome here.

## Why this file exists

The in-repo test `TestNATSRealPublisher_Durability` at
`backend/tests/integration/nats_publisher_real_test.go:93` proves
that:

- `events.NewNATSPublisher` dials a real NATS broker cleanly
- The production `Publish` call forwards subject + data to
  JetStream and the server returns a positive ack
- A *fresh, independent* NATS connection can subsequently retrieve
  the message via `js.GetLastMsg` — which reads server-side stream
  storage, not a client-side buffer
- With `Storage: nats.FileStorage`, the message has crossed the
  persistence boundary

What it does NOT prove:

- **fsync durability** — JetStream's `sync_interval` (default
  2 minutes, async) means a broker crash between commit and fsync
  could still lose the message. `GetLastMsg` returns success as
  soon as the data is in the in-memory stream index, not
  necessarily the on-disk file.
- **Container-restart survival in practice** — a real `docker
  compose restart nats` proves both the storage-side persistence
  and the client-side reconnect path simultaneously.
- **Multi-consumer replay** — the test is publisher-only. A real
  RawDrive deployment will have subscribers too; their replay
  semantics (pull vs push, durable vs ephemeral consumer names,
  ack wait) are out of this attestation's scope but worth a
  separate test.

A real-restart run closes the first two gaps.

## Prerequisites

- [ ] Docker Desktop running with the `_cobolt-docker/docker-compose.yml`
      stack up (or an equivalent staging env with a real NATS broker)
- [ ] `nats` CLI installed (the JetStream CLI — `brew install nats-io/nats-tools/nats`
      or download from https://github.com/nats-io/natscli)
- [ ] The `cobolt-nats` container name resolved — run
      `docker compose -f _cobolt-docker/docker-compose.yml ps nats`
      and confirm you see a running container before starting
- [ ] Backend built locally (`go build ./...`) — the test uses
      `events.NewNATSPublisher` directly, no backend server needed

## Procedure — publish, restart, confirm retention

1. [ ] Bring up the stack:
       ```bash
       docker compose -f _cobolt-docker/docker-compose.yml up -d nats
       ```
       Confirm the container is healthy:
       ```bash
       docker compose -f _cobolt-docker/docker-compose.yml ps nats
       ```

2. [ ] Run the existing ack test to prove the publisher is wired:
       ```bash
       cd backend
       go test ./tests/integration/... -run TestNATSRealPublisher_Ack -v
       ```
       Expected: test passes and prints the subject it published on.

3. [ ] Note the exact subject from step 2's output. It should look
       like `rawdrive.smoke.ack.<unix-nanos>`.

4. [ ] Confirm the message is in JetStream stream storage:
       ```bash
       docker exec -it cobolt-nats nats stream view RAWDRIVE_EVENTS \
         --subject '<exact subject from step 3>'
       ```
       Expected: the message prints with its payload
       (`{"kind":"smoke","test":"TestNATSRealPublisher_Ack"}`).

5. [ ] Restart the NATS container:
       ```bash
       docker compose -f _cobolt-docker/docker-compose.yml restart nats
       ```
       Wait ~5 seconds for JetStream to re-open its files.

6. [ ] Re-open a fresh `nats` CLI session and re-query the stream:
       ```bash
       docker exec -it cobolt-nats nats stream view RAWDRIVE_EVENTS \
         --subject '<exact subject from step 3>'
       ```
       Expected: **the same message prints with the identical
       payload**. If the message is gone, JetStream's sync_interval
       was too generous and the restart lost data — this is a real
       bug that needs investigation.

7. [ ] Verify stream info matches expectation:
       ```bash
       docker exec -it cobolt-nats nats stream info RAWDRIVE_EVENTS
       ```
       Confirm `Storage: File`, `Retention: Limits`, `Max Age: 7d`,
       and `Subjects: [rawdrive.>]`. These come from
       `events.NewNATSPublisher` in
       `backend/internal/events/nats_publisher.go:72` (the constructor)
       and `:107` (the `Storage: nats.FileStorage` setting).

### Result

| Field | Value |
|---|---|
| NATS server version | `__TODO__` (from `nats server info`) |
| Stream config matches code | `__TODO__` (yes / no) |
| Initial message landed in stream | `__TODO__` (yes / no) |
| Message survived container restart | `__TODO__` (yes / no) |
| Payload byte-identical after restart | `__TODO__` (yes / no) |
| Stream file on disk (`ls -la` inside container) | `__TODO__` |
| Container uptime before restart | `__TODO__` (seconds) |
| Time between restart and re-query | `__TODO__` (seconds) |
| Operator initials | `__TODO__` |
| Attestation date | `__TODO__` |

## Optional — crash durability (stricter check)

The restart procedure above is a graceful shutdown. A stricter
check simulates an ungraceful crash by killing the process:

1. [ ] Publish a new message via the ack test (step 2 above).
2. [ ] Immediately `docker kill cobolt-nats` (not `restart`, not
       `stop` — `kill` sends SIGKILL so there is no graceful
       shutdown).
3. [ ] `docker start cobolt-nats` to bring the container back.
4. [ ] Re-query the stream as in step 6 above.

If the message survives a SIGKILL, the on-disk state was fsynced
before the publish ack was returned. If it does NOT survive, the
message was acknowledged before it hit disk — an honest
operational risk that should be documented in the runbook.

| Field | Value |
|---|---|
| Message survived SIGKILL | `__TODO__` (yes / no) |
| Operator initials | `__TODO__` |
| Attestation date | `__TODO__` |

## Sign-off

Once every `__TODO__` above is filled in with a real value, this
file counts as evidence that ISSUE-003 is not just code-complete
but also runtime-complete against a real JetStream broker. Commit
this file alongside any related infra changes.

If the SIGKILL step reveals that messages are lost without a
graceful shutdown, that is a legitimate operational trade-off —
document the expected lag window in `docs/runbooks/` and decide
whether to tune JetStream's `sync_interval` downward or accept
the risk. Do not pretend the check passed if it did not.
