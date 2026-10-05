import math
from datetime import datetime, timezone

import pandas as pd

from btcmon.alignment import build_aligned_frame
from btcmon.db import upsert
from btcmon.parameters import BY_KEY


def _flow(day, value, available):
    return {"observed_at": f"{day}T00:00:00Z", "net_inflow_usd": value, "total_net_assets_usd": None,
            "cum_net_inflow_usd": None, "value_traded_usd": None, "source": "t",
            "available_at": available, "fetched_at": "x"}


def _price(ts, value):
    return {"observed_at": ts, "price_usd": value, "market_cap_usd": None, "volume_24h_usd": None,
            "source": "t", "available_at": ts, "fetched_at": "x"}


def test_forward_fill_respects_publication_time(conn):
    upsert(conn, "etf_flows", [
        _flow("2026-10-01", 10.0, "2026-10-02T14:00:00Z"),
        _flow("2026-10-02", 20.0, "2026-10-05T14:00:00Z"),
    ])
    frame = build_aligned_frame(conn, "2026-10-02T12:00:00Z", "2026-10-05T15:00:00Z", "1h",
                                params=[BY_KEY["etf_flows"]])
    # Prima delle 14:00 del 2/10 il dato dell'1/10 non è ancora pubblico
    assert math.isnan(frame.loc["2026-10-02 13:00:00+00:00", "etf_flows"])
    assert frame.loc["2026-10-02 14:00:00+00:00", "etf_flows"] == 10.0
    # Tutto il weekend resta il valore reale dell'1/10, con il suo timestamp
    sat = frame.loc["2026-10-03 12:00:00+00:00"]
    assert sat["etf_flows"] == 10.0
    assert sat["etf_flows__observed_at"] == pd.Timestamp("2026-10-01", tz="UTC")
    assert sat["etf_flows__age_hours"] == 60.0
    assert frame.loc["2026-10-05 14:00:00+00:00", "etf_flows"] == 20.0


def test_late_revision_of_old_period_does_not_override_newer_value(conn):
    upsert(conn, "etf_flows", [
        _flow("2026-10-01", 10.0, "2026-10-02T14:00:00Z"),
        _flow("2026-10-02", 20.0, "2026-10-05T14:00:00Z"),
        # dato vecchio inserito a mano più tardi (es. import CSV)
        _flow("2026-09-30", 5.0, "2026-10-06T10:00:00Z"),
    ])
    frame = build_aligned_frame(conn, "2026-10-06T12:00:00Z", "2026-10-06T12:00:00Z", "1h",
                                params=[BY_KEY["etf_flows"]])
    assert frame["etf_flows"].iloc[0] == 20.0


def test_daily_grid_and_empty_parameters(conn):
    upsert(conn, "btc_price", [_price("2026-10-04T23:00:00Z", 85000.0), _price("2026-10-05T08:00:00Z", 86000.0)])
    frame = build_aligned_frame(conn, datetime(2026, 10, 5, 9, tzinfo=timezone.utc),
                                datetime(2026, 10, 6, 9, tzinfo=timezone.utc), "1D")
    assert list(frame.index) == [pd.Timestamp("2026-10-05", tz="UTC"), pd.Timestamp("2026-10-06", tz="UTC")]
    assert list(frame["btc_price"]) == [85000.0, 86000.0]
    assert frame["btc_dominance"].isna().all()
    assert "m2_global__age_hours" in frame.columns
    assert str(frame["btc_price__observed_at"].dtype).startswith("datetime64")
    assert str(frame["btc_dominance__observed_at"].dtype).startswith("datetime64")
