# TRAINING_MODEL.md — Il modello di allenamento di TrackStrong

Come il programma è rappresentato nei dati, che cosa è stato deciso e su quale
base.

Data di scrittura: **2026-09-19**.

> ## Avvertenza, prima di tutto il resto
>
> Questo percorso è una **struttura progettuale**, scritta e rivista da agenti
> AI. **Non è clinicamente certificato**, non è stato validato da professionisti
> sanitari abilitati e non sostituisce il parere di un medico o di un istruttore
> qualificato.
>
> Le prime 12 settimane sono **la scheda fornita dall'utente** (vedi `SPEC.md`
> §3): l'app le riproduce, non le ha progettate.
>
> Il piano dal terzo mese in poi è una proposta di organizzazione del lavoro. Le
> affermazioni di metodo che contiene sono classificate esplicitamente, più
> sotto, fra **regole progettuali** (scelte nostre, discutibili) e **criteri con
> fonte** (con citazione e data di verifica).

---

## 1. I quattro livelli

| Livello | Tipo TS | Contenuto |
|---|---|---|
| 1 — Anno | `ProgramYear` | obiettivi annuali e avvertenza |
| 2 — Blocco | `ProgramBlock` | finalità, durata, criteri di ingresso e revisione, politica di interruzione |
| 3 — Settimana | `ProgramWeek` | due sedute A/B, nota della settimana, flag di scarico |
| 4 — Prescrizione | `ExercisePrescription` | serie, intervallo, metrica, lato, margine, recupero, convenzione di carico, alternative, priorità di tempo |

Codice: `packages/core/src/domain/program.ts`, `packages/core/src/domain/prescription.ts`.

---

## 2. Quattro stati di un numero, che non vanno confusi

Questa distinzione è il centro del modello (`SPEC.md` §7):

| Stato | Dove vive | Alimenta i progressi? |
|---|---|---|
| **Prescritto** | `ExercisePrescription` | no |
| **Suggerito** | `CoachProposal` | **no** |
| **Precompilato** | campo dell'interfaccia | **no** |
| **Eseguito** | `PerformedSet` con `status: 'completed'` e `role: 'working'` | **sì, solo questo** |

`extractExposures()` (in `engine/exposure.ts`) legge **solo** l'ultima colonna.
Bozze, serie annullate, serie saltate e serie di riscaldamento non entrano.

Il ruolo di una serie è un **tipo** (`SetRole = 'warmup' | 'working'`), non un
booleano opzionale: una serie di riscaldamento non può essere dimenticata e
finire per sbaglio nei conteggi.

---

## 3. Convenzioni di carico

Un carico senza convenzione non ha significato. `packages/core/src/units.ts`
definisce sette convenzioni, non intercambiabili e senza conversione automatica:

| Convenzione | Il numero inserito è | Nota |
|---|---|---|
| `barbellTotal` | peso totale del bilanciere, bilanciere incluso | |
| `perDumbbell` | peso di **un** manubrio | non la somma dei due |
| `machineStack` | valore sulla scala di **una** macchina | non portabile fra macchine |
| `bodyweight` | — | nessun carico da inserire |
| `bodyweightPlus` | solo il **sovraccarico** | il peso corporeo non entra |
| `assisted` | kg di **assistenza** | il progresso va **verso il basso** |
| `timeOnly` | — | si registrano i secondi |

### Chiave di comparabilità

Ogni serie confermata salva una `comparabilityKey` costruita da:

```
v1 | esercizio | variante | convenzione | attrezzo (solo se legato a macchina) | metrica | perLato/bilaterale
```

Due prestazioni entrano nello stesso confronto **solo** se la chiave coincide.
Conseguenze concrete:

- due presse diverse producono chiavi diverse → non sono confrontabili;
- 20 kg di manubrio e 20 kg di bilanciere non sono confrontabili;
- secondi e ripetizioni non sono confrontabili;
- due manubri da 20 kg presi da rastrelliere diverse **sono** confrontabili
  (l'identità dell'attrezzo è esclusa dalla chiave quando non serve).

La chiave è **salvata con la serie**, non ricalcolata: un confronto resta
riproducibile anche se il codice cambia. È versionata (`v1`) perché un futuro
cambio di formato sia riconoscibile invece di corrompere i confronti passati.

