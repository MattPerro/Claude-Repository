#!/usr/bin/env python3
"""Test delle soglie di screening. `python3 test_soglie.py`.

La soglia di screening e' il filtro che il procacciatore applica su ogni lotto
senza avere la perizia. Se sbaglia verso l'alto, si spendono due diligence su
lotti impossibili; se sbaglia verso il basso, si scartano affari. Questi test
fissano le proprieta' che la soglia deve rispettare.
"""

from __future__ import annotations

from soglie import QUOTA_MINIMA_LEGGE, soglia_screening, tabella
from roi import calcola

FALLITI: list[str] = []


def verifica(nome: str, condizione: bool, dettaglio: str = "") -> None:
    if condizione:
        print(f"  ok   {nome}")
    else:
        print(f"  FAIL {nome} {dettaglio}")
        FALLITI.append(nome)


# Uscita di riferimento: 3.214 EUR/mq, lo stesso valore del caso illustrativo
# del PIANO-PROGETTO (225.000 EUR prudenziali su 70 mq).
USCITA = 3214.0


def test_roi_piu_alto_abbassa_la_soglia() -> None:
    precedente = float("inf")
    for t in (0.10, 0.15, 0.20, 0.25, 0.30):
        s = soglia_screening(t, USCITA)["base_massimo_mq"]
        verifica(
            f"soglia a ROI {t:.0%} sotto quella a ROI inferiore",
            s < precedente,
            f"{s:.0f} vs {precedente:.0f}",
        )
        precedente = s


def test_libero_vale_piu_di_occupato() -> None:
    occ = soglia_screening(0.25, USCITA, libero=False)["base_massimo_mq"]
    lib = soglia_screening(0.25, USCITA, libero=True)["base_massimo_mq"]
    verifica("un immobile libero regge un prezzo base piu' alto", lib > occ,
             f"libero {lib:.0f} vs occupato {occ:.0f}")
    # Il premio per il libero e' sostanziale: e' la fase F7 che scompare.
    verifica("il premio per il libero e' almeno il 5%", lib / occ >= 1.05,
             f"rapporto {lib / occ:.3f}")


def test_valore_noto_al_25_percento() -> None:
    """Il valore documentato nel PIANO-PROGETTO: ~40% dell'uscita, occupato."""
    r = soglia_screening(0.25, USCITA, mq=70.0, libero=False)
    verifica(
        "a ROI 25% la soglia e' ~40% del prezzo di uscita",
        0.38 <= r["quota_su_uscita"] <= 0.42,
        f"ottenuto {r['quota_su_uscita']:.1%}",
    )


def test_lavori_piu_cari_abbassano_la_soglia() -> None:
    economico = soglia_screening(0.20, USCITA, costo_mq=450.0)["base_massimo_mq"]
    costoso = soglia_screening(0.20, USCITA, costo_mq=900.0)["base_massimo_mq"]
    verifica("lavori piu' cari abbassano la soglia", costoso < economico,
             f"{costoso:.0f} vs {economico:.0f}")


def test_uscita_piu_alta_alza_la_soglia() -> None:
    bassa = soglia_screening(0.20, 2600.0)["base_massimo_mq"]
    alta = soglia_screening(0.20, 3800.0)["base_massimo_mq"]
    verifica("una zona piu' cara regge un prezzo base piu' alto", alta > bassa,
             f"{alta:.0f} vs {bassa:.0f}")


def test_coerenza_col_minimo_di_legge() -> None:
    """Il prezzo base massimo deve essere l'offerta massima diviso 0,75."""
    r = soglia_screening(0.20, USCITA)
    atteso = r["offerta_massima"] / QUOTA_MINIMA_LEGGE
    verifica(
        "prezzo base massimo = offerta massima / 75%",
        abs(r["prezzo_base_massimo"] - atteso) < 1.0,
        f"{r['prezzo_base_massimo']:.0f} vs {atteso:.0f}",
    )


def test_la_soglia_riproduce_il_roi() -> None:
    """Offrendo il 75% del prezzo base massimo si deve ottenere il ROI target."""
    from soglie import _parametri

    for target in (0.15, 0.25):
        r = soglia_screening(target, USCITA)
        p = _parametri(USCITA, 70.0, False, 600.0)
        offerta = r["prezzo_base_massimo"] * QUOTA_MINIMA_LEGGE
        roi = calcola(p, prezzo_aggiudicazione=offerta)["roi"]
        verifica(
            f"offrendo il minimo di legge si ottiene ROI {target:.0%}",
            abs(roi - target) < 0.005,
            f"ROI ottenuto {roi:.3%}",
        )


def test_roi_irraggiungibile_non_e_aggredibile() -> None:
    # Un ROI del 200% non e' ottenibile a nessun prezzo positivo sensato.
    r = soglia_screening(2.0, USCITA)
    verifica("un ROI irraggiungibile restituisce non aggredibile",
             r["aggredibile"] == 0.0 or r["base_massimo_mq"] < 300.0,
             f"soglia {r['base_massimo_mq']:.0f}")


def test_tabella_completa() -> None:
    t = tabella(USCITA)
    verifica("la tabella ha 10 righe (5 ROI x 2 stati)", len(t) == 10, str(len(t)))
    verifica("ogni riga ha la quota sull'uscita",
             all("quota_su_uscita" in r for r in t))
    verifica("tutte le quote sono frazioni sensate",
             all(0.0 <= r["quota_su_uscita"] <= 1.0 for r in t))


def main() -> int:
    test = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    print(f"\nSoglie di screening — {len(test)} gruppi di test\n")
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
