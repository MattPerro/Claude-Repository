"""Integrazione: backfill + raccolta con tutte le fonti simulate, poi
allineamento giornaliero e controllo freschezza."""

import re
from datetime import date, timedelta

import responses

from btcmon.alignment import build_aligned_frame
from btcmon.collectors.coingecko import BASE_URL
from btcmon.collectors.fred import CSV_URL
from btcmon.collectors.m2 import ECB_URL
from btcmon.freshness import check_freshness
from btcmon.runner import build_collectors, run_collectors
from conftest import make_ctx


def _fred_csv(series_id, start, end, step, value):
    lines = [f"observation_date,{series_id}"]
    d = start
    while d <= end:
        lines.append(f"{d.isoformat()},{value}")
        d += timedelta(days=step)
    return "\n".join(lines) + "\n"


def _mock_all(now):
    ts = int(now.timestamp())
    ms = ts * 1000
    hourly = [[ms - h * 3_600_000, 86000.0 - h] for h in range(24 * 90, 0, -1)]
    responses.get(f"{BASE_URL}/coins/bitcoin/market_chart",
                  json={"prices": hourly, "market_caps": [], "total_volumes": []})
    responses.get(f"{BASE_URL}/simple/price",
                  json={"bitcoin": {"usd": 86000.0, "xau": 20.2, "last_updated_at": ts - 60}})
    responses.get(f"{BASE_URL}/global",
                  json={"data": {"market_cap_percentage": {"btc": 56.4}, "total_market_cap": {"usd": 3e12},
                                 "updated_at": ts - 30}})
    today = now.date()
    series = {
        "WM2NS": _fred_csv("WM2NS", date(2025, 6, 2), today - timedelta(days=40), 7, 22000.0),
        "DEXUSEU": _fred_csv("DEXUSEU", date(2025, 6, 1), today - timedelta(days=3), 1, 1.12),
        "DFF": _fred_csv("DFF", date(2025, 6, 1), today - timedelta(days=1), 1, 4.33),
        "DFEDTARL": _fred_csv("DFEDTARL", date(2025, 6, 1), today - timedelta(days=1), 1, 4.25),
        "DFEDTARU": _fred_csv("DFEDTARU", date(2025, 6, 1), today - timedelta(days=1), 1, 4.50),
    }
    for sid, body in series.items():
        responses.get(CSV_URL, body=body,
                      match=[responses.matchers.query_param_matcher({"id": sid}, strict_match=False)])
    months = [f"2025-{m:02d}" for m in range(6, 13)] + [f"2026-{m:02d}" for m in range(1, 9)]
    ecb = "KEY,TIME_PERIOD,OBS_VALUE\n" + "".join(f"BSI,{m},16000000\n" for m in months)
    responses.get(ECB_URL, body=ecb)
    responses.get(re.compile(r"https://openapi\.sosovalue\.com/.*"), json={"code": 0, "data": [
        {"date": "2026-10-01", "total_net_inflow": 1e8}, {"date": "2026-10-02", "total_net_inflow": -2e7}]})
    responses.get(re.compile(r"https://external-api\.kalshi\.com/.*"), json={"markets": [
        {"ticker": "KXFEDDECISION-26OCT-H0", "event_ticker": "KXFEDDECISION-26OCT",
         "yes_sub_title": "Fed maintains rate", "close_time": "2026-10-28T18:00:00Z",
         "yes_bid_dollars": "0.82", "yes_ask_dollars": "0.84"},
        {"ticker": "KXFEDDECISION-26OCT-H25", "event_ticker": "KXFEDDECISION-26OCT",
         "yes_sub_title": "Hike 25bps", "close_time": "2026-10-28T18:00:00Z",
         "yes_bid_dollars": "0.16", "yes_ask_dollars": "0.18"},
    ]})


@responses.activate
def test_full_pipeline(conn, now):
    _mock_all(now)
    collectors = build_collectors(make_ctx(sosovalue_api_key="SK", m2_components=("US", "EZ")))
    backfill = run_collectors(conn, collectors, now=now, backfill_days=120)
    assert {o.collector: o.status for o in backfill} == {c.name: "ok" for c in collectors}

    # Il giro orario subito dopo non riscarica le fonti lente
    hourly = {o.collector: o.status for o in run_collectors(conn, collectors, now=now + timedelta(minutes=55))}
    assert hourly["m2_global"] == "skipped"
    assert hourly["fred_fed_funds"] == "skipped"

    statuses = {s.param.key: s.status for s in check_freshness(conn, now)}
    assert statuses == {k: "ok" for k in statuses}, statuses

    frame = build_aligned_frame(conn, now - timedelta(days=60), now, "1D")
    last = frame.iloc[-1]
    for key in ("btc_price", "m2_global", "etf_flows", "btc_gold_ratio", "fed_funds_rate"):
        assert last[key] == last[key], f"{key} è NaN"  # non NaN
    # M2: US 22000 + EZ 16000 mld EUR * 1.12
    assert abs(last["m2_global"] - (22000.0 + 16000.0 * 1.12)) < 1e-6
    # Il giorno prima della prima raccolta live dominance/Kalshi non esistono ancora
    assert frame["btc_dominance"].iloc[:-1].isna().all()
