from btcmon.db import upsert

EXPECTED_TABLES = {
    "btc_price", "m2_global", "m2_components", "etf_flows", "btc_gold_ratio",
    "btc_dominance", "fed_funds_rate", "fed_expectations", "collection_runs",
}


def _row(value, fetched="2026-10-05T10:00:00Z", available="2026-10-05T10:00:00Z"):
    return {
        "observed_at": "2026-10-05T10:00:00Z", "price_usd": value, "market_cap_usd": None,
        "volume_24h_usd": None, "source": "test", "available_at": available, "fetched_at": fetched,
    }


def test_schema_has_one_table_per_parameter(conn):
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert EXPECTED_TABLES <= tables


def test_init_db_is_idempotent(conn):
    from btcmon.db import init_db
    init_db(conn)
    init_db(conn)


def test_upsert_inserts_then_ignores_identical_rows(conn):
    assert upsert(conn, "btc_price", [_row(100.0)]).inserted == 1
    again = upsert(conn, "btc_price", [_row(100.0, fetched="2026-10-05T11:00:00Z")])
    assert (again.inserted, again.updated) == (0, 0)


def test_upsert_updates_revised_value_but_keeps_first_available_at(conn):
    upsert(conn, "btc_price", [_row(100.0)])
    revised = upsert(conn, "btc_price", [_row(101.0, fetched="2026-10-06T00:00:00Z", available="2026-10-06T00:00:00Z")])
    assert revised.updated == 1
    row = conn.execute("SELECT price_usd, available_at, fetched_at FROM btc_price").fetchone()
    assert row["price_usd"] == 101.0
    assert row["available_at"] == "2026-10-05T10:00:00Z"
    assert row["fetched_at"] == "2026-10-06T00:00:00Z"
