"""Job orario: interroga le fonti e salva i nuovi valori se presenti.

Gira ogni ora al minuto 5 (CoinGecko aggiorna /global e i prezzi in pochi
minuti). I collector a bassa frequenza (M2, Fed Funds, ETF) vengono saltati
finché non è trascorso il loro intervallo minimo.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from btcmon.collectors import Context
from btcmon.config import Settings
from btcmon.db import connect, init_db
from btcmon.freshness import check_freshness
from btcmon.http import HttpClient
from btcmon.runner import build_collectors, run_collectors
from btcmon.timeutil import utcnow

log = logging.getLogger(__name__)


def hourly_job(settings: Settings) -> None:
    conn = connect(settings.db_path)
    try:
        init_db(conn)
        ctx = Context(settings, HttpClient(settings.user_agent, settings.http_timeout))
        run_collectors(conn, build_collectors(ctx))
        for status in check_freshness(conn, utcnow()):
            if not status.is_ok:
                log.warning("Dato %s: %s (ultimo: %s, soglia %s)", status.status.upper(),
                            status.param.label, status.last_observed_at or "mai", status.threshold)
    finally:
        conn.close()


def run_forever(settings: Settings, minute: int = 5) -> None:
    scheduler = BlockingScheduler(timezone="UTC")
    scheduler.add_job(
        hourly_job,
        CronTrigger(minute=minute, timezone="UTC"),
        args=[settings],
        id="hourly_collection",
        coalesce=True,
        max_instances=1,
        misfire_grace_time=15 * 60,
    )
    log.info("Scheduler avviato: raccolta ogni ora al minuto %02d UTC (Ctrl+C per uscire)", minute)
    hourly_job(settings)  # prima raccolta subito
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("Scheduler fermato")
