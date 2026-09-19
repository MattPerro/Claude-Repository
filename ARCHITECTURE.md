# ARCHITECTURE.md — Architettura di TrackStrong

Come è fatto il sistema, e perché è fatto così.

Data di scrittura: **2026-09-19**.

---

## 1. Le quattro cose che non vanno confuse

La specifica insiste su questa distinzione (§1.2), e l'architettura la rispetta
fisicamente:

| | Dove vive | Che cosa contiene | Che cosa **non** è |
|---|---|---|---|
| **GitHub** | remoto, repository privato | codice, test, documentazione, dati sintetici | non è il backup degli allenamenti |
| **Database locale** | SQLite nel contenitore protetto dell'app, su ogni dispositivo | tutti i dati operativi | non sta in una cartella sincronizzata |
| **Google Drive** | `appDataFolder` dell'account dell'utente | pacchetti immutabili di operazioni + snapshot | non è un database condiviso, e non aggiorna il binario dell'app |
| **Motore adattivo** | funzione pura in `packages/core`, eseguita sul dispositivo | regole di progressione | non è un servizio, non chiama la rete, non è un modello linguistico |

---

## 2. Struttura del repository

```
trackstrong/
├── packages/
│   ├── core/          TypeScript puro. Zero import da React Native, Expo o rete.
│   │   ├── units.ts           convenzioni di carico, chiave di comparabilità
│   │   ├── time.ts            date, settimane, orizzonte, orologi iniettabili
│   │   ├── ids.ts             ULID generati sul dispositivo
│   │   ├── domain/            prescrizione, esercizi, programma, sessioni,
│   │   │                      profilo, corpo, proposte
│   │   ├── program/           scheda 12 settimane, libreria, piano triennale,
│   │   │                      stima di durata
│   │   ├── engine/            motore adattivo (config, esposizioni,
│   │   │                      progressione, riduzione della seduta)
│   │   ├── timer/             stato dei timer, intervalli, lati
│   │   └── theme/             token di colore + calcolo del contrasto WCAG
│   ├── db/            SQLite: porta SqlDriver, 30 tabelle, migrazioni,
│   │                  unità di lavoro, 9 repository
│   └── sync/          protocollo Drive: operazioni, pacchetti, conflitti,
│                      cursore, retry, porta DriveStore
└── apps/
    └── mobile/        app Expo (iOS prioritario)
        ├── app/               rotte expo-router
        └── src/
            ├── theme/         ThemeProvider (i colori vengono da core)
            ├── components/    componenti di base
            └── store/         apertura database, repository, sincronizzazione
```

### Perché il dominio è un pacchetto separato

Perché è la parte in cui un errore silenzioso fa il danno peggiore, e deve
poter essere verificata **senza un simulatore**. `packages/core` non importa
nulla da React Native: gira su Node, e quindi 429 test lo esercitano a ogni
modifica in mezzo secondo.

Il vincolo è verificabile:

```bash
grep -rn "react-native\|expo-\|fetch(" packages/core/src   # nessun risultato
```

### Perché i colori stanno in `core` e non nei fogli di stile

Perché così il contrasto è un **test** (`packages/core/test/theme.test.ts`) e
non un'affermazione in un documento di revisione. Se qualcuno cambia un grigio
e scende sotto 4,5:1, la build fallisce.

Regola conseguente: **nessun componente dell'app scrive un colore in
esadecimale**. Se serve un colore nuovo, si aggiunge un ruolo ai token in core.

---

## 3. Offline-first: cosa funziona senza rete

**Tutto quello che serve per allenarsi.** Non è uno slogan: è una proprietà
strutturale, perché nessuno dei pacchetti sotto tocca la rete.

| Funzione | Pacchetto | Rete? |
|---|---|---|
| Programma e schede | `core` | no |
| Registrazione delle sessioni | `db` | no |
| Timer | `core` + `db` | no |
| Istruzioni degli esercizi | `core` | no |
| Calendario | `db` | no |
| Storico e grafici | `db` | no |
| Misurazioni | `db` | no |
| Motore adattivo | `core` | no |
| Proposte già salvate | `db` | no |
| Sincronizzazione | `sync` | **sì, e solo questa** |

Un problema di rete non può interrompere la registrazione, perché la
registrazione non passa dalla rete: `setRepository.insert()` apre una
transazione SQLite, scrive la serie e accoda l'operazione, e ritorna.

---

## 4. La porta SQL, e perché è sincrona

`packages/db/src/driver.ts` definisce `SqlDriver` con due implementazioni:

