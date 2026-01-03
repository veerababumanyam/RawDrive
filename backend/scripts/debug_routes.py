#!/usr/bin/env python3
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parents[1]
backend_src = backend_dir / "src"
sys.path.insert(0, str(backend_src))

from fastapi import FastAPI
from app.main import app

def print_routes():
    print("Listing all routes:")
    for route in app.routes:
        if hasattr(route, "path"):
            print(f"{route.methods} {route.path}")
        else:
            print(f"Mount: {route.path}")

if __name__ == "__main__":
    print_routes()
