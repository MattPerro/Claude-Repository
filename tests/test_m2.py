import json
from datetime import date, datetime, timezone

import pandas as pd
import pytest
import responses

from btcmon.collectors.fred import CSV_URL
from btcmon.collectors.m2 import ECB_URL, M2GlobalCollector, build_composite_rows, build_ez_rows, parse_ecb_csv
from btcmon.db import upsert
from btcmon.runner import run_collectors
from conftest import make_ctx

ECB_CSV = (
    "KEY,FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE,OBS_STATUS\n"
    "BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E,M,U2,2026-07,16100000.0,A\n"
    "BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E,M,U2,2026-08,16150000.0,A\n"
)


def test_parse_ecb_csv_uses_month_end():
    frame = parse_ecb_csv(ECB_CSV)
    assert list(frame["date"]) == [date(2026, 7, 31), date(2026, 8, 31)]
    assert frame["value_meur"].iloc[1] == 16150000.0


def test_build_ez_rows_converts_to_usd_billions():
    m2 = parse_ecb_csv(ECB_CSV)
    fx = pd.DataFrame({"date": [date(2026, 7, 31), date(2026, 8, 28)], "value": [1.10, 1.12]})
    now = datetime(2026, 10, 5, tzinfo=timezone.utc)
    rows = build_ez_rows(m2, fx, now, "x")
    assert rows[0]["value_usd_bn"] == pytest.approx(16100.0 * 1.10)
    assert rows[1]["fx_to_usd"] == 1.12  # ultimo cambio disponibile entro fine mese
    assert rows[1]["available_at"] == "2026-09-30T09:00:00Z"  # fine mese + 30 gg


def _component(comp, observed, value, available):
    return {"component": comp, "observed_at": observed, "value_local_bn": value, "currency": "USD",
            "fx_to_usd": 1.0, "value_usd_bn": value, "series_id": "t", "source": "t",
            "available_at": available, "fetched_at": "x"}


def test_composite_is_point_in_time(conn):
    upsert(conn, "m2_components", [
        _component("US", "2026-08-03T00:00:00Z", 22000.0, "2026-09-07T18:00:00Z"),
        _component("US", "2026-08-10T00:00:00Z", 22100.0, "2026-09-14T18:00:00Z"),
        _component("EZ", "2026-07-31T00:00:00Z", 17000.0, "2026-08-30T09:00:00Z"),
        _component("EZ", "2026-08-31T00:00:00Z", 17500.0, "2026-09-30T09:00:00Z"),
    ], key=("component", "observed_at"))
    rows = {r["observed_at"]: r for r in build_composite_rows(conn, ("US", "EZ"), "x")}
    # Il 7/9 l'EZ di agosto non è ancora uscito: si usa luglio
    assert rows["2026-09-07T18:00:00Z"]["value_usd_bn"] == 22000.0 + 17000.0
    assert rows["2026-09-14T18:00:00Z"]["value_usd_bn"] == 22100.0 + 17000.0
    # Il 30/9 esce l'EZ di agosto
    assert rows["2026-09-30T09:00:00Z"]["value_usd_bn"] == 22100.0 + 17500.0
    # Prima che esistano entrambe le componenti non c'è aggregato
    assert "2026-08-30T09:00:00Z" not in rows
    assert json.loads(rows["2026-09-30T09:00:00Z"]["components"])["EZ"]["ref"] == "2026-08-31"


@responses.activate
def test_collector_saves_us_even_if_ecb_fails(conn, now):
    responses.get(CSV_URL, match=[responses.matchers.query_param_matcher({"id": "WM2NS"}, strict_match=False)],
                  body="observation_date,WM2NS\n2026-08-03,22050.4\n")
    responses.get(ECB_URL, status=503)
    outcome = run_collectors(conn, [M2GlobalCollector(make_ctx(m2_components=("US", "EZ")))], now=now)[0]
    assert outcome.status == "error"
    assert "parziale" in outcome.message
    assert conn.execute("SELECT COUNT(*) FROM m2_components WHERE component='US'").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM m2_global").fetchone()[0] == 0


@responses.activate
def test_collector_us_only_builds_composite(conn, now):
    responses.get(CSV_URL, body="observation_date,WM2NS\n2026-08-03,22050.4\n2026-08-10,22070.0\n")
    result = M2GlobalCollector(make_ctx(m2_components=("US",))).collect(conn, now)
    assert result.inserted == 4  # 2 componenti + 2 righe aggregate
    assert conn.execute("SELECT source FROM m2_global LIMIT 1").fetchone()[0] == "composite:US"
