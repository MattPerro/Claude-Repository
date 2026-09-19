# QA_REPORT.md — Stato di verifica di TrackStrong

Che cosa è stato verificato, **come**, e che cosa non lo è.

Data dell'ultima esecuzione: **2026-09-19**.
Commit: vedi `git log --oneline -1`.

---

## 0. I cinque livelli di verifica

La specifica (§15) vieta di confonderli, e questo documento non li confonde.

| Livello | Che cosa significa | Disponibile in questo ambiente |
|---|---|---|
| **A — analisi statica** | letto il codice, `tsc` passa | **sì** |
| **B — test automatico su Node** | `npx vitest run`, con output reale | **sì** |
| **C — simulatore iOS** | app avviata in un simulatore | **no** |
| **D — dispositivo fisico** | app installata su un iPhone | **no** |
| **E — prova utente reale** | una persona l'ha usata | **no** |

L'ambiente di sviluppo è un container **Linux**: non ha Mac, Xcode, iPhone,
simulatore iOS né credenziali Google o Apple. I livelli **C, D ed E non sono
stati raggiunti per nessuna funzione**, e nessuna affermazione in questo
repository sostiene il contrario.

---

## 1. Riassunto

| | |
|---|---|
| Test eseguiti | **429** |
| Test passati | **429** |
| File di test | 21 |
| Typecheck dei pacchetti | **passa** (`tsc -b`, exit 0) |
| Difetti **bloccanti** aperti | vedi §7 |
| Difetti **importanti** aperti | vedi §7 |
| Funzioni **non implementate** | vedi §6 |

### Comandi eseguiti

```
$ npm run typecheck
> tsc -b packages/core packages/db packages/sync
(exit 0, nessun output)

$ npm test
 Test Files  21 passed (21)
      Tests  429 passed (429)
```

---

## 2. Test per area (livello B — automatico su Node)

| File | Test | Area |
|---|---|---|
| `packages/core/test/twelveWeeks.test.ts` | **61** | fedeltà della scheda dell'utente a `SPEC.md` §3 |
| `packages/core/test/theme.test.ts` | **53** | contrasto WCAG, aree di tocco, stati non solo a colore |
| `packages/core/test/engine.test.ts` | **52** | motore adattivo, comportamenti vietati |
| `packages/core/test/threeYear.test.ts` | **36** | copertura triennale, divieti §4.4, durate |
| `packages/core/test/timer.test.ts` | **36** | timer, sospensione, cambio d'orologio, intervalli, lati |
| `packages/core/test/units.test.ts` | **30** | convenzioni di carico, virgola italiana, gradini |
| `packages/core/test/exercises.test.ts` | **29** | completezza delle guide offline |
| `packages/core/test/time.test.ts` | **27** | date, ora legale, anni bisestili, fusi orari |
| `packages/db/test/sedute.test.ts` | **17** | sessioni, bozze, ripresa, snapshot congelato |
| `packages/db/test/serie.test.ts` | **15** | serie, doppio tocco, comparabilità, valori nulli |
| `packages/db/test/backup.test.ts` | **10** | esportazione, importazione, file corrotti |
| `packages/db/test/sincronizzazione.test.ts` | **10** | coda, idempotenza, cursore |
| `packages/db/test/misurazioni.test.ts` | **9** | media mobile, peso dichiarato escluso |
| `packages/db/test/migrazioni.test.ts` | **8** | migrazioni, `SchemaTooNewError` |
| `packages/db/test/unitaDiLavoro.test.ts` | **7** | dati + oplog nella stessa transazione |
| `packages/sync/test/protocol.recupero.test.ts` | **7** | primo recupero, nuova installazione |
| `packages/sync/test/protocol.base.test.ts` | **5** | push, pull, idempotenza |
| `packages/sync/test/protocol.errori.test.ts` | **5** | token revocato, quota, spazio, cambio account |
| `packages/sync/test/unita.test.ts` | **5** | operazioni, pacchetti, digest |
| `packages/sync/test/protocol.conflitti.test.ts` | **4** | conflitti, revisioni concorrenti |
| `packages/db/test/prestazioni.test.ts` | **3** | archivio sintetico di tre anni |

