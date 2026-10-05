"""Esecuzione dei collector con registrazione in collection_runs.
Un collector che fallisce non blocca gli altri."""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime

from btcmon.collectors import ALL_COLLECTORS, Collector, CollectorUnavailable, Context, PartialFailure
from btcmon.db import UpsertResult, last_successful_run, log_run
from btcmon.timeutil import to_iso, to_utc, utcnow

log = logging.getLogger(__name__)


@dataclass
class RunOutcome:
    collector: str
    status: str  # 'ok' | 'no_new_data' | 'error' | 'unavailable' | 'skipped'
    result: UpsertResult
    message: str | None = None


def build_collectors(ctx: Context, only: Iterable[str] | None = None) -> list[Collector]:
    wanted = set(only) if only else None
    collectors = [cls(ctx) for cls in ALL_COLLECTORS if wanted is None or cls.name in wanted]
    if wanted:
        unknown = wanted - {c.name for c in collectors}
        if unknown:
            raise ValueError(f"Collector sconosciuti: {', '.join(sorted(unknown))}")
    return collectors


def run_collectors(
    conn: sqlite3.Connection,
    collectors: Iterable[Collector],
    now: datetime | None = None,
    force: bool = False,
    backfill_days: int | None = None,
) -> list[RunOutcome]:
    outcomes = []
    for collector in collectors:
        run_now = now or utcnow()
        if not force and backfill_days is None and _ran_recently(conn, collector, run_now):
            outcomes.append(RunOutcome(collector.name, "skipped", UpsertResult(), "interrogato di recente"))
            continue
        outcomes.append(_run_one(conn, collector, run_now, backfill_days))
    return outcomes


def _ran_recently(conn, collector: Collector, now: datetime) -> bool:
    last = last_successful_run(conn, collector.name)
    return last is not None and now - to_utc(last) < collector.min_interval


def _run_one(conn, collector: Collector, now: datetime, backfill_days: int | None) -> RunOutcome:
    started = to_iso(now)
    result, message = UpsertResult(), None
    try:
        if backfill_days is not None:
            result = collector.backfill(conn, now, backfill_days)
        else:
            result = collector.collect(conn, now)
        status = "ok" if (result.inserted or result.updated) else "no_new_data"
    except CollectorUnavailable as exc:
        status, message = "unavailable", str(exc)
    except PartialFailure as exc:
        status, message, result = "error", f"parziale: {exc}", exc.result
    except Exception as exc:  # noqa: BLE001 - un collector rotto non deve fermare gli altri
        status, message = "error", f"{type(exc).__name__}: {exc}"
        log.debug("Errore nel collector %s", collector.name, exc_info=True)
    log_run(conn, collector.name, started, to_iso(utcnow()), status, result, message)
    level = logging.WARNING if status in ("error", "unavailable") else logging.INFO
    log.log(level, "%-17s %-12s +%d nuove, %d aggiornate %s", collector.name, status,
            result.inserted, result.updated, f"- {message}" if message else "")
    return RunOutcome(collector.name, status, result, message)
