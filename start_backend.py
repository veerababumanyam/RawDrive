#!/usr/bin/env python3.11
"""
Backend server startup script with .env loading
"""
import os
import sys
from pathlib import Path

# Add backend/src to Python path
backend_src = Path(__file__).parent / "backend" / "src"
sys.path.insert(0, str(backend_src))

# Load .env file
from dotenv import load_dotenv
env_path = Path(__file__).parent / "backend" / ".env"
load_dotenv(env_path)

if __name__ == "__main__":
    print(f"✓ Loaded environment from: {env_path}")
    print(f"✓ DATABASE_URL: {os.getenv('DATABASE_URL', 'NOT SET')[:50]}...")
    print(f"✓ REDIS_URL: {os.getenv('REDIS_URL', 'NOT SET')}")
    print(f"✓ Starting uvicorn on port {os.getenv('PORT', 3002)}...")

    # Start uvicorn
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 3002)),
        reload=True,
        log_level="info"
    )
