"""Inserimento manuale e import CSV: il fallback per le fonti senza API gratuita
stabile (flussi ETF, probabilità FedWatch)."""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import date, datetime
from pathlib import Path

import pandas as pd

from btcmon.collectors.sosovalue import etf_flow_available_at
from btcmon.db import UpsertResult, upsert
from btcmon.timeutil import to_iso


def add_etf_flow(
    conn: sqlite3.Connection,
    day: date,
    net_inflow_usd: float,
    now: datetime,
    total_net_assets_usd: float | None = None,
) -> UpsertResult:
    row = {
        "observed_at": to_iso(day),
        "net_inflow_usd": float(net_inflow_usd),
        "total_net_assets_usd": total_net_assets_usd,
        "cum_net_inflow_usd": None,
        "value_traded_usd": None,
        "source": "manual",
        "available_at": to_iso(min(etf_flow_available_at(day), now)),
        "fetched_at": to_iso(now),
    }
    return upsert(conn, "etf_flows", [row])


def add_fed_expectation(
    conn: sqlite3.Connection,
    meeting_date: date,
    prob_cut: float,
    prob_hold: float,
    prob_hike: float,
    now: datetime,
    cut_size_bps: int = 25,
    hike_size_bps: int = 25,
) -> UpsertResult:
    """Probabilità lette a mano (es. da CME FedWatch). Vengono normalizzate a somma 1."""
    total = prob_cut + prob_hold + prob_hike
    if total <= 0:
        raise ValueError("Le probabilità devono avere somma positiva")
    cut, hold, hike = prob_cut / total, prob_hold / total, prob_hike / total
    observed_at = to_iso(now)
    row = {
        "observed_at": observed_at,
        "meeting_date": meeting_date.isoformat(),
        "event_ticker": None,
        "prob_cut": cut,
        "prob_hold": hold,
        "prob_hike": hike,
        "expected_change_bps": -cut_size_bps * cut + hike_size_bps * hike,
        "outcomes": json.dumps({str(-cut_size_bps): round(cut, 4), "0": round(hold, 4), str(hike_size_bps): round(hike, 4)}),
        "source": "manual",
        "available_at": observed_at,
        "fetched_at": observed_at,
    }
    return upsert(conn, "fed_expectations", [row])


def import_etf_flows_csv(
    conn: sqlite3.Connection,
    path: str | Path,
    now: datetime,
    date_col: str | None = None,
    value_col: str | None = None,
    unit: str | None = None,
) -> UpsertResult:
    """Importa lo storico dei flussi ETF da CSV.

    Formati riconosciuti automaticamente:
    - btcmon:  colonne `date`, `net_inflow_usd` (USD)
    - Farside: colonne `Date`, ..., `Total` in milioni di USD, negativi tra parentesi,
      date tipo '11 Jan 2024'; righe non-data (Total, Average, ...) ignorate.
    """
    frame = pd.read_csv(path, dtype=str)
    columns = {c.lower().strip(): c for c in frame.columns}
    date_col = date_col or columns.get("date") or frame.columns[0]
    if value_col is None:
        if "net_inflow_usd" in columns:
            value_col, unit = columns["net_inflow_usd"], unit or "usd"
        elif "total" in columns:
            value_col, unit = columns["total"], unit or "musd"
        else:
            raise ValueError("Colonna valori non trovata: usa --value-col")
    multiplier = {"usd": 1.0, "musd": 1e6}[unit or "usd"]

    source = f"csv:{Path(path).name}"
    fetched_at = to_iso(now)
    rows = []
    for raw_date, raw_value in zip(frame[date_col], frame[value_col]):
        day = _parse_date(raw_date)
        value = _parse_number(raw_value)
        if day is None or value is None:
            continue
        rows.append(
            {
                "observed_at": to_iso(day),
                "net_inflow_usd": value * multiplier,
                "total_net_assets_usd": None,
                "cum_net_inflow_usd": None,
                "value_traded_usd": None,
                "source": source,
                "available_at": to_iso(min(etf_flow_available_at(day), now)),
                "fetched_at": fetched_at,
            }
        )
    return upsert(conn, "etf_flows", rows)


def _parse_date(raw) -> date | None:
    if raw is None or pd.isna(raw):
        return None
    text = str(raw).strip()
    if not re.search(r"\d", text):
        return None
    try:
        parsed = pd.to_datetime(text, dayfirst=not re.match(r"^\d{4}-", text))
    except (ValueError, TypeError):
        return None
    return parsed.date()


def _parse_number(raw) -> float | None:
    if raw is None or pd.isna(raw):
        return None
    text = str(raw).strip().replace(",", "").replace("$", "")
    if text in ("", "-", "—"):
        return None
    negative = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    try:
        value = float(text)
    except ValueError:
        return None
    return -value if negative else value
