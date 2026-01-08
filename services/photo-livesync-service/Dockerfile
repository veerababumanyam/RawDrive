# syntax=docker/dockerfile:1.6

# =============================================================================
# RawDrive Photo Sync Microservice Dockerfile
# Multi-stage Alpine build optimized for ~150MB image size
# Handles photo imports from cloud providers with KEDA autoscaling support
# =============================================================================

# Build Arguments for Container Registry Configuration
ARG NODE_VERSION=20
ARG ALPINE_VERSION=3.19

# =============================================================================
# Stage 1: Base - Alpine with Node.js and native dependencies
# =============================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base

# Metadata labels for container registry
LABEL org.opencontainers.image.title="RawDrive Photo Sync Service"
LABEL org.opencontainers.image.description="Photo import and sync microservice with OAuth2, job queuing, and KEDA autoscaling"
LABEL org.opencontainers.image.vendor="RawDrive"
LABEL org.opencontainers.image.source="https://github.com/rawdrive/rawdrive"
LABEL org.opencontainers.image.licenses="MIT"

# Install system dependencies required for native modules
# - build-base: Compilation tools for native addons (sharp, pg-native)
# - python3: Required by node-gyp
# - vips-dev: Required by sharp for image processing
# - postgresql-dev: PostgreSQL client library for pg
RUN apk add --no-cache \
    # Build tools
    build-base \
    python3 \
    # Image processing (sharp)
    vips-dev \
    # PostgreSQL client
    postgresql-dev \
    # Runtime utilities
    curl \
    ca-certificates \
    tini \
    # Git for potential npm packages from git
    git

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies - Install all npm packages
# =============================================================================
FROM base AS deps

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
# Using npm ci for deterministic builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# =============================================================================
# Stage 3: Builder - Compile TypeScript to JavaScript
# =============================================================================
FROM deps AS builder

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production

# =============================================================================
# Stage 4: Development - Hot reload and development tools
# =============================================================================
FROM deps AS development

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests

# Create non-root user for security
RUN addgroup -g 1000 appgroup \
    && adduser -u 1000 -G appgroup -s /bin/sh -D appuser \
    && chown -R appuser:appgroup /app

USER appuser

# Development port
EXPOSE 8007

# Development health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8007/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Development with hot reload using tsx
CMD ["npm", "run", "dev"]

# =============================================================================
# Stage 5: Testing - Run tests in isolated environment
# =============================================================================
FROM deps AS testing

# Copy all source and test files
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests

# Create test results directory
RUN mkdir -p /app/test-results

# Create non-root user
RUN addgroup -g 1000 appgroup \
    && adduser -u 1000 -G appgroup -s /bin/sh -D appuser \
    && chown -R appuser:appgroup /app

USER appuser

# Test entrypoint
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "run", "test"]

# =============================================================================
# Stage 6: Production - Minimal optimized runtime image
# =============================================================================
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS production

# Repeat labels for production stage
LABEL org.opencontainers.image.title="RawDrive Photo Sync Service"
LABEL org.opencontainers.image.description="Photo import and sync microservice with OAuth2, job queuing, and KEDA autoscaling"
LABEL org.opencontainers.image.vendor="RawDrive"

# Build args for versioning
ARG VERSION=latest
ARG BUILD_DATE
ARG VCS_REF

LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${VCS_REF}"

# Install only runtime dependencies (no build tools)
# - vips: Runtime library for sharp (smaller than vips-dev)
# - libpq: PostgreSQL client runtime library
# - curl: Health checks
# - tini: PID 1 init system
RUN apk add --no-cache \
    vips \
    libpq \
    curl \
    ca-certificates \
    tini \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Environment configuration
ENV NODE_ENV=production \
    # Service configuration
    PORT=8007 \
    HOST=0.0.0.0 \
    # Node.js production optimizations
    NODE_OPTIONS="--enable-source-maps --max-old-space-size=384" \
    # Disable npm update check
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    # UV threadpool for async I/O operations
    UV_THREADPOOL_SIZE=4

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy compiled JavaScript from builder
COPY --from=builder /app/dist ./dist

# Create non-root user for security
RUN addgroup -g 1000 appgroup \
    && adduser -u 1000 -G appgroup -s /bin/sh -D appuser \
    && chown -R appuser:appgroup /app \
    # Create directories for runtime needs
    && mkdir -p /app/logs /app/tmp \
    && chown -R appuser:appgroup /app/logs /app/tmp

USER appuser

# Production port (8007 for photo-sync-service)
EXPOSE 8007

# Production health check with faster intervals for KEDA scaling
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8007}/health || exit 1

# Use tini as init system for proper signal handling (zombie process cleanup)
ENTRYPOINT ["/sbin/tini", "--"]

# Production command - run compiled JavaScript
CMD ["node", "dist/index.js"]
