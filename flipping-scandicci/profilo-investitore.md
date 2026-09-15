# Profilo investitore

Versione 1 — 15 settembre 2026
Comune di Scandicci (FI) — Tribunale di Firenze

Questo documento è il **charter** del progetto (§1 di `PIANO-PROGETTO.md`) e la
base che ogni esperto legge prima di lavorare. Le soglie qui fissate entrano in
`offerta_massima()` e determinano il tetto d'offerta in asta.

---

## Capitale

| Voce | Valore |
|---|---|
| Disponibile al picco | **200.000 – 350.000 €** |
| Leva finanziaria | nessuna assunta — `[DA CONFERMARE]` |
| Tempo di mobilitazione | `[DA REPERIRE]` — vincolante per il saldo |

**Capienza verificata.** Il picco di esposizione richiesto dalle operazioni in
perimetro (calcolato con `roi.py`, uscita 3.200 €/mq):

| | 70 mq | 110 mq |
|---|---|---|
| Rinfrescata | 167.000 € | 264.000 € |
| Straordinaria | 167.000 € | 264.000 € |

Entrambi dentro la fascia dichiarata, con margine sui tagli medi.

> **Vincolo duro da presidiare (rischio R5).** Il termine di saldo è tipicamente
> **120 giorni dall'aggiudicazione e non è prorogabile**. Fra la cauzione (10%
> dell'offerta) e il saldo passano poche settimane, in cui vanno mobilitati
> oltre 100.000 €. Mancare quel termine significa perdere **cauzione e
> immobile**. Il tempo di mobilitazione va accertato prima della prima offerta,
> non dopo (task F4.7).

---

## Obiettivi — criteri di successo

| Metrica | Soglia |
|---|---|
| ROI su capitale, **scenario prudente** | **≥ 20%** |
| Durata dall'aggiudicazione all'incasso | **≤ 12 mesi** *(vincolo rigido)* |
| Capitale massimo al picco | 350.000 € |
| Margine di sicurezza sul prezzo di uscita | ≥ 12% |

**Metrica prevalente: ROI annualizzato.** *(assunta, non dichiarata
esplicitamente — vedi Punti aperti)* La scelta di un orizzonte rigido a 12 mesi
implica che conti il rendimento per unità di tempo, non il margine assoluto.

---

## Intento

**Rivendita dopo ristrutturazione.** È il perimetro nativo del sistema: modello
ROI, tre scenari di uscita, plusvalenza infra-quinquennale.

Conseguenze fiscali attive:
- Imposta di registro **9%** + 100 € fisse (non prima casa)
- **Plusvalenza tassata**: opzione per l'imposta sostitutiva **26%**, da
  dichiarare **in atto** dal notaio (task F9.7 — si esercita in quel momento e
  non si recupera dopo)
- Valutare il **prezzo-valore** su base catastale in F6.3, se più favorevole

---

## Tolleranza

| Dimensione | Posizione |
|---|---|
| **Immobile occupato dal debitore** | **Escluso** — solo immobili liberi |
| Livello massimo di cantiere | Straordinaria (distribuzione invariata) |
| Livello preferito | **Rinfrescata** |
| Invenduto oltre 3 mesi | `[DA DEFINIRE]` — gate G6 |

### Conflitto risolto in sede di intervista

Le risposte iniziali contenevano una contraddizione: *"12 mesi di orizzonte"* e
*"immobili occupati accettati se prezzati"*. Non stanno insieme.

Scomposizione di una durata a 12 mesi su un immobile occupato:

| Fase | Mesi |
|---|---|
| Pratiche edilizie | 1–2 |
| Cantiere (straordinaria) | 4–5 |
| Vendita | 3–4 |
| **Restano per la liberazione** | **1–4** — contro i **3–18 tipici** |

**Decisione del decisore: si tengono i 12 mesi.** Di conseguenza gli immobili
occupati sono **esclusi dal perimetro**, non prezzati.

