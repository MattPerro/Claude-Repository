"""Riga di comando: btcmon <comando> --help per i dettagli."""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, timedelta
from logging.handlers import RotatingFileHandler

from btcmon.alignment import build_aligned_frame
from btcmon.collectors import Context
from btcmon.config import Settings
from btcmon.db import connect, init_db
from btcmon.freshness import check_freshness
from btcmon.http import HttpClient
from btcmon.manual import add_etf_flow, add_fed_expectation, import_etf_flows_csv
from btcmon.runner import build_collectors, run_collectors
from btcmon.scheduler import run_forever
from btcmon.timeutil import utcnow


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    settings = Settings.from_env()
    # Lo scheduler mostra tutto in console; collect/backfill stampano già un riepilogo.
    console_level = {"run-scheduler": logging.INFO, "collect": logging.ERROR, "backfill": logging.ERROR}
    _setup_logging(settings, logging.DEBUG if args.verbose else console_level.get(args.command, logging.WARNING))
    return args.func(args, settings) or 0


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="btcmon", description=__doc__)
    parser.add_argument("-v", "--verbose", action="store_true", help="log di debug")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init-db", help="crea (o aggiorna) lo schema del database")
    p.set_defaults(func=cmd_init_db)

    p = sub.add_parser("backfill", help="scarica lo storico gratuito disponibile")
    p.add_argument("--days", type=int, default=365)
    p.add_argument("--only", help="collector separati da virgola (default: tutti)")
    p.set_defaults(func=cmd_backfill)

    p = sub.add_parser("collect", help="una raccolta (quello che fa il job orario)")
    p.add_argument("--only", help="collector separati da virgola (default: tutti)")
    p.add_argument("--force", action="store_true", help="ignora l'intervallo minimo dei collector")
    p.set_defaults(func=cmd_collect)

    p = sub.add_parser("run-scheduler", help="avvia il job orario (bloccante)")
    p.add_argument("--minute", type=int, default=5, help="minuto dell'ora a cui girare (UTC)")
    p.set_defaults(func=cmd_run_scheduler)

    p = sub.add_parser("status", help="freschezza dei parametri e ultime raccolte")
    p.set_defaults(func=cmd_status)

    p = sub.add_parser("export-aligned", help="esporta i dati allineati con forward-fill")
    p.add_argument("--freq", default="1D", help="passo della griglia, es. 1h o 1D")
    p.add_argument("--days", type=int, default=90)
    p.add_argument("--out", required=True, help="file CSV di destinazione")
    p.set_defaults(func=cmd_export_aligned)

    manual = sub.add_parser("manual", help="inserimento manuale (fallback)")
    msub = manual.add_subparsers(dest="manual_command", required=True)
    p = msub.add_parser("etf-flow", help="flusso netto giornaliero ETF spot BTC USA")
    p.add_argument("--date", required=True, type=date.fromisoformat, help="giorno di borsa YYYY-MM-DD")
    p.add_argument("--net-inflow-usd", required=True, type=float, help="es. 241.1e6, negativo = deflusso")
    p.add_argument("--total-net-assets-usd", type=float)
    p.set_defaults(func=cmd_manual_etf)
    p = msub.add_parser("fed-expectations", help="probabilità prossimo FOMC (es. da CME FedWatch)")
    p.add_argument("--meeting-date", required=True, type=date.fromisoformat)
    p.add_argument("--prob-cut", type=float, default=0.0)
    p.add_argument("--prob-hold", type=float, default=0.0)
    p.add_argument("--prob-hike", type=float, default=0.0)
    p.set_defaults(func=cmd_manual_fed)

    p = sub.add_parser("import-csv", help="importa storico da CSV (oggi: etf_flows)")
    p.add_argument("table", choices=["etf_flows"])
    p.add_argument("path")
    p.add_argument("--date-col")
    p.add_argument("--value-col")
    p.add_argument("--unit", choices=["usd", "musd"], help="musd = milioni di USD (formato Farside)")
    p.set_defaults(func=cmd_import_csv)
    return parser


def _open(settings: Settings):
    conn = connect(settings.db_path)
    init_db(conn)
    return conn


def _context(settings: Settings) -> Context:
    return Context(settings, HttpClient(settings.user_agent, settings.http_timeout))


def _only(value: str | None):
    return [v.strip() for v in value.split(",") if v.strip()] if value else None


