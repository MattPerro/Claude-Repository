# CHANGELOG

Cronologia delle modifiche di TrackStrong.

Formato basato su [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).
Le versioni seguono [SemVer](https://semver.org/lang/it/), con `0.x` a indicare
che il progetto **non ha ancora funzionato su un dispositivo reale**.

---

## [Non rilasciato]

### Da fare prima di poter usare l'app in palestra

1. Produrre una **build firmata** sull'iPhone (serve un Mac con Xcode:
   `INSTALL_IPHONE.md`).
2. **Verificare su dispositivo** registrazione delle serie, timer e persistenza.
3. Risolvere l'**ambiguità sugli schemi di redirect OAuth per iOS** nella
   documentazione di Google, e solo dopo implementare il flusso di accesso.
4. Esportazione **CSV** (formato specificato in `BACKUP_RESTORE.md` §4, codice
   non ancora scritto).
5. Copia dei **file immagine** delle foto di progresso nel backup.

Dettaglio completo e classificazione dei difetti: `QA_REPORT.md`.

---

## [0.1.0] — 2026-09-19

Primo incremento. Il dominio, la persistenza, il protocollo di sincronizzazione
e il sistema visivo sono verificati da test automatici su Node. L'interfaccia è
implementata ma **non verificata**: in questo ambiente non esistono né
simulatore iOS né dispositivo.

**429 test eseguiti, 429 passati** (`npm test`).

### Aggiunto — dominio (`packages/core`)

- **Convenzioni di carico come tipo esplicito**: totale bilanciere, per
  manubrio, valore di *una* macchina, corpo libero, sovraccarico, assistenza, a
  tempo. Nessuna conversione automatica fra loro.
- **Chiave di comparabilità** salvata con ogni serie confermata e versionata,
  così un confronto resta riproducibile anche se il codice cambia. Le
  convenzioni legate a una macchina richiedono l'identità dell'attrezzo: senza,
  la funzione lancia.
- **Incremento di carico come dato dell'attrezzo**, non come percentuale.
- **Virgola decimale italiana** in ingresso e in uscita; un campo illeggibile
  resta `null` e non diventa 0.
