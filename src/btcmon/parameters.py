"""Registro dei parametri del modello: dove stanno, che unità hanno e dopo quanto
tempo senza aggiornamenti vanno considerati "vecchi" (avviso in dashboard)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class Parameter:
    key: str
    label: str
    table: str
    value_column: str
    unit: str
    frequency: str
    #: soglia di vecchiaia in ore di calendario (dati infragiornalieri / mensili)...
    max_age: timedelta | None = None
    #: ...oppure in giorni lavorativi tra il giorno del dato e oggi (dati legati
    #: ai giorni di borsa USA, così il weekend non genera falsi allarmi)
    max_business_days: int | None = None
    is_target: bool = False


PARAMETERS: tuple[Parameter, ...] = (
    Parameter(
        "btc_price", "Prezzo Bitcoin", "btc_price", "price_usd", "USD",
        "oraria (fonte: minuti)", max_age=timedelta(hours=3), is_target=True,
    ),
    Parameter(
        "m2_global", "Liquidità M2 aggregata", "m2_global", "value_usd_bn", "mld USD",
        "settimanale (US) / mensile (EZ)", max_age=timedelta(days=45),
    ),
    Parameter(
        "etf_flows", "Flussi netti ETF spot BTC USA", "etf_flows", "net_inflow_usd", "USD",
        "giornaliera (giorni di borsa)", max_business_days=3,
    ),
    Parameter(
        "btc_gold_ratio", "Rapporto BTC/Oro", "btc_gold_ratio", "ratio", "once per BTC",
        "oraria", max_age=timedelta(hours=3),
    ),
    Parameter(
        "btc_dominance", "Bitcoin Dominance", "btc_dominance", "dominance_pct", "%",
        "oraria", max_age=timedelta(hours=3),
    ),
    Parameter(
        "fed_funds_rate", "Fed Funds effettivo", "fed_funds_rate", "effective_rate", "%",
        "giornaliera (giorni lavorativi)", max_business_days=3,
    ),
    Parameter(
        "fed_expectations", "Variazione attesa prossimo FOMC", "fed_expectations",
        "expected_change_bps", "bp", "oraria (mercati Kalshi)", max_age=timedelta(hours=3),
    ),
)

BY_KEY = {p.key: p for p in PARAMETERS}