Se una convenzione legata a una macchina arriva senza identità dell'attrezzo, la
funzione **lancia**: è un errore di dati, non un caso da gestire con un valore
di riserva.

### Incrementi di carico

L'incremento è una proprietà **dell'attrezzo fisico** (`EquipmentInstance.loadStep`),
non una percentuale. Una pressa a pacco sale di 5 kg, i manubri di 2, i
microcarichi di 1,25: nessuna percentuale produce tutti e tre.

Quando l'attrezzo non è ancora configurato, il motore usa il valore predefinito
dell'esercizio **e lo dichiara** come informazione da confermare in palestra
(`unconfirmedEquipmentStep`). Vedi `COACH_RULES.md` §4 per il perché di questa
scelta.

---

## 4. Le prime 12 settimane

Trascrizione della scheda dell'utente. File: `packages/core/src/program/twelveWeeks.ts`.
Test di fedeltà voce per voce: `packages/core/test/twelveWeeks.test.ts` (61 test).

### Volumi per fase

| | Pos. 1-4 | Pos. 5-6 | Margine | Cyclette finale |
|---|---|---|---|---|
| **Settimane 1-2** | 2 serie | 1 serie | ~4 rip. in riserva | 8-10 min facili |
| **Settimane 3-4** | 2 serie | 2 serie | ~3 rip. in riserva | 12-15 min (gradualmente) |
| **Settimane 5-12** | tabella completa | tabella completa | 2-3 rip. in riserva | 12-15 min |

### Assunzioni documentate

La specifica non fissa tutto. Cinque decisioni reversibili, prese per poter
procedere e annotate in testa al file di codice:

| # | Assunzione | Perché |
|---|---|---|
| A1 | I recuperi delle settimane 1-4 sono quelli della tabella completa | Il recupero è una proprietà dell'esercizio, non della fase, e la specifica non lo ridefinisce per le prime settimane |
| A2 | «Circa 4 / 3 / 2-3 rip. in riserva» è modellato come intervallo esatto | La prescrizione resta fedele al testo; la tolleranza sul «circa» sta nel motore, non nel dato |
| A3 | Lo step-up usa `bodyweightPlus` in tutte le settimane, con sovraccarico 0 kg nelle settimane 1-2 | Così lo storico resta confrontabile quando si aggiungono i manubri, invece di spezzarsi in due serie di dati separate |
| A4 | L'hip thrust eredita il recupero dello stacco rumeno (120 s) | Occupa la stessa posizione nella seduta |
| A5 | Le serie leggere di riscaldamento si agganciano alle posizioni 1 e 2 | In entrambe le sedute la posizione 1 è un esercizio per le gambe e la 2 uno per la parte superiore |

### Recuperi a intervallo

Dove la scheda indica un intervallo (60-90 s, 45-60 s), l'interfaccia **mostra il
range** e il timer **parte dal limite superiore** (`defaultRestSeconds()`).

### Alternativa hip thrust

Prevista dalla scheda al posto dello stacco rumeno «quando la tecnica dello
stacco non è ancora adeguata, **da valutare con un istruttore**».

- Prime quattro settimane: 2 × 8-10
- A regime: 3 × 8-10
- **Storici distinti**: cambia esercizio e convenzione (macchina invece di
  manubri), quindi cambia la chiave di comparabilità. L'app non somma le due
  storie e non le confronta.
- L'app **non giudica** la tecnica dello stacco: offre l'alternativa, la scelta
  è dell'utente con il suo istruttore.

### Alternativa cardio dalla settimana 7

3 min facili + 6 × (30 s sostenuti + 60 s facili) + 3 min facili = **15 minuti**.
Solo nella **seduta B**, solo **dalla settimana 7**, e **`optIn: true`**: non si
attiva per il passare dei giorni, va scelta espressamente. I tratti sostenuti
**non sono sprint massimali** ed è scritto nella prescrizione stessa.

---

## 5. Il piano triennale

File: `packages/core/src/program/threeYear.ts`. Test: `packages/core/test/threeYear.test.ts` (36 test).

### Orizzonte su date reali