- **Tre tipi di tempo distinti**: giorno di calendario, istante, base monotona.
  Aritmetica sui giorni via mezzogiorno UTC (l'ora legale non sposta un giorno),
  anni bisestili, orologio iniettabile.
- **ULID monotoni** generati sul dispositivo: ogni entità nasce con un ID
  definitivo, quindi un retry dopo una risposta di rete persa non duplica nulla.
- Modello di dominio che distingue **prescritto, suggerito, precompilato ed
  eseguito**, con il ruolo delle serie come tipo somma (`SetRole`) invece che
  come flag opzionale.

### Aggiunto — programma

- **Scheda delle prime 12 settimane** trascritta come dati versionati:
  riscaldamento a sei voci, tabelle A e B, volumi delle settimane 1-2 / 3-4 /
  5-12, margini 4 / 3 / 2-3, cyclette per fase, alternativa a intervalli dalla
  settimana 7 nella sola seduta B e solo se scelta, alternativa hip thrust con
  volumi distinti e storico separato. Verificata voce per voce da 61 test.
  Cinque assunzioni documentate in testa al file per i punti che la specifica
  non fissa.
- **Libreria di 14 esercizi** con guida offline completa in italiano:
  impostazione, esecuzione passo per passo, respirazione, indicazioni rapide
  sotto i 60 caratteri per la lettura in seduta, errori comuni con il segnale
  che li rivela, accorgimenti per il rientro, varianti, regolazioni da annotare.
  Nessun video, nessun collegamento.
- **Piano triennale**: 27 blocchi su 157 settimane, ciascuno con finalità,
  durata, esercizi, schemi, margine, recuperi, cardio, alternative, criteri di
  ingresso verificabili sui dati registrati, criteri di revisione e politica di
  interruzione. Nessun carico in kg predetto per il futuro, nessun test
  massimale.
- **Stima della durata delle sedute** con ripartizione ispezionabile. Nessuna
  delle 314 sedute del percorso supera i 75 minuti stimati.

### Aggiunto — motore adattivo

- Deterministico, offline, senza modello linguistico. Undici tipi di proposta,
  non solo «aggiungi peso».
- Un aumento di carico richiede **tutte e quattro** le condizioni verificate su
  **due esposizioni consecutive confrontabili**, ciascuna con il proprio esito
  motivato.
- **Sette informazioni mancanti dichiarate** invece di essere silenziate.
- Doppia progressione: prima le ripetizioni entro l'intervallo, poi il carico.
- «Ho meno tempo oggi» riduce il lavoro in un ordine dichiarato e **lascia
  intatti i recuperi**, con una verifica programmatica che lo dimostra.

### Aggiunto — timer

- La verità è una **scadenza persistita** su base monotona; `setInterval` serve
  solo a ridisegnare.
- Il modulo **non conosce le serie**, per costruzione: non ha nessun campo con
  cui segnare come eseguito qualcosa che non è stato confermato.
- Modifiche manuali (+15 / −15) accumulate in un campo separato, così resta
  visibile che il recupero è stato cambiato a mano.
- Per lo step-up il recupero parte **dopo entrambe le gambe**, senza che il
  conteggio delle serie raddoppi.

### Aggiunto — persistenza (`packages/db`)

- Porta `SqlDriver` sincrona con due implementazioni: `node:sqlite` per i test,
  `expo-sqlite` per il dispositivo.
- 30 tabelle `STRICT`, due migrazioni realmente eseguite in un test,
  `SchemaTooNewError` lanciato **prima di qualunque scrittura**.
- **Dati e operazione di sincronizzazione nella stessa transazione**, con un
  test che inietta un errore e dimostra il rollback completo.
- Quattro requisiti scesi nello **schema SQL** invece che nel codice: chiave di
  idempotenza contro il doppio tocco, una sola sessione attiva per
  installazione, carico `NULL` e non `0` per corpo libero e esercizi a tempo,
  peso dichiarato in una tabella che le query delle misurazioni non raggiungono.
- Media mobile a 7 giorni **con il conteggio delle osservazioni**, senza
  interpolare i giorni mancanti.
- Esportazione e importazione **transazionale** con anteprima, gestione
  duplicati e rifiuto dei file corrotti.
- Prestazioni misurate su un archivio sintetico di tre anni (312 sedute, 6240
  serie): inserimento 0,44 ms mediani su file con WAL, query dell'ultima
  prestazione comparabile 0,014 ms.

### Aggiunto — sincronizzazione (`packages/sync`)

- Registro di **operazioni immutabili**, pacchetti raggruppati e snapshot su
  `appDataFolder`. Nessun database viaggia, nessun «vince l'ultimo upload».
- De-duplicazione sull'identificativo, **non** sul nome del file.
- **Marcatura per campo**: unione automatica dei campi disgiunti, conflitto
  materializzato sul solo campo contestato. Nessuna versione scartata in
  silenzio.
- Il **cursore avanza dentro la stessa transazione** che persiste i dati
  ricevuti.
- Sette errori tipizzati: nessuno viene interpretato come «archivio vuoto».
- Tombstone conservate 400 giorni con potatura esplicita.
- Cambio di account Google: **nessun trasferimento involontario**.

### Aggiunto — sistema visivo

- Token di colore in TypeScript puro, con il **contrasto calcolato da 53 test**
  secondo WCAG 2.1: la build fallisce se una coppia scende sotto soglia.
- Ogni stato ha simbolo e testo oltre al colore.
- I sei stati di sincronizzazione della specifica, incluso il chiarimento che
  «Sincronizzato con Drive» non significa che gli altri dispositivi abbiano
  scaricato i dati.

### Aggiunto — processo

- Nove specialisti in `.claude/agents/` con compiti, divieti e formato di report
  espliciti, e la regola che l'autore di una parte non è il suo unico revisore.
- Documentazione: `SPEC.md`, `ARCHITECTURE.md`, `TRAINING_MODEL.md`,
  `COACH_RULES.md`, `SYNC_PROTOCOL.md`, `GOOGLE_DRIVE_SETUP.md`,
  `INSTALL_IPHONE.md`, `PRIVACY.md`, `BACKUP_RESTORE.md`, `QA_REPORT.md`,
  `README.md`, `CLAUDE.md`.

### Corretto

Tre difetti reali trovati dai test durante lo sviluppo, tutti di un tipo che
passa inosservato a una lettura del codice:

- **L'orizzonte triennale lasciava scoperti gli ultimi 3-4 giorni.** Tre anni
  sono 1095 o 1096 giorni, cioè 156 settimane piene **più un resto**:
  arrotondando per difetto restavano giorni fuori dal piano. Ora il piano
  arrotonda per eccesso e l'ultimo blocco assorbe la differenza.
- **Una proposta di aumento usava il gradino di carico predefinito senza
  dichiararlo.** Presentava come verificato un numero che non veniva
  dall'attrezzo reale. Ora la proposta arriva ma porta l'avvertenza
  `unconfirmedEquipmentStep`.
- **Un pacchetto Drive rifiutato per corruzione transitoria non veniva mai più
  riletto**, perché il cursore era già avanzato oltre il suo cambiamento: una
  perdita silenziosa di dati. Ora i rifiuti vanno in quarantena e vengono
  ritentati a ogni pull.

Inoltre:

- Un difetto nei dati di prova faceva passare come «controllata» una tecnica
  **non dichiarata**, nascondendo un controllo di sicurezza del motore. Corretto
  distinguendo «campo assente» da «campo presente e nullo».
- Le versioni di quattro librerie React Native divergevano da quelle attese da
  Expo SDK 57, con un divario di **versione maggiore** su
  `react-native-gesture-handler`. Allineate alla mappa dei moduli che ship con
  l'SDK.

### Sicurezza e privacy

- **Rimossi i dati personali dal codice tracciato.** Altezza, peso e nome erano
  scritti in un file pubblicabile. Ora il codice contiene solo valori neutri e
  il tipo; i dati reali arrivano dall'onboarding o da un bootstrap locale
  ignorato da Git, di cui è tracciato solo il modello.
- Nessuna telemetria, nessun segreto nei file tracciati, nessun workflow di
  pubblicazione automatica, nessun database o backup tracciato. Verificato con
  `git ls-files` e ricerche sui contenuti.

### Dichiarazioni di non verifica

Elencate qui perché fanno parte della consegna quanto il codice:

- **Nessuna build firmata è stata prodotta.** Nessun `expo prebuild`, nessuna
  compilazione, nessun profilo di provisioning.
- **L'interfaccia non è stata avviata**, né su dispositivo né su simulatore.
- **Il driver `expo-sqlite` non è stato eseguito**: le firme sono verificate sul
  pacchetto pubblicato, il comportamento a runtime no.
- **Nessuna chiamata reale ai server Google.** Il protocollo è verificato contro
  un finto conforme all'API; l'integrazione OAuth non è implementata.
- **Nessuna prova utente.**
- Il percorso di allenamento oltre le prime 12 settimane è una struttura
  progettuale rivista da agenti AI: **non è clinicamente certificato**.
