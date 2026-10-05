from datetime import datetime, timezone

import pytest

from btcmon.collectors import Context
from btcmon.config import Settings
from btcmon.db import connect, init_db
from btcmon.http import HttpClient


@pytest.fixture
def conn():
    connection = connect(":memory:")
    init_db(connection)
    yield connection
    connection.close()


def make_ctx(**overrides) -> Context:
    settings = Settings(**overrides)
    http = HttpClient("btcmon-test", timeout=5, retries=0, min_interval_by_host={})
    return Context(settings, http)


@pytest.fixture
def ctx():
    return make_ctx()


@pytest.fixture
def now():
    # Lunedì 5 ottobre 2026, 21:05 UTC
    return datetime(2026, 10, 5, 21, 5, tzinfo=timezone.utc)