Tre anni **non** sono 156 settimane esatte. Sono **1095 o 1096 giorni**, cioè 156
settimane piene **più 3 o 4 giorni di resto**, e le settimane di calendario
lunedì-domenica toccate sono 157 o 158 a seconda del giorno di avvio.

`planningHorizon()` calcola tutto da date reali e arrotonda le settimane di
programma **per eccesso** (157), così nessun giorno dell'orizzonte resta fuori dal
piano. Arrotondare per difetto avrebbe lasciato scoperti gli ultimi giorni: è un
difetto che è stato trovato da un test e corretto.

L'**ultimo blocco ha durata variabile** e assorbe la differenza. È l'unico punto
di flessibilità: tutti gli altri blocchi hanno durata fissa.

### I 27 blocchi

**Anno 1 — rientro, tecnica, prima forza generale** (52 settimane)

| Blocco | Sett. | Fase | Schema |
|---|---|---|---|
| Rientro | 4 | rientro | scheda utente |
| Consolidamento tecnico | 8 | consolidamento | scheda utente |
| Scarico e verifica | 1 | scarico | scarico |
| Forza generale 1 | 8 | sviluppo | forza |
| Base aerobica e continuità | 8 | sviluppo | ripetere gli sforzi |
| Scarico | 1 | scarico | scarico |
| Forza generale 2 | 8 | sviluppo | forza |
| Periodo di pista | 8 | pista | mantenimento |
| Scarico | 1 | scarico | scarico |
| Consolidamento di fine anno | 5 | consolidamento | consolidamento tecnico |

**Anno 2 — forza relativa sostenibile e sforzi ripetuti** (52 settimane)
Forza relativa 1 (8) · Consolidamento muscolare 1 (8) · Scarico (1) · Ripetere
gli sforzi (8) · Periodo di pista (8) · Scarico (1) · Forza relativa 2 (8) ·
Consolidamento muscolare 2 (8) · Mantenimento e verifica (2)

**Anno 3 — consolidamento e qualità limitanti** (53 settimane)
Qualità limitanti 1 (8) · Consolidamento (8) · Scarico (1) · Periodo di pista
(8) · Qualità limitanti 2 (8) · Scarico (1) · Alternanza personalizzata (12) ·
Chiusura del percorso (**durata variabile**)

### Gli otto schemi

Uno schema dice **come** si allena, mai **con quanti kg**.

| Schema | Serie (1-2 / 3-4 / 5-6) | Rip. principali | Rip. complementari | Margine | Recupero principale |
|---|---|---|---|---|---|
| Rientro | 2 / 2 / 1 | 8-10 | 10-12 | 4 | 120 s |
| Consolidamento tecnico | 3 / 3 / 2 | 6-8 | 8-10 | 2-3 | 120 s |
| Forza generale | 3 / 3 / 2 | 5-7 | 8-10 | 2-3 | 120-150 s |
| Consolidamento muscolare | 3 / 3 / 2 | 8-10 | 10-12 | 2 | 90-120 s |
| Ripetere gli sforzi | 3 / 2 / 2 | 8-10 | 10-12 | 2-3 | 75-90 s |
| Mantenimento | 2 / 2 / 1 | 6-8 | 8-10 | 3 | 120 s |
| Periodo di pista | 2 / 2 / 1 | 6-8 | 8-10 | 3 | 120 s |
| Scarico | 2 / 1 / 1 | 6-8 | 8-10 | 4 | 120 s |

Nello schema «ripetere gli sforzi» i recuperi brevi sono **l'obiettivo dichiarato
del blocco**, non una compressione per far stare la seduta nel tempo. La
differenza conta: vedi §7.

### Perché il pool di esercizi resta stabile

La specifica (§4.4) vieta **entrambi** gli estremi: copiare la stessa settimana
per tre anni, e cambiare esercizi così spesso da rendere impossibile misurare i
progressi.

Con **due sedute a settimana**, uno storico confrontabile sullo stesso esercizio
vale più della varietà: su 8 settimane di blocco un esercizio principale
raccoglie 8 esposizioni: appena abbastanza per vedere una tendenza. Cambiarlo ne
azzererebbe la serie.

