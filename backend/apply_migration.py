
import os
import sys

# Load .env
try:
    with open(os.path.join(os.path.dirname(__file__), ".env")) as f:
        for line in f:
            if line.strip() and not line.startswith('#'):
                try:
                    key, value = line.strip().split('=', 1)
                    os.environ[key] = value
                except ValueError:
                    pass
except Exception as e:
    print(f"Failed to load .env: {e}")

except Exception as e:
    print(f"Failed to load .env: {e}")

# Fix driver for Alembic (sync) if pyscopg2 is missing
url = os.environ.get("DATABASE_URL", "")
# print(f"DEBUG: URL scheme is {url.split('://')[0] if '://' in url else 'INVALID'}")

if "postgresql" in url or "postgres" in url:
    if "asyncpg" in url:
        os.environ["DATABASE_URL"] = url.replace("asyncpg", "pg8000")
    elif "pg8000" not in url:
        # Assume default postgres:// needs pg8000 if psycopg2 is missing (which is implied by previous error)
        if url.startswith("postgres://"):
            os.environ["DATABASE_URL"] = url.replace("postgres://", "postgresql+pg8000://", 1)
        elif url.startswith("postgresql://"):
            os.environ["DATABASE_URL"] = url.replace("postgresql://", "postgresql+pg8000://", 1)

from alembic.config import main

if __name__ == "__main__":
    sys.argv = ["alembic", "upgrade", "head"]
    main()
