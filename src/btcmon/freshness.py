"""Controllo di "freschezza": segnala i parametri che non si aggiornano da troppo
tempo (es. fonte ETF senza chiave, Kalshi irraggiungibile)."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

from btcmon.parameters import PARAMETERS, Parameter
from btcmon.timeutil import business_days_between, to_utc


@dataclass
class FreshnessStatus:
    param: Parameter
    status: str  # 'ok' | 'stale' | 'missing'
    last_observed_at: str | None
    last_value: float | None
    last_source: str | None
    age_hours: float | None
    threshold: str

    @property
    def is_ok(self) -> bool:
        return self.status == "ok"


def check_freshness(conn: sqlite3.Connection, now: datetime) -> list[FreshnessStatus]:
    return [_check(conn, p, now) for p in PARAMETERS]


def _check(conn: sqlite3.Connection, param: Parameter, now: datetime) -> FreshnessStatus:
    if param.max_business_days is not None:
        threshold = f"{param.max_business_days} gg lavorativi"
    elif param.max_age >= timedelta(days=2):
        threshold = f"{param.max_age.days} gg"
    else:
        threshold = f"{param.max_age.total_seconds() / 3600:g} h"
    row = conn.execute(
        f"SELECT observed_at, {param.value_column} AS value, source FROM {param.table}"
        " ORDER BY observed_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return FreshnessStatus(param, "missing", None, None, None, None, threshold)

    observed = to_utc(row["observed_at"])
    age_hours = (now - observed).total_seconds() / 3600.0
    if param.max_business_days is not None:
        # Giorni lavorativi in [giorno del dato, oggi). In condizioni normali è <= 2
        # (il dato di ieri esce stamattina; il lunedì l'ultimo è venerdì);
        # una festività USA aggiunge 1.
        stale = business_days_between(observed.date(), now.date()) > param.max_business_days
    else:
        stale = now - observed > param.max_age
    return FreshnessStatus(
        param,
        "stale" if stale else "ok",
        row["observed_at"],
        row["value"],
        row["source"],
        age_hours,
        threshold,
    )
