from datetime import date

import pytest

from btcmon.manual import add_etf_flow, add_fed_expectation, import_etf_flows_csv

FARSIDE_CSV = """Date,IBIT,FBTC,GBTC,Total
Fee,0.25%,0.25%,1.50%,
01 Oct 2026,100.5,(20.0),-,"1,050.3"
02 Oct 2026,10.0,5.0,(3.1),(45.2)
Total,,,,1005.1
Average,,,,502.5
"""


def test_manual_etf_flow(conn, now):
    result = add_etf_flow(conn, date(2026, 10, 2), -45.2e6, now)
    assert result.inserted == 1
    row = conn.execute("SELECT * FROM etf_flows").fetchone()
    assert row["source"] == "manual"
    assert row["net_inflow_usd"] == -45.2e6


def test_manual_fed_expectation_is_normalized(conn, now):
    add_fed_expectation(conn, date(2026, 10, 28), 0.0, 83.0, 17.0, now)  # anche in percentuale
    row = conn.execute("SELECT * FROM fed_expectations").fetchone()
    assert row["prob_hold"] == pytest.approx(0.83)
    assert row["expected_change_bps"] == pytest.approx(25 * 0.17)


def test_import_farside_style_csv(conn, now, tmp_path):
    path = tmp_path / "farside.csv"
    path.write_text(FARSIDE_CSV)
    result = import_etf_flows_csv(conn, path, now)
    assert result.inserted == 2
    rows = conn.execute("SELECT observed_at, net_inflow_usd FROM etf_flows ORDER BY observed_at").fetchall()
    assert [tuple(r) for r in rows] == [("2026-10-01T00:00:00Z", 1050.3e6), ("2026-10-02T00:00:00Z", -45.2e6)]


def test_import_btcmon_format(conn, now, tmp_path):
    path = tmp_path / "flows.csv"
    path.write_text("date,net_inflow_usd\n2026-09-30,1500000\n")
    assert import_etf_flows_csv(conn, path, now).inserted == 1