Effetto misurato sullo stesso lotto allo stesso prezzo: a 18 mesi il ROI
annualizzato scende dal 20% al **12,9%**. È la ragione numerica della scelta.

**Costo della scelta, dichiarato:** si scarta circa metà dei lotti disponibili,
e si elimina il rischio **R1** (liberazione), che è il rischio strutturale
dell'asta — alto in probabilità, alto in impatto e con residuo alto anche dopo
tutte le mitigazioni.

---

## Forma dell'acquisto

**Persona fisica.** È lo scenario che `roi.py` copre. Nessun adattamento del
modello richiesto.

> Se in futuro si valutasse l'acquisto tramite società, il modello va **rifatto
> col commercialista**: IVA detraibile, immobile come merce, utile tassato come
> reddito d'impresa invece che plusvalenza. Non è una variante, è un altro
> progetto (`PIANO-PROGETTO.md` §11).

---

## Perimetro

**Geografia:** tutto il Comune di Scandicci. Nessun filtro di zona in questa
fase — il vincolo effettivo è la scarsità di lotti liberi in buono stato, non
la geografia. Il `procacciatore` riporta comunque la **zona omogenea** di ogni
candidato, perché il prezzo di uscita si stima per zona.

**Tipologia:** qualsiasi taglio residenziale, **incluse unità indipendenti e
villette**.

Nota sulle unità indipendenti: nessuna esposizione ex art. 63 disp. att. c.c.
(arretrati condominiali e lavori deliberati) — che è il rischio **R6** eliminato
— ma imprevisti strutturali più alti e mercato più sottile in uscita. Il
`geometra` è istruito ad alzare la riserva imprevisti su questa tipologia.

**Esclusioni assolute:**
- Immobili **occupati** (da debitore o terzi)
- Locazione opponibile, quota indivisa, diritti reali di terzi
- Abusi **non sanabili**
- Interventi che richiedano **ridistribuzione** o livelli superiori alla
  straordinaria
- Terreni, box isolati, immobili commerciali e produttivi

---

## Risorse

| Ruolo | Stato |
|---|---|
| Tecnico (geometra / architetto) | **disponibile** |
| Impresa esecutrice | **da individuare** — 4–6 settimane in F0 |
| Legale esecuzioni | da individuare |
| Commercialista | da individuare |
| Agenzia immobiliare | da individuare |

Il tecnico disponibile è un vantaggio operativo concreto: permette il
**sopralluogo con il custode prima dell'asta**, che è la verifica che alza di
più la confidenza del computo (task F3.6 e F3.8).

L'impresa mancante è rilevante con un orizzonte di 12 mesi: senza impresa pronta
si perdono **4–6 settimane** fra capitolato, gare e contratto. Va nel
cronoprogramma di F0, non scoperto in F8.

---

## Soglie di screening derivate

Filtro che il `procacciatore` applica: **il prezzo base al mq deve stare sotto
la soglia**. Tutti gli immobili sono liberi per perimetro; ROI target 20%
sullo scenario prudente.

### Binario preferito — rinfrescata (250 €/mq, 9 mesi)

| Uscita €/mq | 70 mq | % uscita | 110 mq | % uscita |
|---|---|---|---|---|
| 2.600 | 1.693 | 65% | 1.794 | 69% |
| 2.900 | 1.971 | 68% | 2.072 | 71% |
| 3.200 | 2.250 | 70% | 2.351 | 73% |
| 3.500 | 2.528 | 72% | 2.629 | 75% |

ROI annualizzato al tetto d'offerta: **27,5%**

### Binario accettato — straordinaria (600 €/mq, 12 mesi)

| Uscita €/mq | 70 mq | % uscita | 110 mq | % uscita |
|---|---|---|---|---|
| 2.600 | 1.009 | 39% | 1.135 | 44% |
| 2.900 | 1.288 | 44% | 1.413 | 49% |
| 3.200 | 1.566 | 49% | 1.691 | 53% |
| 3.500 | 1.844 | 53% | 1.970 | 56% |

