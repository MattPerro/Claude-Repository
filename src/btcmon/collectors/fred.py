"""FRED (Federal Reserve Bank of St. Louis): M2 USA, Fed Funds, cambio EUR/USD.

Due modalità:
- con FRED_API_KEY (gratuita, 120 richieste/min): API ufficiale + vintage ALFRED.
  Per ogni osservazione si conosce la data della PRIMA pubblicazione
  (realtime_start), usata come available_at: nessun look-ahead nel backtest;
- senza chiave: export CSV pubblico (fredgraph.csv). La data di pubblicazione
  viene stimata con un ritardo tipico configurato per serie.
"""

from __future__ import annotations

import io
import sqlite3
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import pandas as pd

from btcmon.collectors.base import Collector
from btcmon.db import UpsertResult, upsert
from btcmon.http import HttpClient, HttpError
from btcmon.timeutil import at_utc, next_business_day, to_iso

API_URL = "https://api.stlouisfed.org/fred/series/observations"
CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"

# Ora (UTC) a cui si considera disponibile un dato FRED nel giorno di uscita.
# Conservativa: H.6 esce alle 13:00 ET, H.15 al mattino.
FRED_RELEASE_HOUR_UTC = 18


def _lag_next_business_day(d: date) -> datetime:
    return at_utc(next_business_day(d), FRED_RELEASE_HOUR_UTC)


def _lag_days(days: int) -> Callable[[date], datetime]:
    return lambda d: at_utc(d + timedelta(days=days), FRED_RELEASE_HOUR_UTC)


# Ritardo di pubblicazione stimato (usato solo senza API key).
ESTIMATED_RELEASE: dict[str, Callable[[date], datetime]] = {
    # M2 settimanale (H.6): pubblicato una volta al mese, 3-7 settimane dopo.
    "WM2NS": _lag_days(35),
    "M2SL": _lag_days(30),
    "DFF": _lag_next_business_day,
    "DFEDTARU": _lag_next_business_day,
    "DFEDTARL": _lag_next_business_day,
    # Cambi H.10: pubblicati il lunedì per la settimana precedente.
    "DEXUSEU": _lag_days(8),
}


@dataclass
class FredSeries:
    series_id: str
    data: pd.DataFrame  # colonne: date (datetime.date), value (float), available_at (str ISO)
    source: str


def fetch_series(
    http: HttpClient, api_key: str | None, series_id: str, start: date, now: datetime
) -> FredSeries:
    if api_key:
        frame = _fetch_api(http, api_key, series_id, start)
        source = "fred_api"
    else:
        frame = _fetch_csv(http, series_id, start)
        estimate = ESTIMATED_RELEASE.get(series_id, _lag_days(1))
        frame["available_at"] = [estimate(d) for d in frame["date"]]
        source = "fred_csv"
    # Un dato non può essere "disponibile" dopo il momento in cui lo stiamo leggendo.
    frame["available_at"] = [to_iso(min(a, now)) for a in frame["available_at"]]
    return FredSeries(series_id, frame.reset_index(drop=True), source)


def _fetch_api(http: HttpClient, api_key: str, series_id: str, start: date) -> pd.DataFrame:
    payload = http.get_json(
        API_URL,
        params={
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "observation_start": start.isoformat(),
            # Tutte le vintage: permette di ricavare la data di prima pubblicazione.
            "realtime_start": "1776-07-04",
            "realtime_end": "9999-12-31",
        },
    )
    return parse_api_observations(payload)


def parse_api_observations(payload: dict) -> pd.DataFrame:
    obs = payload.get("observations")
    if obs is None:
        raise HttpError(f"Risposta FRED inattesa: {payload!r:.200}")
    frame = pd.DataFrame(obs, columns=["realtime_start", "realtime_end", "date", "value"])
    if frame.empty:
        return pd.DataFrame(columns=["date", "value", "available_at"])
    first_release = frame.groupby("date")["realtime_start"].min()
    latest = frame[frame["realtime_end"] == "9999-12-31"].set_index("date")["value"]
    out = pd.DataFrame({"value": latest}).join(first_release.rename("first_release"), how="left")
    out["value"] = pd.to_numeric(out["value"], errors="coerce")  # "." = mancante
    out = out.dropna(subset=["value"]).reset_index()
    out["date"] = [date.fromisoformat(d) for d in out["date"]]
    out["available_at"] = [at_utc(date.fromisoformat(d), FRED_RELEASE_HOUR_UTC) for d in out["first_release"]]
    return out[["date", "value", "available_at"]].sort_values("date")


def _fetch_csv(http: HttpClient, series_id: str, start: date) -> pd.DataFrame:
    text = http.get_text(CSV_URL, params={"id": series_id, "cosd": start.isoformat()})
    return parse_csv(text, series_id)


def parse_csv(text: str, series_id: str) -> pd.DataFrame:
    frame = pd.read_csv(io.StringIO(text))
    if frame.shape[1] < 2:
        raise HttpError(f"CSV FRED inatteso per {series_id}: {text[:200]!r}")
    date_col = frame.columns[0]  # 'observation_date' (formato attuale) o 'DATE'
    value_col = series_id if series_id in frame.columns else frame.columns[1]
    out = pd.DataFrame(
        {
            "date": pd.to_datetime(frame[date_col]).dt.date,
            "value": pd.to_numeric(frame[value_col], errors="coerce"),
        }
    )
    return out.dropna(subset=["value"]).sort_values("date").reset_index(drop=True)


class FedFundsCollector(Collector):
    """Tasso Fed Funds effettivo (DFF) e range obiettivo (DFEDTARL/DFEDTARU)."""

    name = "fred_fed_funds"
    tables = ("fed_funds_rate",)
    min_interval = timedelta(hours=6)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        return self._run(conn, now, days=30)

    def backfill(self, conn: sqlite3.Connection, now: datetime, days: int) -> UpsertResult:
        return self._run(conn, now, days=days)

    def _run(self, conn, now, days):
        start = (now - timedelta(days=days)).date()
        key = self.settings.fred_api_key
        dff = fetch_series(self.http, key, "DFF", start, now)
        lower = fetch_series(self.http, key, "DFEDTARL", start, now)
        upper = fetch_series(self.http, key, "DFEDTARU", start, now)
        rows = build_fed_funds_rows(dff, lower, upper, to_iso(now))
        return upsert(conn, "fed_funds_rate", rows)


def build_fed_funds_rows(dff: FredSeries, lower: FredSeries, upper: FredSeries, fetched_at: str) -> list[dict]:
    frame = dff.data.rename(columns={"value": "effective_rate"}).set_index("date")
    frame = frame.join(lower.data.set_index("date")["value"].rename("target_lower"), how="left")
    frame = frame.join(upper.data.set_index("date")["value"].rename("target_upper"), how="left")
    rows = []
    for d, r in frame.sort_index().iterrows():
        rows.append(
            {
                "observed_at": to_iso(d),
                "effective_rate": float(r["effective_rate"]),
                "target_lower": None if pd.isna(r["target_lower"]) else float(r["target_lower"]),
                "target_upper": None if pd.isna(r["target_upper"]) else float(r["target_upper"]),
                "source": dff.source,
                "available_at": r["available_at"],
                "fetched_at": fetched_at,
            }
        )
    return rows
