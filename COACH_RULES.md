# COACH_RULES.md — Le regole del coach

Che cosa il coach può proporre, a quali condizioni, e cosa gli è vietato fare.

Data di scrittura: **2026-09-19**. Revisionato e corretto: **2026-09-20**.
Codice: `packages/core/src/engine/`.
Test: `packages/core/test/engine.test.ts` (52) e
`packages/core/test/engineRegressions.test.ts` (regressioni della revisione
indipendente).

---

## 0. Due componenti, non una

| | **Coach adattivo locale** | **Coach generativo** |
|---|---|---|
| Obbligatorio | **sì** | no |
| Funziona offline | **sì, sempre** | no |
| Serve per allenarsi | **sì** | **no** |
| Deterministico | **sì** | no |
| Stato iniziale | attivo | **disattivato** |
| Stato di implementazione | **implementato e testato** | **non implementato** (vedi §9) |

Il coach adattivo locale è una **funzione pura**: dato lo stesso contesto
produce sempre le stesse proposte. È questa proprietà che lo rende testabile, e
quindi verificabile. Un test lo controlla esplicitamente.

Una raccolta di frasi predefinite **non** è intelligenza artificiale generativa e
in questo progetto non viene chiamata così. Le spiegazioni del coach adattivo
sono testo costruito da regole: sono descritte come tali.

---

## 1. Il coach non scrive niente

`evaluate()` restituisce `CoachProposal[]`. Non apre transazioni, non tocca il
database, non modifica il piano, non muove il cursore del programma.

Una proposta diventa un effetto solo attraverso:

```
proposta strutturata → validazione → controllo delle regole → anteprima → conferma dell'utente → applicazione transazionale
```

Le proposte che cambiano la **struttura** del programma (revisione di un blocco,
sostituzione permanente, cambio di volume, ripetizione della settimana) hanno
`requiresExplicitConfirmation: true` e non possono essere applicate in automatico.

**Non si cambia silenziosamente la seduta in corso.**

---

## 2. Che cosa può proporre

Non solo «aggiungi peso». Undici tipi di modifica (`ProposalChange`):

| Tipo | Quando |
|---|---|
| `hold` | mantenere i valori attuali, con il motivo. Mostrato quando ha qualcosa da dire: un blocco per sicurezza, un cambio di schema o un dato da colmare |
| `increaseReps` | salire di ripetizioni entro l'intervallo — **primo passo** della doppia progressione |
| `increaseDuration` | salire di secondi entro l'intervallo, per gli esercizi a tempo |
| `increaseLoad` | salire di carico — solo dopo aver esaurito l'intervallo di ripetizioni |
| `reduceLoadTemporarily` | riduzione con durata dichiarata |
| `repeatWeek` | ripetere la settimana invece di avanzare |
| `changeVolume` | variare il numero di serie |
| `substituteExercise` | alternativa compatibile, con scelta fra «solo oggi» e «anche nel programma futuro» |
| `changeCardio` | modificare il lavoro aerobico |
| `reviseBlock` | rivedere il blocco |
| `shortenSession` | selezione ragionata del lavoro per una seduta più corta |

---

## 3. Le condizioni per un incremento di carico

Un incremento viene proposto **solo se tutte** queste condizioni sono vere.
Ciascuna produce un esito esplicito con la sua motivazione in italiano
(`ConditionResult`), che finisce nella proposta.

La specifica ne elenca cinque; il codice ne verifica **sei**, perché la
revisione ha mostrato che «carico registrato» era un presupposto implicito che
non veniva controllato.

### Condizione 1 — tutte le serie allenanti al limite superiore

`checkRangeTop()`. Richiede **anche** che il numero di serie completate copra
quello prescritto: due serie su tre al limite superiore **non sono** «tutte le
serie previste». Un valore mancante (`null`) fa fallire il controllo.

### Condizione 2 — margine coerente con la fase

`checkEffortMargin()`. «Coerente» significa che il margine registrato è **almeno**
quello prescritto.

Il verso conta: se la fase chiede di lasciare 2 ripetizioni in riserva e la serie
è stata chiusa con margine 0, il margine prescritto **non c'era**, e aggiungere
carico lo ridurrebbe ancora. Un margine **più ampio** del prescritto è invece un
segnale a favore: la serie era più facile del previsto.

