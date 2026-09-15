# Dove si prendono i dati — fonti e loro affidabilità

Regola che governa tutti gli agenti di questo progetto:

> **Un numero senza fonte non entra in un documento.**
> Se il dato non si trova, si scrive `[DA REPERIRE: <cosa>, <dove>]` e si va
> avanti. Non si stima "a sentimento" un €/mq, un tempo di vendita o
> un'aliquota.

---

## 1. Aste — dove si trovano gli immobili

| Fonte | Cosa dà | Note |
|---|---|---|
| **PVP — Portale delle Vendite Pubbliche** (`pvp.giustizia.it`) | La fonte **legale** e completa: ogni vendita deve esservi pubblicata | Interfaccia di ricerca scomoda ma è l'unica autorevole. Filtrare per Tribunale di Firenze + comune Scandicci |
| **astegiudiziarie.it** | Annunci, perizie, avvisi scaricabili | Gestore autorizzato, buona copertura Toscana |
| **astalegale.net** | Annunci + documentazione | Gestore autorizzato |
| **Tribunale di Firenze** | Ordinanze di delega, calendario | Utile per capire la prassi del foro |
| **Portali generalisti** (immobiliare.it / idealista sezione aste) | Comodi per il monitoraggio | **Non autorevoli**: dati a volte stantii. Verificare sempre su PVP |

**Attenzione al "già venduto".** Le aste deserte vengono ribassate e ripubblicate.
Un immobile al terzo o quarto esperimento ha un prezzo base molto più basso —
e spesso una ragione precisa per cui nessuno l'ha comprato. Cercarla.

**Documenti da scaricare per ogni lotto, sempre:**
1. **Avviso di vendita** — prezzo base, offerta minima, cauzione, rilancio, termine saldo
2. **Perizia di stima del CTU** — il documento più importante: stato, conformità, occupazione, comparabili del perito
3. **Ordinanza di delega** — chi è il delegato, quali oneri a carico dell'aggiudicatario
4. **Relazione notarile / ispezione ipotecaria** — gravami da cancellare
5. **Planimetrie catastali**

---

## 2. Valori di mercato a Scandicci

| Fonte | Cosa dà | Affidabilità |
|---|---|---|
| **OMI — Agenzia delle Entrate** (`agenziaentrate.gov.it`, banca dati quotazioni) | Fasce €/mq **min–max** per zona omogenea, per tipologia e stato conservativo, aggiornate a semestre | **Riferimento istituzionale.** Fasce ampie: utili come limite, non come stima puntuale |
| **Borsino Immobiliare** | €/mq per microzona | A pagamento, granularità migliore |
| **immobiliare.it / idealista** — report di zona | Prezzi **richiesti** e andamento | Utile per il trend e per i tempi di vendita. **I prezzi richiesti non sono prezzi realizzati**: lo scarto tipico è significativo |
| **Agenzie locali di Scandicci** | Comparabili **realizzati**, tempi reali di assorbimento | La fonte migliore e la più difficile da ottenere. Due o tre agenzie, non una |
| **Perizie CTU di altri lotti nella stessa zona** | Comparabili valutati da un tecnico giurato | Sottovalutato: le perizie sono pubbliche e contengono comparabili motivati |

**Le zone di Scandicci non sono un blocco unico.** Prima di qualsiasi €/mq va
fissata la **zona omogenea OMI** del lotto. Centro, Casellina, Vingone,
San Giusto, Le Bagnese, Badia a Settimo, la fascia collinare verso Mosciano e
Scandicci Alto: profili di prezzo e di domanda diversi.

**Fattore trasversale da verificare per ogni lotto:** distanza dalle fermate
della tramvia T1 e accessibilità verso Firenze. A Scandicci pesa sul prezzo e
soprattutto sui **tempi di vendita**.

---

## 3. Costi di costruzione e ristrutturazione

| Fonte | Note |
|---|---|
| **Prezzario Regione Toscana** per i lavori pubblici | Base tecnica seria, tende a stare **sopra** il prezzo di mercato privato |
| **Preventivi reali di imprese fiorentine** | **La fonte che conta.** Minimo due, su computo metrico dello stesso capitolato |
| **Camera di Commercio / collegi (geometri, ingegneri)** | Riferimenti per onorari tecnici |

Le medie €/mq trovate online servono **solo** a impostare un primo scenario.
Prima di un rilancio vincolante serve un sopralluogo tecnico e un preventivo.

---

## 4. Dati comunali di Scandicci

- **Comune di Scandicci** — delibere IMU (aliquota seconda casa), oneri di
  costruzione, regolamento edilizio
- **Ufficio urbanistica / SUE** — vincoli, strumenti urbanistici, sanabilità
- Vincoli **paesaggistici e storici** rilevanti nella fascia collinare e nei
  nuclei storici: cambiano tempi e costi delle pratiche

---

## 5. Come si cita

Nei documenti prodotti, ogni numero porta con sé la sua provenienza:

    Prezzo di vendita atteso: 260.000 EUR
    Fonte: OMI Firenze zona D4, semestre 1/2026, fascia 2.900–3.800 EUR/mq,
    stato "normale"; assunto 3.400 EUR/mq su 76 mq commerciali.
    Confronto: 2 comparabili realizzati via agenzia X (3.250 e 3.500 EUR/mq).
    Confidenza: media. Da riverificare con terzo comparabile.

Tre elementi obbligatori: **fonte**, **data**, **livello di confidenza**
(alta / media / bassa).