---

## 3. Verifiche richieste dalla specifica (§18)

### Programma

| Requisito | Livello | Esito |
|---|---|---|
| Volumi corretti delle settimane 1-2, 3-4, 5-12 | **B** | ✅ verificato voce per voce |
| Copertura reale dell'orizzonte triennale | **B** | ✅ 157 settimane, 314 sedute, nessun giorno scoperto |
| Gestione di pause e settimane ripetute | **B** | ✅ cursore separato dal calendario |
| Nessun avanzamento improprio per il calendario | **B** | ✅ il motore propone di ripetere, non avanza |
| Durata stimata coerente | **B** | ✅ nessuna delle 314 sedute supera i 75 minuti stimati |
| Storico invariato dopo modifiche future | **B** | ✅ snapshot congelato |

### Sessioni

| Requisito | Livello | Esito |
|---|---|---|
| Doppio tocco senza duplicati | **B** | ✅ vincolo `UNIQUE` nello schema, non un debounce |
| Sessioni parziali | **B** | ✅ stato calcolato sulle serie confermate |
| Correzione e annullamento | **B** | ✅ `voided` escluso dai conteggi |
| Chiusura e ripresa con bozze recuperate | **B** | ✅ le bozze non contano come eseguite |
| Esercizi per lato | **B** | ✅ le serie non raddoppiano |
| Pesi per manubrio | **B** | ✅ convenzione distinta nella chiave |
| Virgola decimale | **B** | ✅ giro completo scrittura → lettura |
| Valori nulli e anomali | **B** | ✅ `load_kg` NULL per corpo libero, `CHECK` nello schema |
| Fallimenti di salvataggio | **B** | ✅ rollback completo con errore iniettato |
| A e B completabili dall'inizio alla fine | **C/D** | ⬜ **non verificato**: richiede l'app in esecuzione |

### Timer

| Requisito | Livello | Esito |
|---|---|---|
| Residuo coerente dopo sospensione | **B** | ✅ anche dopo mezz'ora |
| Scadenza senza serie inventate | **B** | ✅ il modulo non ha campi per farlo |
| Pausa, modifica, cancellazione | **B** | ✅ pause ripetute non perdono né inventano tempo |
| Cambio dell'orologio | **B** | ✅ base monotona indipendente dall'orologio di sistema |
| Distinzione tempo trascorso / attività confermata | **B** | ✅ `roundsElapsed`, non `roundsCompleted` |
| Nessuna notifica duplicata | **A/B** | ⚠️ la logica di riprogrammazione è testata; la **programmazione reale** delle notifiche di iOS no |
| Permessi negati | **C/D** | ⬜ **non verificato** |
| Trasferimento della seduta fra dispositivi | **B** parziale | ⚠️ una sola sessione attiva per installazione è verificata; il **trasferimento esplicito** non è implementato |

### Adattamento

| Requisito | Livello | Esito |
|---|---|---|
| Due esposizioni valide → proposta motivata | **B** | ✅ con prove, ragione, rivalutazione |
| Dati incompleti → nessun incremento ingiustificato | **B** | ✅ 8 casi distinti |
| Macchine diverse non equivalenti | **B** | ✅ chiavi di comparabilità distinte |
| Dolore, interruzione, stanchezza non ignorati | **B** | ✅ un fastidio blocca l'aumento |
| Un solo risultato negativo ≠ plateau | **B** | ✅ soglia a 3 esposizioni |
| Proposte accettate, rifiutate, annullate | **A** | ⚠️ modello dati e repository presenti; il **flusso nell'interfaccia** non è verificato |
| Proposte obsolete dopo sincronizzazione | **A** | ⚠️ `basePlanVersion` e stato `superseded` presenti; la transizione automatica non è testata end-to-end |

### Sincronizzazione