ROI annualizzato al tetto d'offerta: **20,0%**

### Come si leggono
1. Il `procacciatore` colloca il lotto nella sua **zona omogenea** e ne ricava
   il €/mq del ristrutturato per quella zona.
2. Sceglie la riga di uscita più vicina e la colonna di metratura.
3. Confronta il **prezzo base al mq** del lotto con la soglia.
4. Sopra soglia → scarto. Sotto soglia → candidato, non affare.

I costi fissi non scalano coi metri quadri: **le metrature maggiori hanno una
soglia percentuale più generosa.** Per metrature intermedie o valori di uscita
diversi, ricalcolare:

```bash
python3 flipping-scandicci/strumenti/soglie.py --uscita-mq <X> --roi 0.20 \
        --mq <mq> --libero --costo-mq <250 o 600>
```

### Osservazione strategica: dove si è spostato il rischio

La rinfrescata è **più efficiente per mese e per euro** — 27,5% annualizzato
contro 20% — perché l'operazione è più breve e più leggera. Il filtro è anche
più permissivo (70% del valore di uscita contro 49%).

Ma lo sconto in asta viene da tre cose: **occupazione, cattivo stato,
complessità legale.** Questo profilo esclude la prima, preferisce evitare la
seconda e scarta la terza.

**Conseguenza:** il collo di bottiglia non è l'economia dell'operazione, è il
**flusso di lotti**. Gli immobili liberi e in buono stato sono la categoria più
rara e più contesa in asta. Il rischio dominante di questo profilo non è **R2**
(sforo di cantiere) né **R1** (liberazione, eliminato): è **R13** —
*aggiudicazione a un rilancio superiore di terzi*.

Va gestito così:
- mettere in conto **tornate senza un solo candidato**: è il funzionamento
  normale di questo profilo, non un malfunzionamento;
- il binario "straordinaria accettata" è la valvola che allarga il flusso
  quando la rinfrescata non produce candidati;
- la disciplina sul tetto d'offerta (**R8**) diventa ancora più critica: su
  lotti contesi la tentazione di superare la soglia è massima.

---

## Punti aperti

| # | Punto | Assunzione adottata | Impatto se sbagliata |
|---|---|---|---|
| 1 | **Valori €/mq reali per zona di Scandicci** | Soglie parametrizzate su 2.600–3.500 €/mq | Alto: sposta tutte le soglie. Prima azione di `mercato-scandicci` in F1 |
| 2 | Tempo di mobilitazione del capitale | Non accertato | **Critico (R5)**: da confermare prima della prima offerta |
| 3 | Metrica prevalente | Assunta **annualizzata**, dedotta dall'orizzonte rigido | Medio: cambia la preferenza fra operazioni brevi e margini assoluti |
| 4 | Leva finanziaria | Assunta nessuna | Medio: la leva riduce il capitale proprio e alza il ROI, ma aggiunge oneri |
| 5 | Politica su invenduto oltre 3 mesi | Non definita | Medio: è la decisione del gate G6 |
| 6 | Costo/mq reale per rinfrescata e straordinaria | 250 e 600 €/mq parametrici | Alto sulle soglie. Da tarare con due preventivi reali del tecnico |

**Priorità:** i punti 1 e 2 vanno chiusi prima di una qualsiasi offerta
vincolante. Il punto 1 è il primo incarico da dare a `mercato-scandicci`; il
punto 2 dipende solo dal decisore.

---

## Prossimi passi

1. `mercato-scandicci` — mappare i €/mq per zona omogenea di Scandicci e
   sostituire le soglie parametriche con quelle reali *(chiude il punto aperto 1)*
2. `/monitora-aste` con `/loop 1d` — avviare la sorveglianza sulle
   pubblicazioni, filtro sui soli immobili liberi
3. Accertare il tempo di mobilitazione del capitale *(chiude il punto 2)*
4. Individuare l'impresa esecutrice *(4–6 settimane, non rinviabile a F8)*
