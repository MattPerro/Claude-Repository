"""Configurazione da variabili d'ambiente (e file .env se presente)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name, default)
    if value is None:
        return None
    value = value.strip()
    return value or default


@dataclass(frozen=True)
class Settings:
    db_path: Path = Path("data/btcmon.sqlite")
    log_path: Path = Path("data/btcmon.log")
    fred_api_key: str | None = None
    coingecko_demo_api_key: str | None = None
    sosovalue_api_key: str | None = None
    m2_components: tuple[str, ...] = ("US", "EZ")
    kalshi_base_urls: tuple[str, ...] = (
        "https://external-api.kalshi.com/trade-api/v2",
        "https://api.elections.kalshi.com/trade-api/v2",
    )
    sosovalue_base_url: str = "https://openapi.sosovalue.com/openapi/v1"
    http_timeout: float = 20.0
    user_agent: str = field(default="btcmon/0.1 (personal research tool)")

    @classmethod
    def from_env(cls, env_file: str | Path | None = ".env") -> "Settings":
        if env_file and Path(env_file).exists():
            load_dotenv(env_file, override=False)
        db_path = Path(_env("BTCMON_DB_PATH", "data/btcmon.sqlite"))
        components = tuple(
            c.strip().upper() for c in (_env("BTCMON_M2_COMPONENTS", "US,EZ") or "").split(",") if c.strip()
        )
        kalshi = _env("KALSHI_BASE_URL")
        return cls(
            db_path=db_path,
            log_path=Path(_env("BTCMON_LOG_PATH", str(db_path.with_suffix(".log")))),
            fred_api_key=_env("FRED_API_KEY"),
            coingecko_demo_api_key=_env("COINGECKO_DEMO_API_KEY"),
            sosovalue_api_key=_env("SOSOVALUE_API_KEY"),
            m2_components=components or ("US",),
            kalshi_base_urls=(kalshi,) if kalshi else cls.kalshi_base_urls,
            sosovalue_base_url=_env("SOSOVALUE_BASE_URL", cls.sosovalue_base_url),
        )
