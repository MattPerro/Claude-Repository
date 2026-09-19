#!/usr/bin/env python3
"""Deriva le soglie di screening dal modello ROI.

Il procacciatore, in fase di ricerca, non ha i dati per calcolare un ROI: non
conosce il prezzo di uscita del ristrutturato, non ha il computo dei lavori e
spesso non sa lo stato occupativo. Un ROI "stimato" a quello stadio e' un numero
inventato che poi nessuno mette piu' in discussione.

Questo modulo risolve il problema al contrario: dato un obiettivo di ROI,
calcola **il prezzo base massimo al mq** oltre il quale un lotto non puo'
rispettare quell'obiettivo. Diventa un filtro applicabile con il solo avviso di
vendita e il dato OMI di zona, in dieci secondi, senza perizia.

La soglia e' derivata da roi.py, non stimata: se cambia il modello o il profilo
di costi, la soglia si ricalcola.

Uso:
    python3 soglie.py --uscita-mq 3200                  # tabella completa
    python3 soglie.py --uscita-mq 3200 --roi 0.25       # una soglia
    python3 soglie.py --uscita-mq 3200 --mq 90 --libero --costo-mq 750
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import asdict

from roi import Parametri, calcola, offerta_massima

# Offerta minima di legge: un'offerta inferiore di oltre un quarto al prezzo
# base e' inefficace (art. 571 c.p.c.).
QUOTA_MINIMA_LEGGE = 0.75

# Profilo di costi "prudente tipico" per Scandicci. Sono le assunzioni che
# rendono la soglia utilizzabile senza perizia: vanno ritarate in F10 sul
# consuntivo delle operazioni reali (vedi PIANO-PROGETTO.md §10.2).
PROFILO_TIPO = {
    "compenso_delegato": 3000.0,
    "spese_trasferimento": 1500.0,
    "cancellazione_gravami": 1200.0,
    "oneri_e_pratiche": 6000.0,
    "arretrati_condominiali": 2500.0,
    "imu_mensile": 75.0,
    "condominio_mensile": 70.0,
    "altre_spese_mensili": 60.0,
    "costi_marketing": 2000.0,
    # Scenario prudente: riserva imprevisti al 20%.
    "imprevisti_pct": 0.20,
}

# Durate tipiche. L'occupazione e' la variabile che sposta di piu' la soglia,
# perche' allunga il progetto prima che il cantiere possa nemmeno iniziare.
#
# REVISIONE 19/09/2026 — la fase di uscita era sottostimata di 2-3 mesi.
# Il rilevamento di `mercato-scandicci`: i tempi di vendita pubblicati
# (~109 giorni, hinterland di Firenze, Tecnocasa gen 2026) misurano il
# collocamento fino alla PROPOSTA ACCETTATA, non fino al rogito. Lo scarto
# proposta -> atto -> incasso vale altri 2-3 mesi, che il modello non contava.
# Uscita realistica fino all'incasso: 5,6-6,6 mesi, non 3-4.
# Durate portate da 11 -> 13 (libero) e da 18 -> 20 (occupato).
#
# `mesi` e' sovrascrivibile: i tempi di assorbimento variano per zona, e con un
# orizzonte rigido la zona lenta va compensata da uno sconto maggiore in asta.
MESI_OCCUPATO = 20.0
MESI_LIBERO = 13.0
LIBERAZIONE_OCCUPATO = (8.0, 5000.0)  # (mesi, costo)


def _parametri(
    uscita_mq: float,
    mq: float,
    libero: bool,
    costo_mq: float,
    mesi: float | None = None,
) -> Parametri:
    mesi_lib, costo_lib = (0.0, 0.0) if libero else LIBERAZIONE_OCCUPATO
    durata = mesi if mesi is not None else (MESI_LIBERO if libero else MESI_OCCUPATO)
    return Parametri(
        riferimento="soglia-screening",
        superficie_mq=mq,
        # Il prezzo base non entra nel calcolo del ROI: serve solo al confronto
        # finale col minimo di legge, che facciamo fuori dal modello.
        prezzo_base=0.0,
        prezzo_aggiudicazione=0.0,
        compenso_delegato=PROFILO_TIPO["compenso_delegato"],
        spese_trasferimento=PROFILO_TIPO["spese_trasferimento"],
        cancellazione_gravami=PROFILO_TIPO["cancellazione_gravami"],
        mesi_liberazione=mesi_lib,
        costo_liberazione=costo_lib,
        costo_mq=costo_mq,
        oneri_e_pratiche=PROFILO_TIPO["oneri_e_pratiche"],
        arretrati_condominiali=PROFILO_TIPO["arretrati_condominiali"],
        mesi_totali=durata,
        imu_mensile=PROFILO_TIPO["imu_mensile"],
        condominio_mensile=PROFILO_TIPO["condominio_mensile"],
        altre_spese_mensili=PROFILO_TIPO["altre_spese_mensili"],
        prezzo_vendita_atteso=uscita_mq * mq,
        costi_marketing=PROFILO_TIPO["costi_marketing"],
        opzioni={"imprevisti_pct": PROFILO_TIPO["imprevisti_pct"]},
    )


def soglia_screening(
    roi_target: float,
    uscita_mq: float,
    mq: float = 70.0,
    libero: bool = False,
    costo_mq: float = 600.0,
    mesi: float | None = None,
) -> dict[str, float]:
    """Prezzo base massimo compatibile con `roi_target` sullo scenario prudente.

    Restituisce anche il rapporto sul prezzo di uscita, che e' la forma in cui
    il filtro si applica davvero: *il prezzo base al mq deve stare sotto il X%
    del valore al mq del ristrutturato in quella zona.*

    `mesi` sovrascrive la durata di default: serve per le zone a assorbimento
    lento, dove la stessa operazione richiede piu' tempo e quindi un prezzo
    d'ingresso piu' basso a parita' di ROI.
    """
    p = _parametri(uscita_mq, mq, libero, costo_mq, mesi)
    offerta_max = offerta_massima(p, roi_target)

    if offerta_max <= 0:
        return {
            "roi_target": roi_target,
            "offerta_massima": 0.0,
            "prezzo_base_massimo": 0.0,
            "base_massimo_mq": 0.0,
            "quota_su_uscita": 0.0,
            "aggredibile": 0.0,
        }

    # Un lotto e' aggredibile solo se il 75% del suo prezzo base sta sotto
    # l'offerta massima. Quindi il prezzo base non puo' superare max/0,75.
    base_massimo = offerta_max / QUOTA_MINIMA_LEGGE

    return {
        "roi_target": roi_target,
        "offerta_massima": offerta_max,
        "prezzo_base_massimo": base_massimo,
        "base_massimo_mq": base_massimo / mq,
        "quota_su_uscita": (base_massimo / mq) / uscita_mq,
        "aggredibile": 1.0,
    }


def tabella(
    uscita_mq: float,
    mq: float = 70.0,
    costo_mq: float = 600.0,
    obiettivi: tuple[float, ...] = (0.10, 0.15, 0.20, 0.25, 0.30),
    mesi: float | None = None,
) -> list[dict[str, float]]:
    righe = []
    for t in obiettivi:
        for libero in (False, True):
            r = soglia_screening(t, uscita_mq, mq, libero, costo_mq, mesi)
            r["libero"] = 1.0 if libero else 0.0
            righe.append(r)
    return righe


def _stampa_tabella(
    uscita_mq: float, mq: float, costo_mq: float, mesi: float | None = None
) -> None:
    print(f"\nSoglie di screening — scenario prudente")
    print(f"Uscita ipotizzata: {uscita_mq:,.0f} EUR/mq ristrutturato".replace(",", "."))
    print(f"Superficie: {mq:.0f} mq | Lavori: {costo_mq:,.0f} EUR/mq".replace(",", "."))
    print()
    if mesi is not None:
        print(f"Durata imposta: {mesi:.0f} mesi")
    print(f"{'ROI':>6} | {'OCCUPATO base max/mq':>22} {'% uscita':>9} | {'LIBERO base max/mq':>20} {'% uscita':>9}")
    print("-" * 78)
    righe = tabella(uscita_mq, mq, costo_mq, mesi=mesi)
    for i in range(0, len(righe), 2):
        occ, lib = righe[i], righe[i + 1]
        print(
            f"{occ['roi_target']:>5.0%} | "
            f"{occ['base_massimo_mq']:>22,.0f} {occ['quota_su_uscita']:>8.0%} | "
            f"{lib['base_massimo_mq']:>20,.0f} {lib['quota_su_uscita']:>8.0%}"
        )
    print()
    print("Lettura: un lotto entra in lista solo se il prezzo base al mq sta")
    print("sotto la soglia della riga corrispondente al ROI obiettivo.")
    print()


def _stampa_singola(r: dict[str, float], uscita_mq: float, mq: float, libero: bool) -> None:
    stato = "libero" if libero else "occupato"
    print(f"\nSoglia per ROI {r['roi_target']:.0%} — {mq:.0f} mq, {stato}")
    print(f"  uscita ipotizzata        {uscita_mq * mq:>12,.0f} EUR  ({uscita_mq:,.0f}/mq)".replace(",", "."))
    if not r["aggredibile"]:
        print("\n  Nessun prezzo rende l'operazione compatibile con questo ROI.")
        print("  Il lotto non e' aggredibile a queste condizioni di costo e uscita.\n")
        return
    print(f"  offerta massima          {r['offerta_massima']:>12,.0f} EUR".replace(",", "."))
    print(f"  prezzo base massimo      {r['prezzo_base_massimo']:>12,.0f} EUR".replace(",", "."))
    print(f"  base massimo al mq       {r['base_massimo_mq']:>12,.0f} EUR/mq".replace(",", "."))
    print(f"  quota sul prezzo uscita  {r['quota_su_uscita']:>11.0%}")
    print(f"\n  FILTRO: scarta i lotti con prezzo base sopra "
          f"{r['base_massimo_mq']:,.0f} EUR/mq.\n".replace(",", "."))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Deriva le soglie di screening dal modello ROI."
    )
    ap.add_argument("--uscita-mq", type=float, required=True,
                    help="EUR/mq del ristrutturato nella zona (fonte: OMI o comparabili)")
    ap.add_argument("--mq", type=float, default=70.0, help="superficie commerciale")
    ap.add_argument("--costo-mq", type=float, default=600.0,
                    help="lavori al mq, IVA esclusa")
    ap.add_argument("--roi", type=float, default=None,
                    help="obiettivo di ROI (0.25 = 25%%); se omesso stampa la tabella")
    ap.add_argument("--libero", action="store_true",
                    help="immobile libero (senza fase di liberazione)")
    ap.add_argument("--mesi", type=float, default=None,
                    help="durata totale in mesi; sovrascrive il default "
                         f"({MESI_LIBERO:.0f} libero / {MESI_OCCUPATO:.0f} occupato). "
                         "Usalo per le zone ad assorbimento lento")
    a = ap.parse_args(argv)

    if a.roi is None:
        _stampa_tabella(a.uscita_mq, a.mq, a.costo_mq, mesi=a.mesi)
    else:
        r = soglia_screening(a.roi, a.uscita_mq, a.mq, a.libero, a.costo_mq, a.mesi)
        _stampa_singola(r, a.uscita_mq, a.mq, a.libero)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
