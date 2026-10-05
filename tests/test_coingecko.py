import pytest
import responses

from btcmon.collectors.coingecko import (
    BASE_URL,
    CoinGeckoGlobalCollector,
    CoinGeckoPriceCollector,
    parse_market_chart,
    parse_simple_price,
)
from conftest import make_ctx

TS = 1759698000  # 2025-10-05T21:00:00Z
SIMPLE_PRICE = {
    "bitcoin": {
        "usd": 86000.5, "usd_market_cap": 1.71e12, "usd_24h_vol": 3.2e10,
        "xau": 20.25, "xau_market_cap": 4.0e8, "xau_24h_vol": 7.5e6,
        "last_updated_at": TS,
    },
    "pax-gold": {"usd": 4250.0, "last_updated_at": TS - 30},
}
GLOBAL = {
    "data": {
        "active_cryptocurrencies": 17000,
        "total_market_cap": {"usd": 3.05e12, "eur": 2.8e12},
        "market_cap_percentage": {"btc": 56.42, "eth": 11.9},
        "updated_at": TS + 12,
    }
}


def test_parse_simple_price_uses_xau_for_ratio():
    prices, ratios = parse_simple_price(SIMPLE_PRICE, "2025-10-05T21:05:00Z")
    assert prices[0]["observed_at"] == "2025-10-05T21:00:00Z"
    assert prices[0]["price_usd"] == 86000.5
    assert ratios[0]["ratio"] == 20.25
    assert ratios[0]["gold_usd"] == pytest.approx(86000.5 / 20.25)
    assert ratios[0]["source"] == "coingecko_xau"


def test_parse_simple_price_falls_back_to_paxg():
    payload = {"bitcoin": {k: v for k, v in SIMPLE_PRICE["bitcoin"].items() if not k.startswith("xau")},
               "pax-gold": SIMPLE_PRICE["pax-gold"]}
    _, ratios = parse_simple_price(payload, "x")
    assert ratios[0]["ratio"] == pytest.approx(86000.5 / 4250.0)
    assert ratios[0]["source"] == "coingecko_paxg"


@responses.activate
def test_price_collector_writes_price_and_ratio(conn, ctx, now):
    responses.get(f"{BASE_URL}/simple/price", json=SIMPLE_PRICE)
    result = CoinGeckoPriceCollector(ctx).collect(conn, now)
    assert result.inserted == 2
    # Stessa risposta (CoinGecko non ha aggiornato): nessuna nuova riga
    assert CoinGeckoPriceCollector(ctx).collect(conn, now).inserted == 0


@responses.activate
def test_demo_key_is_sent_as_header(conn, now):
    responses.get(f"{BASE_URL}/global", json=GLOBAL)
    CoinGeckoGlobalCollector(make_ctx(coingecko_demo_api_key="CG-test")).collect(conn, now)
    assert responses.calls[0].request.headers["x-cg-demo-api-key"] == "CG-test"


@responses.activate
def test_global_collector_writes_dominance(conn, ctx, now):
    responses.get(f"{BASE_URL}/global", json=GLOBAL)
    CoinGeckoGlobalCollector(ctx).collect(conn, now)
    row = conn.execute("SELECT * FROM btc_dominance").fetchone()
    assert row["dominance_pct"] == 56.42
    assert row["total_market_cap_usd"] == 3.05e12
    assert row["observed_at"] == "2025-10-05T21:00:12Z"


def test_parse_market_chart_matches_xau_to_nearest_usd_point():
    ms = TS * 1000
    usd = {
        "prices": [[ms, 86000.0], [ms + 3_600_000, 86500.0]],
        "market_caps": [[ms, 1.7e12], [ms + 3_600_000, 1.72e12]],
        "total_volumes": [[ms, 3e10], [ms + 3_600_000, 3.1e10]],
    }
    xau = {"prices": [[ms + 2_000, 20.0], [ms + 3_600_000 + 5_000, 20.2]]}
    prices, ratios = parse_market_chart(usd, xau, "x")
    assert [p["price_usd"] for p in prices] == [86000.0, 86500.0]
    assert prices[1]["market_cap_usd"] == 1.72e12
    assert [r["btc_usd"] for r in ratios] == [86000.0, 86500.0]
    assert ratios[1]["gold_usd"] == pytest.approx(86500.0 / 20.2)


@responses.activate
def test_backfill_requests_daily_and_hourly_windows(conn, ctx, now):
    ms = TS * 1000
    chart = {"prices": [[ms, 86000.0]], "market_caps": [[ms, 1.7e12]], "total_volumes": [[ms, 3e10]]}
    responses.get(f"{BASE_URL}/coins/bitcoin/market_chart", json=chart)
    responses.get(f"{BASE_URL}/simple/price", json=SIMPLE_PRICE)
    CoinGeckoPriceCollector(ctx).backfill(conn, now, days=365)
    days = [c.request.params.get("days") for c in responses.calls if "market_chart" in c.request.url]
    assert sorted(days) == ["365", "365", "90", "90"]  # usd + xau per finestra
