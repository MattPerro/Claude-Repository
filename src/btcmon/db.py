"""Accesso al database SQLite: creazione schema e upsert idempotente."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

# Colonne che non contano come "variazione del dato" in un upsert.
_META_COLUMNS = {"fetched_at", "available_at"}


@dataclass
class UpsertResult:
    inserted: int = 0
    updated: int = 0

    def __iadd__(self, other: "UpsertResult") -> "UpsertResult":
        self.inserted += other.inserted
        self.updated += other.updated
        return self


def connect(path: str | Path) -> sqlite3.Connection:
    path = Path(path)
    if str(path) != ":memory:":
        path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    schema = resources.files("btcmon").joinpath("schema.sql").read_text(encoding="utf-8")
    conn.executescript(schema)
    conn.commit()


def upsert(
    conn: sqlite3.Connection,
    table: str,
    rows: Iterable[Mapping[str, object]],
    key: Sequence[str] = ("observed_at",),
) -> UpsertResult:
    """Inserisce le righe nuove; aggiorna quelle esistenti solo se un valore è cambiato
    (es. revisione di M2). In aggiornamento `available_at` resta quello originale:
    il dato era pubblico da allora, anche se poi è stato rivisto."""
    rows = list(rows)
    result = UpsertResult()
    if not rows:
        return result

    columns = list(rows[0].keys())
    value_cols = [c for c in columns if c not in key and c not in _META_COLUMNS]
    update_cols = value_cols + (["fetched_at"] if "fetched_at" in columns else [])
    placeholders = ", ".join("?" for _ in columns)
    changed = " OR ".join(f"{table}.{c} IS NOT excluded.{c}" for c in value_cols) or "0"
    sql = (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({placeholders}) "
        f"ON CONFLICT ({', '.join(key)}) DO UPDATE SET "
        + ", ".join(f"{c} = excluded.{c}" for c in update_cols)
        + f" WHERE {changed}"
    )

    existing = _existing_keys(conn, table, key, rows)
    with conn:
        for row in rows:
            cursor = conn.execute(sql, [row[c] for c in columns])
            if cursor.rowcount:
                if tuple(row[k] for k in key) in existing:
                    result.updated += 1
                else:
                    result.inserted += 1
    return result


def _existing_keys(conn, table, key, rows) -> set[tuple]:
    if len(key) == 1:
        found: set[tuple] = set()
        values = list({row[key[0]] for row in rows})
        for i in range(0, len(values), 500):
            chunk = values[i : i + 500]
            q = f"SELECT {key[0]} FROM {table} WHERE {key[0]} IN ({', '.join('?' for _ in chunk)})"
            found.update((r[0],) for r in conn.execute(q, chunk))
        return found
    q = f"SELECT {', '.join(key)} FROM {table}"
    return {tuple(r) for r in conn.execute(q)}


def latest_row(conn: sqlite3.Connection, table: str, order_col: str = "observed_at"):
    return conn.execute(f"SELECT * FROM {table} ORDER BY {order_col} DESC LIMIT 1").fetchone()


def log_run(
    conn: sqlite3.Connection,
    collector: str,
    started_at: str,
    finished_at: str,
    status: str,
    result: UpsertResult | None = None,
    message: str | None = None,
) -> None:
    result = result or UpsertResult()
    with conn:
        conn.execute(
            "INSERT INTO collection_runs (collector, started_at, finished_at, status,"
            " rows_inserted, rows_updated, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (collector, started_at, finished_at, status, result.inserted, result.updated, message),
        )


def last_successful_run(conn: sqlite3.Connection, collector: str) -> str | None:
    row = conn.execute(
        "SELECT MAX(started_at) FROM collection_runs"
        " WHERE collector = ? AND status IN ('ok', 'no_new_data')",
        (collector,),
    ).fetchone()
    return row[0] if row else None
