# PRIVACY.md — Privacy e dati personali

Che cosa l'app raccoglie, dove finisce, e chi può leggerlo.

Data di scrittura: **2026-09-19**.

---

## 1. In breve

| Domanda | Risposta |
|---|---|
| L'app invia telemetria o statistiche d'uso? | **No. Nessuna, e non c'è un'impostazione per attivarla.** |
| C'è un server di TrackStrong? | **No.** Non esiste un backend. |
| Chi può leggere i dati di allenamento? | Solo Mattia, sui suoi dispositivi, e Google in quanto gestore del Drive dell'account (vedi §4). |
| I dati vengono inviati a un provider di intelligenza artificiale? | **No.** Il coach generativo non è implementato ed è disattivato. |
| Le foto di progresso vengono sincronizzate? | **No, a meno che non venga attivato espressamente.** |
| I dati personali stanno su GitHub? | **No.** Il repository contiene codice, test, documentazione e dati sintetici. |

---

## 2. Quali dati esistono, e dove

Tutti i dati vivono in **un file SQLite** nel contenitore protetto dell'app, sul
dispositivo. Non in una cartella sincronizzata, non in iCloud Drive, non in
`Documenti`.

| Categoria | Esempi | Dove |
|---|---|---|
| Profilo | nome, altezza, peso dichiarato, obiettivi, limitazioni fisiche | database locale |
| Allenamenti | sessioni, esercizi svolti, serie con carico e ripetizioni, RIR, note, tecnica dichiarata, fastidi segnalati | database locale |
| Corpo | pesate, circonferenze, percentuale di grasso (solo se inserita, con metodo e data) | database locale |
| Recupero | sonno, energia, stress, indolenzimento | database locale |
| Moto | data, circuito, turni, fatica per zona, tempi facoltativi | database locale |
| Abitudini | camminate, cardio, note alimentari, calorie e proteine inserite a mano | database locale |
| Foto di progresso | immagini | file nel contenitore protetto dell'app; **non nel rullino** |
| Token Google | token di accesso e di rinnovo | **Keychain di iOS** tramite `expo-secure-store`, **non** nel database |
| Timer, bozze, coda di sincronizzazione | stato interno | database locale, **e restano locali**: non vengono sincronizzati |

### Dati che l'app NON raccoglie

- Posizione.
- Contatti, calendario, foto del rullino (nessuna integrazione con Apple
  Calendar o Google Calendar: la specifica non la richiede e non è stata
  aggiunta).
- Frequenza cardiaca, passi, dati di HealthKit.
- Identificativi pubblicitari.
- Indirizzo IP, perché non c'è nessun server che lo riceva.

### Dati che l'app non inventa

Per scelta architetturale, non per omissione:

- **percentuale di massa grassa**: esiste solo se inserita, con metodo e data.
  Non viene dedotta dal peso, e una misurazione senza metodo viene rifiutata
  (`MissingBodyFatMethodError`);
- **peso**: il peso dichiarato nel profilo **non** diventa una pesata datata, e
  non compare nei grafici né nella media mobile. Vive in una tabella che le
  query delle misurazioni non raggiungono;
- **calorie bruciate**: nessuna stima;
- **punteggi sanitari**: nessun indice composito di recupero, nessuna diagnosi;
- **frequenza cardiaca massima**, età, patologie: mai dedotte.

---

## 3. Nessuna telemetria, nessun dato personale nei log

Non esiste, nel codice, nessuna chiamata di rete verso un servizio di analisi.
Verificabile:

```bash
grep -rniE "analytics|telemetry|sentry|firebase|mixpanel|amplitude|posthog" \
  packages apps --include="*.ts" --include="*.tsx" | grep -v node_modules
```

I log di diagnostica non contengono dati personali: registrano identificativi,
conteggi ed esiti, non carichi, pesi o note.

I **dati sintetici** usati nei test e in eventuali schermate di esempio non
contengono dati reali: l'atleta dei test si chiama «Atleta di prova» e i carichi
sono inventati.

---

## 4. Google Drive

L'unico trasferimento di dati fuori dal dispositivo è la sincronizzazione con
**il Drive dell'utente**.

| | |
|---|---|
| Dove | cartella `appDataFolder` dell'account Google dell'utente |
| Ambito OAuth richiesto | `https://www.googleapis.com/auth/drive.appdata` |
| Cos'altro l'app può vedere del Drive | **niente**: quell'ambito dà accesso solo alla cartella privata dell'app, non ai file dell'utente |
| Che cosa viene caricato | pacchetti di operazioni e snapshot: cioè i dati di allenamento |
| Chi può leggerli | l'utente, e Google in quanto gestore dello spazio di archiviazione |
| Password Google | **mai chiesta dall'app.** L'accesso avviene sulla pagina di Google |
| Segreti nel binario | **nessuno**: OAuth con PKCE, senza client secret |

### `appDataFolder` non è invisibile a Google

È una cartella nascosta all'interfaccia di Drive, il che significa che l'utente
non la vede sfogliando i suoi file. **Non** significa che sia cifrata né che
Google non possa accedervi. È importante essere precisi su questo punto.

L'utente può eliminare i dati dell'app dal proprio Drive dalle impostazioni
dell'account Google, e revocare l'autorizzazione in qualsiasi momento. In quel
caso l'app mostra «Accesso da rinnovare» e **i dati sul dispositivo restano
intatti**: una revoca non cancella nulla in locale.

---

## 5. Cifratura: cosa è cifrato e cosa non lo è

Questa sezione è deliberatamente precisa, perché la specifica (§14) vieta di
chiamare «end-to-end» una protezione non implementata e verificata.

