from datetime import datetime, timezone

from btcmon.db import upsert
from btcmon.freshness import check_freshness


def _status(conn, key, now):
    return next(s for s in check_freshness(conn, now) if s.param.key == key)


def _flow(day):
    return {"observed_at": f"{day}T00:00:00Z", "net_inflow_usd": 1.0, "total_net_assets_usd": None,
            "cum_net_inflow_usd": None, "value_traded_usd": None, "source": "t",
            "available_at": f"{day}T00:00:00Z", "fetched_at": "x"}


def test_missing_parameter(conn, now):
    assert _status(conn, "btc_dominance", now).status == "missing"


def test_hourly_parameter_goes_stale_after_threshold(conn):
    upsert(conn, "btc_dominance", [{"observed_at": "2026-10-05T18:00:00Z", "dominance_pct": 56.0,
                                    "total_market_cap_usd": None, "source": "t",
                                    "available_at": "2026-10-05T18:00:00Z", "fetched_at": "x"}])
    assert _status(conn, "btc_dominance", datetime(2026, 10, 5, 20, 59, tzinfo=timezone.utc)).is_ok
    assert _status(conn, "btc_dominance", datetime(2026, 10, 5, 21, 1, tzinfo=timezone.utc)).status == "stale"


def test_etf_flows_weekend_is_not_stale_but_missing_days_are(conn):
    upsert(conn, "etf_flows", [_flow("2026-10-02")])  # venerdì
    tuesday = datetime(2026, 10, 6, 9, tzinfo=timezone.utc)
    wednesday = datetime(2026, 10, 7, 9, tzinfo=timezone.utc)
    thursday = datetime(2026, 10, 8, 9, tzinfo=timezone.utc)
    assert _status(conn, "etf_flows", tuesday).is_ok
    assert _status(conn, "etf_flows", wednesday).is_ok  # tollera una festività
    assert _status(conn, "etf_flows", thursday).status == "stale"
