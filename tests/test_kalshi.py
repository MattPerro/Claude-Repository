import json
from datetime import datetime, timezone

import pytest
import responses

from btcmon.collectors.kalshi import KalshiFedCollector, build_expectation_row, market_probability, outcome_bps
from conftest import make_ctx


def _market(event, suffix, sub, bid, ask, last, close="2026-10-28T18:00:00Z"):
    return {"ticker": f"{event}-{suffix}", "event_ticker": event, "yes_sub_title": sub,
            "title": "Fed decision in October?", "close_time": close,
            "yes_bid_dollars": bid, "yes_ask_dollars": ask, "last_price_dollars": last}


OCT = [
    _market("KXFEDDECISION-26OCT", "C26", "Cut >25bps", "0.00", "0.01", "0.01"),
    _market("KXFEDDECISION-26OCT", "C25", "Cut 25bps", "0.01", "0.02", "0.01"),
    _market("KXFEDDECISION-26OCT", "H0", "Fed maintains rate", "0.82", "0.84", "0.83"),
    _market("KXFEDDECISION-26OCT", "H25", "Hike 25bps", "0.17", "0.19", "0.18"),
    _market("KXFEDDECISION-26OCT", "H26", "Hike >25bps", "0.00", "0.01", "0.00"),
]
DEC = [_market("KXFEDDECISION-26DEC", "H0", "Fed maintains rate", "0.60", "0.62", "0.61",
               close="2026-12-09T19:00:00Z")]


@pytest.mark.parametrize("sub,expected", [
    ("Cut 25bps", -25), ("Cut >25bps", -50), ("Hike 25bps", 25), ("Hike >25bps", 50),
    ("Fed maintains rate", 0), ("Hold", 0),
])
def test_outcome_bps_from_subtitle(sub, expected):
    assert outcome_bps({"yes_sub_title": sub}) == expected


def test_outcome_bps_ticker_fallback():
    assert outcome_bps({"ticker": "KXFEDDECISION-26OCT-C26"}) == -50
    assert outcome_bps({"ticker": "KXFEDDECISION-26OCT-H0"}) == 0


def test_probability_prefers_mid_then_last_then_cents():
    assert market_probability({"yes_bid_dollars": "0.40", "yes_ask_dollars": "0.44"}) == pytest.approx(0.42)
    wide = {"yes_bid_dollars": "0.10", "yes_ask_dollars": "0.60", "last_price_dollars": "0.30"}
    assert market_probability(wide) == pytest.approx(0.30)
    assert market_probability({"yes_bid": 40, "yes_ask": 44}) == pytest.approx(0.42)


def test_expectation_row_uses_nearest_meeting_and_normalizes(now):
    row = build_expectation_row(DEC + OCT, now)
    assert row["event_ticker"] == "KXFEDDECISION-26OCT"
    assert row["meeting_date"] == "2026-10-28"
    assert row["prob_cut"] + row["prob_hold"] + row["prob_hike"] == pytest.approx(1.0)
    assert row["prob_hike"] > row["prob_cut"]
    assert 0 < row["expected_change_bps"] < 10
    assert set(json.loads(row["outcomes"])) == {"-50", "-25", "0", "25", "50"}


def test_past_meetings_are_ignored():
    after_oct = datetime(2026, 10, 29, tzinfo=timezone.utc)
    assert build_expectation_row(OCT + DEC, after_oct)["event_ticker"] == "KXFEDDECISION-26DEC"


@responses.activate
def test_collector_falls_back_to_second_base_url(conn, now):
    ctx = make_ctx(kalshi_base_urls=("https://a.example/v2", "https://b.example/v2"))
    responses.get("https://a.example/v2/markets", status=500)
    responses.get("https://b.example/v2/markets", json={"markets": OCT, "cursor": ""})
    assert KalshiFedCollector(ctx).collect(conn, now).inserted == 1
    assert conn.execute("SELECT meeting_date FROM fed_expectations").fetchone()[0] == "2026-10-28"
