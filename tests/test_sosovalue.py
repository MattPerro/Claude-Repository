import pytest
import responses

from btcmon.collectors.base import CollectorUnavailable
from btcmon.collectors.sosovalue import LEGACY_URL, SoSoValueEtfCollector, parse_flows
from conftest import make_ctx

V1_URL = "https://openapi.sosovalue.com/openapi/v1/etfs/summary-history"
V1_PAYLOAD = {"code": 0, "msg": "success", "data": [
    {"date": "2026-10-02", "total_net_inflow": "120500000.5", "total_net_assets": "108890000000",
     "cum_net_inflow": "57800000000", "total_value_traded": "2100000000"},
    {"date": "2026-10-01", "total_net_inflow": "-35000000", "total_net_assets": "108100000000"},
]}
LEGACY_PAYLOAD = {"code": 0, "msg": None, "data": {"list": [
    {"date": "2026-10-02", "totalNetInflow": 120500000.5, "totalNetAssets": 1.0889e11, "cumNetInflow": 5.78e10},
]}}


def test_parse_snake_case_and_availability(now):
    rows = parse_flows(V1_PAYLOAD, now)
    assert [r["observed_at"] for r in rows] == ["2026-10-01T00:00:00Z", "2026-10-02T00:00:00Z"]
    assert rows[0]["net_inflow_usd"] == -35_000_000
    # Venerdì 2/10 -> disponibile lunedì 5/10 alle 14:00 UTC
    assert rows[1]["available_at"] == "2026-10-05T14:00:00Z"


def test_parse_legacy_camel_case(now):
    rows = parse_flows(LEGACY_PAYLOAD, now)
    assert rows[0]["net_inflow_usd"] == 120500000.5
    assert rows[0]["cum_net_inflow_usd"] == 5.78e10


def test_error_code_raises(now):
    with pytest.raises(Exception, match="code=40001"):
        parse_flows({"code": 40001, "msg": "invalid api key"}, now)


def test_without_key_collector_is_unavailable(conn, ctx, now):
    with pytest.raises(CollectorUnavailable):
        SoSoValueEtfCollector(ctx).collect(conn, now)


@responses.activate
def test_collector_sends_key_and_falls_back_to_legacy(conn, now):
    responses.get(V1_URL, status=404)
    responses.post(LEGACY_URL, json=LEGACY_PAYLOAD)
    result = SoSoValueEtfCollector(make_ctx(sosovalue_api_key="SK")).collect(conn, now)
    assert result.inserted == 1
    assert all(c.request.headers["x-soso-api-key"] == "SK" for c in responses.calls)


@responses.activate
def test_unrecognized_v1_payload_also_falls_back(conn, now):
    responses.get(V1_URL, json={"code": 0, "data": {"unexpected": True}})
    responses.post(LEGACY_URL, json=LEGACY_PAYLOAD)
    assert SoSoValueEtfCollector(make_ctx(sosovalue_api_key="SK")).collect(conn, now).inserted == 1
