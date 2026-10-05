"""Liquidità M2 aggregata in USD.

Componenti disponibili gratuitamente (verificate ottobre 2026):
- US: FRED WM2NS (settimanale, miliardi USD);
- EZ: ECB Data Portal, serie BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E (mensile,
  destagionalizzata, milioni EUR), convertita in USD con FRED DEXUSEU.

Cina e Giappone (necessari per un vero "global M2") non hanno oggi una fonte
gratuita, stabile e aggiornata via API: le serie IMF su FRED sono ferme e
BGeometrics mette M2 Global solo nei piani a pagamento. Per questo l'aggregato
è etichettato con le componenti incluse (colonna source, es. composite:EZ+US).
"""

from __future__ import annotations

import io
import json
import sqlite3
from datetime import date, datetime, timedelta

import pandas as pd

from btcmon.collectors.base import Collector, PartialFailure
from btcmon.collectors.fred import fetch_series
from btcmon.db import UpsertResult, upsert
from btcmon.http import HttpClient, HttpError
from btcmon.timeutil import at_utc, to_iso, to_utc

ECB_URL = "https://data-api.ecb.europa.eu/service/data/BSI/M.U2.Y.V.M20.X.1.U2.2300.Z01.E"
ECB_SERIES = "BSI.M.U2.Y.V.M20.X.1.U2.2300.Z01.E"
# La BCE pubblica gli aggregati monetari ~28 giorni dopo fine mese, alle 10:00 CET.
ECB_RELEASE_LAG_DAYS = 30

# Componente scartata se il suo ultimo dato di riferimento è più vecchio di così
# rispetto alla data dell'evento (evita di sommare un'Eurozona ferma da mesi).
MAX_COMPONENT_AGE = timedelta(days=100)


def fetch_ecb_m2(http: HttpClient, start: date) -> pd.DataFrame:
    text = http.get_text(ECB_URL, params={"format": "csvdata", "startPeriod": start.strftime("%Y-%m")})
    return parse_ecb_csv(text)


def parse_ecb_csv(text: str) -> pd.DataFrame:
    frame = pd.read_csv(io.StringIO(text))
    if "TIME_PERIOD" not in frame.columns or "OBS_VALUE" not in frame.columns:
        raise HttpError(f"CSV BCE inatteso: {text[:200]!r}")
    periods = pd.PeriodIndex(frame["TIME_PERIOD"].astype(str), freq="M")
    out = pd.DataFrame(
        {
            # Stock a fine mese
            "date": [p.end_time.date() for p in periods],
            "value_meur": pd.to_numeric(frame["OBS_VALUE"], errors="coerce"),
        }
    )
    return out.dropna().sort_values("date").reset_index(drop=True)


class M2GlobalCollector(Collector):
    name = "m2_global"
    tables = ("m2_components", "m2_global")
    min_interval = timedelta(hours=12)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        return self._run(conn, now, days=400)

    def backfill(self, conn: sqlite3.Connection, now: datetime, days: int) -> UpsertResult:
        # Un po' di margine prima della finestra per avere già l'Eurozona all'inizio.
        return self._run(conn, now, days=max(days, 400) + 120)

    def _run(self, conn, now, days):
        start = (now - timedelta(days=days)).date()
        fetched_at = to_iso(now)
        rows: list[dict] = []
        errors: list[str] = []
        for component in self.settings.m2_components:
            try:
                if component == "US":
                    rows += self._us_rows(start, now, fetched_at)
                elif component == "EZ":
                    rows += self._ez_rows(start, now, fetched_at)
                else:
                    errors.append(f"componente M2 sconosciuta: {component}")
            except HttpError as exc:
                errors.append(f"{component}: {exc}")
        result = upsert(conn, "m2_components", rows, key=("component", "observed_at"))
        result += upsert(
            conn,
            "m2_global",
            build_composite_rows(conn, self.settings.m2_components, fetched_at),
        )
        if errors:
            # Le righe valide sono già salvate; segnalo comunque l'errore nel log raccolte.
            raise PartialFailure("; ".join(errors), result)
        return result

    def _us_rows(self, start, now, fetched_at):
        series = fetch_series(self.http, self.settings.fred_api_key, "WM2NS", start, now)
        return [
            {
                "component": "US",
                "observed_at": to_iso(r.date),
                "value_local_bn": float(r.value),
                "currency": "USD",
                "fx_to_usd": 1.0,
                "value_usd_bn": float(r.value),
                "series_id": "FRED:WM2NS",
                "source": series.source,
                "available_at": r.available_at,
                "fetched_at": fetched_at,
            }
            for r in series.data.itertuples(index=False)
        ]

    def _ez_rows(self, start, now, fetched_at):
        m2 = fetch_ecb_m2(self.http, start)
        fx = fetch_series(self.http, self.settings.fred_api_key, "DEXUSEU", start - timedelta(days=10), now)
        return build_ez_rows(m2, fx.data, now, fetched_at)


