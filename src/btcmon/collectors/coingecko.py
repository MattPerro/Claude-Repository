"""CoinGecko: prezzo BTC, rapporto BTC/oro, Bitcoin Dominance.

Limiti verificati (ottobre 2026):
- pool pubblico senza chiave: ~5-30 chiamate/min per IP, non garantito;
- piano Demo gratuito (chiave): 100 chiamate/min, 10.000 crediti/mese;
- storico /market_chart limitato agli ultimi 365 giorni sui piani gratuiti,
  con granularità automatica: 2-90 giorni -> oraria, >90 giorni -> giornaliera;
- lo storico della dominance (/global/market_cap_chart) è solo a pagamento:
  la dominance si accumula quindi a partire dalla prima raccolta.

Il rapporto BTC/oro è il prezzo di 1 BTC in once d'oro (vs_currency 'xau').
Se 'xau' non è disponibile si ripiega su PAX Gold (token 1:1 con un'oncia).
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

import pandas as pd

from btcmon.collectors.base import Collector
from btcmon.db import UpsertResult, upsert
from btcmon.http import HttpError
from btcmon.timeutil import to_iso

BASE_URL = "https://api.coingecko.com/api/v3"


class _CoinGeckoMixin:
    def _get(self, path: str, params: dict | None = None):
        headers = {}
        if self.settings.coingecko_demo_api_key:
            headers["x-cg-demo-api-key"] = self.settings.coingecko_demo_api_key
        return self.http.get_json(f"{BASE_URL}{path}", params=params, headers=headers)


def parse_simple_price(payload: dict, fetched_at: str) -> tuple[list[dict], list[dict]]:
    """Da /simple/price -> (righe btc_price, righe btc_gold_ratio)."""
    btc = payload.get("bitcoin") or {}
    if "usd" not in btc or "last_updated_at" not in btc:
        raise HttpError(f"Risposta /simple/price inattesa: {payload!r:.200}")
    observed_at = to_iso(int(btc["last_updated_at"]))
    price_usd = float(btc["usd"])
    price_rows = [
        {
            "observed_at": observed_at,
            "price_usd": price_usd,
            "market_cap_usd": _opt_float(btc.get("usd_market_cap")),
            "volume_24h_usd": _opt_float(btc.get("usd_24h_vol")),
            "source": "coingecko",
            "available_at": observed_at,
            "fetched_at": fetched_at,
        }
    ]

    ratio_rows = []
    paxg_usd = _opt_float((payload.get("pax-gold") or {}).get("usd"))
    if btc.get("xau"):
        ratio = float(btc["xau"])
        ratio_rows.append(_ratio_row(observed_at, ratio, price_usd, price_usd / ratio, "coingecko_xau", fetched_at))
    elif paxg_usd:
        ratio_rows.append(
            _ratio_row(observed_at, price_usd / paxg_usd, price_usd, paxg_usd, "coingecko_paxg", fetched_at)
        )
    return price_rows, ratio_rows


def parse_global(payload: dict, fetched_at: str) -> list[dict]:
    data = payload.get("data") or {}
    try:
        dominance = float(data["market_cap_percentage"]["btc"])
        observed_at = to_iso(int(data["updated_at"]))
    except (KeyError, TypeError, ValueError) as exc:
        raise HttpError(f"Risposta /global inattesa: {payload!r:.200}") from exc
    return [
        {
            "observed_at": observed_at,
            "dominance_pct": dominance,
            "total_market_cap_usd": _opt_float((data.get("total_market_cap") or {}).get("usd")),
            "source": "coingecko",
            "available_at": observed_at,
            "fetched_at": fetched_at,
        }
    ]


def parse_market_chart(usd: dict, xau: dict | None, fetched_at: str) -> tuple[list[dict], list[dict]]:
    """Da /coins/bitcoin/market_chart (usd e xau) -> (righe btc_price, righe btc_gold_ratio)."""
    prices = _series(usd.get("prices"), "price_usd")
    if prices.empty:
        return [], []
    caps = _series(usd.get("market_caps"), "market_cap_usd")
    vols = _series(usd.get("total_volumes"), "volume_24h_usd")
    frame = prices.join(caps, how="left").join(vols, how="left").reset_index()

    price_rows = [
        {
            "observed_at": to_iso(r.ts.to_pydatetime()),
            "price_usd": float(r.price_usd),
            "market_cap_usd": _opt_float(r.market_cap_usd),
            "volume_24h_usd": _opt_float(r.volume_24h_usd),
            "source": "coingecko_history",
            "available_at": to_iso(r.ts.to_pydatetime()),
            "fetched_at": fetched_at,
        }
        for r in frame.itertuples(index=False)
    ]

    ratio_rows: list[dict] = []
    if xau:
        ratios = _series(xau.get("prices"), "ratio").reset_index()
        if not ratios.empty:
            # Le serie usd e xau possono avere timestamp leggermente diversi: abbino
            # ogni punto xau al punto usd più vicino entro 10 minuti.
            matched = pd.merge_asof(
                ratios.sort_values("ts"),
                prices.reset_index().sort_values("ts"),
                on="ts",
                direction="nearest",
                tolerance=pd.Timedelta(minutes=10),
            ).dropna(subset=["price_usd", "ratio"])
            for r in matched.itertuples(index=False):
                ts = to_iso(r.ts.to_pydatetime())
                ratio_rows.append(
                    _ratio_row(ts, float(r.ratio), float(r.price_usd), float(r.price_usd) / float(r.ratio),
                               "coingecko_history_xau", fetched_at)
                )
    return price_rows, ratio_rows


class CoinGeckoPriceCollector(_CoinGeckoMixin, Collector):
    """Prezzo BTC/USD e rapporto BTC/oro con una sola chiamata a /simple/price."""

    name = "coingecko_price"
    tables = ("btc_price", "btc_gold_ratio")
    min_interval = timedelta(minutes=50)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        payload = self._get(
            "/simple/price",
            {
                "ids": "bitcoin,pax-gold",
                "vs_currencies": "usd,xau",
                "include_market_cap": "true",
                "include_24hr_vol": "true",
                "include_last_updated_at": "true",
                "precision": "full",
            },
        )
        price_rows, ratio_rows = parse_simple_price(payload, to_iso(now))
        result = upsert(conn, "btc_price", price_rows)
        result += upsert(conn, "btc_gold_ratio", ratio_rows)
        return result

    def backfill(self, conn: sqlite3.Connection, now: datetime, days: int) -> UpsertResult:
        result = UpsertResult()
        fetched_at = to_iso(now)
        # Prima lo storico giornaliero (fino a 365 gg), poi l'orario degli ultimi 90 gg.
        windows = []
        if days > 90:
            windows.append(min(days, 365))
        windows.append(min(days, 90))
        for window in windows:
            usd = self._get("/coins/bitcoin/market_chart", {"vs_currency": "usd", "days": window})
            try:
                xau = self._get("/coins/bitcoin/market_chart", {"vs_currency": "xau", "days": window})
            except HttpError:
                xau = None
            price_rows, ratio_rows = parse_market_chart(usd, xau, fetched_at)
            result += upsert(conn, "btc_price", price_rows)
            result += upsert(conn, "btc_gold_ratio", ratio_rows)
        result += self.collect(conn, now)
        return result


class CoinGeckoGlobalCollector(_CoinGeckoMixin, Collector):
    """Bitcoin Dominance da /global (nessuno storico gratuito)."""

    name = "coingecko_global"
    tables = ("btc_dominance",)
    min_interval = timedelta(minutes=50)

    def collect(self, conn: sqlite3.Connection, now: datetime) -> UpsertResult:
        payload = self._get("/global")
        return upsert(conn, "btc_dominance", parse_global(payload, to_iso(now)))


def _ratio_row(observed_at, ratio, btc_usd, gold_usd, source, fetched_at) -> dict:
    return {
        "observed_at": observed_at,
        "ratio": ratio,
        "btc_usd": btc_usd,
        "gold_usd": gold_usd,
        "source": source,
        "available_at": observed_at,
        "fetched_at": fetched_at,
    }


def _series(points, column: str) -> pd.DataFrame:
    if not points:
        return pd.DataFrame(columns=[column], index=pd.DatetimeIndex([], tz="UTC", name="ts"))
    frame = pd.DataFrame(points, columns=["ts", column])
    frame["ts"] = pd.to_datetime(frame["ts"], unit="ms", utc=True).dt.floor("s")
    frame = frame.dropna().drop_duplicates("ts", keep="last").set_index("ts").sort_index()
    return frame


def _opt_float(value) -> float | None:
    if value is None:
        return None
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(result) else result
