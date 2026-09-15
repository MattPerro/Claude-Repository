#!/usr/bin/env python3
"""Test del modello ROI. Nessuna dipendenza: `python3 test_roi.py`.

Lo scopo non e' la copertura: e' avere un oracolo. Se un agente cambia il
modello fiscale o la struttura dei costi, questi test dicono se ha rotto
qualcosa prima che il numero finisca in un documento di sintesi.
"""

from __future__ import annotations

from dataclasses import asdict

from roi import (
    Parametri,
    calcola,
    offerta_massima,
    prezzo_di_pareggio,
    sensibilita,
    _imposte_acquisto,
)

FALLITI: list[str] = []


def verifica(nome: str, condizione: bool, dettaglio: str = "") -> None:
    if condizione:
        print(f"  ok   {nome}")
    else:
        print(f"  FAIL {nome} {dettaglio}")
        FALLITI.append(nome)


def quasi(a: float, b: float, tolleranza: float = 1.0) -> bool:
    return abs(a - b) <= tolleranza


def caso_base() -> Parametri:
    """Bilocale a Scandicci, numeri plausibili ma inventati: servono al test."""
    return Parametri(
        riferimento="TEST-bilocale",
        superficie_mq=70.0,
        prezzo_base=150_000.0,
        prezzo_aggiudicazione=150_000.0,
        compenso_delegato=3_000.0,
        spese_trasferimento=1_500.0,
        cancellazione_gravami=800.0,
        mesi_liberazione=6.0,
        costo_liberazione=4_000.0,
        costo_mq=600.0,
        oneri_e_pratiche=6_000.0,
        arretrati_condominiali=2_500.0,
        mesi_totali=18.0,
        imu_mensile=90.0,
        condominio_mensile=70.0,
        altre_spese_mensili=60.0,
        importo_finanziato=0.0,
        prezzo_vendita_atteso=260_000.0,
        costi_marketing=2_000.0,
    )


def test_imposte_registro_ordinarie() -> None:
    p = caso_base()
    # 9% su 150.000 = 13.500, piu' 100 di imposte fisse.
    verifica(
        "registro ordinario 9% + fisse",
        quasi(_imposte_acquisto(p, 150_000.0), 13_600.0),
        f"ottenuto {_imposte_acquisto(p, 150_000.0)}",
    )


def test_registro_minimo() -> None:
    p = Parametri(**{**asdict(caso_base()), "prezzo_aggiudicazione": 5_000.0})
    # 9% su 5.000 = 450, sotto il minimo di 1.000: si applica il minimo.
    verifica(
        "registro non scende sotto il minimo",
        quasi(_imposte_acquisto(p, 5_000.0), 1_100.0),
        f"ottenuto {_imposte_acquisto(p, 5_000.0)}",
    )


def test_prima_casa_costa_meno() -> None:
    base = caso_base()
    prima = Parametri(**{**asdict(base), "opzioni": {"prima_casa": True}})
    verifica(
        "prima casa riduce le imposte di acquisto",
        _imposte_acquisto(prima, 150_000.0) < _imposte_acquisto(base, 150_000.0),
    )


def test_prezzo_valore_usa_la_base_piu_bassa() -> None:
    p = Parametri(
        **{
            **asdict(caso_base()),
            "opzioni": {"usa_prezzo_valore": True, "valore_catastale": 90_000.0},
        }
    )
    # 9% su 90.000 (catastale, piu' basso) = 8.100 + 100.
    verifica(
        "prezzo-valore applica la base catastale",
        quasi(_imposte_acquisto(p, 150_000.0), 8_200.0),
        f"ottenuto {_imposte_acquisto(p, 150_000.0)}",
    )


def test_regime_iva_esclude_il_registro() -> None:
    p = Parametri(**{**asdict(caso_base()), "opzioni": {"regime_iva_acquisto": True}})
    # IVA 10% su 150.000 = 15.000 + 100 fisse. Il registro non si applica.
    verifica(
        "regime IVA alternativo al registro",
        quasi(_imposte_acquisto(p, 150_000.0), 15_100.0),
        f"ottenuto {_imposte_acquisto(p, 150_000.0)}",
    )


def test_conto_economico_si_chiude() -> None:
    p = caso_base()
    r = calcola(p)
    atteso = r["prezzo_vendita_atteso"] - r["costo_totale"] - r["imposta_plusvalenza"]
    verifica(
        "utile netto = vendita - costi - imposta",
        quasi(r["utile_netto"], atteso, 0.01),
    )
    somma_blocchi = (
        r["totale_acquisto"]
        + r["totale_ristrutturazione"]
        + r["totale_mantenimento"]
        + r["oneri_finanziari"]
        + r["costi_vendita"]
    )
    verifica(
        "costo totale = somma dei blocchi",
        quasi(r["costo_totale"], somma_blocchi, 0.01),
    )


def test_imprevisti_peggiorano_il_roi() -> None:
    p = caso_base()
    prudente = Parametri(**{**asdict(p), "opzioni": {"imprevisti_pct": 0.30}})
    verifica(
        "riserva imprevisti piu' alta abbassa il ROI",
        calcola(prudente)["roi"] < calcola(p)["roi"],
    )


