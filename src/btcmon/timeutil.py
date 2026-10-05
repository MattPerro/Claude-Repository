"""Helper per timestamp UTC. Nel database tutti gli istanti sono stringhe ISO 8601
UTC nel formato 'YYYY-MM-DDTHH:MM:SSZ', che si ordinano correttamente anche come testo."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import numpy as np

ISO_FMT = "%Y-%m-%dT%H:%M:%SZ"


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def to_utc(value: datetime | date | str | int | float) -> datetime:
    """Converte in datetime UTC: datetime, date (mezzanotte UTC), stringa ISO o epoch in secondi."""
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).replace(microsecond=0)
    if isinstance(value, date):
        return datetime.combine(value, time(0, 0), tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        # Accetta anche epoch in millisecondi (CoinGecko market_chart)
        seconds = value / 1000 if value > 1e11 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc).replace(microsecond=0)
    if isinstance(value, str):
        text = value.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        if len(text) == 10:  # solo data
            return to_utc(date.fromisoformat(text))
        return to_utc(datetime.fromisoformat(text))
    raise TypeError(f"Tipo timestamp non supportato: {type(value)!r}")


def to_iso(value: datetime | date | str | int | float) -> str:
    return to_utc(value).strftime(ISO_FMT)


def next_business_day(d: date, offset: int = 1) -> date:
    """Giorno lavorativo (lun-ven) successivo; le festività USA non sono considerate."""
    return np.busday_offset(np.datetime64(d, "D"), offset, roll="forward").astype(date)


def business_days_between(start: date, end: date) -> int:
    """Numero di giorni lavorativi in [start, end)."""
    return int(np.busday_count(np.datetime64(start, "D"), np.datetime64(end, "D")))


def at_utc(d: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(d, time(hour, minute), tzinfo=timezone.utc)


def days_ago(days: float, now: datetime | None = None) -> datetime:
    return (now or utcnow()) - timedelta(days=days)
