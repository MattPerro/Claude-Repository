"""Flussi netti giornalieri degli ETF spot Bitcoin USA da SoSoValue OpenAPI.

Verificato (ottobre 2026): SoSoValue offre ora un'API ufficiale con piano
gratuito (chiave gratuita da https://sosovalue.com/developer, 20 chiamate/min,
100.000/mese). Endpoint: GET /openapi/v1/etfs/summary-history con header
x-soso-api-key; lo storico restituito copre circa l'ultimo mese.
Per lo storico più lungo: btcmon import-csv etf_flows <file.csv>.

Il parsing accetta sia chiavi snake_case (API v1) sia camelCase (API legacy
/openapi/v2/etf/historicalInflowChart), che viene usata come ripiego.
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timedelta

from btcmon.collectors.base import Collector, CollectorUnavailable
from btcmon.db import UpsertResult, upsert
from btcmon.http import HttpError
from btcmon.timeutil import at_utc, next_business_day, to_iso

LEGACY_URL = "https://api.sosovalue.xyz/openapi/v2/etf/historicalInflowChart"

_DATE_KEYS = ("date", "trade_date", "tradeDate", "data_date")
_FIELD_KEYS = {
    "net_inflow_usd": ("total_net_inflow", "totalNetInflow", "daily_net_inflow", "dailyNetInflow", "net_inflow"),
    "total_net_assets_usd": ("total_net_assets", "totalNetAssets", "net_assets"),
    "cum_net_inflow_usd": ("cum_net_inflow", "cumNetInflow", "cumulative_net_inflow"),
    "value_traded_usd": ("total_value_traded", "totalValueTraded", "value_traded"),
}


def etf_flow_available_at(trading_day: date) -> datetime:
    """I flussi del giorno D sono completi la mattina del giorno lavorativo
    successivo (alcuni emittenti pubblicano dopo la chiusura): 14:00 UTC ≈ 10:00 ET."""
    return at_utc(next_business_day(trading_day), 14)


def parse_flows(payload: dict, now: datetime) -> list[dict]:
    code = payload.get("code")
    if code not in (None, 0, "0", 200, "200"):
        raise HttpError(f"SoSoValue ha risposto con errore: code={code} msg={payload.get('msg')!r}")
    records = _find_records(payload.get("data", payload))
    fetched_at = to_iso(now)
    rows = []
    for rec in records:
        raw_date = _first(rec, _DATE_KEYS)
        values = {field: _to_float(_first(rec, keys)) for field, keys in _FIELD_KEYS.items()}
        if raw_date is None or values["net_inflow_usd"] is None:
            continue
        day = date.fromisoformat(str(raw_date)[:10])
        rows.append(
            {
                "observed_at": to_iso(day),
                **values,
                "source": "sosovalue",
                "available_at": to_iso(min(etf_flow_available_at(day), now)),
                "fetched_at": fetched_at,
            }
        )
    return sorted(rows, key=lambda r: r["observed_at"])


class SoSoValueEtfCollector(Collector):
    name = "sosovalue_etf"
    tables = ("etf_flows",)
    min_interval = timedelta(hours=3)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        key = self.settings.sosovalue_api_key
        if not key:
            raise CollectorUnavailable(
                "SOSOVALUE_API_KEY non impostata: inserisci i flussi con "
                "'btcmon manual etf-flow' o 'btcmon import-csv etf_flows'"
            )
        headers = {"x-soso-api-key": key}
        try:
            payload = self.http.get_json(
                f"{self.settings.sosovalue_base_url}/etfs/summary-history",
                params={"symbol": "BTC", "country_code": "US", "limit": 300},
                headers=headers,
            )
            rows = _require_rows(parse_flows(payload, now))
        except HttpError as primary_error:
            try:
                payload = self.http.post_json(LEGACY_URL, json={"type": "us-btc-spot"}, headers=headers)
                rows = _require_rows(parse_flows(payload, now))
            except HttpError as legacy_error:
                raise HttpError(f"v1: {primary_error} | legacy: {legacy_error}") from legacy_error
        return upsert(conn, "etf_flows", rows)


def _require_rows(rows: list[dict]) -> list[dict]:
    if not rows:
        raise HttpError("nessun record di flusso riconosciuto nella risposta")
    return rows


def _find_records(data) -> list[dict]:
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for key in ("list", "items", "records", "data", "history"):
            if isinstance(data.get(key), list):
                return [r for r in data[key] if isinstance(r, dict)]
    return []


def _first(record: dict, keys):
    for key in keys:
        if record.get(key) not in (None, ""):
            return record[key]
    return None


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None
