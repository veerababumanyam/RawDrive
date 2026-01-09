# Stage 1: Build
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt

# Stage 2: Runtime
FROM python:3.11-slim

WORKDIR /app

# Create non-root user
RUN groupadd -r webhooks && useradd -r -g webhooks webhooks

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels and install
COPY --from=builder /app/wheels /wheels
RUN pip install --no-cache /wheels/*

# Copy application code
COPY src/ ./src/

# Set ownership
RUN chown -R webhooks:webhooks /app

# Switch to non-root user
USER webhooks

# Environment variables - PORT is configured via docker-compose from PORT_WEBHOOKS env var
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Note: PORT is set by docker-compose at runtime from PORT_WEBHOOKS in .env
# EXPOSE is skipped as port is dynamic

# Health check uses PORT env var (must be set at runtime)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/health || exit 1

# Run the application - PORT env var must be set by docker-compose
CMD uvicorn src.main:app --host 0.0.0.0 --port $PORT
