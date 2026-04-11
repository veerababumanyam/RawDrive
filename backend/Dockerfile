# syntax=docker/dockerfile:1.7

# ---------- build stage ----------
FROM golang:1.26-alpine AS build

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
FROM alpine:3.20 AS runtime

# CA certs for outbound TLS (R2, SMTP, Cloudflare); tzdata for TZ support;
# curl for container healthchecks; nothing else.
RUN apk add --no-cache ca-certificates tzdata curl

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
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/api/v1/health || exit 1

# Default command is the API. The migrate service overrides with
# `command: ["/usr/local/bin/migrate"]` in docker-compose.prod-app.yml.
CMD ["/usr/local/bin/api"]
