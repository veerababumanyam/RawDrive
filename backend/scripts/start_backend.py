#!/usr/bin/env python3.11
"""
Backend server startup script with .env loading
"""
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
backend_src = backend_dir / "src"
sys.path.insert(0, str(backend_src))

from dotenv import load_dotenv

env_path = backend_dir / ".env"
load_dotenv(env_path)

if __name__ == "__main__":
    print(f"✓ Loaded environment from: {env_path}")
    print(f"✓ DATABASE_URL: {os.getenv('DATABASE_URL', 'NOT SET')[:50]}...")
    print(f"✓ REDIS_URL: {os.getenv('REDIS_URL', 'NOT SET')}")
    port = int(os.getenv("PORT", 3002))
    print(f"✓ Starting uvicorn on port {port}...")

    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info",
    )