| Dato | Cifrato? | Da chi |
|---|---|---|
| Database sul dispositivo | dal sistema operativo, quando il dispositivo è bloccato e ha un codice impostato | iOS (Data Protection) |
| Token Google | sì | Keychain di iOS |
| Pacchetti su Drive, in transito | sì | TLS |
| Pacchetti su Drive, a riposo | dall'infrastruttura di Google | Google |
| **Pacchetti su Drive, con cifratura lato client** | **NO: non implementata** | — |

### Stato onesto della cifratura lato client

`AppSettings.clientEncryptionEnabled` esiste come impostazione e vale `false`.
**La cifratura lato client non è implementata.** Non è un interruttore che fa
qualcosa di parziale: è un posto predisposto nel modello dati per una funzione
futura.

Di conseguenza, **oggi**:

- TrackStrong **non è** un sistema end-to-end encrypted, e questo documento non
  lo afferma;
- i dati su Drive sono protetti come qualsiasi altro file su Drive: TLS in
  transito, cifratura dell'infrastruttura a riposo, accesso tecnicamente
  possibile per Google;
- **per il ripristino basta l'accesso Google**, e non serve nessuna chiave
  aggiuntiva. Questo è vero adesso ed è importante saperlo, perché se un domani
  si attivasse la cifratura lato client **non sarebbe più vero**: servirebbe
  anche la chiave, e perderla significherebbe perdere i backup.

Se la cifratura lato client verrà implementata, queste sono le regole
vincolanti, già scritte per non dimenticarle:

1. libreria consolidata, **nessuna crittografia artigianale**;
2. la chiave **non** va conservata in chiaro accanto ai dati cifrati;
3. progettazione esplicita del recupero su un nuovo dispositivo;
4. documentazione precisa di **cosa** è cifrato e cosa non lo è;
5. il termine «end-to-end» si usa solo dopo che la protezione è implementata
   **e verificata**;
6. la documentazione del ripristino deve dire che l'accesso Google **non basta**.

---

## 6. Esportazioni

L'app può esportare i dati in JSON e CSV (vedi `BACKUP_RESTORE.md`).

**Un'esportazione contiene dati personali in chiaro**, e l'app lo dichiara prima
di produrla. Un file esportato in `File`, inviato per email o messo in un altro
cloud non ha nessuna delle protezioni descritte sopra: è responsabilità
dell'utente dove lo mette.

---

## 7. Il repository GitHub

Il repository è **privato** e contiene:

- codice, test, documentazione tecnica;
- **dati sintetici**.

Non contiene, ed è escluso da `.gitignore`:

- database operativi (`*.db`, `*.db-wal`, `*.db-shm`, `*.sqlite`);
- backup ed esportazioni (`backups/`, `*.trackstrong-backup`);
- foto di progresso (`photos/`, `progress-photos/`);
- token, chiavi, certificati (`*.pem`, `*.p12`, `*.mobileprovision`,
  `client_secret*.json`, `token.json`, `.env`);
- il bootstrap personale (`personal/`, `bootstrap.local.*`), di cui è tracciato
  **solo** il modello con valori vuoti.

**Altezza, peso e nome reali non sono nel codice tracciato.** Sono stati
rimossi: il codice contiene solo valori neutri e il tipo, e i dati reali
arrivano dall'onboarding o dal bootstrap locale ignorato da Git. Verificabile:

```bash
git ls-files -z | xargs -0 grep -ln "183\|declaredWeightKg: 100"   # nessun risultato
git check-ignore -v apps/mobile/src/bootstrap.local.ts             # ignorato
```

Nessun workflow di pubblicazione automatica, nessun GitHub Pages: la directory
`.github/` non esiste.

---

## 8. Foto di progresso

- **Facoltative.**
- Salvate nel contenitore protetto dell'app, **non nel rullino**.
- **Non sincronizzate** per impostazione predefinita
  (`syncProgressPhotos: false`).
- **Mai trasmesse a un provider di intelligenza artificiale**, per impostazione
  predefinita e per assenza di codice che lo faccia.
- La loro sincronizzazione richiede un'attivazione esplicita, e l'app deve dire
  che da quel momento le immagini finiscono su Drive.

---

## 9. Tre cancellazioni diverse

La specifica (§14) chiede di distinguerle, perché hanno conseguenze diverse:

| Azione | Cosa cancella | Cosa resta |
|---|---|---|
| **Eliminazione dal dispositivo** | il database locale di questa installazione | i dati su Drive, e quelli sugli altri dispositivi |
| **Scollegamento dell'account** | il collegamento e i token | il database locale **e** i dati su Drive |
| **Eliminazione dall'archivio sincronizzato** | i pacchetti su Drive | i database locali dei dispositivi già allineati |

Disinstallare l'app dall'iPhone cancella il contenitore, quindi il database.
**Prima di disinstallare serve un backup verificato**: vedi
`BACKUP_RESTORE.md`.

---

## 10. Nessun codice eseguito da Drive

Su Drive ci sono solo **dati**, che vengono validati al parsing e rifiutati se
malformati o di versione superiore a quella supportata.

L'app **non** scarica ed esegue codice arbitrario da Drive, e Drive **non**
aggiorna il binario dell'app: gli aggiornamenti passano da una nuova build
firmata (vedi `INSTALL_IPHONE.md`).

---

## 11. Limiti di questo documento

- Descrive il comportamento del **codice presente in questo repository**. Non
  copre le politiche di Google, che vanno lette sul loro sito.
- Le affermazioni sulla cifratura di iOS e di Drive riguardano infrastrutture di
  terzi: non sono state verificate in questo ambiente e valgono per quanto
  dichiarato dai rispettivi fornitori.
- L'assenza di telemetria e di segreti è verificabile con i comandi indicati
  sopra sul codice. **Non** è stata verificata su un binario compilato, perché
  in questo ambiente non è stata prodotta nessuna build.