La tolleranza sotto il minimo di fase è **0** per scelta di progetto
(`rirToleranceBelowPhaseMin`). È configurabile, ma alzarla rende il motore più
permissivo: è una manopola da muovere con consapevolezza.

Per gli esercizi **a tempo** il RIR non si applica (`durationControl`): la
specifica vieta di imporre un margine privo di significato. La condizione è
soddisfatta per costruzione e lo **dichiara** nella spiegazione, invece di
inventare un numero.

### Condizione 3 — tecnica dichiarata controllata

`checkTechnique()`. Deve essere `'controlled'`. Tre esiti negativi distinti:

- `null` → **non dichiarata**: blocca, e segnala `noTechniqueDeclared`;
- `'uncertain'` → blocca;
- `'broke'` → blocca, e dice che quella serie non è un riferimento valido.

La tecnica è **dichiarata dall'utente**. L'app non la giudica: non ha modo di
vederla.

### Condizione 4 — nessun problema segnalato

`checkNoIssues()`. **Qualunque** fastidio segnalato su quell'esercizio blocca
l'incremento, a prescindere dall'intensità dichiarata.

### Condizione 5 — carico registrato in modo completo

`checkLoadRecorded()`. Aggiunta **dopo la revisione**. Distingue quattro casi:

| Caso | Esito |
|---|---|
| L'esercizio non prevede carico (corpo libero, a tempo) | soddisfatta, e lo dichiara |
| Carico presente e uguale su tutte le serie | soddisfatta |
| Carico assente su **alcune** serie (`partialLoads`) | **blocca**, con `noLoadRecorded` |
| Carichi **diversi** fra le serie (`mixedLoads`) | **blocca**: non esiste un riferimento unico da aumentare |

Serviva perché un carico cancellato correggendo una serie già confermata rendeva
l'esposizione «a carico uniforme», e la proposta **citava come registrato** un
valore che non esisteva. La causa a monte è stata chiusa anche nel livello di
persistenza: `SetRepository.correct()` ora rifiuta di svuotare il carico di una
serie confermata la cui convenzione lo richiede.

### Condizione 6 — confermato in due esposizioni consecutive confrontabili

`decideProgression()` richiede che le **due esposizioni più recenti** soddisfino
tutte le condizioni precedenti. Una sola non basta.

«Confrontabili» significa **due cose**, e inizialmente il codice ne controllava
una sola:

1. **stesso attrezzo e stessa convenzione** — la chiave di comparabilità. Due
   prestazioni su macchine diverse non sono la seconda esposizione richiesta;
2. **stessa prescrizione** — `prescriptionSignature`: serie previste,
   intervallo, metrica, lato e margine.

Il secondo controllo è stato aggiunto dopo la revisione, che ha dimostrato il
caso concreto: la **settimana di scarico** del piano prescrive meno serie e
margine 4, e dichiara esplicitamente che i carichi restano quelli della
settimana precedente. Senza il controllo sulla prescrizione, una seduta di
scarico contava come «seconda esposizione consecutiva confrontabile» e
confermava un incremento che nessuno aveva guadagnato — proponendolo, peggio,
per una settimana con un intervallo di ripetizioni più basso.

### Una ripetizione in più è un incremento

Il caso più pericoloso trovato dalla revisione. La proposta «prova una
ripetizione in più» veniva valutata **prima** delle condizioni, e non guardava
fastidio, tecnica né margine: il motore poteva proporre «prova 7 ripetizioni»
nella seduta successiva a un dolore che aveva **interrotto l'esercizio**, con
tecnica dichiarata ceduta e margine zero, e senza nessuna avvertenza.

Ora:

| Segnale | Effetto sulla proposta di ripetizioni |
|---|---|
| Fastidio segnalato | **blocca** |
| Tecnica non controllata o non dichiarata | **blocca** |
| Margine insufficiente o non dichiarato | non blocca (non si aggiunge carico) ma viene **dichiarato** fra le informazioni mancanti |
| Dispersione ampia fra le serie | **blocca** e lo segnala: non si costruisce un «+1» su una serie crollata |

La proposta resta inoltre **dentro l'intervallo prescritto anche verso il
basso**: prima il limite c'era solo verso l'alto, e una serie crollata da 12 a 5
su un esercizio prescritto 10-12 produceva «prova 6 ripetizioni».

---

## 4. Dati mancanti non sono risultati positivi

