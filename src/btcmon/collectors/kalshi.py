"""Probabilità implicite della prossima decisione FOMC dai mercati Kalshi.

CME FedWatch non ha un'API pubblica gratuita. Kalshi (exchange regolato CFTC)
espone i dati di mercato senza autenticazione; la serie KXFEDDECISION ha un
evento per riunione FOMC con esiti mutuamente esclusivi (taglio >25bp,
taglio 25bp, invariato, rialzo 25bp, rialzo >25bp). Il prezzo di un contratto
"sì" (0-1 $) si legge come probabilità.

Nota: il contesto di ottobre 2026 prezza anche rialzi, per questo si salvano
prob_cut / prob_hold / prob_hike e la variazione attesa in bp, non solo la
probabilità di taglio.
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta

from btcmon.collectors.base import Collector
from btcmon.db import UpsertResult, upsert
from btcmon.http import HttpError
from btcmon.timeutil import to_iso, to_utc

SERIES_TICKER = "KXFEDDECISION"
MAX_SPREAD = 0.10  # oltre questo spread bid/ask uso l'ultimo prezzo scambiato

_HOLD_RE = re.compile(r"maintain|hold|no change|unchanged|pause")
_MOVE_RE = re.compile(r"(cut|lower|decrease|hike|raise|increase)\D{0,12}?(>|more than|over|at least)?\s*(\d+)\s*(?:bps|bp|basis)")
_TICKER_RE = re.compile(r"-(C|H)(\d+)$")


def outcome_bps(market: dict) -> int | None:
    """Variazione del tasso (bp) dell'esito di un mercato; '>25bp' viene codificato come 50."""
    # Campi in ordine di specificità: il sottotitolo descrive l'esito, il titolo
    # a volte descrive l'evento intero e non va guardato per primo.
    for key in ("yes_sub_title", "subtitle", "title"):
        text = str(market.get(key) or "").lower()
        move = _MOVE_RE.search(text)
        if move:
            sign = -1 if move.group(1) in ("cut", "lower", "decrease") else 1
            size = int(move.group(3)) + (25 if move.group(2) else 0)
            return sign * size
        if _HOLD_RE.search(text):
            return 0
    # Ripiego sul suffisso del ticker, es. ...-C25 (taglio 25), -C26 (>25), -H0 (invariato)
    tick = _TICKER_RE.search(str(market.get("ticker") or ""))
    if tick:
        size = int(tick.group(2))
        size = 50 if size == 26 else size
        if size == 0:
            return 0
        return -size if tick.group(1) == "C" else size
    return None


def market_probability(market: dict) -> float | None:
    bid = _price(market, "yes_bid")
    ask = _price(market, "yes_ask")
    last = _price(market, "last_price")
    if bid is not None and ask is not None and ask > 0 and ask - bid <= MAX_SPREAD:
        return (bid + ask) / 2
    if last is not None and last > 0:
        return last
    if bid is not None and ask is not None and ask > 0:
        return (bid + ask) / 2
    return None


def build_expectation_row(markets: list[dict], now: datetime) -> dict | None:
    """Sceglie l'evento FOMC aperto più vicino e ne aggrega le probabilità."""
    events: dict[str, list[dict]] = defaultdict(list)
    for m in markets:
        if m.get("event_ticker") and m.get("close_time"):
            events[m["event_ticker"]].append(m)
    upcoming = []
    for ticker, ms in events.items():
        close = min(to_utc(m["close_time"]) for m in ms)
        if close > now:
            upcoming.append((close, ticker))
    if not upcoming:
        return None
    meeting_close, event_ticker = min(upcoming)

    probs: dict[int, float] = defaultdict(float)
    for m in events[event_ticker]:
        bps, p = outcome_bps(m), market_probability(m)
        if bps is not None and p is not None:
            probs[bps] += p
    total = sum(probs.values())
    if total <= 0:
        return None
    probs = {k: v / total for k, v in sorted(probs.items())}  # normalizza l'overround
    observed_at = to_iso(now)
    return {
        "observed_at": observed_at,
        "meeting_date": meeting_close.date().isoformat(),
        "event_ticker": event_ticker,
        "prob_cut": sum(p for k, p in probs.items() if k < 0),
        "prob_hold": probs.get(0, 0.0),
        "prob_hike": sum(p for k, p in probs.items() if k > 0),
        "expected_change_bps": sum(k * p for k, p in probs.items()),
        "outcomes": json.dumps({str(k): round(p, 4) for k, p in probs.items()}),
        "source": "kalshi",
        "available_at": observed_at,
        "fetched_at": observed_at,
    }


class KalshiFedCollector(Collector):
    name = "kalshi_fed"
    tables = ("fed_expectations",)
    min_interval = timedelta(minutes=50)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        markets = self._open_markets()
        row = build_expectation_row(markets, now)
        if row is None:
            raise HttpError(f"Kalshi: nessun evento {SERIES_TICKER} aperto con prezzi utilizzabili")
        return upsert(conn, "fed_expectations", [row])

    def _open_markets(self) -> list[dict]:
        errors = []
        for base in self.settings.kalshi_base_urls:
            try:
                markets, cursor = [], None
                for _ in range(10):  # paginazione
                    params = {"series_ticker": SERIES_TICKER, "status": "open", "limit": 1000}
                    if cursor:
                        params["cursor"] = cursor
                    payload = self.http.get_json(f"{base}/markets", params=params)
                    markets += payload.get("markets") or []
                    cursor = payload.get("cursor")
                    if not cursor:
                        break
                return markets
            except HttpError as exc:
                errors.append(str(exc))
        raise HttpError(" | ".join(errors))


def _price(market: dict, field: str) -> float | None:
    """Prezzo in dollari (0-1). Preferisce i campi *_dollars (stringhe), poi i
    vecchi campi interi in centesimi."""
    dollars = market.get(f"{field}_dollars")
    if dollars not in (None, ""):
        try:
            return float(dollars)
        except (TypeError, ValueError):
            pass
    cents = market.get(field)
    if cents in (None, ""):
        return None
    try:
        return float(cents) / 100.0
    except (TypeError, ValueError):
        return None