Quindi: **12 esercizi** per tre anni, con variazione su schemi, margini,
recuperi, priorità e cardio. Le **varianti** (prese diverse, altezze diverse del
gradino) sono selezionabili dall'utente e, quando cambiano davvero la
prestazione, hanno `separateHistory: true` e quindi storico separato.

Un test verifica che le settimane abbiano almeno **6 forme diverse** (serie,
intervalli, recuperi, margini, cardio) e che i quattro esercizi principali
compaiano in **tutte** le settimane del percorso.

### L'intensità non sale perché cambia l'anno

Vietato dalla specifica (§4.4), e verificato da un test: il margine minimo
prescritto negli anni 2 e 3 **non è mai più stretto** di quello dell'anno 1. La
progressione avviene sui **carichi reali** attraverso il motore adattivo, non
sullo schema.

Ogni blocco di sviluppo dopo il primo ha **criteri di ingresso verificabili sui
dati registrati**:

| Criterio | Significato |
|---|---|
| `minCompletedSessions` | almeno N sedute **completate** (le saltate non contano) |
| `consecutiveSessionsWithoutIssue` | N sedute consecutive senza fastidi segnalati |
| `techniqueControlled` | tecnica **dichiarata** controllata sugli esercizi principali |
| `adherence` | almeno X% delle sedute previste completate nelle ultime N settimane |
| `always` | nessuna condizione (solo blocco iniziale e blocchi a volume ridotto) |

Se i criteri non sono soddisfatti, **il blocco precedente si ripete**.

### Nessun carico futuro, nessun test massimale

Un test verifica che nessuna prescrizione del piano contenga un campo di carico
in kg, e che ogni occorrenza delle parole «massimale» o «cedimento» nel piano sia
in un contesto **negato** (cioè un divieto). Nessuna prescrizione chiede margine
0.

### Interruzioni

Ogni blocco dichiara la sua politica. Per i blocchi di lavoro:

- **fino a 2 settimane** di pausa → si riprende dalla stessa settimana, con la
  prima seduta a margine più ampio;
- **3-6 settimane** → si ripete il blocco dall'inizio;
- **oltre 6 settimane** → si rientra dal blocco di rientro.

E in tutti i casi: **le sedute perse non si recuperano accumulandole**. È
verificato da un test su tutti i 27 blocchi.

### Settimana di calendario ≠ settimana di programma

`ProgramCursor` tiene `weekIndex`, `repetitionCount` e `completedSlots`. Avanza
**solo** quando le sedute previste risultano completate, e prevede
esplicitamente la **ripetizione** della settimana. Il passare dei giorni non lo
muove: il motore, davanti a una lunga pausa, propone di **ripetere**, non di
avanzare, e non tocca il cursore da sé.

---

## 6. Durata delle sedute

File: `packages/core/src/program/duration.ts`.

La stima somma, con ripartizione ispezionabile:

```
riscaldamento + lavoro + recuperi + cambi di attrezzo + registrazione + cardio + spese fisse
```

Dettagli del calcolo:

- il **lavoro** è stimato sul **limite superiore** dell'intervallo (è il caso che
  deve stare nel tempo disponibile: stimare sul minimo produce sedute che
  sforano sistematicamente);
- un esercizio **per lato** ha il doppio delle esecuzioni ma **non** il doppio
  delle serie;
- per lo step-up il recupero principale è **dopo entrambe le gambe**, e fra le
  due gambe si conta solo il cambio di appoggio;
- fra due esercizi il tempo reale è il **maggiore** fra recupero e tempo di
  cambio postazione, non la somma: il recupero avviene camminando.

I coefficienti (10 s per registrare una serie, 45 s di check-in, 45 s di
riepilogo, 60 s per impostare la cyclette) sono **stime progettuali dichiarate**,
non misurazioni. La durata reale viene registrata a ogni seduta e mostrata
accanto alla stima, così diventa verificabile con i dati di Mattia.

**Risultato verificato**: nessuna delle 314 sedute del percorso triennale supera i
**75 minuti** stimati, e le sedute a regime della settimana 5 stanno nella
finestra **55-75 minuti**. Test: `threeYear.test.ts`.

---

## 7. Non si comprimono i recuperi

