
import sys
import os

# Add src to path
sys.path.append(os.path.join(os.getcwd(), "backend/src"))

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