| Implementazione | Usata da | Verificata? |
|---|---|---|
| `openNodeSqlite` (`node:sqlite`) | test su Node | **sì**, 79 test |
| `openExpoSqlite` (`expo-sqlite`) | iPhone | **no**: firme verificate sul pacchetto pubblicato, comportamento a runtime non verificato |

L'interfaccia è **sincrona per transazione**, deliberatamente. Con un'API
asincrona un `await` mal piazzato dentro una transazione la spezza in due, e la
garanzia «dati e operazione di sincronizzazione nella stessa transazione»
diventa finta. `expo-sqlite` espone l'API sincrona completa
(`execSync`, `runSync`, `getAllSync`, `getFirstSync`, `withTransactionSync`),
quindi la scelta è possibile su entrambi i lati.

`expo-sqlite` **non** è importato staticamente da `packages/db`: il modulo viene
iniettato dall'app. Così il pacchetto resta caricabile su Node per i test.

---

## 5. Il punto più importante: una sola transazione

La specifica (§7) chiede che la modifica ai dati **e** l'operazione da inviare
alla sincronizzazione siano salvate nella stessa transazione. Se l'accodamento
fallisce, la modifica non è avvenuta.

```
withWrite(db, (ctx) => {
  ctx.upsert('performed_sets', row, operazioneDiSync);   // entrambi, o nessuno
});
```

Un test lo dimostra iniettando un errore nell'accodamento e verificando che
**nessuna** modifica ai dati sopravviva.

### Vincoli nello schema, non nel codice

Un vincolo nel codice si aggira; uno nello schema no. Quattro requisiti sono
scesi nello schema SQL:

| Requisito | Come | Perché non nel codice |
|---|---|---|
| Il doppio tocco non crea duplicati | `performed_sets.idempotency_key TEXT NOT NULL UNIQUE`, derivata da `(sessione, esercizio, ordine, lato)` | un debounce nell'interfaccia non resiste a due processi, a una ripresa dopo interruzione o a un'importazione |
| Una sola sessione attiva per installazione | indice `UNIQUE` parziale su `sessions(owner_device_id) WHERE status='active'` | — |
| Carico `NULL` e non `0` per corpo libero e esercizi a tempo | `CHECK (load_kg IS NULL OR load_convention NOT IN ('bodyweight','timeOnly'))` | uno 0 salvato come carico è un dato falso, e sarebbe indistinguibile |
| Peso dichiarato fuori dai grafici | vive in `profiles`, tabella che **nessuna query** di `measurementRepository` raggiunge | separazione strutturale invece di una convenzione da ricordare |

### Fotografia della prescrizione

Ogni sessione salva `prescription_snapshot`: la prescrizione congelata al
momento dell'avvio. Una revisione futura del programma **non riscrive lo
storico**. Un test lo verifica modificando il piano e controllando che la
sessione già avviata non cambi.

---

## 6. Sincronizzazione: registro di operazioni, non «vince l'ultimo upload»

Vedi `SYNC_PROTOCOL.md` per il dettaglio. Qui il riassunto architetturale.

```
   iPhone                      Google Drive (appDataFolder)              iPad
┌──────────┐                 ┌───────────────────────────┐          ┌──────────┐
│ SQLite   │──push bundle──▶ │ bundle-01.json (immutabile)│ ◀──push──│ SQLite   │
│  +       │                 │ bundle-02.json (immutabile)│          │   +      │
│ coda ops │ ◀──pull changes │ snapshot-03.json           │ pull───▶ │ coda ops │
└──────────┘                 └───────────────────────────┘          └──────────┘
```

Proprietà che l'architettura garantisce:

- **Nessun database viaggia.** Su Drive ci sono solo operazioni e snapshot. Un
  database operativo non viene mai aperto né copiato dentro una cartella
  sincronizzata.
- **Idempotenza per identificativo.** Ogni operazione ha un ULID generato sul
  dispositivo che la crea. Un retry dopo una risposta di rete persa riusa lo
  stesso identificativo: non duplica. La de-duplicazione **non** si affida
  all'unicità dei nomi dei file, perché su Drive i nomi non sono unici.
- **Il cursore avanza dentro la stessa transazione** che persiste i dati
  ricevuti. Due scritture separate lascerebbero una finestra in cui il cursore
  è avanti rispetto ai dati: perdita silenziosa.
- **Marcatura per campo.** Permette di unire automaticamente modifiche a campi
  disgiunti (una pesata e un allenamento si conservano entrambi) e di
  materializzare il conflitto sul **solo** campo contestato, applicando gli
  altri.