Tutti e 20 i casi richiesti dalla specifica hanno un test dedicato
(livello **B**, contro un finto conforme all'API Drive), più 6 aggiuntivi. La
tabella nominale è in `SYNC_PROTOCOL.md` §14.

⬜ **Nessuno di questi casi è stato verificato contro i server reali di Google.**
Vedi §5.

### Backup e versioni

| Requisito | Livello | Esito |
|---|---|---|
| Esportazione e ripristino senza perdita | **B** | ✅ |
| File corrotto o incompatibile | **B** | ✅ storico intatto in tutti e tre i casi |
| Importazione ripetuta | **B** | ✅ nessun duplicato |
| Migrazione da versioni precedenti | **B** | ✅ percorso 001 → 002 eseguito |
| App vecchia con protocollo nuovo | **B** | ✅ `SchemaTooNewError` prima di ogni scrittura |
| Aggiornamento della build mantenendo i dati | **D** | ⬜ **non verificato**: richiede due installazioni reali |

### UX

| Requisito | Livello | Esito |
|---|---|---|
| Contrasto dei token, tema chiaro e scuro | **B** | ✅ calcolato con formule WCAG 2.1 |
| Stati distinguibili senza il solo colore | **B** | ✅ simbolo + testo per ogni stato |
| Aree di tocco ≥ 44 punti | **A** | ⚠️ incorporate nei componenti di base; non misurate su schermo reale |
| Obiettivi di tocchi (2 per iniziare, 1 per confermare) | **A** | ⚠️ conteggio sui gestori nel codice; non cronometrato con un utente |
| Caratteri grandi, tastiera aperta, testi lunghi, stati vuoti | **C/D** | ⬜ **non verificato** |
| Screen reader | **A** | ⚠️ etichette presenti nel codice; **mai provato con VoiceOver** |
| Confronto fra due alternative della schermata di seduta | — | ⬜ **non effettuato**: richiesto da `SPEC.md` §9, resta da fare |

### Prestazioni

Misurate su un archivio sintetico di **tre anni** (312 sedute, 6240 serie, 500
misurazioni, 6245 operazioni in coda). Numeri **realmente misurati**, su Linux:

| Operazione | Mediana | Massimo |
|---|---|---|
| Inserimento di una serie, database in memoria | **0,41 ms** | 1,33 ms |
| Inserimento di una serie, database su file con WAL | **0,44 ms** | 0,68 ms |
| «Ultima prestazione comparabile», in memoria | **0,014 ms** | 0,46 ms |
| «Ultima prestazione comparabile», su file | **0,014 ms** | 0,12 ms |
| Media mobile a 7 giorni su 500 punti | **2,46 ms** | 3,29 ms |
| Generazione dell'archivio sintetico | 147 ms | — |

Un test verifica con `EXPLAIN QUERY PLAN` che la query usi l'indice
`idx_performed_sets_comparability` e non faccia una scansione.

**Limiti di queste misure, dichiarati**: sono su **Linux**, non su iPhone 15. La
misura su file usa `synchronous = NORMAL` con WAL, cioè **senza `fsync` per
commit**, e quindi **sottostima** il costo di una scrittura durevole su iOS. Le
soglie dei test (50 ms, 100 ms, 20 ms) cercano una regressione di **ordine di
grandezza**, non certificano una latenza.

⬜ Sincronizzazione incrementale e primo ripristino su un archivio di dimensioni
reali: **non misurati**.

---

## 4. Verifiche di privacy e sicurezza (eseguite)

| Controllo | Comando | Esito |
|---|---|---|
| Nessuna telemetria | `grep -rniE "analytics|telemetry|sentry|firebase|mixpanel|amplitude|posthog" packages apps` | ✅ nessun risultato |
| Nessun segreto nei file tracciati | `grep -rniE "client_secret|api[_-]?key *[:=]|AIza|-----BEGIN|ghp_|sk-"` | ✅ nessun risultato |
| Nessun dato personale tracciato | `git ls-files -z \| xargs -0 grep -ln "heightCm: 183\|declaredWeightKg: 100"` | ✅ nessun risultato |
| Bootstrap personale ignorato | `git check-ignore -v apps/mobile/src/bootstrap.local.ts` | ✅ ignorato |
| Nessun database, backup o foto tracciati | `git ls-files \| grep -iE "\.(db\|sqlite\|jpg\|png\|p12\|pem\|mobileprovision)$"` | ✅ nessun risultato |
| Nessuna pubblicazione automatica | `ls .github` | ✅ directory assente |
| `core` senza rete né React Native | `grep -rn "react-native\|from 'expo\|fetch(" packages/core/src` | ✅ nessun risultato |
| Dipendenze allineate all'SDK | confronto con `node_modules/expo/bundledNativeModules.json` | ✅ nessuna divergenza |

⬜ **Non verificato**: l'assenza di segreti in un **binario compilato**, perché
nessuna build è stata prodotta.

⬜ **Da verificare dall'utente**: che il repository GitHub sia effettivamente
**privato**. In questo ambiente la CLI `gh` non è utilizzabile e non è stato
possibile leggerne la visibilità. È un requisito di `SPEC.md` §1 e va confermato
manualmente.

---

## 5. Non verificato contro sistemi reali

Elenco completo, senza attenuazioni.

### Apple / iOS

- **Nessuna build firmata prodotta.** Nessun `expo prebuild`, nessuna
  compilazione, nessun archivio, nessun `.ipa`, nessun profilo di provisioning.
- La procedura di `INSTALL_IPHONE.md` **non è stata eseguita**. I nomi dei menu
  di Xcode vengono dalla documentazione Apple verificata, non da una schermata.
- Il driver **`expo-sqlite` non è stato eseguito**: le firme sono verificate sul
  pacchetto pubblicato `expo-sqlite@57.0.3`, il comportamento a runtime no.
- Notifiche locali, permessi negati, modalità silenziosa, Focus,
  Live Activity: **nulla provato**.
- Durata reale del certificato per il programma a pagamento: **Apple non la
  documenta**; il documento dice di leggerla in Xcode e di non assumere «un
  anno».

### Google

- **Nessuna chiamata reale ai server Google.** Nessuna credenziale, e l'egress
  verso `developers.google.com`, `cloud.google.com` e `support.google.com` è
  bloccato dal proxy di questo ambiente.
- **Il flusso OAuth non è implementato.** La porta `DriveStore` è collegata ma
  restituisce un errore di autorizzazione finché non c'è un token.
- Comportamento reale di `changes.list` sotto concorrenza (collasso dei
  cambiamenti, propagazione, ordine, eventual consistency), validità dei token
  di pagina, codici HTTP reali, soglie di quota, valori di `Retry-After`,
  latenza: **tutti dedotti dalla documentazione, non osservati**.

### Interfaccia

- **L'app non è mai stata avviata**, né su dispositivo né su simulatore.
- Nessuna prova con VoiceOver, caratteri ingranditi o riduzione delle
  animazioni.
- **Nessuno screenshot reale prodotto**, quindi la revisione visiva richiesta da
  `SPEC.md` §17 **non è stata effettuata**: i revisori visivi devono guardare
  schermate prodotte dall'app, e non esistono.
- **Nessuna prova utente.**

---

## 6. Funzioni non implementate

Elencate perché la specifica (§15) vieta di dichiarare completa una funzione
rappresentata solo da un pulsante. Nessuna di queste è un pulsante inerte: sono
assenze dichiarate.

| Funzione | Stato | Dove è documentato |
|---|---|---|
| Flusso OAuth con Google | **non implementato** | `GOOGLE_DRIVE_SETUP.md`, `README.md` §6 |
| Cifratura lato client dei pacchetti | **non implementata**; l'impostazione esiste e vale `false` | `PRIVACY.md` §5 |
| Coach generativo | **non implementato**; l'impostazione esiste e vale `false` | `COACH_RULES.md` §9 |
| Esportazione CSV | formato specificato, **codice assente** | `BACKUP_RESTORE.md` §4 |
| Copia dei file immagine nel backup | **non implementata** | `BACKUP_RESTORE.md` §2 |
| Upload ripristinabile su Drive (`308`/`Range`) | **non implementato** | `SYNC_PROTOCOL.md` §15.3 |
| Riconciliazione guidata di due archivi indipendenti | mattoni presenti, **procedura assente** | `SYNC_PROTOCOL.md` §15.3 |
| Trasferimento esplicito di una seduta fra dispositivi | **non implementato** | questo documento, §3 |
| Migrazioni di `formatVersion` dei dati | **non implementate** | `SYNC_PROTOCOL.md` §15.3 |
| Modello linguistico sul dispositivo | **non valutato** (richiede un iPhone 15 reale) | `COACH_RULES.md` §9 |
| Integrazione con Google Calendar o Apple Calendar | **non implementata**, e non richiesta | `SPEC.md` §11 |
| Versione Android o web | **non implementate** | `ARCHITECTURE.md` §9 |

---

## 7. Difetti noti

### Bloccanti

Nessun difetto bloccante **aperto** sui componenti verificati.

Tre difetti bloccanti sono stati **trovati e corretti** durante lo sviluppo. Sono
elencati qui perché la loro storia è informativa: tutti e tre sono del tipo che
una lettura del codice non coglie.

| Difetto | Come si manifestava | Correzione | Verificato da |
|---|---|---|---|
| L'orizzonte triennale lasciava scoperti gli ultimi **3-4 giorni** | tre anni sono 156 settimane **più un resto**, e l'arrotondamento per difetto perdeva il resto | arrotondamento per eccesso; l'ultimo blocco assorbe la differenza | `threeYear.test.ts` |
| Una proposta di aumento usava il **gradino predefinito senza dichiararlo** | presentava come verificato un numero che non veniva dall'attrezzo reale | avvertenza `unconfirmedEquipmentStep` nella proposta | `engine.test.ts` |
| Un pacchetto Drive rifiutato per corruzione **transitoria** non veniva mai più riletto | il cursore era già avanzato oltre il suo cambiamento: **perdita silenziosa di dati** | quarantena dei rifiuti, ritentata a ogni pull | `packages/sync/test/` |

**Difetto bloccante aperto sulle funzioni non verificate**: l'app non è
installabile né usabile, perché non esiste una build. È l'ostacolo principale, e
richiede un Mac.

### Importanti

| # | Difetto | Dove | Nota |
|---|---|---|---|
| I-1 | **Ambiguità sugli schemi di redirect OAuth per iOS.** La documentazione di Google è contraddittoria su quali schemi siano ancora supportati. Va risolto **prima** di scrivere il flusso: un redirect sbagliato non torna mai nell'app | `GOOGLE_DRIVE_SETUP.md` | bloccante per la sincronizzazione |
| I-2 | **Nessun tetto ai tentativi per un pacchetto in quarantena permanente.** Un pacchetto corrotto in modo irreversibile viene ritentato a ogni pull, indefinitamente | `packages/sync` | spreco, non perdita di dati |
| I-3 | **Le notifiche locali non sono state programmate né provate.** La logica di riprogrammazione è testata, l'integrazione con iOS no | `apps/mobile` | richiede un dispositivo |
| I-4 | **Il confronto fra due alternative della schermata di seduta non è stato effettuato**, come richiede `SPEC.md` §9 | — | richiede screenshot reali |
| I-5 | **Nessuna revisione visiva né di flusso su schermate reali.** Richiesta da `SPEC.md` §17 | — | richiede l'app in esecuzione |

### Minori

| # | Difetto | Nota |
|---|---|---|
| M-1 | 15 vulnerabilità di gravità *moderate* segnalate da `npm audit`, tutte in dipendenze di sviluppo della catena Expo | non risolte: `npm audit fix --force` cambierebbe versioni verificate contro l'SDK |
| M-2 | La visibilità del repository GitHub non è stata verificata da questo ambiente | vedi §4 |
| M-3 | Le misure di prestazione sono su Linux e sottostimano il costo di una scrittura durevole su iOS | vedi §3 |

---

## 8. Checklist di stato

Nella forma richiesta da `SPEC.md` §15.

| Componente | Implementato | Verificato automaticamente | Verificato su dispositivo | Non verificato | Incompleto |
|---|:---:|:---:|:---:|:---:|:---:|
| Convenzioni di carico e comparabilità | ✅ | ✅ | — | | |
| Date, settimane, orizzonte | ✅ | ✅ | — | | |
| Identificativi ULID | ✅ | ✅ | — | | |
| Scheda 12 settimane | ✅ | ✅ | — | | |
| Libreria esercizi | ✅ | ✅ | — | | |
| Piano triennale | ✅ | ✅ | — | | |
| Stima di durata | ✅ | ✅ | — | | |
| Motore adattivo | ✅ | ✅ | — | | |
| Timer (logica) | ✅ | ✅ | — | | |
| Timer (notifiche iOS) | ✅ | — | — | ⬜ | |
| Schema, migrazioni, transazioni | ✅ | ✅ | — | | |
| Repository | ✅ | ✅ | — | | |
| Driver `node:sqlite` | ✅ | ✅ | — | | |
| Driver `expo-sqlite` | ✅ | — | — | ⬜ | |
| Protocollo di sincronizzazione | ✅ | ✅ (finto) | — | ⬜ (Google reale) | |
| OAuth Google | — | — | — | — | 🚧 |
| Token di colore e contrasto | ✅ | ✅ | — | | |
| Componenti di base | ✅ | — | — | ⬜ | |
| Schermate dell'app | ✅ | — | — | ⬜ | |
| Backup ed esportazione JSON | ✅ | ✅ | — | | |
| Esportazione CSV | — | — | — | — | 🚧 |
| Cifratura lato client | — | — | — | — | 🚧 |
| Coach generativo | — | — | — | — | 🚧 |
| Build firmata iPhone | — | — | — | — | 🚧 |
| Revisione visiva su screenshot | — | — | — | — | 🚧 |
| Prova utente | — | — | — | — | 🚧 |

Legenda: ✅ fatto · ⬜ non verificato · 🚧 incompleto o non implementato · — non applicabile.

---

## 9. Dichiarazione finale

**Il prodotto non è completo e non è dichiarato completo.**

Il nucleo che decide e conserva i dati — dominio, programma, motore adattivo,
timer, persistenza, protocollo di sincronizzazione, sistema visivo — è
implementato e **verificato da 429 test automatici eseguiti**, e i difetti
trovati durante il lavoro sono stati corretti e ri-verificati.

L'interfaccia è implementata ma **non è mai stata eseguita**. Non esiste una
build firmata. L'integrazione con Google Drive è verificata contro un finto
conforme all'API, **non contro Google**.

Per arrivare a un'app usabile in palestra servono, in ordine:

1. una **build firmata** su un Mac con Xcode (`INSTALL_IPHONE.md`);
2. la **verifica su dispositivo** di registrazione delle serie, timer e
   persistenza;
3. la risoluzione dell'ambiguità **I-1** e l'implementazione di **OAuth**;
4. la **revisione visiva e di flusso su screenshot reali** (**I-4**, **I-5**).

I punti 1 e 2 si possono fare subito con un Mac. Il punto 3 richiede di creare
un progetto Google Cloud, cosa che non è stata fatta: creare risorse remote a
nome dell'utente richiede la sua autorizzazione.

---

## 10. Come riprodurre

```bash
npm install
npm run typecheck
npm test
npx tsc --noEmit -p apps/mobile/tsconfig.json

# Per area
npm test -- packages/core/test/twelveWeeks.test.ts   # fedeltà della scheda
npm test -- packages/core/test/engine.test.ts        # sicurezza del motore
npm test -- packages/core/test/timer.test.ts         # timer
npm test -- packages/core/test/theme.test.ts         # contrasto
npm test -- packages/db                               # persistenza
npm test -- packages/sync                             # protocollo Drive
npm test -- packages/db/test/prestazioni.test.ts      # prestazioni misurate
```
