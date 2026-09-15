---
name: valuta-asta
description: Valuta un'asta immobiliare a Scandicci dall'inizio alla fine — due diligence, mercato, cantiere, modello ROI e soglia massima d'offerta — orchestrando gli agenti specializzati. Usala quando l'utente porta un lotto (link PVP, riferimento procedura, perizia, o anche solo un indirizzo) e vuole sapere se conviene e fino a quanto rilanciare. Trigger: "valuta questa asta", "conviene questo lotto", "fino a quanto posso offrire", "analizza questa perizia", "quanto vale questo immobile all'asta".
---

# Valutare un'asta a Scandicci

Questa skill orchestra la squadra. Tu sei il coordinatore: non fai il lavoro dei
sottoagenti, li ingaggi, ne riconcili gli output e porti all'utente **una
decisione**, non cinque referti.

## Il numero che deve uscire

Ogni valutazione converge su una cosa sola:

> **la cifra oltre la quale, in sede d'asta, si smette di rilanciare.**

Tutto il resto è strumentale. Se la conversazione finisce senza quel numero e
senza il suo confronto col 75% del prezzo base, la valutazione non è finita.

## Fase 0 — Cosa abbiamo in mano

Prima di ingaggiare chiunque, stabilisci il livello di informazione:

| Hai | Puoi arrivare a |
|---|---|
| Solo un indirizzo o una zona | Inquadramento di mercato. Nessuna soglia d'asta. |
| Avviso di vendita | Prezzo base, offerta minima, termini. Valutazione preliminare. |
| **Avviso + perizia del CTU** | Valutazione completa. È il minimo per una soglia d'offerta. |
| + relazione notarile + amministratore | Valutazione da rilancio vincolante. |

Dillo all'utente in una riga, subito: *"con questi documenti arrivo a una stima
preliminare; per una soglia su cui rilanciare serve la perizia"*. Non far
scoprire il limite a valutazione finita.

Se mancano i documenti, ingaggia **`asta-scout`** per recuperarli.

## Fase 1 — Fan-out (in parallelo)

Tre agenti lavorano su assi indipendenti. **Ingaggiali nello stesso messaggio**,
così girano insieme:

- **`asta-due-diligence`** — cosa si compra davvero: occupazione, gravami,
  abusi, condominio. Restituisce rischi con euro e mesi.
- **`mercato-scandicci`** — a quanto si rivende e in quanto tempo. Tre scenari.
- **`cantiere-stima`** — cosa va fatto e quanto costa. Livello di intervento.

Passa a ognuno **tutti** i documenti disponibili: la perizia serve a tutti tre
per ragioni diverse.

Una dipendenza reale da gestire: `cantiere-stima` ha bisogno di sapere **cosa
paga la zona** per scegliere il livello di finitura. Se gli scenari di mercato
non sono ancora pronti, fagli proporre i tre livelli con il costo di ciascuno,
e scegli dopo, quando hai il dato di mercato. Non aspettare in serie: raccogli
le alternative e decidi alla riconciliazione.

## Fase 2 — Riconciliazione (la fai tu)

Qui sta il tuo valore aggiunto. Prima di passare al modello, controlla le
**contraddizioni tra agenti** — è il punto in cui un'analisi multiagente
sbaglia più spesso:

- **Superficie**: quella usata da `mercato-scandicci` (commerciale, con
  ragguagli) e quella di `cantiere-stima` (calpestabile) sono numeri diversi.
  Verifica che ognuno usi il suo, e che il modello riceva quello giusto.
- **Doppi conteggi**: la sanatoria è un costo. `asta-due-diligence` accerta
  l'abuso, `cantiere-stima` prezza la regolarizzazione. Deve comparire **una
  volta sola** nei parametri.
- **Durata**: `mesi_totali` del modello deve contenere liberazione **+** pratiche
  **+** cantiere **+** mesi sul mercato. È l'errore più frequente: si mette solo
  il cantiere e il ROI annualizzato esce gonfiato.
- **Livello di finitura coerente** col prezzo di uscita ipotizzato: non si
  può stimare il ricavo di un ristrutturato integrale e il costo di una
  rinfrescata.

Se due agenti si contraddicono su un fatto, **non fare la media**. Vai al
documento e risolvi, o dichiara l'incertezza e porta il caso peggiore nel modello.

## Fase 3 — Modello

Ingaggia **`roi-analista`** con i parametri riconciliati. Esegue `roi.py` sui
tre scenari e restituisce soglia d'asta, sensibilità, pareggio.

**Il verdetto si dà sullo scenario prudente.**

Nessun numero economico deve essere calcolato da te o dagli altri agenti a
mente: passa per lo script o non esiste.

## Fase 4 — Verdetto all'utente

Questo è l'unico output che l'utente legge davvero. Struttura:

```
VERDETTO: <procedere fino a X EUR | procedere con condizioni | scartare>

Perché, in tre righe.

LA SOGLIA
  Offerta massima (ROI 20% prudente)   X EUR
  Offerta minima di legge (75% base)   Z EUR
  Prezzo base                          B EUR
  → aggredibile / non aggredibile

I NUMERI                     prudente    centrale   ottimista
  Prezzo di uscita
  Costo totale
  Utile netto
  ROI / ROI annualizzato
  Durata (mesi)

I TRE RISCHI CHE CONTANO
  1. <rischio> — <impatto in euro e mesi> — <cosa lo mitiga>
  2. ...
  3. ...

COSA AFFONDA L'OPERAZIONE PER PRIMA
  <dalla sensibilità: quale variabile, e di quanto deve muoversi>

PRIMA DI RILANCIARE
  [ ] verifiche aperte, in ordine di urgenza, con la scadenza rispetto all'asta

CONFIDENZA: alta / media / bassa — e perché
```

Poi archivia l'analisi completa in
`flipping-scandicci/valutazioni/<riferimento>/` e dillo all'utente in una riga.
Il dettaglio va su disco, non nella chat.

## Dire di no

Un verdetto negativo è il risultato **più frequente e più utile** di questa
skill. Le aste convenienti sono una minoranza: la maggior parte dei lotti ha un
prezzo base fuori mercato, un'occupazione che divora il rendimento, o un vizio
che il mercato ha già rifiutato.

Non addolcire un no. Non cercare uno scenario in cui il conto torna. Se serve
l'ipotesi ottimista per far quadrare il ROI, **il ROI non quadra**.

E non spostare i parametri per far arrivare la soglia sopra il minimo di legge:
quella soglia è la ragione per cui questo sistema esiste.

## Se l'utente vuole procedere comunque

È la sua operazione e il suo capitale: la decisione è sua, non tua. Se dopo un
verdetto negativo vuole andare avanti, non ripetere l'obiezione — l'hai già fatta.
Passa a **`pm-progetto`**, apri il lotto come progetto e struttura le fasi, con
i rischi accettati messi per iscritto nel charter.

Metterli nero su bianco è il modo corretto di procedere su un rischio noto:
non è un avvertimento, è documentazione.

## Riferimenti
- `flipping-scandicci/riferimenti/fiscalita-e-costi.md` — norme, imposte, regole d'asta
- `flipping-scandicci/riferimenti/fonti-dati.md` — dove si prendono i dati
- `flipping-scandicci/strumenti/roi.py` — il modello
- `flipping-scandicci/PIANO-PROGETTO.md` — l'impianto PMBOK del progetto
