from __future__ import annotations

import pytest

from app.config.settings import AppSettings, get_settings
from app.db import redis as rd
from app.db.redis import InMemoryRedis
from tests.config.test_settings import VALID_ENV


class DummyRedis:
    def __init__(self, url: str = "", **kwargs) -> None:
        self.url = url
        self.kwargs = kwargs
        self.ping_called = 0
        self.closed = False

    @classmethod
    def from_url(cls, url: str, **kwargs) -> "DummyRedis":
        return cls(url, **kwargs)

    async def ping(self):
        self.ping_called += 1
        return True

    async def aclose(self):
        self.closed = True


@pytest.fixture(autouse=True)
async def reset_client() -> None:
    await rd.close_redis_client()
    get_settings.cache_clear()
    yield
    await rd.close_redis_client()


@pytest.fixture()
def settings(monkeypatch: pytest.MonkeyPatch) -> AppSettings:
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    return AppSettings()


@pytest.mark.asyncio
async def test_init_redis_client_uses_from_url(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    dummy = DummyRedis()

    def fake_from_url(url: str, **kwargs):
        return DummyRedis.from_url(url, **kwargs)

    monkeypatch.setattr(rd, "Redis", DummyRedis)

    client = await rd.init_redis_client(settings)
    assert isinstance(client, (DummyRedis, InMemoryRedis))
    if isinstance(client, DummyRedis):
        assert client.url == str(settings.redis_url)


@pytest.mark.asyncio
async def test_redis_healthcheck_pings(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    monkeypatch.setattr(rd, "Redis", DummyRedis)

    client = await rd.init_redis_client(settings)
    ok = await rd.redis_healthcheck()

    assert ok is True
    if isinstance(client, DummyRedis):
        assert client.ping_called == 1
    else:
        assert client.ping_called >= 1


@pytest.mark.asyncio
async def test_close_redis_client_resets(monkeypatch: pytest.MonkeyPatch, settings: AppSettings) -> None:
    monkeypatch.setattr(rd, "Redis", DummyRedis)

    client = await rd.init_redis_client(settings)
    await rd.close_redis_client()

    assert getattr(client, "closed", False) is True
    with pytest.raises(RuntimeError):
        await rd.get_redis_client()