def cmd_init_db(args, settings):
    _open(settings).close()
    print(f"Database pronto: {settings.db_path}")


def cmd_backfill(args, settings):
    conn = _open(settings)
    outcomes = run_collectors(conn, build_collectors(_context(settings), _only(args.only)), backfill_days=args.days)
    _print_outcomes(outcomes)
    return 1 if any(o.status == "error" for o in outcomes) else 0


def cmd_collect(args, settings):
    conn = _open(settings)
    outcomes = run_collectors(conn, build_collectors(_context(settings), _only(args.only)), force=args.force)
    _print_outcomes(outcomes)
    return 1 if any(o.status == "error" for o in outcomes) else 0


def cmd_run_scheduler(args, settings):
    _open(settings).close()
    run_forever(settings, minute=args.minute)


def cmd_status(args, settings):
    conn = _open(settings)
    now = utcnow()
    print(f"Stato al {now:%Y-%m-%d %H:%M} UTC  —  db: {settings.db_path}\n")
    print(f"{'parametro':<34} {'stato':<8} {'ultimo dato reale':<21} {'età':>8}  {'soglia':<16} {'valore':>16}  fonte")
    for s in check_freshness(conn, now):
        age = f"{s.age_hours:.1f}h" if s.age_hours is not None else "-"
        value = f"{s.last_value:,.4g}" if s.last_value is not None else "-"
        flag = {"ok": "ok", "stale": "VECCHIO", "missing": "ASSENTE"}[s.status]
        print(f"{s.param.label:<34} {flag:<8} {s.last_observed_at or '-':<21} {age:>8}  "
              f"{s.threshold:<16} {value:>16}  {s.last_source or '-'}")
    print("\nUltime raccolte:")
    rows = conn.execute(
        "SELECT r.collector, r.started_at, r.status, r.rows_inserted, r.rows_updated, r.message"
        " FROM collection_runs r JOIN (SELECT collector, MAX(id) AS id FROM collection_runs"
        " GROUP BY collector) last ON last.id = r.id ORDER BY r.collector"
    ).fetchall()
    if not rows:
        print("  nessuna raccolta eseguita: lancia 'btcmon backfill' e poi 'btcmon collect'")
    for r in rows:
        msg = f" - {r['message']}" if r["message"] else ""
        print(f"  {r['collector']:<17} {r['started_at']}  {r['status']:<12}"
              f" +{r['rows_inserted']}/{r['rows_updated']}{msg}")


def cmd_export_aligned(args, settings):
    conn = _open(settings)
    now = utcnow()
    frame = build_aligned_frame(conn, now - timedelta(days=args.days), now, freq=args.freq)
    frame.to_csv(args.out)
    print(f"{len(frame)} righe ({args.freq}) scritte in {args.out}")


def cmd_manual_etf(args, settings):
    conn = _open(settings)
    result = add_etf_flow(conn, args.date, args.net_inflow_usd, utcnow(), args.total_net_assets_usd)
    print(f"Flusso ETF {args.date}: {args.net_inflow_usd:,.0f} USD ({_verb(result)})")


def cmd_manual_fed(args, settings):
    conn = _open(settings)
    add_fed_expectation(conn, args.meeting_date, args.prob_cut, args.prob_hold, args.prob_hike, utcnow())
    print(f"Aspettative FOMC {args.meeting_date} salvate")


def cmd_import_csv(args, settings):
    conn = _open(settings)
    result = import_etf_flows_csv(conn, args.path, utcnow(), args.date_col, args.value_col, args.unit)
    print(f"Import {args.path}: {result.inserted} nuove righe, {result.updated} aggiornate")


def _verb(result) -> str:
    return "inserito" if result.inserted else "aggiornato" if result.updated else "invariato"


def _print_outcomes(outcomes) -> None:
    for o in outcomes:
        msg = f"  {o.message}" if o.message else ""
        print(f"{o.collector:<17} {o.status:<12} +{o.result.inserted} nuove, {o.result.updated} aggiornate{msg}")


def _setup_logging(settings: Settings, console_level: int) -> None:
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(min(console_level, logging.INFO))
    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(fmt)
    console.setLevel(console_level)
    root.addHandler(console)
    settings.log_path.parent.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(settings.log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    file_handler.setFormatter(fmt)
    root.addHandler(file_handler)
    logging.getLogger("urllib3").setLevel(logging.ERROR)


if __name__ == "__main__":
    sys.exit(main())
