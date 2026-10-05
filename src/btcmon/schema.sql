-- Schema SQLite di btcmon.
--
-- Una tabella per parametro. Ogni tabella contiene SOLO valori reali pubblicati
-- dalla fonte (nessun valore sintetico orario). Il forward-fill avviene in
-- lettura (btcmon.alignment), non in scrittura.
--
-- Colonne temporali comuni (tutte ISO 8601 UTC, formato 'YYYY-MM-DDTHH:MM:SSZ'):
--   observed_at   istante/periodo a cui si riferisce il dato (es. settimana M2,
--                 giorno di borsa per i flussi ETF, last_updated_at di CoinGecko)
--   available_at  istante in cui il dato è diventato pubblico (data di
--                 pubblicazione reale o stimata). È la colonna usata per il
--                 forward-fill, così il modello non "vede" dati futuri.
--   fetched_at    istante in cui btcmon ha scaricato o aggiornato la riga
--   source        fonte del dato (es. 'coingecko', 'fred_api', 'manual')

PRAGMA journal_mode = WAL;

-- 1. Prezzo Bitcoin (variabile target)
CREATE TABLE IF NOT EXISTS btc_price (
    observed_at     TEXT PRIMARY KEY,
    price_usd       REAL NOT NULL,
    market_cap_usd  REAL,
    volume_24h_usd  REAL,
    source          TEXT NOT NULL,
    available_at    TEXT NOT NULL,
    fetched_at      TEXT NOT NULL
);

-- 2. Liquidità M2 aggregata in USD (miliardi), "point-in-time".
--    Una riga ogni volta che una componente pubblica un nuovo dato:
--    observed_at = available_at = istante di pubblicazione; il valore è la somma
--    delle ultime componenti già pubblicate a quell'istante. Così l'aggregato
--    non usa mai un dato dell'Eurozona non ancora uscito.
CREATE TABLE IF NOT EXISTS m2_global (
    observed_at     TEXT PRIMARY KEY,
    value_usd_bn    REAL NOT NULL,
    reference_date  TEXT NOT NULL,   -- data di riferimento più recente tra le componenti
    components      TEXT NOT NULL,   -- JSON {"US": {"usd_bn": ..., "ref": "2026-08-25"}, ...}
    source          TEXT NOT NULL,
    available_at    TEXT NOT NULL,
    fetched_at      TEXT NOT NULL
);

-- 2b. Componenti dell'aggregato M2 (tabella di supporto, una riga per
--     componente e data di riferimento).
CREATE TABLE IF NOT EXISTS m2_components (
    component       TEXT NOT NULL,   -- 'US', 'EZ', ...
    observed_at     TEXT NOT NULL,
    value_local_bn  REAL NOT NULL,   -- miliardi in valuta locale
    currency        TEXT NOT NULL,
    fx_to_usd       REAL,            -- USD per 1 unità di valuta locale
    value_usd_bn    REAL,
    series_id       TEXT NOT NULL,
    source          TEXT NOT NULL,
    available_at    TEXT NOT NULL,
    fetched_at      TEXT NOT NULL,
    PRIMARY KEY (component, observed_at)
);

-- 3. Flussi netti giornalieri ETF spot Bitcoin USA (observed_at = giorno di borsa)
CREATE TABLE IF NOT EXISTS etf_flows (
    observed_at          TEXT PRIMARY KEY,
    net_inflow_usd       REAL NOT NULL,
    total_net_assets_usd REAL,
    cum_net_inflow_usd   REAL,
    value_traded_usd     REAL,
    source               TEXT NOT NULL,
    available_at         TEXT NOT NULL,
    fetched_at           TEXT NOT NULL
);

-- 4. Rapporto prezzo Bitcoin / Oro (once d'oro per 1 BTC)
CREATE TABLE IF NOT EXISTS btc_gold_ratio (
    observed_at     TEXT PRIMARY KEY,
    ratio           REAL NOT NULL,
    btc_usd         REAL,
    gold_usd        REAL,
    source          TEXT NOT NULL,
    available_at    TEXT NOT NULL,
    fetched_at      TEXT NOT NULL
);

-- 5. Bitcoin Dominance (% della market cap crypto totale)
CREATE TABLE IF NOT EXISTS btc_dominance (
    observed_at           TEXT PRIMARY KEY,
    dominance_pct         REAL NOT NULL,
    total_market_cap_usd  REAL,
    source                TEXT NOT NULL,
    available_at          TEXT NOT NULL,
    fetched_at            TEXT NOT NULL
);

-- 6a. Tasso Fed Funds effettivo e range obiettivo (giornaliero)
CREATE TABLE IF NOT EXISTS fed_funds_rate (
    observed_at     TEXT PRIMARY KEY,
    effective_rate  REAL NOT NULL,
    target_lower    REAL,
    target_upper    REAL,
    source          TEXT NOT NULL,
    available_at    TEXT NOT NULL,
    fetched_at      TEXT NOT NULL
);

-- 6b. Aspettative sulla prossima riunione FOMC (snapshot di mercato).
--     expected_change_bps = somma(prob_i * variazione_i): negativo = taglio atteso.
CREATE TABLE IF NOT EXISTS fed_expectations (
    observed_at          TEXT PRIMARY KEY,
    meeting_date         TEXT NOT NULL,
    event_ticker         TEXT,
    prob_cut             REAL NOT NULL,
    prob_hold            REAL NOT NULL,
    prob_hike            REAL NOT NULL,
    expected_change_bps  REAL NOT NULL,
    outcomes             TEXT,          -- JSON {"-25": 0.10, "0": 0.83, ...}
    source               TEXT NOT NULL,
    available_at         TEXT NOT NULL,
    fetched_at           TEXT NOT NULL
);

-- Registro di ogni esecuzione dei collector (diagnostica e avvisi in dashboard)
CREATE TABLE IF NOT EXISTS collection_runs (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    collector      TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    finished_at    TEXT NOT NULL,
    status         TEXT NOT NULL,      -- 'ok' | 'no_new_data' | 'error'
    rows_inserted  INTEGER NOT NULL DEFAULT 0,
    rows_updated   INTEGER NOT NULL DEFAULT 0,
    message        TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_collector ON collection_runs (collector, started_at);
