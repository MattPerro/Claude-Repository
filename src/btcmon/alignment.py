"""Allineamento di parametri a frequenza diversa su una griglia comune (oraria o
giornaliera) con forward-fill "point-in-time".

Per ogni istante t della griglia e per ogni parametro si prende l'ultimo valore
REALE con available_at <= t (cioè già pubblicato a t), e si riportano anche:
  <param>__observed_at  timestamp dell'ultimo dato reale usato
  <param>__age_hours    ore trascorse da quel dato reale
Nessun valore viene interpolato o inventato: tra due pubblicazioni il valore
resta costante, e prima della prima pubblicazione resta NaN.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable
from datetime import datetime

import pandas as pd

from btcmon.parameters import PARAMETERS, Parameter
from btcmon.timeutil import to_utc


def load_parameter(conn: sqlite3.Connection, param: Parameter) -> pd.DataFrame:
    frame = pd.read_sql_query(
        f"SELECT observed_at, available_at, {param.value_column} AS value FROM {param.table}",
        conn,
    )
    if frame.empty:
        return pd.DataFrame(
            {
                "observed_at": pd.Series(dtype="datetime64[ns, UTC]"),
                "available_at": pd.Series(dtype="datetime64[ns, UTC]"),
                "value": pd.Series(dtype=float),
            }
        )
    frame["observed_at"] = pd.to_datetime(frame["observed_at"], utc=True)
    frame["available_at"] = pd.to_datetime(frame["available_at"], utc=True)
    frame["value"] = frame["value"].astype(float)
    frame = frame.sort_values(["available_at", "observed_at"]).reset_index(drop=True)
    # Un dato riferito a un periodo PIÙ VECCHIO di uno già noto (es. una revisione
    # pubblicata dopo) non deve sostituire il dato più recente nel forward-fill.
    newest_so_far = frame["observed_at"].cummax()
    return frame[frame["observed_at"] >= newest_so_far].reset_index(drop=True)


def build_aligned_frame(
    conn: sqlite3.Connection,
    start: datetime | str,
    end: datetime | str,
    freq: str = "1h",
    params: Iterable[Parameter] = PARAMETERS,
) -> pd.DataFrame:
    """DataFrame indicizzato sulla griglia [start, end] con passo `freq` ('1h', '1D', ...)."""
    start_ts = pd.Timestamp(to_utc(start)).floor(freq)
    end_ts = pd.Timestamp(to_utc(end)).floor(freq)
    grid = pd.DataFrame({"ts": pd.date_range(start_ts, end_ts, freq=freq, tz="UTC")})
    out = grid.copy()
    for param in params:
        series = load_parameter(conn, param)
        if series.empty:
            out[param.key] = float("nan")
            out[f"{param.key}__observed_at"] = pd.Series(pd.NaT, index=out.index, dtype="datetime64[ns, UTC]")
            out[f"{param.key}__age_hours"] = float("nan")
            continue
        merged = pd.merge_asof(
            grid,
            series.rename(columns={"available_at": "ts_avail"}),
            left_on="ts",
            right_on="ts_avail",
            direction="backward",
        )
        # merge_asof conserva ordine e indice della griglia: assegnazione diretta
        out[param.key] = merged["value"]
        out[f"{param.key}__observed_at"] = merged["observed_at"]
        out[f"{param.key}__age_hours"] = (merged["ts"] - merged["observed_at"]).dt.total_seconds() / 3600.0
    return out.set_index("ts")
