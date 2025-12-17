from __future__ import annotations

import asyncio
from typing import Any

import asyncpg
import pytest

from app.config.settings import AppSettings, get_settings
from app.db import postgres as pg
from tests.config.test_settings import VALID_ENV


class DummyConn:
    def __init__(self) -> None:
        self.fetchval_called = False

    async def fetchval(self, query: str) -> int:
        self.fetchval_called = True
        return 1

    async def __aenter__(self) -> "DummyConn":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # type: ignore[override]
        return None

    def transaction(self) -> "DummyConn":
        return self


class DummyPool:
    def __init__(self) -> None:
        self.acquired = 0
        self.closed = False

    async def acquire(self) -> DummyConn:
        self.acquired += 1
        return DummyConn()

    async def close(self) -> None:
        self.closed = True


@pytest.fixture(autouse=True)
async def reset_pool() -> None:
    await pg.close_postgres_pool()
    get_settings.cache_clear()
    yield
    await pg.close_postgres_pool()


@pytest.fixture()
def settings(monkeypatch: pytest.MonkeyPatch) -> AppSettings:
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    return AppSettings()


@pytest.mark.asyncio
async def test_init_postgres_pool_uses_settings(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    pool = DummyPool()

    async def fake_create_pool(*args: Any, **kwargs: Any) -> DummyPool:  # type: ignore[override]
        return pool

    monkeypatch.setattr(asyncpg, "create_pool", fake_create_pool)

    created = await pg.init_postgres_pool(settings)

    assert created is pool
    assert pool.closed is False


@pytest.mark.asyncio
async def test_postgres_healthcheck_runs_select(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    pool = DummyPool()

    async def fake_create_pool(*args: Any, **kwargs: Any) -> DummyPool:  # type: ignore[override]
        return pool

    monkeypatch.setattr(asyncpg, "create_pool", fake_create_pool)

    await pg.init_postgres_pool(settings)
    ok = await pg.postgres_healthcheck()

    assert ok is True
    assert pool.acquired == 1


@pytest.mark.asyncio
async def test_close_postgres_pool_resets(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    pool = DummyPool()

    async def fake_create_pool(*args: Any, **kwargs: Any) -> DummyPool:  # type: ignore[override]
        return pool

    monkeypatch.setattr(asyncpg, "create_pool", fake_create_pool)

    await pg.init_postgres_pool(settings)
    await pg.close_postgres_pool()

    assert pool.closed is True
    with pytest.raises(RuntimeError):
        await pg.get_postgres_pool()
