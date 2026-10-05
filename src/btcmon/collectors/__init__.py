"""Registro dei collector disponibili."""

from btcmon.collectors.base import Collector, CollectorUnavailable, Context, PartialFailure
from btcmon.collectors.coingecko import CoinGeckoGlobalCollector, CoinGeckoPriceCollector
from btcmon.collectors.fred import FedFundsCollector
from btcmon.collectors.kalshi import KalshiFedCollector
from btcmon.collectors.m2 import M2GlobalCollector
from btcmon.collectors.sosovalue import SoSoValueEtfCollector

ALL_COLLECTORS: tuple[type[Collector], ...] = (
    CoinGeckoPriceCollector,
    CoinGeckoGlobalCollector,
    M2GlobalCollector,
    SoSoValueEtfCollector,
    FedFundsCollector,
    KalshiFedCollector,
)

__all__ = [
    "ALL_COLLECTORS",
    "Collector",
    "CollectorUnavailable",
    "Context",
    "PartialFailure",
]
