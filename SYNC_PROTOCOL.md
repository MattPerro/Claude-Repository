# SYNC_PROTOCOL.md — Il protocollo di sincronizzazione su Google Drive

Come TrackStrong sincronizza due dispositivi attraverso `appDataFolder`, e perché
è fatto così.

Data di scrittura: **2026-09-19**. Codice documentato: `packages/sync`
(`SYNC_PROTOCOL_VERSION = 1`, `SYNC_FORMAT_VERSION = 1`).

Questo documento descrive un protocollo **implementato e verificato
automaticamente su Node contro un finto conforme all'API**. Non descrive
un'integrazione provata contro i server di Google: vedi §15, che è la parte del
documento da leggere per prima se interessa lo stato reale.

---

## 0. Le cinque invarianti

Tutto il resto del documento è il dettaglio di queste cinque frasi. Se una
modifica futura al codice ne rompe una, il protocollo può perdere dati.

| # | Invariante | Dove è imposta |
|---|---|---|
| 1 | Il cursore dei cambiamenti avanza **dentro** la stessa scrittura atomica che persiste i dati ricevuti, mai dopo | `SyncStateStore.applyIncoming` riceve `cursor` nel batch |
| 2 | Un upload ritentato dopo una risposta persa **non** crea un secondo pacchetto logico | `PushIntent` persistito prima dell'upload + ricerca per `appProperties.bundleId` |
| 3 | Nessun errore di rete, autorizzazione, quota o spazio viene interpretato come «archivio vuoto» | sette errori tipizzati che si propagano invece di restituire una lista vuota |
| 4 | Un'eliminazione non torna indietro: le tombstone durano 400 giorni e si potano solo su richiesta esplicita | `TOMBSTONE_RETENTION_MS`, `pruneTombstones()` |
| 5 | L'orologio del dispositivo non decide mai quale modifica vince | la divergenza si rileva da `baseRevision`; il tie-break è `(lamport, dispositivo, identificativo)` |

---

## 1. Modello dei dati del protocollo

Su Drive esistono **due soli tipi di file**, entrambi immutabili una volta
scritti: pacchetti di operazioni e snapshot. Non viaggia nessun database.

### 1.1 L'operazione

Un'operazione è un fatto **immutabile** e **applicabile una sola volta**. Nasce
nella stessa transazione della modifica ai dati locali (specifica §7).

| Campo | Tipo | A cosa serve |
|---|---|---|
| `id` | ULID (26 caratteri) | Generato **sul dispositivo** che crea l'operazione. È la **chiave di idempotenza**: se la stessa operazione arriva due volte, viene applicata una volta sola. Non esiste un identificativo provvisorio da rimpiazzare dopo l'upload |
| `origin` | `DeviceId` | Dispositivo che l'ha creata. Compare come origine nelle alternative di un conflitto, così l'utente sa da dove viene ciascuna |
| `workspaceId` | stringa | Archivio di appartenenza. Un'operazione di un altro archivio viene ignorata, non applicata |
| `entityType` | unione chiusa di 19 valori | Su cosa agisce (`session`, `performedSet`, `programPlan`, `bodyMeasurement`, …). Unione **chiusa** di proposito: aggiungere un tipo obbliga a rivedere le regole di conflitto |
| `entityId` | stringa | Quale istanza |
| `kind` | `'upsert' \| 'delete'` | Cosa fa |
| `baseRevision` | intero ≥ 0 | Revisione dell'entità su cui l'autore si è basato. `0` per una creazione. **È così che si rileva un conflitto senza usare l'orologio** |
| `newRevision` | intero > `baseRevision` | Revisione risultante. Sempre `baseRevision + 1`: non è un parametro |
| `payload` | oggetto di campi, o `null` | **Delta**, non l'entità intera. È ciò che permette l'unione automatica di campi disgiunti. `null` per `delete` |
| `formatVersion` | intero ≥ 1 | Versione della forma dei dati nel `payload`, per le migrazioni |
| `createdAt` | `Instant` (ms UTC) | **Solo diagnostica e ordinamento di presentazione.** Nessuna regola del protocollo lo usa per decidere chi vince |
| `lamport` | intero ≥ 1 | Contatore logico monotono per dispositivo, incrementato oltre il massimo osservato (comprese le operazioni ricevute dagli altri). Dà l'ordinamento **causale** |
| `causalDeps` | array di ULID, max 8 | Operazioni sulla **stessa entità** che l'autore aveva già applicato. Serve a riconoscere una ricezione fuori ordine: se le dipendenze non risultano applicate, l'operazione resta in attesa invece di essere applicata su una base sbagliata |

`causalDeps` è deliberatamente **corto** (`MAX_CAUSAL_DEPS = 8`): non è un
vettore di versioni completo, è l'ultimo tratto di storia locale. Basta per
sapere «mi manca qualcosa» senza far crescere il pacchetto senza limite.

### 1.2 Il pacchetto

Un pacchetto raggruppa **N** operazioni. Non si crea mai un file per singola
operazione: il divieto della specifica §8.1 è esplicito («non creare un file
remoto per ogni aggiornamento del timer»), e il valore predefinito è
`DEFAULT_MAX_OPERATIONS_PER_BUNDLE = 200`.

| Campo | A cosa serve |
|---|---|
| `bundleId` | ULID del pacchetto. Replicato in `appProperties`: è la chiave di de-duplicazione lato invio **e** lato ricezione |
| `originDeviceId`, `workspaceId` | Provenienza e archivio |
| `protocolVersion` | Versione del protocollo. Se è superiore a quella supportata, il pacchetto viene **rifiutato** |
| `formatVersion` | Versione della forma dei dati |
| `operationCount`, `lamportRange` | Metadati verificati contro il contenuto al parsing: se non concordano il pacchetto è incoerente e viene rifiutato |
| `createdAt` | Diagnostica |
| `digest` | Impronta del contenuto, per rilevare **corruzione** |
| `operations` | L'elenco delle operazioni |

**Il digest non è una protezione crittografica.** È FNV-1a a 64 bit, nella forma
`fnv1a64-<16 cifre esadecimali>`, calcolato sul JSON canonico delle sole
operazioni. Rileva un troncamento, un download interrotto, un byte alterato.
Non autentica l'autore e non impedisce una manomissione deliberata, perché chi
altera il contenuto può ricalcolare l'impronta. Per una garanzia contro un
avversario servirebbe una firma con chiave, che **questo protocollo non
implementa**: la specifica §14 vieta di dichiarare una protezione non
implementata e non verificata.

Perché FNV-1a e non SHA-256 via `crypto.subtle`: `crypto.subtle.digest` è
**asincrono**, mentre l'impronta serve anche in un percorso sincrono (la
validazione durante il parsing). Introdurre asincronia in quel punto renderebbe
possibile applicare operazioni *prima* della verifica, che è esattamente ciò che
si vuole evitare. Dato che l'obiettivo è rilevare corruzione e non manomissione,
un hash non crittografico sincrono è la scelta corretta.

Il **JSON canonico** ordina le chiavi a ogni livello, così l'impronta è
riproducibile fra dispositivi e fra versioni di runtime.

### 1.3 Nomi e proprietà dei file remoti

| | Pacchetto | Snapshot |
|---|---|---|
| Prefisso | `ts-ops` | `ts-snap` |
| Nome | `ts-ops-<workspaceId>-<lamport a 12 cifre>-<bundleId>.json` | `ts-snap-<workspaceId>-<lamport a 12 cifre>-<snapshotId>.json` |
| `appProperties.kind` | `operations` | `snapshot` |
| Altre `appProperties` | `bundleId`, `workspaceId`, `originDeviceId`, `protocolVersion`, `lamportMax`, `operationCount` | `snapshotId`, `workspaceId`, `originDeviceId`, `protocolVersion`, `lamport`, `entityCount` |

Il `lamport` in testa al nome, riempito di zeri a 12 cifre, serve solo a rendere
l'elenco ordinabile per nome durante un recupero. **Non** è la garanzia di
unicità: vedi §4.3.

### 1.4 Esempio di pacchetto — dati sintetici

Questo è il contenuto **esatto** di un file `ts-ops` come sta su Drive: chiavi
ordinate alfabeticamente, perché è il JSON canonico su cui si calcola
l'impronta. I due `digest` di questa sezione e della successiva sono stati
calcolati con l'implementazione reale, e i due esempi sono stati passati a
`parseBundle` e `parseSnapshot`, che li accettano.

Nome del file:
`ts-ops-ws-sintetico-000000000038-01K5J8W4D2S6AH9NR3VGETPJXC.json`

```json
{
  "bundleId": "01K5J8W4D2S6AH9NR3VGETPJXC",
  "createdAt": 1789804860000,
  "digest": "fnv1a64-9d0ba2e17af06cc5",
  "formatVersion": 1,
  "lamportRange": { "max": 38, "min": 37 },
  "operationCount": 2,
  "operations": [
    {
      "baseRevision": 1,
      "causalDeps": ["01K5J8VTZ9B4XH2CNDPR6KGME0"],
      "createdAt": 1789804800000,
      "entityId": "set-a3",
      "entityType": "performedSet",
      "formatVersion": 1,
      "id": "01K5J8W2A0Q3YF7KP1ZDS5MNRT",
      "kind": "upsert",
      "lamport": 37,
      "newRevision": 2,
      "origin": "dev-telefono-01",
      "payload": { "reps": 8, "rir": 2 },
      "workspaceId": "ws-sintetico"
    },
    {
      "baseRevision": 0,
      "causalDeps": [],
      "createdAt": 1789804860000,
      "entityId": "mis-2026-09-19",
      "entityType": "bodyMeasurement",
      "formatVersion": 1,
      "id": "01K5J8W3C1R5ZG8MQ2TFDSNHVB",
      "kind": "upsert",
      "lamport": 38,
      "newRevision": 1,
      "origin": "dev-telefono-01",
      "payload": { "bodyweightKg": 79.4, "waistCm": 92 },
      "workspaceId": "ws-sintetico"
    }
  ],
  "originDeviceId": "dev-telefono-01",
  "protocolVersion": 1,
  "workspaceId": "ws-sintetico"
}
```

