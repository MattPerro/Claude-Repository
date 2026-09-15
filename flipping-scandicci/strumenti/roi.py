#!/usr/bin/env python3
"""Modello deterministico di ROI per il flipping di immobili all'asta (Scandicci, FI).

Perche' esiste questo file: la valutazione economica di un'asta non va lasciata
al linguaggio naturale. Gli agenti raccolgono i parametri dalla perizia, dall'avviso
di vendita e dal mercato; il conto lo fa questo modulo, sempre nello stesso modo.

Nessuna dipendenza esterna: solo libreria standard.

Uso:
    python3 roi.py esempio.json
    python3 roi.py esempio.json --sensibilita
    python3 roi.py esempio.json --offerta-massima 0.20   # ROI target 20%

Ogni importo e' in euro, ogni durata in mesi, ogni aliquota in frazione (0.09 = 9%).
Le aliquote di default sono indicate in `DEFAULT` e vanno verificate ad ogni
progetto: la fiscalita' immobiliare italiana cambia con la legge di bilancio.
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field, asdict
from typing import Any

# Valori di partenza. Non sono verita': sono un punto di partenza tracciabile.
# Vedi ../riferimenti/fiscalita-e-costi.md per la fonte di ognuno.
DEFAULT: dict[str, Any] = {
    # --- Acquisto ---
    "prima_casa": False,
    "aliquota_registro": 0.09,           # 9% ordinaria, 2% prima casa
    "aliquota_registro_prima_casa": 0.02,
    "registro_minimo": 1000.0,           # l'imposta di registro non scende sotto 1.000 EUR
    "imposte_fisse_acquisto": 100.0,     # ipotecaria 50 + catastale 50
    "usa_prezzo_valore": False,          # base = valore catastale se piu' basso (Corte Cost. 6/2014)
    "valore_catastale": None,
    "regime_iva_acquisto": False,        # True se il venditore e' soggetto IVA
    "aliquota_iva_acquisto": 0.10,
    # --- Ristrutturazione ---
    "aliquota_iva_lavori": 0.10,         # 10% su manutenzione straordinaria; 22% su alcune forniture
    "imprevisti_pct": 0.15,              # riserva di contingenza sui lavori
    "tecnico_pct": 0.10,                 # progetto + direzione lavori + sicurezza, % sui lavori
    # --- Vendita ---
    "agenzia_pct": 0.03,
    "aliquota_iva_servizi": 0.22,
    # --- Uscita fiscale ---
    "rivendita_entro_5_anni": True,
    "aliquota_plusvalenza": 0.26,        # imposta sostitutiva in atto notarile
}


@dataclass
class Parametri:
    """Tutti gli input del modello. I None vanno riempiti prima di calcolare."""

    # Identificazione
    riferimento: str = "senza-nome"
    superficie_mq: float = 0.0

    # Acquisto all'asta
    prezzo_base: float = 0.0
    prezzo_aggiudicazione: float = 0.0
    compenso_delegato: float = 0.0
    spese_trasferimento: float = 0.0       # registrazione, trascrizione, note del delegato
    cancellazione_gravami: float = 0.0

    # Liberazione dell'immobile (se occupato)
    mesi_liberazione: float = 0.0
    costo_liberazione: float = 0.0         # legale, custode, eventuale accordo col debitore

    # Ristrutturazione
    costo_mq: float = 0.0                  # lavori al mq, IVA esclusa
    oneri_e_pratiche: float = 0.0          # oneri comunali, sanatoria, APE, allacci, catasto
    arretrati_condominiali: float = 0.0    # anno in corso + precedente (art. 63 disp. att. c.c.)

    # Durata e mantenimento
    mesi_totali: float = 0.0               # dal saldo prezzo all'incasso della vendita
    imu_mensile: float = 0.0
    condominio_mensile: float = 0.0
    altre_spese_mensili: float = 0.0       # utenze, assicurazione, vigilanza

    # Finanziamento
    importo_finanziato: float = 0.0
    tasso_annuo: float = 0.0
    mesi_finanziamento: float = 0.0
    spese_istruttoria: float = 0.0

    # Vendita
    prezzo_vendita_atteso: float = 0.0
    costi_marketing: float = 0.0           # home staging, fotografie, planimetrie

    # Override delle aliquote di default
    opzioni: dict[str, Any] = field(default_factory=dict)

    def opt(self, chiave: str) -> Any:
        return self.opzioni.get(chiave, DEFAULT[chiave])


def _imposte_acquisto(p: Parametri, prezzo: float) -> float:
    """Imposte sul trasferimento. Due regimi alternativi, non cumulabili."""
    if p.opt("regime_iva_acquisto"):
        # Venditore soggetto IVA: IVA sul prezzo + imposte fisse.
        return prezzo * p.opt("aliquota_iva_acquisto") + p.opt("imposte_fisse_acquisto")

    aliquota = (
        p.opt("aliquota_registro_prima_casa")
        if p.opt("prima_casa")
        else p.opt("aliquota_registro")
    )

    base = prezzo
    catastale = p.opt("valore_catastale")
    if p.opt("usa_prezzo_valore") and catastale is not None:
        base = min(prezzo, float(catastale))

    registro = max(base * aliquota, p.opt("registro_minimo"))
    return registro + p.opt("imposte_fisse_acquisto")


def _oneri_finanziari(p: Parametri) -> float:
    if p.importo_finanziato <= 0:
        return p.spese_istruttoria
    mesi = p.mesi_finanziamento or p.mesi_totali
    interessi = p.importo_finanziato * p.tasso_annuo * (mesi / 12.0)
    return interessi + p.spese_istruttoria


def calcola(p: Parametri, prezzo_aggiudicazione: float | None = None) -> dict[str, float]:
    """Sviluppa il conto economico completo dell'operazione.

    `prezzo_aggiudicazione` permette di ricalcolare a prezzo diverso senza
    mutare i parametri: serve al solver di `offerta_massima`.
    """
    prezzo = (
        p.prezzo_aggiudicazione
        if prezzo_aggiudicazione is None
        else prezzo_aggiudicazione
    )

    imposte_acq = _imposte_acquisto(p, prezzo)
    costi_acquisto_accessori = (
        p.compenso_delegato + p.spese_trasferimento + p.cancellazione_gravami
    )
    totale_acquisto = prezzo + imposte_acq + costi_acquisto_accessori

    lavori = p.costo_mq * p.superficie_mq
    lavori_con_imprevisti = lavori * (1.0 + p.opt("imprevisti_pct"))
    iva_lavori = lavori_con_imprevisti * p.opt("aliquota_iva_lavori")
    tecnico = lavori * p.opt("tecnico_pct")
    iva_tecnico = tecnico * p.opt("aliquota_iva_servizi")
    totale_ristrutturazione = (
        lavori_con_imprevisti + iva_lavori + tecnico + iva_tecnico + p.oneri_e_pratiche
    )

    mesi_possesso = p.mesi_totali
    mantenimento = (
        (p.imu_mensile + p.condominio_mensile + p.altre_spese_mensili) * mesi_possesso
        + p.arretrati_condominiali
        + p.costo_liberazione
    )

    finanziari = _oneri_finanziari(p)

    provvigione = p.prezzo_vendita_atteso * p.opt("agenzia_pct")
    costi_vendita = (
        provvigione * (1.0 + p.opt("aliquota_iva_servizi")) + p.costi_marketing
    )

    costo_totale = (
        totale_acquisto
        + totale_ristrutturazione
        + mantenimento
        + finanziari
        + costi_vendita
    )

    # Plusvalenza: prezzo di cessione meno costo di acquisto e costi inerenti
    # documentati (art. 67 co. 1 lett. b TUIR). Le spese finanziarie non sono
    # costi inerenti: restano fuori dalla base imponibile.
    costi_inerenti = (
        prezzo
        + imposte_acq
        + costi_acquisto_accessori
        + totale_ristrutturazione
        + costi_vendita
    )
    plusvalenza = max(0.0, p.prezzo_vendita_atteso - costi_inerenti)
    imposta_plusvalenza = (
        plusvalenza * p.opt("aliquota_plusvalenza")
        if p.opt("rivendita_entro_5_anni")
        else 0.0
    )

    utile_netto = p.prezzo_vendita_atteso - costo_totale - imposta_plusvalenza

    # Capitale proprio immobilizzato: tutto cio' che esce di tasca prima di incassare.
    capitale_investito = max(
        1.0, costo_totale - costi_vendita - p.importo_finanziato
    )

    roi = utile_netto / capitale_investito
    roi_annualizzato = _annualizza(roi, mesi_possesso)

    return {
        "prezzo_aggiudicazione": prezzo,
        "imposte_acquisto": imposte_acq,
        "costi_acquisto_accessori": costi_acquisto_accessori,
        "totale_acquisto": totale_acquisto,
        "lavori_base": lavori,
        "totale_ristrutturazione": totale_ristrutturazione,
        "totale_mantenimento": mantenimento,
        "oneri_finanziari": finanziari,
        "costi_vendita": costi_vendita,
        "costo_totale": costo_totale,
        "prezzo_vendita_atteso": p.prezzo_vendita_atteso,
        "plusvalenza_imponibile": plusvalenza,
        "imposta_plusvalenza": imposta_plusvalenza,
        "utile_netto": utile_netto,
        "capitale_investito": capitale_investito,
        "roi": roi,
        "roi_annualizzato": roi_annualizzato,
        "margine_su_vendita": (
            utile_netto / p.prezzo_vendita_atteso if p.prezzo_vendita_atteso else 0.0
        ),
        "mesi_totali": mesi_possesso,
    }


def _annualizza(roi: float, mesi: float) -> float:
    if mesi <= 0:
        return 0.0
    if roi <= -1.0:
        return -1.0
    return (1.0 + roi) ** (12.0 / mesi) - 1.0


def prezzo_di_pareggio(p: Parametri) -> float:
    """Prezzo di vendita che azzera l'utile netto, a costi dati.

    Non e' una formula chiusa: la provvigione e la plusvalenza dipendono dal
    prezzo di vendita. Si risolve per bisezione sul prezzo di vendita.
    """

    def utile_a(prezzo_vendita: float) -> float:
        copia = Parametri(**{**asdict(p), "prezzo_vendita_atteso": prezzo_vendita})
        return calcola(copia)["utile_netto"]

    basso, alto = 0.0, max(p.prezzo_vendita_atteso * 3.0, 100_000.0)
    if utile_a(alto) < 0:
        return float("inf")
    return _bisezione(utile_a, basso, alto)


def offerta_massima(p: Parametri, roi_target: float) -> float:
    """Prezzo massimo di aggiudicazione che tiene il ROI sopra la soglia.

    E' il numero che serve in sede d'asta: il prezzo oltre il quale si smette
    di rilanciare. Il ROI decresce al crescere del prezzo, quindi la bisezione
    e' ben definita.
    """

    def scarto(prezzo: float) -> float:
        return roi_target - calcola(p, prezzo_aggiudicazione=prezzo)["roi"]

    basso, alto = 1_000.0, max(p.prezzo_vendita_atteso, p.prezzo_base * 3.0, 10_000.0)
    if scarto(basso) > 0:
        # Nemmeno al prezzo minimo l'operazione regge il ROI richiesto.
        return 0.0
    if scarto(alto) < 0:
        return alto
    return _bisezione(scarto, basso, alto)


def _bisezione(f, basso: float, alto: float, tolleranza: float = 1.0) -> float:
    """Trova lo zero di f, monotona crescente su [basso, alto], al netto di 1 euro."""
    for _ in range(200):
        if alto - basso < tolleranza:
            break
        mezzo = (basso + alto) / 2.0
        if f(mezzo) < 0:
            basso = mezzo
        else:
            alto = mezzo
    return (basso + alto) / 2.0


def sensibilita(
    p: Parametri,
    scostamenti_vendita: tuple[float, ...] = (-0.15, -0.10, -0.05, 0.0, 0.05),
    scostamenti_lavori: tuple[float, ...] = (-0.10, 0.0, 0.10, 0.25),
) -> list[dict[str, float]]:
    """Griglia ROI al variare di prezzo di vendita e costo dei lavori.

    Sono le due variabili che affondano un flipping: il mercato che non tiene
    il prezzo ipotizzato, e il cantiere che costa piu' del preventivo.
    """
    righe = []
    for dv in scostamenti_vendita:
        for dl in scostamenti_lavori:
            variante = Parametri(
                **{
                    **asdict(p),
                    "prezzo_vendita_atteso": p.prezzo_vendita_atteso * (1.0 + dv),
                    "costo_mq": p.costo_mq * (1.0 + dl),
                }
            )
            r = calcola(variante)
            righe.append(
                {
                    "scostamento_vendita": dv,
                    "scostamento_lavori": dl,
                    "utile_netto": r["utile_netto"],
                    "roi": r["roi"],
                }
            )
    return righe


def carica(percorso: str) -> Parametri:
    with open(percorso, encoding="utf-8") as f:
        dati = json.load(f)
    validi = {k for k in Parametri.__dataclass_fields__}
    ignorati = set(dati) - validi
    if ignorati:
        raise ValueError(f"parametri non riconosciuti: {sorted(ignorati)}")
    return Parametri(**dati)


def _euro(x: float) -> str:
    return f"{x:>14,.0f} EUR".replace(",", ".")


def _pct(x: float) -> str:
    return f"{x * 100:>13.1f} %"


def stampa(p: Parametri, r: dict[str, float]) -> None:
    print(f"\n=== {p.riferimento} — {p.superficie_mq:.0f} mq ===\n")
    voci = [
        ("Prezzo di aggiudicazione", "prezzo_aggiudicazione"),
        ("Imposte di acquisto", "imposte_acquisto"),
        ("Oneri accessori acquisto", "costi_acquisto_accessori"),
        ("  Totale acquisto", "totale_acquisto"),
        ("Ristrutturazione (tutto incl.)", "totale_ristrutturazione"),
        ("Mantenimento e liberazione", "totale_mantenimento"),
        ("Oneri finanziari", "oneri_finanziari"),
        ("Costi di vendita", "costi_vendita"),
        ("  COSTO TOTALE", "costo_totale"),
        ("Prezzo di vendita atteso", "prezzo_vendita_atteso"),
        ("Imposta su plusvalenza", "imposta_plusvalenza"),
        ("  UTILE NETTO", "utile_netto"),
        ("Capitale proprio investito", "capitale_investito"),
    ]
    for etichetta, chiave in voci:
        print(f"{etichetta:<32}{_euro(r[chiave])}")
    print()
    print(f"{'ROI su capitale':<32}{_pct(r['roi'])}")
    print(f"{'ROI annualizzato':<32}{_pct(r['roi_annualizzato'])}")
    print(f"{'Margine su prezzo di vendita':<32}{_pct(r['margine_su_vendita'])}")
    print(f"{'Durata ipotizzata':<32}{r['mesi_totali']:>13.0f} mesi")
    pareggio = prezzo_di_pareggio(p)
    print(f"\n{'Prezzo di vendita di pareggio':<32}{_euro(pareggio)}")
    if p.prezzo_vendita_atteso:
        margine_sicurezza = 1.0 - pareggio / p.prezzo_vendita_atteso
        print(f"{'Margine di sicurezza sul prezzo':<32}{_pct(margine_sicurezza)}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    p = carica(argv[1])
    r = calcola(p)
    stampa(p, r)

    if "--offerta-massima" in argv:
        i = argv.index("--offerta-massima")
        target = float(argv[i + 1]) if len(argv) > i + 1 else 0.20
        massimo = offerta_massima(p, target)
        print(f"\n--- Soglia d'asta per ROI >= {target * 100:.0f}% ---")
        if massimo <= 0:
            print("Nessun prezzo rende l'operazione compatibile con il ROI richiesto.")
        else:
            print(f"{'Offerta massima':<32}{_euro(massimo)}")
            if p.prezzo_base:
                print(f"{'in % del prezzo base':<32}{_pct(massimo / p.prezzo_base)}")

    if "--sensibilita" in argv:
        print("\n--- Sensibilita' (ROI) ---")
        print(f"{'vendita':>10}{'lavori':>10}{'utile':>16}{'ROI':>10}")
        for riga in sensibilita(p):
            print(
                f"{riga['scostamento_vendita'] * 100:>9.0f}%"
                f"{riga['scostamento_lavori'] * 100:>9.0f}%"
                f"{riga['utile_netto']:>15,.0f}"
                f"{riga['roi'] * 100:>9.1f}%"
            )
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
