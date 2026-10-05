# btcmon — monitoraggio e previsione del prezzo di Bitcoin

Applicazione Python che raccoglie ogni ora un set di parametri macro e crypto,
ne mantiene lo storico in SQLite e (negli step successivi) stima un modello
statistico a finestra mobile con previsioni a 1 e 7 giorni e metriche di
affidabilità esplicite.

**Stato:** step 1 completato (database + raccolta dati). Modello e dashboard
sono gli step 2 e 3.

## Avvio rapido

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env                                   # facoltativo: chiavi gratuite
btcmon init-db
btcmon backfill --days 365                             # storico gratuito disponibile
btcmon status                                          # freschezza di ogni parametro
btcmon run-scheduler                                   # raccolta ogni ora (minuto 05 UTC)
```

In alternativa allo scheduler integrato si può usare cron (`btcmon collect`
salta da solo le fonti interrogate di recente):

```cron
5 * * * *  cd /percorso/btcmon && .venv/bin/btcmon collect >> data/cron.log 2>&1
```

Su Windows: Utilità di pianificazione → attività ogni ora → `.venv\Scripts\btcmon.exe collect`.

## Parametri e fonti (verificate a ottobre 2026)

| Parametro | Fonte v1 | Frequenza reale | Chiave | Limiti / note |
|---|---|---|---|---|
| Prezzo BTC/USD (target) | CoinGecko `/simple/price` | minuti → salvato ogni ora | no (Demo opzionale) | Senza chiave ~5-30 chiamate/min; Demo gratuita 100/min, 10k/mese. Storico gratuito: 365 gg (orario fino a 90 gg) |
| Rapporto BTC/Oro | CoinGecko, `vs_currency=xau` (once d'oro per BTC) | infragiornaliera | no | Stessa chiamata del prezzo. Ripiego: PAX Gold. Storico 365 gg |
| Bitcoin Dominance | CoinGecko `/global` | infragiornaliera | no | **Nessuno storico gratuito** (`/global/market_cap_chart` è a pagamento): si accumula dalla prima raccolta |
| M2 aggregato (USD) | FRED `WM2NS` (USA, settimanale) + BCE `BSI…M20…` (Eurozona, mensile) × FRED `DEXUSEU` | settimanale / mensile | FRED opzionale | Cina e Giappone esclusi: oggi nessuna fonte gratuita, stabile e aggiornata via API (BGeometrics M2 Global è a pagamento) |
| Flussi netti ETF spot BTC USA | SoSoValue OpenAPI `etfs/summary-history` | giornaliera (dopo la chiusura) | **sì, gratuita** | 20 chiamate/min, 100k/mese, storico ~1 mese. Fallback: inserimento manuale o import CSV (es. Farside) |
| Fed Funds effettivo + range | FRED `DFF`, `DFEDTARL`, `DFEDTARU` | giornaliera | opzionale | API con chiave: 120 richieste/min. Senza chiave: CSV pubblico |
| Aspettative FOMC | Kalshi, serie `KXFEDDECISION` (dati pubblici) | continua | no | CME FedWatch non ha API gratuita. Si salvano prob. taglio / invariato / rialzo e variazione attesa in bp. Fallback manuale |

Chiavi gratuite: [FRED](https://fred.stlouisfed.org/docs/api/api_key.html),
[CoinGecko Demo](https://www.coingecko.com/en/api/pricing),
[SoSoValue](https://sosovalue.com/developer).

`yfinance` è stato scartato per la v1: è uno scraper non ufficiale di Yahoo con
limiti non pubblicati ed errori di rate limit frequenti.

## Frequenze eterogenee: come funziona

Ogni tabella contiene **solo valori reali** pubblicati dalla fonte, con tre timestamp UTC:

- `observed_at`: istante o periodo a cui si riferisce il dato (settimana M2, giorno di borsa, ...);
- `available_at`: quando il dato è diventato pubblico. Con la chiave FRED si usa la data
  reale di prima pubblicazione (vintage ALFRED); altrimenti un ritardo tipico stimato
  (M2 USA +35 gg, M2 Eurozona +30 gg, flussi ETF il giorno lavorativo successivo, ...);
- `fetched_at`: quando btcmon l'ha scaricato.

Il forward-fill avviene in lettura (`btcmon.alignment.build_aligned_frame`): per ogni
istante della griglia (oraria o giornaliera) si usa l'ultimo valore con
`available_at <= t`, insieme a `<parametro>__observed_at` (timestamp dell'ultimo dato
reale) e `<parametro>__age_hours`. Il modello quindi non vede mai un dato prima che
fosse pubblicato. Questo conta per la validazione out-of-sample dello step 2.

L'aggregato M2 viene ricalcolato point-in-time: una riga per ogni pubblicazione di una
componente, sommando solo le componenti già uscite in quel momento.

```bash
btcmon export-aligned --freq 1D --days 90 --out allineato.csv
```

## Fallback e avvisi

- `btcmon status` mostra per ogni parametro l'ultimo dato reale, l'età e lo stato
  (`ok` / `VECCHIO` / `ASSENTE`). Le soglie per i dati di borsa sono in giorni
  lavorativi, così il weekend non genera falsi allarmi. Lo scheduler scrive gli
  avvisi nel log a ogni giro.
- Un collector che fallisce non blocca gli altri; ogni esecuzione è registrata in
  `collection_runs`.
- Inserimento manuale:

```bash
btcmon manual etf-flow --date 2026-10-02 --net-inflow-usd -45.2e6
btcmon manual fed-expectations --meeting-date 2026-10-28 --prob-hold 0.83 --prob-hike 0.17
btcmon import-csv etf_flows farside.csv            # colonne Date/Total in mln USD, negativi tra ()
btcmon import-csv etf_flows flussi.csv             # colonne date, net_inflow_usd
```

## Struttura

```
src/btcmon/
  schema.sql           una tabella per parametro + collection_runs
  db.py                connessione, upsert idempotente (le revisioni aggiornano il valore,
                       available_at resta quello della prima pubblicazione)
  collectors/          coingecko, fred, m2 (US+EZ), sosovalue, kalshi
  alignment.py         griglia comune con forward-fill point-in-time
  freshness.py         controllo dati vecchi
  manual.py            inserimento manuale e import CSV
  runner.py            esecuzione collector con log e intervalli minimi
  scheduler.py         job orario (APScheduler)
  cli.py               comando `btcmon`
tests/                 test con risposte HTTP simulate (pytest)
```

## Limiti noti della v1

- Il parsing di SoSoValue e Kalshi segue il formato documentato e accetta varianti
  di nomi dei campi; va verificato al primo avvio con le chiavi reali (`btcmon collect --force -v`).
- La dominance e le probabilità FOMC non hanno storico gratuito: il modello potrà
  usarle solo dopo qualche settimana di raccolta. Per Kalshi si può aggiungere in seguito
  un backfill dalle candlestick storiche.
- Le festività USA non sono nel calendario dei giorni lavorativi (tolleranza di 1 giorno nelle soglie).
- Le stime dei ritardi di pubblicazione senza chiave FRED sono conservative: con la
  chiave il backtest usa le date reali.
