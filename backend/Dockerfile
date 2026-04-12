# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
# Pinned to the minor-patch of go.mod (1.26.2). Floating tag
# 'golang:1.26-alpine' would silently drift on every patch release and
# produce compiler-mismatched builds across machines. Bump in lockstep
# with go.mod when we upgrade Go.
FROM golang:1.26.2-alpine AS build

# git + ca-certs needed for go mod download of pinned deps over https
RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Cache deps: copy go.mod/go.sum first so layer is reused across code changes
COPY go.mod go.sum ./
RUN go mod download

# Now copy the rest of the backend source
COPY . .

# Build BOTH binaries with the same toolchain / same vendored deps.
# CGO off ⇒ static binary, works on scratch-like runtime.
# -trimpath strips local filesystem paths from stack traces.
# -ldflags '-s -w' strips symbol + debug tables (smaller image).
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags='-s -w' -o /out/api     ./cmd/api
RUN go build -trimpath -ldflags='-s -w' -o /out/migrate ./cmd/migrate

# ---------- runtime stage ----------
# Pinned to a specific alpine patch for reproducibility. Bump when we
# want new security patches from the alpine base.
FROM alpine:3.20.3 AS runtime

# Runtime dependencies:
# - ca-certificates, tzdata: outbound TLS + Asia/Kolkata TZ
# - curl: container HEALTHCHECK
# - libwebp-tools: provides `cwebp`. REQUIRED by thumbnail_service.go which
#   shells out to cwebp via exec.CommandContext to produce WebP derivatives.
#   Per AGENTS.md ("Every uploaded image MUST produce WebP derivatives") this
#   binary is non-negotiable — the image is broken without it.
# - ffmpeg: used by processing_pipeline.go:tryVideoThumbnail for video poster
#   frame extraction. Graceful-degrade in code, but we ship it for feature
#   parity with the pre-existing Dockerfile (commit c481200).
RUN apk add --no-cache ca-certificates tzdata curl libwebp-tools ffmpeg

# Non-root user — drops privileges even if the binary is exploited
RUN addgroup -S rawdrive && adduser -S -G rawdrive rawdrive

# Copy both binaries
COPY --from=build /out/api     /usr/local/bin/api
COPY --from=build /out/migrate /usr/local/bin/migrate

USER rawdrive
WORKDIR /home/rawdrive

# Listen on 8080 inside the container. nginx upstream points here.
EXPOSE 8080

# Healthcheck: containers get marked unhealthy if the API stops responding.
# Compose reads this and nginx peer-backup failover uses the docker-dns
# resolver to notice.
# start-period=30s gives the Go API enough headroom to open its Postgres
# pgxpool, subscribe to NATS JetStream, and connect to Valkey on cold start.
# 20s was cutting it close on fresh VPSes with cold disk cache.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/v1/health || exit 1

# Default command is the API. The migrate service overrides with
# `command: ["/usr/local/bin/migrate"]` in docker-compose.prod-app.yml.
CMD ["/usr/local/bin/api"]