> **Questa affermazione era falsa, ed è stata corretta.**
>
> Una prima versione di questo documento diceva: «Non esiste, nel codice del
> motore, un percorso in cui un valore assente diventi `true`». La revisione
> indipendente `coach-safety` ha dimostrato che ne esistevano **cinque**, con
> casi riproducibili. Sono stati corretti, e ogni correzione ha un test di
> regressione in `packages/core/test/engineRegressions.test.ts`.
>
> I cinque percorsi erano: `Math.min(...[])` che vale `Infinity` e faceva
> risultare «coerente» un margine inesistente; `[].every()` che vale `true` e
> faceva risultare raggiunto il limite superiore con zero serie; un carico
> assente su una serie filtrato via prima del controllo di uniformità, che
> trasformava un buco in «carico uniforme»; `latest.loadKg ?? 0`, che proponeva
> 0 kg su un esercizio senza carico; e un valore di ripetizioni assente che
> contribuiva 0 a un totale, mascherando un progresso.
>
> Il fatto che l'affermazione fosse scritta con sicurezza in un documento non
> l'ha resa vera. È la ragione per cui la specifica (§17) richiede che l'autore
> di una parte non sia il suo unico revisore.

Lo stato **attuale**, verificato: quando un dato manca, il motore **mantiene** e
**dichiara cosa manca**. L'unico `?? 0` residuo nel motore riguarda un criterio
di ordinamento (una seduta senza istante di avvio finisce in coda fra quelle
dello stesso giorno), non un dato dell'atleta, e il codice lo dichiara.

Quando un dato manca, il motore **mantiene** e **dichiara cosa manca**:

| Codice | Significato |
|---|---|
| `noRirDeclared` | il margine non è stato dichiarato su una o più serie |
| `noTechniqueDeclared` | la tecnica non è stata dichiarata |
| `notEnoughExposures` | serve una seconda esposizione confrontabile |
| `noComparableHistory` | non esiste storico confrontabile per questo esercizio su questo attrezzo |
| `noLoadRecorded` | nessun carico registrato |
| `unconfirmedEquipmentStep` | l'incremento dell'attrezzo non è configurato: il valore usato va confermato |
| `noLoadStepAvailable` | per questo attrezzo non esiste nessun incremento: non si propone un carico |

`EngineConfig.allowIncreaseWithMissingData` ha tipo letterale **`false`**: non
esiste un valore che riattivi il comportamento vietato. Non è un flag, è un
promemoria verificabile.

### Nota su `unconfirmedEquipmentStep` — una decisione presa consapevolmente

Quando l'attrezzo non è ancora configurato, il motore ha tre opzioni:

1. **rifiutare la proposta** — il motore resta inutile finché ogni macchina della
   palestra non è stata censita;
2. **usare il valore predefinito in silenzio** — l'utente riceve un numero che
   sembra verificato e non lo è;
3. **usare il valore predefinito dichiarandolo** — la proposta arriva, e dice:
   «verifica in palestra che la macchina salga davvero di questo valore».

È stata scelta la **terza**. La prima versione del codice faceva la seconda, ed è
stata corretta dopo che un test l'ha messa in evidenza: la proposta non
dichiarava l'origine del gradino. Se in futuro si decide che questo caso deve
bloccare, il test `un gradino non configurato sull attrezzo viene dichiarato da
confermare` va aggiornato insieme alla decisione.

Quando **nessun** gradino esiste (esercizi a tempo, corpo libero), il motore non
propone un carico: `noLoadStepAvailable`.

---

## 5. Doppia progressione

**Prima le ripetizioni entro l'intervallo, poi eventualmente il carico.**