def build_ez_rows(m2: pd.DataFrame, fx: pd.DataFrame, now: datetime, fetched_at: str) -> list[dict]:
    """Converte M2 Eurozona (milioni EUR, fine mese) in miliardi USD al cambio di fine mese."""
    if m2.empty:
        return []
    fx_sorted = fx.sort_values("date")[["date", "value"]].rename(columns={"value": "fx"})
    fx_sorted["date"] = pd.to_datetime(fx_sorted["date"])
    left = m2.assign(date=pd.to_datetime(m2["date"])).sort_values("date")
    merged = pd.merge_asof(left, fx_sorted, on="date", direction="backward", tolerance=pd.Timedelta(days=10))
    rows = []
    for r in merged.itertuples(index=False):
        if pd.isna(r.fx):
            continue
        ref = r.date.date()
        available = min(at_utc(ref + timedelta(days=ECB_RELEASE_LAG_DAYS), 9), now)
        local_bn = float(r.value_meur) / 1000.0
        rows.append(
            {
                "component": "EZ",
                "observed_at": to_iso(ref),
                "value_local_bn": local_bn,
                "currency": "EUR",
                "fx_to_usd": float(r.fx),
                "value_usd_bn": local_bn * float(r.fx),
                "series_id": f"ECB:{ECB_SERIES}",
                "source": "ecb",
                "available_at": to_iso(available),
                "fetched_at": fetched_at,
            }
        )
    return rows


def build_composite_rows(conn: sqlite3.Connection, components: tuple[str, ...], fetched_at: str) -> list[dict]:
    """Ricostruisce l'aggregato point-in-time: per ogni istante in cui una componente
    pubblica un dato, somma l'ultimo valore GIÀ PUBBLICATO di ciascuna componente."""
    placeholders = ", ".join("?" for _ in components)
    frame = pd.read_sql_query(
        f"SELECT component, observed_at, value_usd_bn, available_at FROM m2_components"
        f" WHERE component IN ({placeholders}) AND value_usd_bn IS NOT NULL",
        conn,
        params=list(components),
    )
    if frame.empty or set(frame["component"]) != set(components):
        return []

    by_component = {c: g.sort_values("available_at") for c, g in frame.groupby("component")}
    rows = []
    for event in sorted(frame["available_at"].unique()):
        parts = {}
        for comp, g in by_component.items():
            known = g[g["available_at"] <= event]
            if known.empty:
                break
            latest = known.loc[known["observed_at"].idxmax()]
            parts[comp] = latest
        if len(parts) != len(components):
            continue
        newest_ref = max(to_utc(p["observed_at"]) for p in parts.values())
        if any(newest_ref - to_utc(p["observed_at"]) > MAX_COMPONENT_AGE for p in parts.values()):
            continue
        rows.append(
            {
                "observed_at": event,
                "value_usd_bn": float(sum(p["value_usd_bn"] for p in parts.values())),
                "reference_date": to_iso(newest_ref),
                "components": json.dumps(
                    {c: {"usd_bn": round(float(p["value_usd_bn"]), 3), "ref": p["observed_at"][:10]}
                     for c, p in sorted(parts.items())}
                ),
                "source": "composite:" + "+".join(sorted(components)),
                "available_at": event,
                "fetched_at": fetched_at,
            }
        )
    return rows
