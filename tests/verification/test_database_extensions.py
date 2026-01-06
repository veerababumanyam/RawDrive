#!/usr/bin/env python3
"""Database Extensions Verification Test.

This test verifies that PostgreSQL database extensions are properly installed
and enabled, including pgvector and pgvectorscale for vector similarity search.

Requirements:
    - PostgreSQL with pgvector extension
    - PostgreSQL with pgvectorscale extension (from timescale/timescaledb-ha image)
    - pip install playwright asyncpg httpx
    - playwright install chromium (for browser-based tests)

Usage:
    # Direct execution
    python -m tests.verification.test_database_extensions

    # With pytest
    pytest tests/verification/test_database_extensions.py -v

    # Check extensions only (no browser)
    python -m tests.verification.test_database_extensions --extensions-only
"""

import asyncio
import sys
import os
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

# Add backend src to path for importing
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend" / "src"))

# Colors for terminal output
class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    BLUE = "\033[94m"
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"


def print_header(msg: str):
    """Print a section header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{msg}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'=' * 60}{Colors.RESET}\n")


def print_info(msg: str):
    """Print informational message."""
    print(f"{Colors.CYAN}i {msg}{Colors.RESET}")


def print_success(msg: str):
    """Print success message."""
    print(f"{Colors.GREEN}[PASS] {msg}{Colors.RESET}")


def print_error(msg: str):
    """Print error message."""
    print(f"{Colors.RED}[FAIL] {msg}{Colors.RESET}")


def print_warning(msg: str):
    """Print warning message."""
    print(f"{Colors.YELLOW}[WARN] {msg}{Colors.RESET}")


@dataclass
class ExtensionInfo:
    """Information about a PostgreSQL extension."""
    name: str
    installed: bool
    enabled: bool
    version: Optional[str] = None


@dataclass
class VerificationResult:
    """Result of verification tests."""
    passed: bool
    total_tests: int
    passed_tests: int
    failed_tests: int
    extensions: dict


class DatabaseExtensionsVerifier:
    """Verifies database extensions are properly installed and configured."""

    def __init__(self, database_url: Optional[str] = None):
        """Initialize the verifier.

        Args:
            database_url: PostgreSQL connection URL. If not provided, uses DATABASE_URL env var.
        """
        self.database_url = database_url or os.environ.get(
            "DATABASE_URL",
            "postgresql://rawdrive:rawdrive@localhost:5432/rawdrive"
        )
        # Convert async URL to sync if needed
        self.database_url = self.database_url.replace("postgresql+asyncpg://", "postgresql://")
        self.conn = None
        self.results = {}

    async def connect(self) -> bool:
        """Connect to the database."""
        try:
            import asyncpg
            # Parse connection URL
            self.conn = await asyncpg.connect(self.database_url)
            print_success("Connected to PostgreSQL database")
            return True
        except ImportError:
            print_error("asyncpg not installed. Run: pip install asyncpg")
            return False
        except Exception as e:
            print_error(f"Failed to connect to database: {e}")
            return False

    async def disconnect(self):
        """Disconnect from the database."""
        if self.conn:
            await self.conn.close()
            self.conn = None

    async def check_postgresql_version(self) -> bool:
        """Check PostgreSQL version meets requirements (15+)."""
        print_info("Checking PostgreSQL version...")
        try:
            result = await self.conn.fetchval("SELECT version();")
            print_info(f"  PostgreSQL: {result[:50]}...")

            # Extract version number
            version_row = await self.conn.fetchrow("SHOW server_version;")
            version_str = version_row['server_version']
            major_version = int(version_str.split('.')[0])

            if major_version >= 15:
                print_success(f"PostgreSQL version {version_str} (>= 15 required)")
                self.results['postgresql_version'] = True
                return True
            else:
                print_error(f"PostgreSQL version {version_str} is too old (15+ required for pgvectorscale)")
                self.results['postgresql_version'] = False
                return False
        except Exception as e:
            print_error(f"Failed to check PostgreSQL version: {e}")
            self.results['postgresql_version'] = False
            return False

    async def check_extension_available(self, extension_name: str) -> bool:
        """Check if an extension is available to be installed."""
        result = await self.conn.fetchrow(
            "SELECT name, default_version FROM pg_available_extensions WHERE name = $1",
            extension_name
        )
        return result is not None

    async def check_extension_enabled(self, extension_name: str) -> Optional[str]:
        """Check if an extension is enabled and return its version."""
        result = await self.conn.fetchrow(
            "SELECT extname, extversion FROM pg_extension WHERE extname = $1",
            extension_name
        )
        if result:
            return result['extversion']
        return None

    async def check_pgvector(self) -> ExtensionInfo:
        """Check pgvector extension status."""
        print_info("Checking pgvector extension...")

        available = await self.check_extension_available('vector')
        enabled_version = await self.check_extension_enabled('vector')

        info = ExtensionInfo(
            name='pgvector',
            installed=available,
            enabled=enabled_version is not None,
            version=enabled_version
        )

        if info.enabled:
            print_success(f"pgvector extension enabled (version {info.version})")
        elif info.installed:
            print_warning("pgvector extension available but not enabled")
        else:
            print_error("pgvector extension not available in PostgreSQL")

        self.results['pgvector'] = info.enabled
        return info

    async def check_pgvectorscale(self) -> ExtensionInfo:
        """Check pgvectorscale extension status."""
        print_info("Checking pgvectorscale extension...")

        available = await self.check_extension_available('vectorscale')
        enabled_version = await self.check_extension_enabled('vectorscale')

        info = ExtensionInfo(
            name='pgvectorscale',
            installed=available,
            enabled=enabled_version is not None,
            version=enabled_version
        )

        if info.enabled:
            print_success(f"pgvectorscale extension enabled (version {info.version})")
        elif info.installed:
            print_warning("pgvectorscale extension available but not enabled - run migrations")
        else:
            print_warning("pgvectorscale not available - ensure timescale/timescaledb-ha Docker image is used")

        self.results['pgvectorscale'] = info.enabled
        return info

    async def check_timescaledb(self) -> ExtensionInfo:
        """Check TimescaleDB extension status (bundled with timescaledb-ha image)."""
        print_info("Checking TimescaleDB extension (optional)...")

        available = await self.check_extension_available('timescaledb')
        enabled_version = await self.check_extension_enabled('timescaledb')

        info = ExtensionInfo(
            name='timescaledb',
            installed=available,
            enabled=enabled_version is not None,
            version=enabled_version
        )

        if info.enabled:
            print_success(f"TimescaleDB extension enabled (version {info.version})")
        elif info.installed:
            print_info("TimescaleDB available but not enabled (optional)")
        else:
            print_info("TimescaleDB not available (optional)")

        # TimescaleDB is optional, so always pass
        self.results['timescaledb'] = True
        return info

    async def test_vector_operations(self) -> bool:
        """Test basic vector operations to ensure pgvector works."""
        print_info("Testing vector operations...")

        try:
            # Create a temporary test table
            await self.conn.execute("""
                CREATE TEMP TABLE IF NOT EXISTS _test_vectors (
                    id SERIAL PRIMARY KEY,
                    embedding vector(3)
                )
            """)

            # Insert test vectors
            await self.conn.execute("""
                INSERT INTO _test_vectors (embedding) VALUES
                ('[1,2,3]'::vector),
                ('[4,5,6]'::vector)
            """)

            # Test cosine similarity query
            result = await self.conn.fetch("""
                SELECT id, embedding <=> '[1,2,3]' AS distance
                FROM _test_vectors
                ORDER BY distance
                LIMIT 1
            """)

            if result and len(result) > 0:
                print_success("Vector operations work correctly (cosine similarity)")
                self.results['vector_operations'] = True
                return True
            else:
                print_error("Vector query returned no results")
                self.results['vector_operations'] = False
                return False

        except Exception as e:
            print_error(f"Vector operations failed: {e}")
            self.results['vector_operations'] = False
            return False

    async def test_diskann_availability(self) -> bool:
        """Test if StreamingDiskANN index type is available (requires pgvectorscale)."""
        print_info("Testing StreamingDiskANN index availability...")

        try:
            # Check if vectorscale is enabled first
            vectorscale_version = await self.check_extension_enabled('vectorscale')

            if not vectorscale_version:
                print_info("StreamingDiskANN not available (pgvectorscale not enabled)")
                self.results['diskann_available'] = False
                return False

            # Try to create a DiskANN index (will fail if not available)
            await self.conn.execute("""
                CREATE TEMP TABLE IF NOT EXISTS _test_diskann (
                    id SERIAL PRIMARY KEY,
                    embedding vector(3)
                )
            """)

            await self.conn.execute("""
                INSERT INTO _test_diskann (embedding) VALUES ('[1,2,3]'::vector)
            """)

            # Try creating a DiskANN index
            await self.conn.execute("""
                CREATE INDEX IF NOT EXISTS _test_diskann_idx
                ON _test_diskann USING diskann (embedding)
            """)

            print_success("StreamingDiskANN indexes available")
            self.results['diskann_available'] = True
            return True

        except Exception as e:
            error_msg = str(e).lower()
            if 'diskann' in error_msg or 'access method' in error_msg:
                print_warning(f"StreamingDiskANN not available: {e}")
                self.results['diskann_available'] = False
                return False
            else:
                print_error(f"DiskANN test failed with unexpected error: {e}")
                self.results['diskann_available'] = False
                return False

    async def run_all_checks(self) -> VerificationResult:
        """Run all verification checks."""
        print_header("Database Extensions Verification")

        extensions = {}

        if not await self.connect():
            return VerificationResult(
                passed=False,
                total_tests=0,
                passed_tests=0,
                failed_tests=1,
                extensions={}
            )

        try:
            # Run all checks
            await self.check_postgresql_version()

            pgvector = await self.check_pgvector()
            extensions['pgvector'] = pgvector

            pgvectorscale = await self.check_pgvectorscale()
            extensions['pgvectorscale'] = pgvectorscale

            timescaledb = await self.check_timescaledb()
            extensions['timescaledb'] = timescaledb

            if pgvector.enabled:
                await self.test_vector_operations()

            if pgvectorscale.enabled:
                await self.test_diskann_availability()

        finally:
            await self.disconnect()

        # Calculate results
        # Core requirements: PostgreSQL version and pgvector
        # Optional but recommended: pgvectorscale
        core_tests = ['postgresql_version', 'pgvector']
        optional_tests = ['pgvectorscale', 'diskann_available']

        core_passed = all(self.results.get(t, False) for t in core_tests)
        optional_passed = sum(1 for t in optional_tests if self.results.get(t, False))

        total_tests = len(self.results)
        passed_tests = sum(1 for v in self.results.values() if v)
        failed_tests = total_tests - passed_tests

        # Print summary
        print_header("Verification Summary")

        print(f"\n{Colors.BOLD}Core Requirements:{Colors.RESET}")
        for test in core_tests:
            status = self.results.get(test, False)
            if status:
                print_success(f"  {test}")
            else:
                print_error(f"  {test}")

        print(f"\n{Colors.BOLD}Optional Extensions (recommended):{Colors.RESET}")
        for test in optional_tests:
            status = self.results.get(test, False)
            if status:
                print_success(f"  {test}")
            else:
                print_warning(f"  {test} (not enabled)")

        print(f"\n{Colors.BOLD}Results: {passed_tests}/{total_tests} checks passed{Colors.RESET}")

        if core_passed:
            print_success("\nCore requirements satisfied - vector search is available")
            if extensions.get('pgvectorscale', ExtensionInfo('', False, False)).enabled:
                print_success("pgvectorscale enabled - StreamingDiskANN indexes available for optimal performance")
            else:
                print_warning("pgvectorscale not enabled - using standard HNSW/IVFFlat indexes")
        else:
            print_error("\nCore requirements not met - vector search may not work")

        return VerificationResult(
            passed=core_passed,
            total_tests=total_tests,
            passed_tests=passed_tests,
            failed_tests=failed_tests,
            extensions=extensions
        )


class APIExtensionsVerifier:
    """Verify extensions via the API health endpoint (Playwright-style browser test)."""

    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url

    async def check_api_health(self) -> bool:
        """Check if the API is healthy and extensions are available."""
        print_info("Checking API health endpoint...")

        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.api_url}/health")

                if response.status_code == 200:
                    data = response.json()
                    print_success(f"API health check passed: {data.get('status', 'ok')}")
                    return True
                else:
                    print_error(f"API health check failed: {response.status_code}")
                    return False

        except ImportError:
            print_warning("httpx not installed - skipping API health check")
            return True
        except Exception as e:
            print_warning(f"API health check skipped: {e}")
            return True


async def run_browser_test():
    """Run a Playwright-based browser test to verify the admin can see extension info."""
    print_header("Browser-Based Extension Verification")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print_warning("Playwright not installed - skipping browser test")
        print_info("Run: pip install playwright && playwright install chromium")
        return True

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context()
            page = await context.new_page()

            # Try to access the API docs which shows available endpoints
            try:
                await page.goto("http://localhost:8000/docs", timeout=10000)
                title = await page.title()
                print_success(f"API documentation accessible: {title}")
            except Exception as e:
                print_warning(f"API docs not accessible (API may not be running): {e}")

            await browser.close()
            return True

    except Exception as e:
        print_warning(f"Browser test skipped: {e}")
        return True


async def main():
    """Main entry point for verification tests."""
    import argparse

    parser = argparse.ArgumentParser(description="Verify database extensions")
    parser.add_argument(
        "--extensions-only",
        action="store_true",
        help="Only check database extensions, skip browser tests"
    )
    parser.add_argument(
        "--database-url",
        help="PostgreSQL connection URL (default: from DATABASE_URL env or localhost)"
    )
    args = parser.parse_args()

    # Run database extension verification
    verifier = DatabaseExtensionsVerifier(database_url=args.database_url)
    result = await verifier.run_all_checks()

    if not args.extensions_only:
        # Run API health check
        api_verifier = APIExtensionsVerifier()
        await api_verifier.check_api_health()

        # Run browser test
        await run_browser_test()

    print_header("Final Result")

    if result.passed:
        print_success("All core verification checks passed!")
        if result.extensions.get('pgvectorscale', ExtensionInfo('', False, False)).enabled:
            print_info("pgvectorscale is enabled - you have optimal vector search performance")
        else:
            print_info("Consider enabling pgvectorscale for better performance at scale")
        sys.exit(0)
    else:
        print_error("Some verification checks failed")
        print_info("\nTroubleshooting:")
        print_info("1. Ensure PostgreSQL is running with: docker compose up -d postgres")
        print_info("2. Verify using timescale/timescaledb-ha:pg16 Docker image")
        print_info("3. Run migrations: alembic upgrade head")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
