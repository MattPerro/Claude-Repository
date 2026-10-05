from datetime import date, datetime, timezone

import responses

from btcmon.collectors.fred import (
    API_URL,
    CSV_URL,
    FedFundsCollector,
    fetch_series,
    parse_api_observations,
    parse_csv,
)
from conftest import make_ctx

WM2NS_CSV = "observation_date,WM2NS\n2026-07-27,22010.1\n2026-08-03,22050.4\n2026-08-10,.\n"


def test_parse_csv_skips_missing_values():
    frame = parse_csv(WM2NS_CSV, "WM2NS")
    assert list(frame["date"]) == [date(2026, 7, 27), date(2026, 8, 3)]
    assert list(frame["value"]) == [22010.1, 22050.4]


def test_parse_csv_accepts_legacy_date_header():
    frame = parse_csv("DATE,DFF\n2026-10-01,4.33\n", "DFF")
    assert frame["value"].iloc[0] == 4.33


def test_parse_api_uses_first_release_and_latest_value():
    payload = {"observations": [
        {"realtime_start": "2026-08-26", "realtime_end": "2026-09-22", "date": "2026-08-03", "value": "22040.0"},
        {"realtime_start": "2026-09-23", "realtime_end": "9999-12-31", "date": "2026-08-03", "value": "22050.4"},
        {"realtime_start": "2026-09-23", "realtime_end": "9999-12-31", "date": "2026-08-10", "value": "22070.0"},
    ]}
    frame = parse_api_observations(payload).set_index("date")
    assert frame.loc[date(2026, 8, 3), "value"] == 22050.4  # valore rivisto
    assert frame.loc[date(2026, 8, 3), "available_at"] == datetime(2026, 8, 26, 18, tzinfo=timezone.utc)
    assert frame.loc[date(2026, 8, 10), "available_at"] == datetime(2026, 9, 23, 18, tzinfo=timezone.utc)


@responses.activate
def test_csv_mode_estimates_release_and_clamps_to_now(ctx):
    responses.get(CSV_URL, body=WM2NS_CSV)
    now = datetime(2026, 9, 1, tzinfo=timezone.utc)
    series = fetch_series(ctx.http, None, "WM2NS", date(2026, 1, 1), now)
    # 2026-07-27 + 35 gg = 2026-08-31 18:00 (< now); 2026-08-03 + 35 gg sarebbe nel futuro -> now
    assert list(series.data["available_at"]) == ["2026-08-31T18:00:00Z", "2026-09-01T00:00:00Z"]
    assert series.source == "fred_csv"


@responses.activate
def test_api_mode_sends_key_and_vintage_range(now):
    responses.get(API_URL, json={"observations": []})
    fetch_series(make_ctx().http, "KEY123", "DFF", date(2026, 1, 1), now)
    params = responses.calls[0].request.params
    assert params["api_key"] == "KEY123"
    assert params["realtime_start"] == "1776-07-04"


@responses.activate
def test_fed_funds_collector_merges_target_range(conn, ctx, now):
    responses.get(CSV_URL, match=[responses.matchers.query_param_matcher({"id": "DFF"}, strict_match=False)],
                  body="observation_date,DFF\n2026-10-01,4.33\n2026-10-02,4.33\n")
    responses.get(CSV_URL, match=[responses.matchers.query_param_matcher({"id": "DFEDTARL"}, strict_match=False)],
                  body="observation_date,DFEDTARL\n2026-10-01,4.25\n2026-10-02,4.25\n")
    responses.get(CSV_URL, match=[responses.matchers.query_param_matcher({"id": "DFEDTARU"}, strict_match=False)],
                  body="observation_date,DFEDTARU\n2026-10-01,4.50\n2026-10-02,4.50\n")
    result = FedFundsCollector(ctx).collect(conn, now)
    assert result.inserted == 2
    row = conn.execute("SELECT * FROM fed_funds_rate ORDER BY observed_at DESC").fetchone()
    assert (row["effective_rate"], row["target_lower"], row["target_upper"]) == (4.33, 4.25, 4.50)
    # Venerdì 2 ottobre -> disponibile lunedì 5 alle 18:00 UTC
    assert row["available_at"] == "2026-10-05T18:00:00Z"