def test_oltre_cinque_anni_nessuna_plusvalenza() -> None:
    p = caso_base()
    lungo = Parametri(**{**asdict(p), "opzioni": {"rivendita_entro_5_anni": False}})
    verifica(
        "nessuna imposta di plusvalenza oltre i 5 anni",
        calcola(lungo)["imposta_plusvalenza"] == 0.0,
    )
    verifica(
        "e l'utile netto e' di conseguenza maggiore",
        calcola(lungo)["utile_netto"] > calcola(p)["utile_netto"],
    )


def test_roi_decresce_col_prezzo() -> None:
    p = caso_base()
    roi_bassi = calcola(p, prezzo_aggiudicazione=120_000.0)["roi"]
    roi_alti = calcola(p, prezzo_aggiudicazione=200_000.0)["roi"]
    verifica("il ROI decresce al crescere del prezzo d'asta", roi_bassi > roi_alti)


def test_offerta_massima_centra_il_target() -> None:
    p = caso_base()
    for target in (0.10, 0.20, 0.30):
        massimo = offerta_massima(p, target)
        if massimo <= 0:
            verifica(f"offerta massima per ROI {target}", False, "nessuna soluzione")
            continue
        roi_al_massimo = calcola(p, prezzo_aggiudicazione=massimo)["roi"]
        verifica(
            f"offerta massima riproduce ROI {target:.0%}",
            quasi(roi_al_massimo, target, 0.005),
            f"ROI ottenuto {roi_al_massimo:.4f}",
        )


def test_offerta_massima_monotona() -> None:
    p = caso_base()
    verifica(
        "un ROI target piu' alto impone un'offerta piu' bassa",
        offerta_massima(p, 0.30) < offerta_massima(p, 0.10),
    )


def test_pareggio_azzera_lutile() -> None:
    p = caso_base()
    pareggio = prezzo_di_pareggio(p)
    a_pareggio = Parametri(**{**asdict(p), "prezzo_vendita_atteso": pareggio})
    verifica(
        "al prezzo di pareggio l'utile e' nullo",
        quasi(calcola(a_pareggio)["utile_netto"], 0.0, 50.0),
        f"utile {calcola(a_pareggio)['utile_netto']:.0f}",
    )
    verifica("il pareggio sta sotto il prezzo atteso", pareggio < p.prezzo_vendita_atteso)


def test_annualizzazione() -> None:
    p = caso_base()
    corto = Parametri(**{**asdict(p), "mesi_totali": 9.0})
    lungo = Parametri(**{**asdict(p), "mesi_totali": 36.0})
    # A parita' di costi mensili l'operazione corta rende di piu' su base annua.
    verifica(
        "durata piu' breve = ROI annualizzato migliore",
        calcola(corto)["roi_annualizzato"] > calcola(lungo)["roi_annualizzato"],
    )


def test_finanziamento_genera_interessi() -> None:
    p = caso_base()
    a_debito = Parametri(
        **{
            **asdict(p),
            "importo_finanziato": 100_000.0,
            "tasso_annuo": 0.06,
            "mesi_finanziamento": 18.0,
        }
    )
    r = calcola(a_debito)
    # 100.000 * 6% * 1,5 anni = 9.000
    verifica("interessi calcolati pro rata", quasi(r["oneri_finanziari"], 9_000.0))
    verifica(
        "la leva riduce il capitale proprio immobilizzato",
        r["capitale_investito"] < calcola(p)["capitale_investito"],
    )


def test_griglia_sensibilita() -> None:
    p = caso_base()
    griglia = sensibilita(p)
    verifica("la griglia ha 20 combinazioni", len(griglia) == 20, str(len(griglia)))
    peggiore = min(griglia, key=lambda r: r["roi"])
    migliore = max(griglia, key=lambda r: r["roi"])
    verifica(
        "lo scenario peggiore e' vendita bassa + lavori alti",
        peggiore["scostamento_vendita"] == -0.15
        and peggiore["scostamento_lavori"] == 0.25,
    )
    verifica("gli scenari sono ordinati come atteso", migliore["roi"] > peggiore["roi"])


def test_parametri_sconosciuti_vengono_rifiutati() -> None:
    import json
    import tempfile
    import os
    from roi import carica

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump({"superficie_mq": 70, "campo_inventato": 1}, f)
        percorso = f.name
    try:
        carica(percorso)
        verifica("carica() rifiuta parametri sconosciuti", False, "nessuna eccezione")
    except ValueError:
        verifica("carica() rifiuta parametri sconosciuti", True)
    finally:
        os.unlink(percorso)


def main() -> int:
    test = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    print(f"\nModello ROI — {len(test)} gruppi di test\n")
    for t in test:
        print(f"{t.__name__}:")
        t()
    print()
    if FALLITI:
        print(f"{len(FALLITI)} test falliti: {FALLITI}")
        return 1
    print("tutti i test passano.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
