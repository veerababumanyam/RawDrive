# AI Service (MCP) Dockerfile
FROM python:3.11-slim as base

WORKDIR /app

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base as dependencies

RUN apt-get update && apt-get install -y \
    --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

FROM base as production

COPY --from=dependencies /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=dependencies /usr/local/bin /usr/local/bin

COPY src/ /app/src/

ENV PYTHONPATH=/app/src
ENV PORT_AI_SERVICE=8013

EXPOSE 8013

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:${PORT_AI_SERVICE}/health || exit 1

CMD ["python", "-m", "uvicorn", "rawdrive_mcp.server:app", "--host", "0.0.0.0", "--port", "8013"]
