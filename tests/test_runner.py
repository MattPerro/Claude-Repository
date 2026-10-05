from datetime import timedelta

from btcmon.collectors.base import Collector, CollectorUnavailable
from btcmon.db import UpsertResult
from btcmon.runner import build_collectors, run_collectors


class _Ok(Collector):
    name = "ok_collector"
    min_interval = timedelta(hours=6)

    def collect(self, conn, now):
        return UpsertResult(inserted=1)


class _Broken(Collector):
    name = "broken_collector"

    def collect(self, conn, now):
        raise ValueError("risposta inattesa")


class _NoKey(Collector):
    name = "nokey_collector"

    def collect(self, conn, now):
        raise CollectorUnavailable("manca la chiave")


def test_broken_collector_does_not_stop_others(conn, ctx, now):
    outcomes = run_collectors(conn, [_Broken(ctx), _NoKey(ctx), _Ok(ctx)], now=now)
    assert [o.status for o in outcomes] == ["error", "unavailable", "ok"]
    logged = conn.execute("SELECT collector, status FROM collection_runs ORDER BY id").fetchall()
    assert [tuple(r) for r in logged] == [("broken_collector", "error"), ("nokey_collector", "unavailable"),
                                          ("ok_collector", "ok")]


def test_min_interval_skips_recent_collectors_unless_forced(conn, ctx, now):
    run_collectors(conn, [_Ok(ctx)], now=now)
    assert run_collectors(conn, [_Ok(ctx)], now=now + timedelta(hours=1))[0].status == "skipped"
    assert run_collectors(conn, [_Ok(ctx)], now=now + timedelta(hours=1), force=True)[0].status == "ok"
    assert run_collectors(conn, [_Ok(ctx)], now=now + timedelta(hours=7))[0].status == "ok"


def test_build_collectors_filters_by_name(ctx):
    names = [c.name for c in build_collectors(ctx, ["coingecko_price", "kalshi_fed"])]
    assert names == ["coingecko_price", "kalshi_fed"]