- **Nessun conflitto risolto con l'orologio.** La divergenza si rileva da
  `baseRevision`. Dove serve un ordine deterministico si usa
  `(lamport, dispositivo, identificativo)`, e il codice dichiara che è un
  ordinamento, non un giudizio su quale modifica sia giusta.
- **Errori tipizzati.** `DriveAuthError`, `DriveQuotaError`,
  `DriveStorageFullError`, `DriveNetworkError`, `DriveRateLimitError`,
  `DriveNotFoundError`, `DriveConflictError`. Nessuno di questi viene mai
  interpretato come «archivio vuoto».

---

## 7. Il motore adattivo è una funzione

```
evaluate(context) → CoachProposal[]
```

Non apre transazioni, non scrive, non muove il cursore del programma, non
chiama la rete. Dato lo stesso contesto produce le stesse proposte, e un test
lo verifica.

Una proposta diventa un effetto solo dopo una conferma esplicita
dell'utente. Vedi `COACH_RULES.md`.

---

## 8. Timer: la verità è una scadenza persistita

`setInterval` serve **solo** a ridisegnare i numeri. Se muore, non cambia
niente.

Lo stato di un timer (`packages/core/src/timer/timer.ts`) porta sia una base
monotona sia un riferimento all'orologio di sistema:

| | Immune ai cambi d'ora | Sopravvive alla ricreazione del processo |
|---|---|---|
| base monotona | **sì** | no (si azzera) |
| orologio di sistema | no | **sì** |

Quando le due misure non concordano si usa **la maggiore**: per un recupero è la
scelta prudente, perché una sottostima spinge a ricominciare troppo presto. Una
misura negativa (orologio spostato indietro) viene scartata.

Il modulo **non conosce le serie**, per costruzione: non ha nessun campo con cui
segnare come eseguito qualcosa che l'utente non ha confermato. Un test lo
verifica ispezionando le chiavi dello stato.

---

## 9. Piattaforme: cosa è implementato e cosa no

La specifica (§1) chiede di dichiarare quali piattaforme vengono **davvero**
implementate e verificate. Dichiarazione onesta:

| Piattaforma | Implementata | Verificata |
|---|---|---|
| **iPhone (iOS)** | sì, è il bersaglio | **no**: nessuna build prodotta, nessun dispositivo in questo ambiente |
| **iPad (iPadOS)** | sì, `supportsTablet: true`, interfaccia che scorre e si adatta | **no** |
| **Android** | **no**. L'architettura è condivisibile (il dominio è puro, la porta SQL ha già due implementazioni) ma non esiste una configurazione Android verificata | no |
| **Web** | **no, e deliberatamente.** La specifica vieta di aggiungere una versione web solo per poter dire che l'app è multipiattaforma | — |

Non è stata aggiunta una versione desktop: sarebbe un'estensione, e non deve
compromettere il prodotto mobile.

---

## 10. Versionamento

Tre numeri di versione distinti, che cambiano per ragioni diverse:

| Versione | Dove | Cambia quando |
|---|---|---|
| Schema del database | tabella `meta` | si aggiunge una migrazione |
| Protocollo di sincronizzazione | intestazione dei pacchetti | cambia il formato dei pacchetti su Drive |
| Formato dei dati | `formatVersion` nelle operazioni e nel piano | cambia la forma di un'entità |

Un'app **vecchia** che trova un archivio **nuovo** non lo corrompe: `migrate()`
lancia `SchemaTooNewError` **prima** di qualunque scrittura, e
`openDatabaseTolerant()` lo cattura per bloccare la **sola** sincronizzazione
lasciando i dati locali leggibili e scrivibili. Un pacchetto con
`protocolVersion` superiore a quella supportata viene rifiutato senza toccare i
dati.

---

## 11. Sicurezza

- **Nessun segreto nel binario.** OAuth con PKCE, senza client secret.
- **Token nel Keychain** tramite `expo-secure-store`, non nel database.
- **Nessuna telemetria**, nessun dato personale nei log.
- **Nessun codice scaricato da Drive ed eseguito.** Su Drive ci sono solo dati,
  che vengono validati al parsing e rifiutati se malformati.
- Le impostazioni sensibili alla privacy partono **disattivate**: coach
  generativo, sincronizzazione delle foto.

---

## 12. Come si verifica

```bash
npm install
npm run typecheck                 # tsc -b sui tre pacchetti
npm test                          # 429 test su Node
npx tsc --noEmit -p apps/mobile/tsconfig.json
```

Cosa **non** si verifica con questi comandi, e va detto: il driver
`expo-sqlite`, l'interfaccia su un dispositivo reale, e l'integrazione con i
server di Google. Vedi `QA_REPORT.md` per la classificazione completa.