Da leggere così: sul telefono l'utente ha corretto una serie già registrata
(`baseRevision: 1`, quindi sapeva di stare modificando la revisione 1, e cita
l'operazione da cui veniva quella revisione) e ha inserito una pesata nuova
(`baseRevision: 0`, nessuna dipendenza causale). Le due operazioni viaggiano
**insieme**, in un file solo.

### 1.5 Lo snapshot

Uno snapshot è una copia coerente dello stato materializzato, per **accelerare**
il recupero di una nuova installazione.

Tre cose che uno snapshot **non** è:

- **Non sostituisce i pacchetti.** I pacchetti restano sull'archivio: sono la
  storia, lo snapshot è una scorciatoia. Un protocollo in cui lo snapshot
  rimpiazza le operazioni ricade nel divieto «un unico database con vince
  l'ultimo caricamento».
- **Non cancella le tombstone.** Include le tombstone ancora entro la politica
  di conservazione. Se le omettesse, un dispositivo che recupera dallo snapshot
  non saprebbe che un dato è stato eliminato e lo farebbe ricomparire.
- **Non è un backup di stati precedenti.** La specifica §14 distingue
  «sincronizzazione dello stato corrente» da «backup recuperabile di stati
  precedenti»: questo è il primo.

Contiene: `entities` (entità vive **e** tombstone, ciascuna con la marcatura per
campo di §7.1), `appliedOperationIds` (che rientrano nel registro di idempotenza,
così un pacchetto vecchio riapplicato dopo un recupero resta un no-op),
`openConflicts` (i conflitti aperti non si perdono in un recupero), `lamport`,
`entityCount`, `tombstoneCount`, `digest`.

Esempio ridotto a due entità, una viva e una eliminata — dati sintetici:

```json
{
  "appliedOperationIds": [
    "01K5J8VQP7A2WD9BNMTRS4HGCF",
    "01K5J8VTZ9B4XH2CNDPR6KGME0",
    "01K5J8W2A0Q3YF7KP1ZDS5MNRT"
  ],
  "createdAt": 1789804920000,
  "digest": "fnv1a64-cbe1c00398debdfe",
  "entities": [
    {
      "deleted": false,
      "deletedAt": null,
      "deletedAtRevision": 0,
      "deletedByOperationId": null,
      "entityId": "set-a3",
      "entityType": "performedSet",
      "fieldStamps": {
        "reps": { "lamport": 37, "operationId": "01K5J8W2A0Q3YF7KP1ZDS5MNRT", "origin": "dev-telefono-01", "revision": 2 },
        "rir":  { "lamport": 37, "operationId": "01K5J8W2A0Q3YF7KP1ZDS5MNRT", "origin": "dev-telefono-01", "revision": 2 }
      },
      "fields": { "reps": 8, "rir": 2 },
      "lamport": 37,
      "lastOperationId": "01K5J8W2A0Q3YF7KP1ZDS5MNRT",
      "revision": 2,
      "workspaceId": "ws-sintetico"
    },
    {
      "deleted": true,
      "deletedAt": 1789718400000,
      "deletedAtRevision": 3,
      "deletedByOperationId": "01K5J8VTZ9B4XH2CNDPR6KGME0",
      "entityId": "ses-07",
      "entityType": "session",
      "fieldStamps": {
        "slot":   { "lamport": 12, "operationId": "01K5J8VQP7A2WD9BNMTRS4HGCF", "origin": "dev-tablet-02", "revision": 1 },
        "status": { "lamport": 31, "operationId": "01K5J8VTZ9B4XH2CNDPR6KGME0", "origin": "dev-tablet-02", "revision": 3 }
      },
      "fields": { "slot": "A", "status": "completed" },
      "lamport": 31,
      "lastOperationId": "01K5J8VTZ9B4XH2CNDPR6KGME0",
      "revision": 3,
      "workspaceId": "ws-sintetico"
    }
  ],
  "entityCount": 2,
  "formatVersion": 1,
  "lamport": 38,
  "openConflicts": [],
  "originDeviceId": "dev-telefono-01",
  "protocolVersion": 1,
  "snapshotId": "01K5J8W5E3T7BJ0PS4WHFVQKYD",
  "tombstoneCount": 1,
  "workspaceId": "ws-sintetico"
}
```

Nella tombstone i **campi restano**: servono a mostrare all'utente cosa sta per
essere ripristinato quando risolve un conflitto «modifica contro eliminazione»,
e a un ripristino non distruttivo.

---

## 2. Versionamento

Tre numeri distinti, che cambiano per ragioni diverse. La tabella completa sta
in `ARCHITECTURE.md` §10; qui la parte che riguarda il protocollo.

| Versione | Dove vive | Cambia quando | Valore attuale |
|---|---|---|---|
| Protocollo di sincronizzazione | intestazione del pacchetto e dello snapshot (`protocolVersion`) | cambia il formato dei file su Drive | 1 |
| Formato dei dati | `formatVersion` nell'operazione e nel pacchetto | cambia la forma di un'entità | 1 |
| Schema del database locale | tabella `meta` in SQLite (`packages/db`) | si aggiunge una migrazione | vedi `ARCHITECTURE.md` |

### 2.1 App vecchia, archivio nuovo

È il caso pericoloso, perché una scrittura dell'app vecchia potrebbe corrompere
dati che non sa interpretare. Comportamento:

1. `parseBundle` controlla `protocolVersion` **prima di qualunque altra cosa**,
   prima ancora di guardare gli altri campi: se non sappiamo leggere il formato,
   non dobbiamo nemmeno provare a interpretarlo.
2. Se è superiore a quella supportata, il pacchetto viene **rifiutato** con il
   codice `protocollo-troppo-recente` e un messaggio che dice di aggiornare
   TrackStrong.
3. Il rifiuto **non tocca i dati locali**: nessuna scrittura, nessuna
   cancellazione. Si blocca la **sola** sincronizzazione incompatibile,
   preservando i dati locali (specifica §14).
4. Lo stesso vale per `formatVersion` (codice `formato-troppo-recente`) e per gli
   snapshot: uno snapshot troppo recente viene ignorato e il recupero ricade sui
   pacchetti, che restano tutti sull'archivio. Non si perde nulla, perché lo
   snapshot è solo un'accelerazione.

C'è un secondo effetto, meno ovvio, che il test verifica: un dispositivo nuovo
che su Drive trova **solo** pacchetti di un protocollo futuro riconosce comunque
che **l'archivio remoto esiste**, e quindi non crea un secondo programma
iniziale. Rifiutare il contenuto non significa concludere «non c'è niente».

### 2.2 App nuova, archivio vecchio

Caso benigno e non gestito con un blocco: `protocolVersion` e `formatVersion`
minori o uguali a quelle supportate vengono accettate. Quando servirà una
migrazione di formato, `formatVersion` nell'operazione dirà quale trasformazione
applicare al `payload` prima di materializzarlo. **Al momento non esiste nessuna
migrazione di formato scritta**, perché esiste una sola versione.

### 2.3 Gli otto motivi di rifiuto di un pacchetto

| Codice | Significato |
|---|---|
| `json-non-valido` | Non è JSON, o è troncato (download interrotto) |
| `struttura-non-valida` | Campi mancanti o di tipo sbagliato |
| `protocollo-troppo-recente` | `protocolVersion` superiore a quella supportata |
| `formato-troppo-recente` | `formatVersion` superiore a quella supportata |
| `digest-non-corrispondente` | L'impronta non corrisponde al contenuto: file corrotto |
| `archivio-diverso` | Appartiene a un altro `workspaceId` |
| `operazione-non-valida` | Una o più operazioni sono malformate |
| `metadati-incoerenti` | `operationCount` o `lamportRange` non concordano col contenuto |

In tutti gli otto casi: niente viene scritto in locale, il pacchetto va in
**quarantena** (§12) e le altre operazioni del giro proseguono. Un pacchetto
malformato non deve interrompere l'applicazione degli altri.

---

## 3. Ciclo di vita di un'operazione

```
DISPOSITIVO A                     GOOGLE DRIVE                    DISPOSITIVO B
                                 (appDataFolder)

 1. l'utente conferma
    una serie
       │
       ▼
 2. UNA transazione:
    ┌──────────────────────────┐
    │ modifica ai dati         │
    │ + operazione nella coda  │   ← specifica §7: stessa transazione
    │ + registro applicate     │
    │ + nuovo max lamport      │
    └──────────────────────────┘
       │
       │  (da qui in poi il dato è salvo: la rete non serve più)
       ▼
 3. push():
    raggruppa in un pacchetto
       │
       ▼
 4. PushIntent persistito
    PRIMA dell'upload
       │
       ▼
 5. files.list per bundleId ──────────▶ esiste già?
       │                                   │
       │  no                               │ sì (risposta persa a un
       ▼                                   │     tentativo precedente)
 6. files.create ─────────────────────▶ ts-ops-….json
       │                                   │
       ▼                                   ▼
 7. markOperationsSent  ◀──────────── stesso fileId, nessun file nuovo
    (solo ora la coda si svuota)
       │
       ▼
 8. PushIntent cancellato
                                            │
                                            │ 9. changes.list(pageToken)
                                            ▼
                                    ┌───────────────────┐
                                    │ pagina di cambi   │──────▶ 10. filtra:
                                    └───────────────────┘            kind, workspace,
                                                                     bundleId già visto?
                                                                        │
                                                                        ▼
                                                              11. files.get?alt=media
                                                                        │
                                                                        ▼
                                                              12. parseBundle:
                                                                  versione → struttura
                                                                  → operazioni → digest
                                                                  → metadati
                                                                        │
                                                       rifiutato ◀──────┤
                                                       (quarantena)     │ accettato
                                                                        ▼
                                                              13. ordinamento causale
                                                                        │
                                                                        ▼
                                                              14. per ogni operazione:
                                                                  già applicata? → no-op
                                                                  deps mancanti? → attesa
                                                                  altrimenti resolveIncoming
                                                                        │
                                                                        ▼
                                                              15. UNA scrittura atomica:
                                                                  ┌──────────────────────┐
                                                                  │ record aggiornati    │
                                                                  │ + registro applicate │
                                                                  │ + conflitti          │
                                                                  │ + coda in attesa     │
                                                                  │ + quarantena         │
                                                                  │ + CURSORE            │
                                                                  └──────────────────────┘
                                                                        │
                                                            se fallisce │ il cursore
                                                                        │ NON avanza:
                                                                        │ il giro si ripete
                                                                        ▼
                                                              16. dato visibile su B
```

I punti 2, 4→7 e 15 sono i tre luoghi dove il protocollo può perdere dati se
l'ordine delle scritture è sbagliato. Sono descritti in dettaglio nelle sezioni
seguenti.

---

## 4. Push

### 4.1 Raggruppamento

`push()` prende le operazioni in coda, le ordina causalmente e le taglia in
pacchetti da `maxOperationsPerBundle` (predefinito 200). L'ordinamento causale
non è cosmetico: rende il pacchetto **applicabile da solo** quando possibile,
così chi lo riceve non deve attendere un pacchetto successivo.

Una seduta genera facilmente centinaia di operazioni fra serie e timer. Il test
`raggruppa le operazioni: 50 operazioni non producono 50 file remoti` verifica il
vincolo in entrambe le direzioni: con pacchetti da 200 → 1 file; con pacchetti da
20 → 3 file, non 50.

### 4.2 `PushIntent` scritto prima dell'upload

L'intento contiene `bundleId`, gli `operationIds`, il nome, il contenuto
serializzato e le `appProperties`. Viene scritto **prima** di toccare la rete.

Il motivo è uno solo: dopo una risposta persa, il dispositivo deve poter
**riusare lo stesso `bundleId`**. Se lo rigenerasse, il retry produrrebbe un
secondo pacchetto logico con lo stesso contenuto e identificativo diverso — cioè
un duplicato che la de-duplicazione per `bundleId` non potrebbe riconoscere. (Le
operazioni contenute avrebbero comunque lo stesso `id`, quindi il danno sarebbe
limitato a un file inutile; ma è un difetto che si evita a costo zero.)

Ordine delle scritture alla conferma, che conta:

1. `markOperationsSent(...)` — la coda si svuota e il pacchetto è registrato;
2. `writePushIntent(null)` — l'intento si cancella.

Se il processo muore fra le due, al riavvio si ritrova l'intento, si ritrova il
file su Drive e **non si carica nulla di nuovo**.

### 4.3 Perché il nome del file non è la garanzia di unicità

Il nome remoto è deterministico solo per rendere l'archivio leggibile e
filtrabile per prefisso. La de-duplicazione **non** si affida a esso, e il
motivo è nella documentazione ufficiale del campo `name` di `files`, verificata
il 2026-09-19 sul discovery document `drive v3` rev. `20260901`:

> «The name of the file. This isn't necessarily unique within a folder.»

Due `files.create` con lo stesso `name` producono **due file distinti con due
`id` diversi**. La chiave di identità in Drive è l'`id` assegnato dal server, non
il nome. E anche a nome uguale la de-duplicazione logica deve valere fra
dispositivi diversi e attraverso un ripristino: l'unica cosa su cui si può
contare è un identificativo generato sul dispositivo.

Quindi si de-duplica su due livelli:

| Livello | Chiave | Dove |
|---|---|---|
| Pacchetto | `bundleId`, replicato in `appProperties` | `files.list` prima dell'upload; `hasSeenBundle` prima di applicare; dedup anche **dentro la stessa pagina** di cambiamenti |
| Operazione | `SyncOperation.id` | registro locale delle operazioni applicate |

Il secondo livello è la rete di sicurezza del primo: se lo stesso pacchetto
arrivasse comunque due volte con due `fileId` diversi, le operazioni verrebbero
applicate una volta sola. Il test
`de-duplica sull identificativo del pacchetto e non sul nome del file` carica
deliberatamente due file con nome identico e verifica che il ricevente applichi
una volta sola.

La ricerca per proprietà privata usa l'operatore `has` documentato:

```
q = appProperties has { key='bundleId' and value='01K5J8W4D2S6AH9NR3VGETPJXC' }
spaces = appDataFolder
```

`appProperties` è documentato come «A collection of arbitrary key-value pairs
which are private to the requesting app… You cannot use an API key to retrieve
private properties» — quindi la ricerca richiede un token OAuth, che è
comunque quello che l'app usa.

### 4.4 Il caso «risposta persa», per intero

Il fatto rilevante non è il dettaglio del protocollo di upload ripristinabile,
ma una sua conseguenza, che la guida ufficiale afferma esplicitamente:

> «you should not assume that the server received all bytes sent in any given
> request»

Tradotto in una regola di protocollo: **un upload il cui esito è ignoto può
essere andato a buon fine.** Quindi il retry deve *verificare*, non riscrivere.
Il codice modella questo con `DriveError.maybePartiallyApplied`, vero per
`DriveNetworkError` e `DriveConflictError`.

L'implementazione mette il controllo e l'upload **dentro** la funzione ritentata,
così ogni tentativo ricontrolla:

```
tentativo n:
    files.list(appProperties.bundleId = …)
    se trovato  → restituisci quel fileId, non caricare
    altrimenti  → files.create
```

Il test `non crea un secondo pacchetto quando la risposta di un upload va persa`
verifica due varianti: (a) la risposta si perde e il retry interno ritrova il
file nello stesso `push()`; (b) il dispositivo ha un solo tentativo disponibile,
`push()` lancia, e un secondo `push()` — come dopo un riavvio — ritrova il file e
non ne crea un altro. In entrambe, il conteggio dei file remoti resta quello
atteso.

---

## 5. Pull

### 5.1 Il giro

```
cursore = readCursor()
se è null → primo recupero (§6), che lo imposta

ripeti:
    pagina = changes.list(pageToken = cursore)
    nuovoCursore = pagina.nextPageToken ?? pagina.newStartPageToken ?? cursore
    pacchetti = scarica e valida i file della pagina + quelli in quarantena
    applyIncoming({ …dati…, cursor: nuovoCursore })     ← una sola scrittura
    cursore = nuovoCursore
finché pagina.nextPageToken != null
```

Il cursore iniziale viene da `changes.getStartPageToken` (GET
`changes/startPageToken`), che restituisce uno `StartPageToken` con il solo campo
`startPageToken`. `changes.list` (GET `changes`) accetta `pageToken` e
restituisce uno `ChangeList` con `changes`, `nextPageToken` e
`newStartPageToken`. Tutti e tre i nomi di campo sono confermati sul discovery
document del 2026-09-19. Quando `nextPageToken` è assente, `newStartPageToken`
è il cursore da conservare per il giro successivo.

Ogni chiamata usa `spaces=appDataFolder`, documentato come «A comma-separated
list of spaces to query within the corpora. Supported values are `drive` and
`appDataFolder`».

### 5.2 Perché il cursore avanza *dentro* `applyIncoming`

Questa è l'invariante 1, ed è il punto singolo più importante del protocollo.

Se il cursore fosse una scrittura separata dopo la persistenza dei dati:

```
applyIncoming(dati)     ✓ riuscita
                        ← crash, batteria scarica, processo ucciso
writeCursor(nuovo)      ✗ mai eseguita
```

questo caso è innocuo (si ripete la pagina, e le operazioni sono idempotenti). Il
caso dannoso è l'ordine opposto, o qualunque implementazione in cui il cursore
possa risultare avanti rispetto ai dati:

```
writeCursor(nuovo)      ✓
applyIncoming(dati)     ✗ fallisce
```

Ora il cursore punta oltre cambiamenti che non sono stati applicati, e quei
cambiamenti **non verranno mai più consegnati**. Nessun errore, nessun avviso:
i dati di quel giro sono persi in silenzio. È esattamente il divieto della
specifica §8.1, «non avanzare il cursore prima di aver persistito i dati
ricevuti».

Il contratto elimina la possibilità di sbagliare, invece di raccomandare un
ordine: `IncomingBatch` **contiene** il cursore, e `applyIncoming` scrive tutto
o niente. Un'implementazione che eseguisse le scritture separatamente violerebbe
il contratto documentato nella porta.

Il test `avanza il cursore solo dopo la persistenza` inietta un guasto di
persistenza (`failNextApplyIncoming`), verifica che `pull()` lanci, che il
cursore sia **identico** a prima e che il dato non sia arrivato; poi ripete il
pull e verifica che lo stesso cambiamento venga riconsegnato e applicato.

### 5.3 Paginazione

Il cursore avanza **una pagina alla volta**, usando `nextPageToken` come
cursore intermedio. L'alternativa — accumulare tutte le pagine e persistere una
volta sola alla fine — sarebbe altrettanto corretta rispetto all'invariante, ma
su uno storico lungo terrebbe in memoria un numero arbitrario di operazioni e
ricomincerebbe da zero a ogni fallimento. Persistere per pagina limita sia la
memoria sia il lavoro perso.

### 5.4 Ricezione fuori ordine

I cambiamenti possono arrivare in qualunque ordine. Il protocollo non si affida
all'ordine di arrivo:

- **Dentro un giro**, le operazioni vengono ordinate topologicamente sulle
  `causalDeps` presenti nell'insieme, con `(lamport, dispositivo, identificativo)`
  come tie-break stabile.
- **Fra giri diversi**, un'operazione le cui dipendenze non risultano ancora
  applicate va in una **coda di attesa** persistita, e rientra in gioco a ogni
  giro successivo. L'applicazione è un ciclo che ripete finché fa progressi.
- Un'operazione con `baseRevision > 0` su un'entità mai vista **non** viene
  applicata come creazione: sarebbe costruire l'entità su una base sbagliata.
  Resta in attesa.

L'ordinamento dei file per `lamportMax` dichiarato nelle `appProperties` è
un'**euristica** che riduce le attese, non una garanzia: la correttezza dipende
dalle dipendenze causali.

Due test coprono questo: `arriva allo stato finale corretto con operazioni
ricevute fuori ordine` (tre operazioni concatenate, pubblicate al rovescio, una
pagina per cambiamento, pagine restituite in ordine inverso: lo stato finale è
corretto e la coda di attesa si svuota) e `ricompone le operazioni arrivate a
pezzi, senza applicarle su una base sbagliata` (verifica esplicitamente che
l'entità **non** venga creata dalla sola modifica parziale).

---

## 6. Primo recupero su una nuova installazione

Sequenza (specifica §8.3: `installazione → accesso Google → recupero → uso
offline`):

| # | Passo | Perché in questo ordine |
|---|---|---|
| 1 | `changes.getStartPageToken()` | **Prima di tutto.** Vedi §6.1 |
| 2 | `files.list` degli snapshot e dei pacchetti | Inventario remoto |
| 3 | Scarica e applica lo snapshot più recente per contatore logico | Accelerazione; se corrotto o troppo recente si prova il precedente, altrimenti si prosegue senza |
| 4 | Scarica e applica **tutti** i pacchetti | Lo snapshot non li sostituisce |
| 5 | `applyIncoming({ …, cursor: startPageToken })` | Dati **e** cursore in una sola scrittura |
| 6 | `pull()` immediatamente dopo | Recupera ciò che è arrivato durante i passi 3–4 |

### 6.1 Perché lo `startPageToken` si prende *prima* di scaricare lo storico

Il download dello storico non è istantaneo: su un archivio di anni può durare
minuti. In quella finestra un altro dispositivo può caricare un pacchetto.

Con l'ordine corretto — token prima, download dopo — il token si riferisce a un
istante **precedente** all'inizio del download. Ogni pacchetto caricato da quel
momento in poi compare in `changes.list` a partire da quel cursore, quindi il
`pull()` del passo 6 lo trova. Lo stesso pacchetto può arrivare sia dal download
dello storico sia dai cambiamenti: è innocuo, perché la de-duplicazione per
`bundleId` e per `id` di operazione lo scarta la seconda volta.

Con l'ordine inverso — download prima, token dopo — il token si riferirebbe a un
istante **successivo** alla fine del download, e tutto ciò che è arrivato nel
frattempo cadrebbe in una finestra cieca larga esattamente quanto il download
dello storico. Cioè il momento peggiore: il primo recupero è anche il momento in
cui il download dura più a lungo.

Il test `non perde le modifiche arrivate durante il primo download dello storico`
inserisce un gancio che pubblica un pacchetto da un terzo dispositivo **durante
la prima `files.get`**, e verifica due cose in sequenza: che dopo `bootstrap()`
quel dato non ci sia (non era nell'inventario iniziale), e che dopo il `pull()`
successivo ci sia.

### 6.2 «Non creare un secondo programma iniziale»

`bootstrap()` restituisce `foundRemoteArchive` e `shouldCreateInitialProgram`,
il secondo vero **solo** se l'archivio remoto è assente. Chi chiama genera il
programma iniziale solo in quel caso.

Il punto delicato è che `foundRemoteArchive: false` deve significare «ho
guardato e non c'era niente», non «non sono riuscito a guardare». Per questo
qualunque errore di accesso, quota o rete nei passi 1–4 **interrompe** il
recupero con un'eccezione tipizzata invece di restituire un risultato. Un
`bootstrap()` che avesse restituito `foundRemoteArchive: false` davanti a un
token revocato porterebbe a creare un secondo programma iniziale e, al ripristino
dell'accesso, a due archivi indipendenti da riconciliare.

Due test coprono i due lati: `non crea un secondo programma iniziale se l
archivio remoto esiste già` e `segnala il token revocato come errore distinto,
non come archivio vuoto`.

Se due archivi indipendenti esistono davvero, la specifica §8.3 chiede una
**riconciliazione non distruttiva**. Il protocollo fornisce i mattoni (conflitti
materializzati, conservazione di entrambe le versioni), ma **una procedura di
riconciliazione guidata non è implementata**: vedi §15.

---

## 7. Conflitti

### 7.1 La marcatura per campo

Ogni entità materializzata porta, oltre ai valori, una marcatura **per singolo
campo** (`fieldStamps`): a quale revisione quel campo è stato impostato, da quale
operazione e da quale dispositivo.

Senza di essa non si potrebbe distinguere:

- «hai modificato un campo che io non avevo toccato» → modifica indipendente, si
  unisce;
- «hai modificato lo stesso campo che avevo modificato io» → conflitto.

Un protocollo con la sola revisione di entità dovrebbe scegliere fra due
comportamenti entrambi sbagliati: dichiarare conflitto per qualunque modifica
concorrente sulla stessa entità (rumore insopportabile: una nota e un RIR
diventano un conflitto), oppure sovrascrivere l'entità intera (perdita
silenziosa). La marcatura per campo permette il comportamento corretto: unire i
campi disgiunti **e** materializzare il conflitto sul solo campo contestato,
applicando gli altri.

### 7.2 L'ordine di valutazione

Le regole si applicano in quest'ordine, e l'ordine conta:

| # | Condizione | Esito |
|---|---|---|
| 1 | Operazione di un altro archivio | ignorata |
| 2 | Seduta con `status: 'active'` posseduta da un altro dispositivo | **in attesa di conferma** (§9) |
| 3 | Entità mai vista, `baseRevision > 0` | in attesa: mancano le operazioni precedenti |
| 4 | Entità mai vista, `delete` | tombstone registrata comunque |
| 5 | Entità mai vista, `upsert` con `baseRevision = 0` | creazione |
| 6 | `baseRevision > revisione locale` | in attesa: mancano le operazioni intermedie |
| 7 | Entità eliminata + `upsert` | §7.4 |
| 8 | Entità viva + `delete` | §7.4, visto dall'altro lato |
| 9 | Entità viva + `upsert` | §7.3 |

Il controllo 2 viene per primo di proposito: nemmeno un'eliminazione remota può
toccare una seduta che l'utente sta svolgendo su un altro dispositivo.

Il controllo 4 esiste per lo stesso motivo del punto 3 di §7.4: se un'eliminazione
arrivasse **prima** della creazione (pacchetti in ordine inverso) e non venisse
registrata, la creazione successiva farebbe ricomparire il dato.

### 7.3 Regola 1 — modifica contro modifica

Per **ogni campo** del delta in arrivo:

| Situazione del campo in locale | Esito |
|---|---|
| Mai toccato, oppure toccato a una revisione ≤ `baseRevision` dell'operazione | **unione automatica**: l'autore aveva già visto quel valore, non c'è divergenza |
| Toccato a una revisione > `baseRevision`, ma con lo **stesso** valore | convergenza: niente da chiedere, niente conflitto |
| Toccato a una revisione > `baseRevision` con valore **diverso** | **conflitto materializzato** |

**Esempio di unione automatica.** Serie `set-a3` alla revisione 1 su entrambi i
dispositivi. Il telefono aggiunge `note: "buona tecnica"`, il tablet aggiunge
`rir: 1`. Entrambe le operazioni hanno `baseRevision: 1`. Dopo lo scambio,
entrambi i dispositivi hanno `note`, `rir` **e** i campi originali, e zero
conflitti. Lo stesso vale, a maggior ragione, per entità diverse: una pesata
nuova e un allenamento nuovo si conservano entrambi, come richiede
esplicitamente la specifica §8.2.

**Esempio di conflitto — quello della specifica.** Serie `set-a3` alla revisione
1 con `reps: 12` su entrambi i dispositivi. Offline:

| | Telefono | Tablet |
|---|---|---|
| Operazione | `{ reps: 8 }` | `{ reps: 10 }` |
| `baseRevision` | 1 | 1 |
| `newRevision` | 2 | 2 |

Le due `baseRevision` sono identiche e le due `newRevision` collidono: è la
firma della divergenza, rilevata **senza guardare nessun orologio**. Al momento
dello scambio ciascun dispositivo ha già la propria modifica alla revisione 2, e
riceve un'operazione con `baseRevision: 1` che tocca lo stesso campo `reps` con
un valore diverso. Esito su **entrambi** i dispositivi:

- un record in `conflicts` con `reason: 'stesso-campo-divergente'`,
  `field: 'reps'`, e **due alternative conservate**: valore `8` da
  `dev-telefono`, valore `10` da `dev-tablet`, ciascuna con il proprio
  `operationId`, `origin` e `lamport`;
- una domanda in italiano, del tipo: «Per la serie le ripetizioni ha due valori
  diversi: 8 su dispositivo dev-telefono e 10 su dispositivo dev-tablet. Quale
  vuoi conservare? Entrambi restano salvati finché non scegli.»;
- lo stato mostrato diventa `Conflitto da risolvere`;
- **nessuna delle due modifiche è stata scartata**, e il valore locale non è
  stato sovrascritto.

La risoluzione (`resolveConflict`) è una scelta esplicita e **genera una nuova
operazione locale**: è così che la decisione si propaga agli altri dispositivi
invece di restare locale. L'alternativa non scelta resta nella tabella dei
conflitti come storia della decisione: non viene cancellata.

### 7.4 Regola 2 — modifica contro eliminazione

**La cancellazione non vince in automatico.** Il discrimine è se l'autore della
modifica *aveva visto* l'eliminazione:

| Confronto | Interpretazione | Esito |
|---|---|---|
| `baseRevision >= deletedAtRevision` | L'autore conosceva l'eliminazione e ricrea deliberatamente | applicata: l'entità torna viva |
| `baseRevision < deletedAtRevision` | L'autore non l'aveva vista | **conflitto**, l'entità **resta eliminata** |

**Esempio.** Misurazione `mis-1` alla revisione 1 su entrambi i dispositivi. Il
tablet va offline. Il telefono elimina la misurazione: operazione `delete` con
`baseRevision: 1`, `newRevision: 2`, quindi `deletedAtRevision = 2`. Trenta
giorni dopo il tablet, ignaro, invia `{ waistCm: 90 }` con `baseRevision: 1`.

Quando il telefono riceve quella modifica: `1 < 2`, quindi conflitto
`modifica-vs-eliminazione`. Il record **non viene modificato**: resta eliminato,
il valore precedente di `waistCm` resta quello che era, e la misurazione non
riappare fra le entità vive. Ma la modifica del tablet **non è scartata**: è una
delle due alternative del conflitto, e la domanda dice che finché l'utente non
sceglie il dato resta eliminato e la modifica resta conservata.

La simmetria è gestita: se è il `delete` remoto ad arrivare su un'entità
modificata localmente dopo la sua base, vale la stessa regola vista dall'altro
lato — conflitto, e **nulla viene eliminato** in automatico.

Conseguenza da accettare consapevolmente: fra la materializzazione del conflitto
e la sua risoluzione, i due dispositivi mostrano stati diversi (uno il dato
eliminato, l'altro il dato presente). È il prezzo di non decidere al posto
dell'utente, e lo stato `Conflitto da risolvere` lo rende visibile su entrambi.

### 7.5 Regola 3 — revisioni concorrenti del programma

Due `programPlan` **distinti** che dichiarano la stessa `version` e vengono da
origini diverse sono due revisioni concorrenti: una creata offline su un
dispositivo, l'altra sull'altro.

**Esempio.** Offline, il telefono crea `plan-telefono` con
`{ version: 2, revisionReason: "aumento volume" }` e il tablet crea
`plan-tablet` con `{ version: 2, revisionReason: "riduzione frequenza" }`. Dopo
lo scambio, su entrambi i dispositivi:

- **due** `programPlan` vivi, nessuno sovrascritto;
- un conflitto con `reason: 'revisioni-concorrenti-programma'` e
  `nonDestructive: true`, le cui due alternative citano gli `entityId` distinti;
- la domanda propone di scegliere quale usare **oppure di rinumerarne una**, e
  dichiara che nessuna viene eliminata.

È l'unico conflitto marcato `nonDestructive: true` insieme a quello della seduta
in corso: le due alternative possono coesistere come versioni distinte senza che
si perda nulla.

### 7.6 Il tie-break è un ordinamento, non un giudizio

Dove serve un ordine deterministico si usa, in quest'ordine,
**`(lamport, dispositivo, identificativo)`**.

Serve a una cosa sola: garantire che due dispositivi che hanno visto lo **stesso
insieme** di operazioni arrivino allo **stesso stato**. Senza un ordine totale
deterministico, due dispositivi potrebbero applicare le stesse operazioni in
ordini diversi e divergere.

**Non è un giudizio su quale modifica sia quella giusta.** Quando due modifiche
sono davvero incompatibili, la decisione non viene presa dal tie-break: si
materializza un conflitto e si chiede all'utente. Il tie-break decide *in quale
ordine mostrare le alternative*, non quale alternativa sopravvive.

E l'orologio non entra mai nella decisione. `createdAt` esiste solo per la
diagnostica e per l'ordinamento di presentazione nella cronologia. Il motivo è
concreto: gli orologi dei dispositivi divergono, l'utente può spostare l'ora del
telefono, un fuso può cambiare durante un viaggio. Un protocollo che risolvesse i
conflitti con «vince il più recente» perderebbe silenziosamente le modifiche del
dispositivo con l'orologio indietro.

Il test `usa un tie-break che non dipende dall orologio del dispositivo` lo
verifica direttamente: due operazioni con lo **stesso** `lamport` e orologi
diversi di un'ora vengono ordinate per dispositivo; invertendo gli orologi,
**l'ordine non cambia**.

---

## 8. Tombstone

### 8.1 Perché esistono

Un'eliminazione è un'operazione come le altre, con `kind: 'delete'`, e viene
**conservata**. Il record dell'entità resta, con `deleted: true`,
`deletedAtRevision`, `deletedByOperationId` e `deletedAt`.

Se l'eliminazione non fosse conservata, un'operazione `upsert` tardiva su
quell'entità verrebbe letta come una creazione e il dato eliminato
**ricomparirebbe**. È un danno silenzioso nel modo peggiore: l'utente non vede
un errore, vede riapparire un allenamento che aveva cancellato.

### 8.2 I 400 giorni

```
TOMBSTONE_RETENTION_MS = 400 giorni
```

La scelta è una stima del **peggior ritardo plausibile** di un dispositivo, con
margine. 400 giorni coprono:

- un secondo telefono o un tablet usato una volta l'anno — il caso reale più
  lungo, e la ragione per cui il valore supera l'anno;
- una stagione di inattività seguita dalla ripresa;
- un ripristino da un backup di un anno prima.

Il costo è trascurabile: una tombstone è un record di poche decine di byte, e
l'ordine di grandezza dei dati di TrackStrong è di migliaia di righe, non di
milioni. La simmetria del compromesso è tutta da un lato: conservare troppo costa
byte, conservare troppo poco costa dati dell'utente.

Il valore è una costante con il ragionamento scritto accanto, non un numero
sparso nel codice.

### 8.3 La potatura è esplicita

`pruneTombstones()` è un metodo che il chiamante invoca deliberatamente. Rimuove
**solo** le tombstone il cui `deletedAt` è più vecchio della politica di
conservazione.

Non avviene mai come effetto collaterale:

- un `pull()` non pota;
- `writeSnapshot()` non pota, e lo snapshot **include** le tombstone ancora
  entro la conservazione.

Il test `non fa ricomparire dati eliminati quando si riallinea un dispositivo
vecchio` verifica anche questo: dopo 30 giorni `pruneTombstones()` restituisce
un elenco vuoto e la tombstone è ancora lì; solo oltre la conservazione viene
rimossa.

### 8.4 Il limite che va detto

Oltre i 400 giorni la protezione **cessa**. Un dispositivo che tornasse online
dopo 401 giorni con un `upsert` su un'entità la cui tombstone è stata potata
farebbe ricomparire quel dato. Non è un bug da correggere: è il compromesso
inevitabile di qualunque politica di conservazione finita. È dichiarato qui
perché un lettore possa decidere se il valore è adeguato al suo uso, non
lasciato intendere.

---

## 9. Sessione attiva

Un'operazione remota che modifica una sessione con `status: 'active'` **non
viene applicata in automatico**: va nella coda di attesa e apre un conflitto con
`reason: 'seduta-in-corso'` e `nonDestructive: true`.

La regola precisa: il blocco scatta se il record locale è una `session` con
`status: 'active'` e l'operazione arriva da un dispositivo **diverso** dal
proprietario della seduta (`fields.ownerDeviceId`). Il proprietario può
continuare a modificarla — è lui che la sta svolgendo.

Il motivo è nella specifica §8.2 («non modificare da remoto una seduta in corso
senza conferma») e nell'esperienza d'uso: l'utente è sotto un bilanciere e sta
guardando lo schermo. Un carico o un numero di ripetizioni che cambia da sotto,
in quel momento, non è una sincronizzazione riuscita: è un dato che non
corrisponde più a quello che l'utente sta facendo. E se la seduta è quella in
corso, la modifica remota è quasi certamente basata su una versione più vecchia.

Comportamento verificato dal test `non applica in automatico una modifica remota
su una seduta in corso`:

1. la seduta in corso **non** viene toccata (né i campi né lo stato);
2. si apre un conflitto la cui domanda chiede se applicare le modifiche adesso o
   al termine della seduta, e dichiara che nulla cambia senza conferma;
3. un secondo `pull()` **non duplica** il conflitto e non applica di nascosto —
   la coda di attesa e la de-duplicazione dei conflitti reggono la ripetizione;
4. solo `confirmDeferredOperation(operationId)` applica la modifica.

La conferma sospende la protezione **per quella singola operazione**, non per la
seduta: le altre operazioni in attesa restano in attesa.

---

## 10. Cambio di account Google

`ensureAccount()` è la **prima** istruzione di `push()`, `pull()`,
`bootstrap()` e `writeSnapshot()`. Non è un controllo difensivo generico: è il
punto in cui si impedisce un trasferimento involontario di dati.

Logica:

| Stato | Esito |
|---|---|
| Nessun account collegato | registra l'account attuale e il `deviceId`, prosegue |
| Account collegato = account autenticato | prosegue |
| Account collegato ≠ account autenticato | **`AccountChangedError`**, nessuna chiamata di rete |
| Archivio collegato a un altro `workspaceId` | `WorkspaceMismatchError`, per non mescolare due archivi |

Perché è tassativo: se l'archivio locale contiene i dati dell'account A e l'app
si trova autenticata come B, caricare sarebbe un trasferimento di dati personali
verso un account che potrebbe non essere dell'utente — un telefono prestato, un
account di lavoro selezionato per errore, un dispositivo rivenduto. La specifica
§8.3 è esplicita: «al cambio di account Google **non** caricare automaticamente
i dati sul nuovo account».

Il controllo è posto **prima della rete**, non dopo: lo stato diventa
`Account Google cambiato: conferma richiesta` senza che parta nemmeno una
richiesta. Il test `non trasferisce nulla in automatico quando cambia l account
Google` verifica proprio questo, asserendo `calls.uploads === 0` sulla vista
Drive del nuovo account, oltre a `fileCount() === 0`, e che l'account collegato
**non** sia stato riscritto di nascosto.

Per un trasferimento serve `confirmAccountTransfer(googleAccountId)`, l'unico
modo di ricollegare l'archivio. Va invocato solo dopo che l'utente ha visto e
accettato gli effetti (specifica §14: «il ripristino non sovrascrive
immediatamente gli altri dispositivi: mostra gli effetti e chiedi conferma»).

**Limite dichiarato**: `confirmAccountTransfer` ricollega l'archivio e sblocca la
sincronizzazione, ma **l'interfaccia che mostra gli effetti del trasferimento
prima di chiedere la conferma non è implementata in questo pacchetto** — qui c'è
solo il blocco e il metodo di sblocco. Vedi §15.

---

## 11. Errori e attese

### 11.1 I sette errori tipizzati

Sono classi distinte, non codici in una stringa, perché la specifica §8.1 vieta
di interpretare un errore di autorizzazione, di quota o di rete come «archivio
vuoto». Un elenco vuoto e un errore sono due cose diverse, e confonderle
significa cancellare i dati dell'utente.

| Errore | Causa reale modellata | Ritentabile | Può mascherare un successo | Cosa fa il motore |
|---|---|---|---|---|
| `DriveAuthError` | token revocato o scaduto, consenso ritirato (401, o 403 `authError`) | no | no | interrompe, stato `Accesso da rinnovare`, dati locali intatti, **nessuna attesa** |
| `DriveQuotaError` | quote dell'API superate (403 `userRateLimitExceeded`, quota di progetto) | no | no | interrompe, coda in attesa conservata |
| `DriveStorageFullError` | spazio di Drive dell'utente esaurito (403 `storageQuotaExceeded`) | no | no | interrompe, stato `Spazio su Drive esaurito`, la registrazione locale continua |
| `DriveNetworkError` | rete assente o richiesta interrotta | **sì** | **sì** | backoff e ritenta; ogni tentativo **riverifica** per `bundleId` prima di caricare |
| `DriveRateLimitError` | limite di frequenza (429 `rateLimitExceeded`) | **sì** | no | attende `retryAfterMs` se presente, altrimenti backoff |
| `DriveNotFoundError` | file inesistente o non più visibile all'app (404) | no | no | in quarantena il file viene tolto: non c'è nulla da ritentare |
| `DriveConflictError` | scrittura concorrente segnalata dal server (409, precondizione non soddisfatta) | **sì** | **sì** | verifica prima di ritentare |

La colonna «può mascherare un successo» (`maybePartiallyApplied`) è quella che
guida il comportamento del retry: dove è vera, il retry **non riscrive**, prima
controlla.

Due errori del motore, distinti da quelli di trasporto: `AccountChangedError` e
`WorkspaceMismatchError` (§10). E un errore che arriva dalla porta di
persistenza, non da Drive: un fallimento di `applyIncoming`, che lascia il
cursore indietro.

### 11.2 Backoff con jitter

Segue la guida ufficiale di Google, che prescrive backoff esponenziale con una
componente casuale:

| Parametro | Valore predefinito |
|---|---|
| `maxAttempts` | 5, **primo tentativo incluso** |
| `baseDelayMs` | 1 000 |
| `maxDelayMs` | 32 000 |
| `jitterMs` | 1 000 |

Ritardo del tentativo *n*: `min(base × 2^(n-1), maxDelay) + random × jitter`.

Il jitter evita che più operazioni ritentino in sincronia. La sorgente casuale è
**iniettabile**, quindi i test sono deterministici.

`retryAfterMs` ha la **precedenza** sul backoff calcolato quando il server lo
indica: è il server a sapere quanto aspettare. Unica riserva, per non restare
appesi a un valore assurdo: il ritardo indicato viene limitato a due volte
`maxDelayMs`. Il test `rispetta il ritardo indicato dal server e non attende mai
tempo reale` verifica che due limitazioni con `Retry-After: 4500` producano
esattamente le attese `[4500, 4500]`.

Il **tetto ai tentativi** esiste perché ritentare per sempre significa bloccare
la sincronizzazione e non dirlo all'utente. Superato il tetto, l'errore si
propaga, lo stato lo mostra, e **l'operazione resta in coda**: il test `smette di
ritentare al tetto massimo dei tentativi` verifica sia il numero di attese (2 con
3 tentativi) sia che la coda contenga ancora l'operazione.

Gli errori non ritentabili non producono **nessuna** attesa: ritentare un token
revocato non serve a nulla e nasconderebbe all'utente un problema che deve
vedere.

### 11.3 Nessuna attesa reale nei test

Il ritardo non viene mai eseguito con `setTimeout` dal motore: passa sempre dalla
porta `Sleeper`. Nei test si inietta un finto che registra i ritardi e ritorna
subito. L'intera suite di `packages/sync` gira in meno di un secondo. Se
diventasse lenta, sarebbe il segno che qualcosa ha smesso di usare la porta.

---

## 12. Quarantena dei pacchetti rifiutati — un difetto trovato durante i test

Questa sezione racconta un difetto reale, trovato scrivendo il caso 17
(«pacchetto corrotto → rifiutato, storico intatto»), perché è un buon esempio di
come un protocollo di sincronizzazione può perdere dati **senza segnalare
niente**.

### 12.1 Il difetto

Il comportamento iniziale era quello ovvio, e sembrava corretto:

```
per ogni file della pagina di cambiamenti:
    scarica, valida
    se rifiutato → registra il rifiuto per la diagnostica, prosegui
applyIncoming({ …dati…, cursor: nuovoCursore })   ← il cursore avanza comunque
```

Su un pacchetto **permanentemente** corrotto è giusto: rifiutare, registrare,
andare avanti. Il problema è che non tutti i rifiuti sono permanenti. Un
download interrotto a metà produce JSON troncato, quindi un rifiuto
`json-non-valido` — ma **il file su Drive è integro**. Il difetto era la
combinazione:

1. il pacchetto viene rifiutato e **non** marcato come visto;
2. il cursore avanza comunque, oltre il cambiamento di quel file;
3. `changes.list` non riconsegnerà mai più quel cambiamento;
4. quindi quel pacchetto **non verrà mai più letto**.

Risultato: le operazioni di un pacchetto perfettamente valido perse per sempre a
causa di un'interruzione di rete di un istante. Nessun errore mostrato: l'utente
vede `Sincronizzato con Drive`, e un allenamento non c'è.

Il test che l'ha rivelato è la seconda parte di `rifiuta un pacchetto corrotto
senza cancellare lo storico`: dopo aver troncato un download, un terzo `pull()`
doveva applicare il pacchetto riletto integro. Falliva, restituendo `undefined`
dove ci si aspettava il dato.

Va detto che il difetto è stato trovato perché il test verificava anche il
**recupero**, non solo il rifiuto. Un test che si fermasse a «il pacchetto
corrotto non viene applicato e lo storico è intatto» sarebbe passato, e il
difetto sarebbe rimasto.

### 12.2 La correzione

Un pacchetto rifiutato va in **quarantena**, non semplicemente «registrato». La
quarantena è indicizzata per `fileId` e viene **ritentata a ogni `pull()`
successivo**, in aggiunta alla pagina corrente di cambiamenti.

| Esito del nuovo tentativo | Effetto |
|---|---|
| Letto e valido | applicato, e il file **esce** dalla quarantena |
| Ancora rifiutato | resta in quarantena, con il motivo aggiornato |
| Già visto (arrivato per altra via) | esce dalla quarantena |
| `DriveNotFoundError` | esce dalla quarantena: non c'è più nulla da ritentare |

Meccanica: `BundleRejection` ha ora un campo `fileId` — riempito dal motore, non
dal parser, che vede solo del testo — e `IncomingBatch` ha `clearedRejections`,
l'elenco dei `fileId` da togliere, scritto nella **stessa** transazione atomica
di tutto il resto.

Proprietà risultanti:

- una corruzione **transitoria** si recupera al giro successivo;
- una corruzione **permanente** resta in quarantena, visibile nello stato
  osservabile (`rejectedBundles`), senza bloccare il resto della
  sincronizzazione;
- il cursore continua ad avanzare, quindi non si crea uno stallo su un file
  irrecuperabile.

Con la stessa correzione è stata aggiunta la de-duplicazione per `bundleId`
**dentro la stessa pagina** di cambiamenti: prima era garantita solo
dall'idempotenza a livello di operazione, che è una rete di sicurezza ma non
rende il conteggio dei pacchetti corretto.

### 12.3 Il limite residuo

Un pacchetto in quarantena permanente viene riscaricato a **ogni** `pull()`.
Su un archivio con un file irrimediabilmente corrotto questo è traffico
sprecato per sempre. Non c'è un tetto ai tentativi di quarantena e non c'è una
soglia oltre la quale il file venga abbandonato: **non è implementato**. È
accettabile per l'ordine di grandezza di questo progetto (un utente, due
dispositivi, un file corrotto è un evento eccezionale), ma è un difetto noto, non
una scelta di progetto.

---

## 13. Stati mostrati all'utente

I sei stati della specifica §8.5, più quattro che il motore distingue perché
richiedono azioni diverse.

| Stato interno | Etichetta | Quando |
|---|---|---|
| `salvato-sul-dispositivo` | `Salvato sul dispositivo` | niente in coda, mai sincronizzato |
| `modifiche-in-attesa` | `Modifiche in attesa` | ci sono operazioni da inviare |
| `sincronizzazione-in-corso` | `Sincronizzazione in corso` | durante `push`/`pull`/`bootstrap` |
| `sincronizzato` | `Sincronizzato con Drive` | coda vuota, ultimo giro riuscito |
| `accesso-da-rinnovare` | `Accesso da rinnovare` | `DriveAuthError` |
| `conflitto-da-risolvere` | `Conflitto da risolvere` | almeno un conflitto aperto |
| `spazio-esaurito` | `Spazio su Drive esaurito` | `DriveStorageFullError` |
| `trasferimento-da-confermare` | `Account Google cambiato: conferma richiesta` | `AccountChangedError` |
| `protocollo-non-compatibile` | `Aggiorna l app per sincronizzare` | pacchetti di un protocollo futuro |
| `errore-di-rete` | `Connessione non disponibile` | rete, quota, limite di frequenza |

Lo stato osservabile porta anche i numeri che servono all'interfaccia:
`pendingOperations`, `deferredOperations`, `unresolvedConflicts`,
`rejectedBundles`, `lastSyncedAt`, `cursor`, `lastError`.

### Due precisazioni che la specifica impone

**«Sincronizzato con Drive» non significa che gli altri dispositivi abbiano
scaricato i dati.** Significa una cosa più debole e precisa: le operazioni di
questo dispositivo sono state scritte su Drive e confermate, e questo
dispositivo ha applicato tutto ciò che era disponibile all'ultimo giro. Il tablet
potrebbe essere spento da un mese. Il protocollo non ha modo di sapere cosa
hanno scaricato gli altri, e l'etichetta non deve suggerire che lo sappia.

**Un problema di rete non interrompe la registrazione.** `syncOnce()` non lancia:
raccoglie l'errore nel risultato e aggiorna lo stato. Tutte le scritture locali
funzionano identiche offline, perché `recordLocalChange` non tocca la rete. Il
test `distingue quota di utilizzo e spazio esaurito, senza compromettere la
registrazione` verifica esplicitamente che, con lo spazio Drive esaurito, si
possano ancora registrare serie e che nessuna operazione venga persa.

---

## 14. Casi coperti dai test

26 test, tutti su Node, tutti con orologio e attese finti. Esecuzione:

```bash
npx tsc --noEmit -p packages/sync/tsconfig.json     # exit 0
npx vitest run packages/sync                        # 5 file, 26 test
```

Esito reale al 2026-09-19: **26 test superati su 26**, in circa 0,9 s.

### I 20 casi richiesti

| # | Caso | Nome del test | File |
|---|---|---|---|
| 1 | Allenamento offline e allineamento successivo | `registra un allenamento offline e lo allinea quando torna la connessione` | `protocol.base.test.ts` |
| 2 | Due dispositivi offline, modifiche indipendenti: entrambe conservate | `conserva entrambe le modifiche di due dispositivi offline indipendenti` | `protocol.conflitti.test.ts` |
| 3 | Modifiche incompatibili sullo stesso campo: conflitto visibile | `rende visibile il conflitto su modifiche incompatibili dello stesso campo` | `protocol.conflitti.test.ts` |
| 4 | Upload riuscito ma risposta persa: nessun duplicato | `non crea un secondo pacchetto quando la risposta di un upload va persa` | `protocol.base.test.ts` |
| 5 | Operazioni ricevute fuori ordine | `arriva allo stato finale corretto con operazioni ricevute fuori ordine` | `protocol.recupero.test.ts` |
| 6 | Dispositivo offline per settimane | `riallinea senza perdite un dispositivo rimasto offline per settimane` | `protocol.recupero.test.ts` |
| 7 | Nessuna resurrezione di dati eliminati | `non fa ricomparire dati eliminati quando si riallinea un dispositivo vecchio` | `protocol.recupero.test.ts` |
| 8 | Recupero completo su nuova installazione | `recupera completamente lo storico su una nuova installazione` | `protocol.recupero.test.ts` |
| 9 | Modifiche arrivate durante il primo download | `non perde le modifiche arrivate durante il primo download dello storico` | `protocol.recupero.test.ts` |
| 10 | Token revocato: errore distinto, dati intatti | `segnala il token revocato come errore distinto, non come archivio vuoto` | `protocol.errori.test.ts` |
| 11 | Quota e spazio esauriti: errori distinti | `distingue quota di utilizzo e spazio esaurito, senza compromettere la registrazione` | `protocol.errori.test.ts` |
| 12 | Cambio di account Google: nessun trasferimento | `non trasferisce nulla in automatico quando cambia l account Google` | `protocol.errori.test.ts` |
| 13 | Revisioni concorrenti del programma | `materializza un conflitto per le revisioni concorrenti del programma` | `protocol.conflitti.test.ts` |
| 14 | Cursore avanzato solo dopo la persistenza | `avanza il cursore solo dopo la persistenza` | `protocol.base.test.ts` |
| 15 | Archivio remoto già esistente al primo avvio | `non crea un secondo programma iniziale se l archivio remoto esiste già` | `protocol.recupero.test.ts` |
| 16 | `protocolVersion` futura: rifiutato, dati intatti | `rifiuta un pacchetto con versione di protocollo futura lasciando intatti i dati locali` | `protocol.errori.test.ts` |
| 17 | Pacchetto corrotto: rifiutato, storico intatto | `rifiuta un pacchetto corrotto senza cancellare lo storico` | `protocol.errori.test.ts` |
| 18 | 50 operazioni non producono 50 file | `raggruppa le operazioni: 50 operazioni non producono 50 file remoti` | `protocol.base.test.ts` |
| 19 | Modifica remota su seduta attiva | `non applica in automatico una modifica remota su una seduta in corso` | `protocol.conflitti.test.ts` |
| 20 | Riapplicazione della stessa operazione: no-op | `riapplicare la stessa operazione non ha effetto (idempotenza)` | `protocol.base.test.ts` |

### I 6 casi aggiuntivi

| Caso | Nome del test | File |
|---|---|---|
| Ricomposizione fra giri diversi, senza applicare su una base sbagliata | `ricompone le operazioni arrivate a pezzi, senza applicarle su una base sbagliata` | `protocol.recupero.test.ts` |
| `retryAfterMs` prioritario, e nessuna attesa reale | `rispetta il ritardo indicato dal server e non attende mai tempo reale` | `unita.test.ts` |
| Tetto ai tentativi, operazione non persa | `smette di ritentare al tetto massimo dei tentativi` | `unita.test.ts` |
| Due file con **nome identico**, de-duplicati per `bundleId` | `de-duplica sull identificativo del pacchetto e non sul nome del file` | `unita.test.ts` |
| Tie-break indipendente dall'orologio | `usa un tie-break che non dipende dall orologio del dispositivo` | `unita.test.ts` |
| Tipi di errore distinti e attesa esposta | `distingue il limite di frequenza dagli altri errori e ne espone l attesa` | `unita.test.ts` |

### Guasti che il finto può iniettare

Sono il motivo per cui i casi sopra sono verificabili senza rete:

| Guasto | Metodo |
|---|---|
| Token revocato | `revokeToken()` / `restoreToken()` |
| Quote dell'API esaurite | `exhaustApiQuota()` |
| Spazio di Drive esaurito | `fillStorage()` / `freeStorage()` |
| Dispositivo senza rete | `goOffline()` / `goOnline()` |
| Limite di frequenza, con `Retry-After` | `throttle(volte, retryAfterMs)` |
| Upload che **scrive** e poi perde la risposta | `loseNextUploadResponse()` |
| Upload che falla **senza** scrivere | `failNextUploadBeforeWriting()` |
| Download interrotto a metà | `truncateNextDownload()` |
| Cambiamenti fuori ordine e paginati | opzioni `outOfOrderChanges`, `changesPageSize` |
| Due dispositivi che scrivono contemporaneamente | `writeSimultaneously()` sul backend condiviso |
| Contenuto di un file alterato | `corrupt()` sul backend condiviso |
| Fallimento della persistenza locale | `failNextApplyIncoming()` sullo store |

---

## 15. Limiti dichiarati

Questa è la sezione da leggere per capire lo stato reale. La specifica §15 vieta
di dichiarare funzionante un'integrazione simulata, e questa integrazione è
simulata.

### 15.1 Nessun test ha parlato con Google

**Nessuno dei 26 test ha contattato un server di Google.** I motivi, entrambi
strutturali in questo ambiente:

1. **Nessuna credenziale.** Non esiste un account Google di prova, non esiste un
   client OAuth configurato, non esiste un token.
2. **Egress bloccato.** Le richieste verso i domini Google sono rifiutate dal
   proxy di rete dell'ambiente (`EGRESS_BLOCKED` su `developers.google.com`;
   l'accesso a `www.googleapis.com` non è stato nemmeno tentato per l'assenza di
   credenziali).

Di conseguenza i test verificano il **protocollo**, contro un finto
(`InMemoryDriveStore`) costruito sulla documentazione ufficiale. Non verificano
l'integrazione con Drive. La differenza non è formale: un finto riproduce le
ipotesi di chi l'ha scritto, e se un'ipotesi è sbagliata il finto la conferma
invece di smentirla.

### 15.2 Cosa non è verificato

| Ambito | Stato |
|---|---|
| Flusso OAuth, PKCE, rinnovo e revoca reali del token | **non verificato** |
| Comportamento di `appDataFolder` alla disinstallazione o allo scollegamento dell'app | **non verificato** (documentato, mai osservato) |
| `changes.list` sotto concorrenza reale: collasso dei cambiamenti sullo stesso file, ritardi di propagazione, ordine effettivo, eventual consistency dei metadati | **non verificato** |
| Validità, durata e scadenza reali dei `pageToken` | **non verificato**. Il finto tratta un `pageToken` non valido come errore, non come «nessun cambiamento»; il comportamento reale non è stato osservato |
| Protocollo di **upload ripristinabile**: sessione, `308 Resume Incomplete`, header `Range`, ripresa dall'offset | **non implementato e non verificato.** Il finto riduce l'upload al solo fatto rilevante per il protocollo («un esito ignoto può essere un successo»). Un upload ripristinabile reale va scritto nell'implementazione dell'app |
| Codici e `reason` HTTP reali, e la loro mappatura sui sette errori tipizzati | **non verificata.** La mappatura è dedotta dalla guida ufficiale, non osservata |
| Soglie di quota reali, valori effettivi di `Retry-After`, limiti di dimensione dei file, latenza | **non verificati** |
| Prestazioni su un archivio reale di anni (numero di pacchetti, tempo del primo recupero) | **non misurate** |

### 15.3 Cosa non è implementato

Distinto da «non verificato»: queste sono funzioni assenti, non incerte.

| Funzione | Stato |
|---|---|
| Implementazione reale di `DriveStore` con OAuth e `fetch` | **non in questo pacchetto.** Qui c'è solo la porta; l'implementazione vive nell'app |
| Upload ripristinabile | non implementato (vedi sopra) |
| Riconciliazione guidata di **due archivi indipendenti** (specifica §8.3) | non implementata. Esistono i mattoni (conflitti materializzati, conservazione di entrambe le versioni), non la procedura |
| Interfaccia che mostra gli effetti di un trasferimento di account prima della conferma | non implementata in questo pacchetto |
| Migrazioni di `formatVersion` | non implementate: esiste una sola versione |
| Tetto ai tentativi di rilettura di un pacchetto in quarantena permanente | non implementato (§12.3) |
| Cifratura lato client del contenuto dei pacchetti | **non implementata.** I pacchetti su `appDataFolder` sono JSON in chiaro, protetti dai soli controlli di accesso di Drive. Il termine *end-to-end* non è applicabile e non va usato |
| Firma dei pacchetti | non implementata. Il digest rileva corruzione, non manomissione (§1.2) |
| Collegamento con SQLite (`packages/db`) | la porta `SyncStateStore` è definita e documentata; l'implementazione SQLite è di un altro pacchetto |

### 15.4 Classificazione onesta

Secondo la scala della specifica §15:

| | Stato |
|---|---|
| Protocollo (operazioni, pacchetti, conflitti, cursore, tombstone, retry) | **implementato · verificato automaticamente** |
| Integrazione con Google Drive | **implementata come porta · non verificata** |
| Comportamento su un dispositivo reale | **non verificato** |
| Upload ripristinabile, riconciliazione di due archivi, cifratura | **incompleti / non implementati** |

Per chiudere i punti di §15.2 serve una prova manuale con un account Google di
prova, due dispositivi reali e una rete che si possa interrompere a comando.
Finché non è stata fatta, «la sincronizzazione con Drive funziona» **non** è una
affermazione che questo repository possa sostenere.

---

## 16. Fonti

Tutte consultate il **2026-09-19**. L'accesso diretto a `developers.google.com`
è **bloccato dal proxy di rete** di questo ambiente (errore `EGRESS_BLOCKED`), e
questo è annotato caso per caso insieme alla fonte alternativa usata.

| Cosa ho verificato | Fonte | Accesso | Note |
|---|---|---|---|
| Nomi e struttura di `changes.getStartPageToken` (`StartPageToken.startPageToken`), `changes.list` (`ChangeList.changes`, `nextPageToken`, `newStartPageToken`), parametri di `changes.list` e `files.list`, schema `File` (`id`, `name`, `size`, `appProperties`, `trashed`), elenco degli ambiti OAuth | Discovery document ufficiale `drive v3`, revision `20260901`: `https://raw.githubusercontent.com/googleapis/google-api-go-client/main/drive/v3/drive-api.json` | **diretto, riuscito** | È la stessa fonte da cui sono generati i client ufficiali di Google. Scaricato e ispezionato integralmente |
| Frase «The name of the file. This isn't necessarily unique within a folder.» | idem, descrizione del campo `File.name` | **diretto, riuscito** | Citata in `packages/sync/src/bundle.ts` |
| Frase «A collection of arbitrary key-value pairs which are private to the requesting app… You cannot use an API key to retrieve private properties.» | idem, descrizione del campo `File.appProperties` | **diretto, riuscito** | |
| Frase «A comma-separated list of spaces to query within the corpora. Supported values are `drive` and `appDataFolder`.» | idem, parametro `spaces` di `files.list` e `changes.list` | **diretto, riuscito** | |
| Ambito `https://www.googleapis.com/auth/drive.appdata`, descritto come «See, create, and delete its own configuration data in your Google Drive», e sua presenza fra gli ambiti accettati da `changes.getStartPageToken`, `changes.list` e `files.create` | idem, `auth.oauth2.scopes` e il campo `scopes` di ciascun metodo | **diretto, riuscito** | È l'ambito minimo necessario: l'app vede solo la propria cartella dati, non i file personali dell'utente (specifica §8) |
| `spaces=appDataFolder` come modo di interrogare la cartella dati in v3 | `https://developers.google.com/workspace/drive/api/guides/appdata` | **bloccato**; contenuto letto tramite ricerca web sull'indice della pagina ufficiale | |
| La cartella dati viene eliminata quando l'utente disinstalla o scollega l'app, e l'utente può eliminarla a mano | idem | **bloccato**; idem | È il motivo per cui l'archivio remoto non è la fonte di verità |
| I file in `appDataFolder` occupano la quota di Drive dell'utente | idem + documentazione della vecchia Drive Android API | **bloccato**; idem | Motiva `DriveStorageFullError` come caso reale distinto da `DriveQuotaError` |
| `userRateLimitExceeded` → HTTP 403; `rateLimitExceeded` → HTTP 429; backoff esponenziale con jitter prescritto | `https://developers.google.com/workspace/drive/api/guides/handle-errors` | **bloccato**; idem | Motiva `retry.ts` |
| Frase «you should not assume that the server received all bytes sent in any given request»; ripresa dall'offset indicato dall'header `Range` su `308 Resume Incomplete` | `https://developers.google.com/workspace/drive/api/guides/manage-uploads` | **bloccato**; idem | Motiva la verifica per `bundleId` prima di ricaricare |
| Uso dei `pageToken` opachi invece degli identificativi di cambiamento della v2; `newStartPageToken` da conservare | `https://developers.google.com/workspace/drive/api/guides/manage-changes` e `.../guides/v3versusv2` | **bloccato**; idem | |
| Sintassi `appProperties has { key='…' and value='…' }` con l'operatore `has` per le proprietà private | `https://developers.google.com/workspace/drive/api/guides/search-files` e `.../guides/ref-search-terms` | **bloccato**; idem | Citata in `packages/sync/src/bundle.ts` |

Nessun endpoint, ambito, parametro o comportamento è stato inventato. Dove la
documentazione non è stata raggiunta direttamente, la fonte alternativa è
l'indice della **stessa** pagina ufficiale, e il fatto è annotato sopra.

---

## Riferimenti interni

| Documento | Cosa contiene |
|---|---|
| `SPEC.md` §7, §8, §14 | La specifica autorevole. Dove questo documento divergesse, la specifica prevale |
| `ARCHITECTURE.md` §5, §6, §10 | La transazione unica, il riassunto architetturale della sincronizzazione, il versionamento |
| `GOOGLE_DRIVE_SETUP.md` | Configurazione OAuth e ambiti lato app |
| `packages/sync/src/` | Il codice, con le motivazioni nei commenti |
| `packages/sync/test/` | I 26 test elencati in §14 |