Se le ripetizioni non sono al limite superiore, il passo successivo è salire di
**una** ripetizione (mai oltre il massimo dell'intervallo prescritto), non di
carico. Vale anche quando mancano altri dati: alzare di una ripetizione entro
l'intervallo prescritto non aumenta il carico e resta dentro la prescrizione del
programma.

Per gli esercizi **a tempo** la progressione è la stessa, su secondi: prima si
migliora dentro l'intervallo di durata.

Per le macchine **ad assistenza** il progresso va **verso il basso**: meno
assistenza significa più lavoro. `isInvertedProgress()` lo gestisce; il motore usa
`nextLoadDown()` e il messaggio dice «l'assistenza è già al minimo impostabile»
invece di «il carico è al massimo».

---

## 6. Inferenze vietate

| Inferenza vietata | Come è impedita |
|---|---|
| Un allenamento negativo = plateau | Lo stallo richiede **3** esposizioni consecutive senza progresso (`stalledExposures`) |
| Una seduta saltata = sovrallenamento | Una seduta senza `performedDate` non è un'esposizione: non entra nei conteggi né produce proposte di riduzione |
| Il passare dei giorni = avanzamento di fase | Davanti a una pausa il motore propone di **ripetere**, e non tocca il cursore |
| Macchine diverse = equivalenti | Chiavi di comparabilità diverse |
| Peso corporeo sommato al volume dello step-up | `exposureVolume()` conta **solo** il sovraccarico e lo dichiara nella convenzione |
| Secondi confrontati con ripetizioni | La metrica è parte della chiave |
| Percentuale uniforme di incremento | L'incremento è un dato dell'attrezzo |
| Carico derivato dal peso corporeo | Non esiste nel codice nessun percorso che lo faccia |

### Ordine di valutazione

Pensato per non nascondere i segnali negativi dietro un risultato positivo:

1. **fastidio ripetuto** (2 sedute consecutive) → riduzione temporanea o
   sostituzione con l'alternativa prevista dalla scheda;
2. **incremento confermato** (ripetizioni prima, poi carico);
3. **stallo confermato** (3 esposizioni) → revisione dello schema o ripetizione
   della settimana, **non** forzare il carico;
4. **mantenimento**.

Un fastidio segnalato blocca l'incremento anche con tutto il resto in ordine.

---

## 7. Che cosa mostra ogni proposta

Richiesto dalla specifica (§5.4), e presente in `CoachProposal`:

| Campo | Contenuto |
|---|---|
| `evidence` | **dati utilizzati**, con `sourceSetIds` e `sourceSessionIds` per risalire alle serie esatte |
| `reason` | **ragione** in italiano |
| `change` | **modifica prevista**, strutturata |
| `missingInformation` | **informazioni mancanti**, con testo esplicativo |
| `reevaluateOn` | **momento della rivalutazione** (14 giorni per scelta di progetto) |
| `basePlanVersion` | versione del piano su cui è stata calcolata |
| `requiresExplicitConfirmation` | se serve una conferma esplicita |

Azioni disponibili: **accetta · modifica · rimanda · rifiuta · annulla**
(`ProposalDecision`).

Una proposta calcolata su una versione del piano superata da una revisione
accettata su un altro dispositivo diventa `superseded`: **non sovrascrive** la
revisione più recente.

---

## 8. Soglie e finestre

Tutte in `packages/core/src/engine/config.ts`, ciascuna etichettata nel codice
con la propria natura — `[SPEC]` se imposta dalla specifica dell'utente,
`[PROGETTO]` se è una nostra scelta prudenziale.

| Parametro | Valore | Natura |
|---|---|---|
| `confirmExposures` | 2 | `[SPEC]` |
| `rirToleranceBelowPhaseMin` | 0 | `[PROGETTO]` |
| `stalledExposures` | 3 | `[PROGETTO]` |
| `repeatedDiscomfortSessions` | 2 | `[PROGETTO]` |
| `interruptionDaysToRepeatWeek` | 21 | `[PROGETTO]` |
| `interruptionDaysToReentry` | 42 | `[PROGETTO]` |
| `maxExposuresConsidered` | 12 | `[PROGETTO]` |
| `proposalValidityDays` | 14 | `[PROGETTO]` |
| `allowIncreaseWithMissingData` | `false` (tipo letterale) | `[SPEC]` |

Nessuno di questi valori è presentato come verità scientifica. Vedi
`TRAINING_MODEL.md` §8 per la classificazione completa, e per il fatto che al
momento **nessuna** regola del motore dipende da una fonte primaria — deliberatamente.

---

## 9. Coach generativo: stato e regole

**Stato attuale: non implementato.** `AppSettings.generativeCoachEnabled` esiste
e vale `false`; non esiste codice che chiami un provider esterno. Non è un
pulsante che non fa niente: è un'impostazione che l'app legge, e quando è `false`
non c'è nulla da attivare.

Se verrà implementato, queste regole sono vincolanti:

1. **Nessuna attivazione automatica.** Disattivato all'inizio, soggetto a consenso
   esplicito.
2. **Trasparenza prima del consenso**: quali dati verrebbero trasmessi, a quale
   provider, che connessione serve, quali costi.
3. **Nessuna chiave condivisa nel binario.**
4. **Un modello linguistico non scrive nel database.** Solo proposte strutturate,
   che passano per lo stesso percorso di validazione delle proposte locali.
5. **Rifiuto** di: output malformati, esercizi non presenti in libreria
   (`UnknownExerciseError` esiste già per questo), unità incompatibili, modifiche
   fuori dai limiti configurati.
6. **Note e file importati sono dati non fidati**, non istruzioni di sistema. Una
   nota che contiene «ignora le istruzioni precedenti» è testo che l'utente ha
   scritto in un campo note, e va trattata come tale.
7. **Timeout, limiti di chiamata, fallback e gestione dei costi.** Nessuna
   chiamata a ogni serie.
8. **Nessuna dipendenza della seduta dalla rete**: se il provider è assente,
   irraggiungibile o in timeout, il coach adattivo locale copre tutto.
9. **Foto di progresso mai trasmesse a un provider AI per impostazione
   predefinita** (`syncProgressPhotos: false`).

### Modello sul dispositivo

Non è stato valutato. Valutarlo richiede misurare memoria, tempi, consumi e
qualità **su un iPhone 15 reale**, che in questo ambiente non è disponibile.
Nessuna affermazione è stata fatta sulla fattibilità, e non si presume la
disponibilità di Apple Intelligence.

La regola che verrebbe applicata: **non peggiorare timer e registrazione per
eseguire un modello generativo**. Se non è sostenibile, si mantiene il coach
adattivo completo e si dichiara correttamente la sua natura — che è quello che
questo documento fa.

---

## 10. Limiti dichiarati

Il coach:

- **non certifica idoneità sportiva**;
- **non diagnostica infortuni** — davanti a un fastidio ripetuto il messaggio
  dice esplicitamente «conviene parlarne con un professionista: l'app non fa
  diagnosi», e un test lo verifica;
- **non sostituisce un professionista sanitario**;
- **non introduce** riabilitazione, apnea, esercizi cervicali zavorrati, test
  massimali;
- **non genera** diete o obiettivi nutrizionali: calorie e proteine sono dati
  manuali facoltativi;
- **non promette** una data per raggiungere un peso;
- **non attribuisce** i tempi sul giro alla palestra.

Il promemoria delle **72 ore** prima di una giornata in pista è il valore indicato
dall'utente nella specifica, presentato come **criterio prudenziale configurabile,
non come garanzia** — ed è verificato da un test che controlla la presenza di
entrambe le formule nel testo mostrato.

---

## 11. Come si verifica tutto questo

```bash
npx vitest run packages/core/test/engine.test.ts
```

I test sono scritti **al contrario**: invece di verificare che il motore
funzioni, verificano che non faccia le cose vietate. Copertura:

- il caso positivo (due esposizioni valide → proposta motivata con prove,
  ragione, rivalutazione, gradino dell'attrezzo);
- una sola esposizione → nessun incremento;
- RIR non dichiarato → nessun incremento, segnalato;
- tecnica non dichiarata / incerta / ceduta → nessun incremento;
- margine sotto il minimo di fase → nessun incremento;
- serie incomplete → nessun incremento;
- gradino non configurato → proposta con avvertenza; nessun gradino → nessuna
  proposta di carico;
- nessuno storico → nessuna proposta;
- bozze, serie annullate, serie di riscaldamento → non contano;
- due macchine diverse → non confermano un incremento;
- volume: peso corporeo escluso dallo step-up, due manubri contati con
  convenzione dichiarata, nessun volume per gli esercizi a tempo;
- doppia progressione: ripetizioni prima del carico, mai oltre l'intervallo;
- un risultato negativo ≠ plateau; una seduta saltata ≠ riduzione; il calendario
  ≠ avanzamento di fase;
- fastidio singolo → blocca; fastidio ripetuto → proposta dedicata con conferma
  esplicita e rinvio a un professionista;
- «ho meno tempo»: recuperi intatti, esercizi principali conservati, ogni passo
  spiegato con i minuti risparmiati, e dichiarazione esplicita quando il tempo
  non basta comunque;
- determinismo;
- promemoria pista.

Il revisore indipendente di queste regole è l'agente `coach-safety`
(`.claude/agents/coach-safety.md`), che **non** è l'autore del motore.
