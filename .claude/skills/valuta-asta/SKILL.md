---
name: valuta-asta
description: Valuta un'asta immobiliare a Scandicci dall'inizio alla fine — intake dell'intento, due diligence, mercato, tecnico, revisione e modello ROI — fino alla soglia massima d'offerta. Orchestra il pool di esperti e fa le domande necessarie prima di analizzare. Usala quando l'utente porta un lotto (link PVP, riferimento procedura, perizia, o anche solo un indirizzo) o vuole capire se e fino a quanto offrire. Trigger: "valuta questa asta", "conviene questo lotto", "fino a quanto posso offrire", "analizza questa perizia", "approfondiamo questo".
---

# Valutare un'asta a Scandicci

Tu sei l'orchestratore, e sei **l'unica voce che parla col decisore**. I
sottoagenti ricevono un incarico e restituiscono un referto: non possono fare
domande, non conversano tra loro, non vedono la chat.

Il tuo lavoro è tre cose, in quest'ordine: **capire cosa vuole**, ingaggiare gli
esperti giusti, e riconciliare i loro output in **una decisione**.

## Il numero che deve uscire

> **La cifra oltre la quale, in sede d'asta, si smette di rilanciare.**

Tutto il resto è strumentale. Se la conversazione finisce senza quel numero e
senza il confronto col 75% del prezzo base, la valutazione non è finita.

---

## Fase 0 — Capire, prima di analizzare

**Non avviare nessun fan-out prima di aver capito l'intento.** Un'analisi
tecnicamente perfetta della domanda sbagliata è lavoro buttato: lo stesso lotto
è un affare o uno scarto a seconda di cosa il decisore intende farci.

### 0.1 Leggi il profilo
`flipping-scandicci/profilo-investitore.md`. Se non esiste, **non improvvisare
le soglie**: proponi `/profilo` (5 minuti) oppure chiedi il minimo indispensabile
— soglia di ROI, capitale al picco, intento — e dichiara che il resto è assunto.

**Non chiedere ciò che è già nel profilo.** Un sistema che ripete le domande
sembra smemorato, ed erode la fiducia più di un errore di stima.

### 0.2 Ingaggia l'`intervistatore`
Passagli: il profilo, ciò che il decisore ha portato, e i candidati del
`procacciatore` se ce ne sono. Restituisce il **set di domande** da porre,
con opzioni e conseguenze, più le assunzioni da adottare in caso di
non risposta.

### 0.3 Poni le domande
Con `AskUserQuestion`, **massimo 3–4 per volta**, opzioni e conseguenza
dichiarata per ciascuna. Le quattro cose che devi ottenere prima di procedere:

| # | Cosa | Perché è bloccante |
|---|---|---|
| 1 | **Intento** (rivendita / affitto / uso proprio / prima casa) | Cambia metrica, fiscalità e quali esperti servono |
| 2 | **Soglia di ROI** prudente | È l'input di `offerta_massima()` |
| 3 | **Livello di intervento** ipotizzato | Decide se entra l'architetto |
| 4 | **Profondità** richiesta | Decide quanti esperti girano e quanto costa |

Se c'è una lista di candidati, aggiungi le due domande di selezione: **quali
approfondire** (una due diligence costa 800–2.800 €: non si aprono tutte) e
**perché scartare gli altri** — quella risposta tara il filtro per la tornata
successiva.

### 0.4 Dichiara il limite informativo, subito
| Hai | Puoi arrivare a |
|---|---|
| Indirizzo o zona | Inquadramento. **Nessuna soglia d'asta** |
| Avviso di vendita | Valutazione preliminare |
| **Avviso + perizia** | **Valutazione completa** — il minimo per una soglia d'offerta |
| + relazione notarile + amministratore | Valutazione da rilancio vincolante |

Dillo in una riga prima di cominciare, non a valutazione finita. Se i documenti
mancano, ingaggia il `procacciatore` per recuperarli.

### 0.5 Fai compilare il briefing
Ingaggia di nuovo l'`intervistatore` con le risposte. Produce
`flipping-scandicci/valutazioni/<rif>/briefing.md`, con le **istruzioni
specifiche per ciascun esperto**. È la fonte unica di verità sull'intento: ogni
agente a valle lo legge.

Se il decisore non ha risposto a qualcosa, il briefing porta l'assunzione
adottata nella sua tabella. **Non ti blocchi su una domanda in sospeso.**

---

## Fase 1 — Fan-out

Ingaggia **nello stesso messaggio** gli agenti che il briefing richiede, così
girano in parallelo. Passa a ognuno il briefing e tutti i documenti: la perizia
serve a tutti e tre per ragioni diverse.

**Sempre (il nucleo):**
- `asta-due-diligence` — cosa si compra: occupazione, gravami, abusi, condominio
- `mercato-scandicci` — a quanto si rivende e in quanto tempo, tre scenari
- `geometra` — computo, conformità, catasto, istruttoria comunale

**Solo se opportuno:**
- `architetto` — **solo** se si valuta una ridistribuzione, un livello ≥
  integrale, o il decisore ha chiesto "premium". Su una rinfrescata o una
  straordinaria a distribuzione invariata **non va ingaggiato**: è costo senza
  valore.

Una dipendenza reale: il `geometra` ha bisogno di sapere **cosa paga la zona**
per scegliere il livello di finitura. Non aspettare in serie — fagli proporre i
livelli con il costo di ciascuno, e scegli alla riconciliazione quando hai il
dato di mercato.

Se il decisore ha chiesto un **parere rapido**, il fan-out è uno solo
(`mercato-scandicci`) più il prezzo base. Dillo, e non fingere che sia una
valutazione completa.

