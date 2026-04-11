# syntax=docker/dockerfile:1.7

FROM golang:1.26.2-bookworm AS build

WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/rawdrive-api ./cmd/api

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tzdata webp ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin rawdrive

USER rawdrive
WORKDIR /app

COPY --from=build /out/rawdrive-api /usr/local/bin/rawdrive-api

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/rawdrive-api"]
