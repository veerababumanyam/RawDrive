# syntax=docker/dockerfile:1.7
#
# Frontend production image for RawDrive.
#
# Replaces the pre-existing frontend/Dockerfile (commit c481200) which
# shipped the full .next/ directory plus production node_modules via
# 'pnpm install --prod'. Next.js 16's standalone output (enabled in
# next.config.ts by Task 0.1 / commit fc7b671) gives us a much smaller
# runtime footprint: only the trace-selected subset of node_modules
# required to run server.js.
#
# Uses node:22-bookworm-slim (not alpine) to match the pre-existing
# Dockerfile and avoid musl-libc compat risk for Next.js's sharp-based
# image optimization. pnpm-workspace.yaml is copied for its
# ignoredBuiltDependencies config (sharp, unrs-resolver).

# ---------- deps stage ----------
# Pinned to the Node 22 LTS minor-patch for reproducibility.
FROM node:22.11.0-bookworm-slim AS deps

WORKDIR /app

# Node 22.11's shipped corepack has an outdated signing-key bundle and
# rejects current pnpm releases with "Cannot find matching keyid". Fix
# by upgrading corepack itself first (via npm), then enabling it. Pin
# pnpm to the latest 9.x patch (9.15.9): it keeps lockfileVersion 9.0
# (matches frontend/pnpm-lock.yaml) while picking up every 9.5.x-9.15.x
# fix. This version MUST stay in sync with the `packageManager` field in
# frontend/package.json so local dev and CI resolve the identical pnpm.
RUN npm install -g corepack@latest \
  && corepack enable \
  && corepack prepare pnpm@9.15.9 --activate

# Copy only the manifests first so the deps layer caches across code
# changes. pnpm-workspace.yaml is intentionally NOT copied — pnpm 9.x
# rejects workspace files that lack a `packages:` field, which this
# repo's file has (it's used only to set ignoredBuiltDependencies, a
# misuse of the workspace file). Installing with --ignore-workspace
# would also work, but skipping the file entirely is even cleaner.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- build stage ----------
FROM deps AS build

# Copy the rest of the app source. .dockerignore excludes node_modules,
# .next, coverage, test-results, .env, etc.
COPY . .

# Remove the misused pnpm-workspace.yaml from the build context.
# pnpm 9.x rejects workspace files that lack a `packages:` field. The
# source file is used only to set ignoredBuiltDependencies in a
# single-package repo, and we've already installed without it in the
# deps stage. Leaving it in place causes `pnpm build` to fail with
# "packages field missing or empty".
RUN rm -f pnpm-workspace.yaml

# Disable Next.js telemetry during CI-style builds
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_* env vars are read at BUILD time by `next build` and
# baked into the client bundle. The Compose frontend service passes
# NEXT_PUBLIC_API_URL=https://api.rawdrive.in via build args so all
# client-side fetch('${API_BASE}/...') calls go directly to the real
# API subdomain. Without this, API_BASE defaults to http://localhost:8080
# inside the container (its own loopback) and every fetch fails.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Produces .next/standalone/server.js plus a trimmed node_modules tree.
# Requires next.config.ts to have output: 'standalone' (enabled in
# Task 0.1 / commit fc7b671).
RUN pnpm build

# ---------- runtime stage ----------
# Pinned to the same Node 22 patch as build — if this drifts, the
# standalone server.js may reference a different Node API surface than
# what the runtime provides.
FROM node:22.11.0-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone server.js reads PORT and HOSTNAME from the environment.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Install curl for the HEALTHCHECK. Nothing else — the standalone tree
# includes its own minimal node_modules.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Non-root user. UID 1001 is a standard Node convention (the official
# node image already has a 'node' user at 1000, so 1001 avoids overlap).
RUN groupadd --system --gid 1001 nextjs \
  && useradd --system --uid 1001 --gid nextjs --home /home/nextjs --shell /usr/sbin/nologin nextjs \
  && mkdir -p /home/nextjs \
  && chown nextjs:nextjs /home/nextjs

# Copy the Next.js 16 standalone output. As per
# frontend/node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
# the standalone tree does NOT include public/ or .next/static/ — those
# must be copied manually.
COPY --from=build --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /app/public ./public
COPY --from=build --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# start-period=30s gives Next.js standalone time to boot and open its
# listener. Next.js typically starts in <5s but cold disk caches and
# large .next/static trees can push this higher on fresh VPSes.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ > /dev/null || exit 1

# Next.js 16 standalone ships a minimal server.js at the root.
CMD ["node", "server.js"]