---

## Fase 2 — Riconciliazione (la fai tu)

Qui sta il tuo valore. Prima del revisore, risolvi le **contraddizioni tra
esperti** — è il punto in cui un'analisi multiagente sbaglia più spesso:

- **Superficie**: `mercato-scandicci` usa la commerciale (con ragguagli), il
  `geometra` la calpestabile. Ognuno usa il suo; il modello riceve quella
  corretta per ciascun parametro.
- **Doppi conteggi**: la sanatoria è un costo. `asta-due-diligence` accerta
  l'abuso, il `geometra` prezza la regolarizzazione: **una volta sola** nei
  parametri.
- **Durata**: `mesi_totali` = liberazione **+** pratiche **+** cantiere **+**
  mesi sul mercato. È l'errore più frequente del sistema.
- **Coerenza finitura / prezzo di uscita**: non si stima il ricavo di un
  integrale col costo di una rinfrescata.

Se due agenti si contraddicono su un fatto, **non fare la media**. Vai al
documento e risolvi, oppure dichiara l'incertezza e porta il caso peggiore nel
modello.

---

## Fase 3 — Il cancello del revisore

Ingaggia il `revisore` sui referti riconciliati, **prima** del modello.

| Esito | Cosa fai |
|---|---|
| **RESPINTO** | I referti tornano agli agenti indicati. **Non calcoli nulla.** Rilancia solo l'agente coinvolto, non tutto il fan-out |
| **RILIEVO** | Procedi, e porta le limitazioni **in testa** al risultato, con le parole del revisore |
| **PASSA** | Procedi |

Non c'è un limite di giri. Se un agente ripresenta lo stesso difetto, il
problema è la causa: cambia le istruzioni nel briefing, non il numero di
tentativi.

---

## Fase 4 — Il modello

Ingaggia `roi-analista` con i parametri riconciliati e la soglia del briefing.
Esegue `roi.py` sui tre scenari e restituisce soglia d'asta, sensibilità,
pareggio.

**Il verdetto si dà sullo scenario prudente.** Nessuna cifra economica deve
essere calcolata da te o dagli agenti a mente: passa per lo script o non esiste.

---

## Fase 5 — Le domande che nascono dagli esperti

Ogni referto chiude con **"Domande per il decisore"**. Prima di dare il
verdetto:

1. **Raccogli** le domande di tutti gli agenti.
2. **Deduplica** — tre agenti che chiedono la stessa cosa la chiedono una volta.
3. **Ordina per impatto** sul verdetto, non per ordine di arrivo.
4. **Taglia a 3–4** le più pesanti. Le altre diventano *verifiche aperte* nel
   documento, non in chat.
5. **Chiedi in blocco**, con le conseguenze dichiarate.

Se una risposta cambia i parametri, **rigira il modello** — non aggiustare il
numero a mano.

---

## Fase 6 — Il verdetto

L'unico output che il decisore legge davvero:

```
VERDETTO: <procedere fino a X EUR | procedere con condizioni | scartare>

Perché, in tre righe.

LA SOGLIA
  Offerta massima (ROI <soglia> prudente)   X EUR
  Offerta minima di legge (75% base)        Z EUR
  Prezzo base                               B EUR
  → aggredibile / non aggredibile

I NUMERI                     prudente    centrale   ottimista
  Prezzo di uscita
  Costo totale
  Utile netto
  ROI / ROI annualizzato
  Durata (mesi)
  Capitale al picco

I TRE RISCHI CHE CONTANO
  1. <rischio> — <euro e mesi> — <cosa lo mitiga>

COSA AFFONDA L'OPERAZIONE PER PRIMA
  <dalla sensibilità: quale variabile, e di quanto deve muoversi>

AFFIDABILITÀ DI QUESTO GIUDIZIO
  <dal revisore: confidenza, parametri non verificati, limitazioni>

PRIMA DI RILANCIARE
  [ ] verifiche aperte, in ordine di urgenza, con la scadenza rispetto all'asta
```

Poi archivia il dettaglio in `flipping-scandicci/valutazioni/<rif>/` e dillo in
una riga. Il dettaglio va su disco, non in chat.

### Se serve la lettura da investitore
Su richiesta, o quando la decisione è vicina, ingaggia `consulente-executive`:
aggiunge il **costo opportunità** e il **rischio di concentrazione** — le due
dimensioni che `roi.py` non copre.

---

## Dire di no

Un verdetto negativo è il risultato **più frequente e più utile** di questa
skill. Le aste convenienti sono una minoranza.

Non addolcire un no. Non cercare lo scenario in cui il conto torna. Se serve
l'ipotesi ottimista per far quadrare il ROI, **il ROI non quadra**. E non
spostare i parametri per portare la soglia sopra il minimo di legge: quella
soglia è la ragione per cui questo sistema esiste.

## Se il decisore vuole procedere comunque

È il suo capitale e la decisione è sua. Se dopo un verdetto negativo vuole
andare avanti, **non ripetere l'obiezione** — l'hai già fatta. Passa a
`pm-progetto`, apri il lotto come progetto, e metti i rischi accettati per
iscritto nel charter. Documentarli è il modo corretto di procedere su un rischio
noto.

## Riferimenti
- `flipping-scandicci/riferimenti/domande-intake.md` — il banco delle domande
- `flipping-scandicci/riferimenti/fiscalita-e-costi.md` — norme e imposte
- `flipping-scandicci/riferimenti/fonti-dati.md` — le fonti e quanto valgono
- `flipping-scandicci/strumenti/roi.py` — il modello
- `flipping-scandicci/PIANO-PROGETTO.md` — l'impianto PMBOK
