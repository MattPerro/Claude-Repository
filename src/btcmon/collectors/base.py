"""Interfaccia comune dei collector."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

from btcmon.config import Settings
from btcmon.db import UpsertResult
from btcmon.http import HttpClient


class CollectorUnavailable(RuntimeError):
    """Il collector non può girare (es. manca la chiave API). Non è un errore della fonte."""


class PartialFailure(RuntimeError):
    """Parte dei dati è stata salvata, parte no (es. una componente M2 non risponde)."""

    def __init__(self, message: str, result: UpsertResult):
        super().__init__(message)
        self.result = result


@dataclass
class Context:
    settings: Settings
    http: HttpClient


class Collector:
    #: nome univoco, usato in collection_runs e nella CLI
    name: str = ""
    #: tabelle scritte dal collector
    tables: tuple[str, ...] = ()
    #: intervallo minimo tra due interrogazioni della fonte. Lo scheduler gira
    #: ogni ora ma salta i collector interrogati da meno di questo intervallo
    #: (inutile chiedere M2 ogni ora: esce una volta a settimana).
    min_interval: timedelta = timedelta(minutes=50)

    def __init__(self, ctx: Context):
        self.ctx = ctx

    @property
    def http(self) -> HttpClient:
        return self.ctx.http

    @property
    def settings(self) -> Settings:
        return self.ctx.settings

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        """Scarica i valori più recenti e li salva. Restituisce righe nuove/aggiornate."""
        raise NotImplementedError

    def backfill(self, conn: sqlite3.Connection, now: datetime, days: int) -> UpsertResult:
        """Scarica lo storico disponibile gratuitamente (default: come collect)."""
        return self.collect(conn, now)