La specifica (§4.5 e §5.4) lo vieta due volte: una seduta troppo lunga non si
rende compatibile accorciando i recuperi, e «ho meno tempo oggi» deve produrre una
**selezione ragionata del lavoro**.

`shortenSession()` riduce in un **ordine dichiarato**:

1. cyclette al minimo del suo intervallo;
2. rimozione degli esercizi a priorità più bassa (`timePriority` più alto), uno
   per volta;
3. serie degli esercizi non prioritari a 2;
4. cyclette rimossa del tutto;
5. **ultima risorsa**: serie degli esercizi prioritari a 2.

Gli esercizi con `timePriority === 1` non vengono **mai** rimossi. I recuperi non
vengono **mai** toccati: la funzione restituisce `restsUnchanged: true` e un test
(`restsAreUnchanged()`) verifica che i recuperi degli esercizi conservati siano
identici a quelli prescritti.

Se anche dopo tutte le riduzioni la seduta non sta nel tempo, l'app **lo dice**:
«Non accorcio i recuperi per far quadrare il conto: meglio svolgere una parte
della seduta e registrarla come parziale.»

---

## 8. Classificazione delle affermazioni

La specifica (§5) chiede di distinguere le regole progettuali dai criteri
sostenuti da fonti. Questa è la classificazione, onesta:

### Regole progettuali — scelte nostre, discutibili, configurabili

Non sono sostenute da una fonte primaria che abbiamo verificato. Sono il modo in
cui **questa app** decide.

- La soglia di 3 esposizioni per parlare di stallo.
- La soglia di 2 sedute consecutive con fastidio per proporre una riduzione o una
  sostituzione.
- Le soglie di 21 e 42 giorni di pausa per proporre rispettivamente la
  ripetizione della settimana e il rientro.
- La tolleranza **zero** sotto il margine minimo di fase.
- La durata dei blocchi (8 settimane) e la collocazione delle settimane di scarico.
- La composizione degli schemi (serie, intervalli, recuperi di ciascun archetipo).
- Il ciclo 4 settimane di sviluppo + 2 di mantenimento nel blocco di alternanza.
- I coefficienti della stima di durata.
- Il riferimento delle **72 ore** prima di una giornata in pista: è il valore
  indicato dall'utente nella specifica, presentato come **criterio prudenziale
  configurabile** e non come garanzia.

### Criteri con fonte

Al momento della scrittura di questo documento (2026-09-19) **non è stata
inserita nel codice nessuna affermazione che dipenda da una fonte scientifica
primaria**, e di conseguenza questa sezione è vuota.

È una scelta deliberata: il motore decide sulla base di ciò che Mattia ha
registrato (limite superiore raggiunto, margine dichiarato, tecnica dichiarata,
assenza di fastidi, ripetibilità su due esposizioni) e sulle soglie progettuali
qui sopra. Non contiene formule di conversione carico/ripetizioni, stime di 1RM,
modelli di fatica, zone di frequenza cardiaca o calcoli di calorie: tutte cose che
richiederebbero una fonte e che, senza di essa, sarebbero numeri inventati.

Se in futuro si aggiunge un criterio che dipende dalla letteratura, va aggiunto
**qui** con URL e data di verifica, e la revisione `coach-safety` deve rifiutare
il cambiamento se la fonte manca.

---

## 9. Dove guardare nel codice

| Cosa | File |
|---|---|
| Convenzioni di carico, chiave di comparabilità, gradini | `packages/core/src/units.ts` |
| Date, settimane, orizzonte, orologi | `packages/core/src/time.ts` |
| Prescrizione, margine, recuperi, ruoli delle serie | `packages/core/src/domain/prescription.ts` |
| Struttura del programma e cursore | `packages/core/src/domain/program.ts` |
| Fatti eseguiti | `packages/core/src/domain/session.ts` |
| Scheda 12 settimane | `packages/core/src/program/twelveWeeks.ts` |
| Libreria esercizi | `packages/core/src/program/exercises.ts` |
| Piano triennale | `packages/core/src/program/threeYear.ts` |
| Stima di durata | `packages/core/src/program/duration.ts` |
| Regole del motore | `packages/core/src/engine/` — vedi `COACH_RULES.md` |
