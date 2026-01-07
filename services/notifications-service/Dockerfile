# Notifications Microservice - Multi-stage optimized Docker build
# Optimized for high-throughput notification delivery with KEDA autoscaling

# Stage 1: Builder
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt


# Stage 2: Production
FROM python:3.11-slim as production

# Labels
LABEL maintainer="RawDrive Team"
LABEL service="notifications-service"
LABEL version="1.0.0"

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --gid 1000 appgroup \
    && adduser --uid 1000 --gid 1000 --disabled-password --gecos "" appuser

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy application code
COPY --chown=appuser:appgroup . .

# Set Python path
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Switch to non-root user
USER appuser

# Expose port (default 8007 for notifications-service)
EXPOSE 8007

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8007}/health || exit 1

# Run the application with optimized settings for notification workloads
# - 3 workers: balanced for I/O-bound SendGrid/SMS API calls
# - High concurrency limit: notifications are lightweight HTTP calls
# - Higher max requests: long-running service with graceful restarts
# - Longer keep-alive: maintains connections for webhook receivers
CMD uvicorn src.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8007} \
    --workers 3 \
    --limit-concurrency 750 \
    --limit-max-requests 7500 \
    --timeout-keep-alive 45
