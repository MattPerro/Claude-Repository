# GOOGLE_DRIVE_SETUP.md — Configurazione di Google Drive per TrackStrong

Procedura per collegare TrackStrong al **tuo** Google Drive, a uso personale.

- **Data di verifica delle fonti: 2026-09-19.** Ogni affermazione su ambiti,
  limiti, durate e procedure porta un riferimento `[Gn]` alla tabella
  [§11 Fonti](#11-fonti).
- **Limite di rete di questo ambiente:** `developers.google.com`,
  `support.google.com`, `cloud.google.com` e `console.cloud.google.com` sono
  **bloccati dal proxy di rete** (risposta 403 al CONNECT). Dove non ho potuto
  leggere la pagina, l'ho scritto. Le verifiche **dirette** sono state fatte
  contro gli endpoint ufficiali raggiungibili (`www.googleapis.com`,
  `accounts.google.com`).
- **Nessuna chiamata reale ai server Google è stata effettuata.** Vedi
  [§10 Verifiche non effettuate](#10-verifiche-non-effettuate).

---

## 1. Cosa fa la sincronizzazione, e cosa non fa

| Fa | Non fa |
|---|---|
| Conserva su Drive **pacchetti immutabili di operazioni** in `appDataFolder`, con identificativi univoci e protocollo versionato (SPEC §8.1) | **Non** carica né scarica un unico database con «vince l'ultimo caricamento» (vietato, SPEC §8.1) |
| Permette **sincronizzazione e recupero** fra le tue installazioni (SPEC §1.2) | **Non** è il backup del binario dell'app: «Google Drive sincronizza **dati**, non aggiorna il binario» (SPEC §14) |
| Permette a un secondo dispositivo di ricostruire lo storico (§7) | **Non** è un database condiviso: la fonte di verità in uso è il **database SQLite locale** di ciascun dispositivo (SPEC §1.2, §7) |
| Riconosce le operazioni già applicate e le applica una volta sola (SPEC §8.1) | **Non** scarica ed esegue codice: nessun percorso dell'app esegue codice preso da Drive (SPEC §14) |

Tre conseguenze da tenere a mente:

1. **«Sincronizzato con Drive» non significa che gli altri dispositivi abbiano
   già scaricato i dati** (SPEC §8.5). È lo stato esatto usato dall'app
   (`packages/sync/src/protocol.ts`, etichetta `Sincronizzato con Drive`, con
   il commento che lo dice).
2. **La cartella dati remota non è la fonte di verità.** `appDataFolder` è una
   cartella creata per ciascuna app di terze parti, non accessibile
   dall'interfaccia di Drive, e l'utente può rimuoverla [G3]. Se sparisce, i
   dati locali restano.
3. **Sincronizzazione ≠ backup recuperabile.** Una cancellazione accidentale si
   propaga. La specifica richiede di distinguere la sincronizzazione dello
   stato corrente dal backup versionato di stati precedenti (SPEC §14): il
   backup resta un'operazione separata, in aggiunta a questa configurazione.

---

## 2. Progetto Google Cloud

**Scelta richiesta all'utente:** serve un account Google (il tuo) e la
creazione di un progetto Google Cloud. Non ci sono costi per l'uso dell'API
Drive entro le quote, ma la console può chiedere di accettare i termini.

> **Avvertenza sui nomi delle voci di menu.** *Non verificato il 2026-09-19:
> `console.cloud.google.com`, `developers.google.com` e `support.google.com`
> sono bloccati dal proxy di rete di questo ambiente, quindi **non ho potuto
> leggere le pagine che descrivono l'interfaccia corrente della console**.
> I nomi indicati sotto sono indicativi: segui le etichette che vedi a schermo
> e, in caso di divergenza, controlla su
> https://developers.google.com/workspace/guides/create-project e
> https://developers.google.com/workspace/guides/configure-oauth-consent
> prima di procedere.* Non inventare passaggi: se una voce non c'è con quel
> nome, cercala nella documentazione, non a tentativi.

Sequenza logica (l'ordine è vincolante, i nomi no):

1. **Crea un progetto** nella console Google Cloud. Un progetto solo,
   intestato a te, dedicato a TrackStrong.
2. **Abilita la Google Drive API** per quel progetto (libreria delle API >
   Google Drive API > Abilita). Senza questo passaggio ogni chiamata fallisce,
   anche con un token valido.
3. **Configura la schermata di consenso OAuth**: tipo di utenza **External**
   (l'account Google personale non appartiene a un'organizzazione Workspace),
   nome dell'app, email di supporto, email dello sviluppatore.
4. **Dichiara l'ambito** `https://www.googleapis.com/auth/drive.appdata` (§3).
5. **Aggiungi te stesso come utente di test** (§5).
6. **Crea il client OAuth per iOS** (§4).

Che la Drive API sia effettivamente disponibile nella versione usata dall'app è
verificabile senza console: il documento di discovery ufficiale
`https://www.googleapis.com/discovery/v1/apis/drive/v3/rest` risponde
**HTTP 200** e riporta `"name": "drive"`, `"version": "v3"`,
`"revision": "20260913"` [G1].

---

## 3. Ambito OAuth: `drive.appdata`

**Ambito da usare, e solo questo:**

```
https://www.googleapis.com/auth/drive.appdata
```

**Verificato direttamente** nel documento di discovery ufficiale di Drive v3
(revisione `20260913`, letto il 2026-09-19): l'ambito è dichiarato in
`auth.oauth2.scopes` con la descrizione ufficiale [G1]:

> «See, create, and delete its own configuration data in your Google Drive»

Sempre **verificato direttamente** nello stesso documento: i metodi
`files.list` e `changes.list` accettano il parametro `spaces`, documentato come
«A comma-separated list of spaces to query within the corpora. Supported values
are `drive` and `appDataFolder`» [G1]. TrackStrong usa sempre
`spaces=appDataFolder` e crea i file con `parents: ['appDataFolder']`
(`packages/sync/src/drive.ts`).

### Perché è preferibile all'accesso completo al Drive

| `drive.appdata` | `drive` (accesso completo) |
|---|---|
| L'app vede **solo** la propria cartella dati. «Only the application that created the data in the `appDataFolder` can access it» [G3] | L'app vede **tutti** i tuoi file su Drive |
| La cartella non è visibile nell'interfaccia di Drive [G3] | Nessun isolamento |
| Un difetto dell'app non può cancellare i tuoi documenti personali | Un difetto dell'app può toccare qualunque file |
| Ambito **non sensibile** [G2] | Ambito **ristretto**, con verifica dell'app più onerosa [G2] |

È anche ciò che la specifica impone: «preferendo `appDataFolder` e il **minimo
ambito** necessario» (SPEC §8), e il mandato di revisione richiede
`drive.appdata` invece dell'accesso completo salvo necessità dimostrata
(`.claude/agents/security-release.md`, punto 6). Per TrackStrong non esiste
nessuna necessità dimostrata di accesso completo.

### Sensibile, ristretto o non sensibile?

Secondo la documentazione ufficiale di Google, **`drive.appdata` è un ambito
non sensibile** [G2]. La conseguenza dichiarata è che **non richiede** la
verifica dell'app prevista per gli ambiti sensibili (tempi indicati: 3–5
giorni lavorativi) né quella per gli ambiti ristretti (indicata come
potenzialmente di settimane) [G2].

> *Verifica parziale.* Questa classificazione proviene dagli **estratti
> indicizzati** delle pagine ufficiali
> `https://developers.google.com/workspace/drive/api/guides/api-specific-auth`
> e delle pagine di verifica degli ambiti: **le pagine non sono raggiungibili
> da questo ambiente** (403 dal proxy). *Non verificato il 2026-09-19:
> controllare su
> https://developers.google.com/workspace/drive/api/guides/api-specific-auth
> prima di procedere.* Se la classificazione fosse cambiata, la conseguenza
> pratica sarebbe una richiesta di verifica dell'app da parte di Google — non
> una perdita di dati.

Vincoli operativi di `appDataFolder` da conoscere, dalla guida ufficiale [G3]:
non si possono condividere file o cartelle al suo interno, non si possono
spostare file fra spazi, non si possono mettere nel cestino i file al suo
interno; la cartella non è raggiungibile dall'interfaccia di Drive.

---

## 4. Client OAuth per l'app iOS

**Tipo di client richiesto: client OAuth di tipo iOS.** La documentazione
ufficiale è esplicita: «You must create a separate OAuth client for each
platform on which your app will run… you should not use a "web" client type for
your native iOS app» [G5].

### 4.1 Nessun client secret da proteggere, e PKCE obbligatorio

- Per le app installate **non esiste un segreto che si possa tenere
  riservato**: Google lo dichiara come motivo per cui l'autorizzazione
  incrementale non è supportata con le app installate, «due to the fact that
  the client cannot keep the `client_secret` confidential» [G5].
- Si usa quindi **PKCE**: «Google supports the Proof Key for Code Exchange
  (PKCE) protocol», con un `code_verifier` casuale per ogni richiesta e il suo
  valore trasformato `code_challenge` inviato al server di autorizzazione
  [G5]. Il `code_verifier` è «a high-entropy cryptographic random string using
  the unreserved characters `[A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"`,
  with a minimum length of 43 characters» [G5].
- **Verificato direttamente** contro l'endpoint ufficiale di scoperta
  `https://accounts.google.com/.well-known/openid-configuration` (HTTP 200 il
  2026-09-19) [G4]:

  | Campo | Valore |
  |---|---|
  | `authorization_endpoint` | `https://accounts.google.com/o/oauth2/v2/auth` |
  | `token_endpoint` | `https://oauth2.googleapis.com/token` |
  | `revocation_endpoint` | `https://oauth2.googleapis.com/revoke` |
  | `code_challenge_methods_supported` | `["plain", "S256"]` |

  **Usa `S256`, non `plain`.** `plain` è dichiarato supportato ma non offre
  protezione: il challenge coinciderebbe con il verifier.

### 4.2 Bundle identifier e redirect

- Il client iOS si registra indicando il **bundle identifier** dell'app: è lo
  stesso `ios.bundleIdentifier` usato per la firma (vedi `INSTALL_IPHONE.md`
  §5.0). Se cambia il bundle id, il client OAuth va aggiornato.
- Il redirect per il client iOS usa lo **schema URL basato sul client ID
  invertito**: «The reversed client ID is your client ID with the order of the
  dot-delimited fields reversed, which is also shown under "iOS URL scheme"
  when selecting an existing iOS OAuth client in the Cloud console. For
  example: `com.googleusercontent.apps.1234567890-abcdefg`» [G5].
- Lato app, lo schema deve essere dichiarato nella configurazione Expo
  (`scheme`), che è «a build-time configuration» [G7]: **va impostato prima
  della build**, non si può aggiungere a un binario già compilato. Senza
  schema il flusso si completa nel browser ma non riesce a rientrare nell'app
  [G8].
- **Attenzione a non confondere due schemi diversi.** In
  `apps/mobile/app.json` è già presente `"scheme": "trackstrong"`: è lo schema
  di deep link dell'app. **Non è** lo schema che Google si aspetta come
  redirect per un client iOS, che è quello derivato dal client ID invertito
  (`com.googleusercontent.apps.…`) [G5]. Va **aggiunto** come schema
  ulteriore, non sostituito: `scheme` accetta anche un elenco di valori [G7].
- Il bundle identifier in `apps/mobile/app.json` è il segnaposto
  `com.example.trackstrong`. **Sostituiscilo prima** di registrare il client
  OAuth, altrimenti il client va rifatto (vedi `INSTALL_IPHONE.md` §5.0).
- **Redirect non più utilizzabili**, da verificare in fase di configurazione:
  l'opzione di redirect su indirizzo di loopback è dichiarata **deprecata per i
  tipi di client Android, Chrome app e iOS**, e il metodo manuale
  copia/incolla («out of band», OOB) non è più supportato [G6].

> ### Contraddizione trovata fra le fonti — da risolvere prima di implementare
> Una pagina ufficiale afferma che «custom URI schemes are no longer supported
> due to the risk of app impersonation», indicando come alternativa la Chrome
> Identity API [G6]. Una lettura più circostanziata della stessa
> documentazione attribuisce quella deprecazione **alle app Android e alle
> Chrome app**, mentre per il tipo di client **iOS** la documentazione continua
> a descrivere lo schema URL derivato dal client ID invertito come il
> meccanismo di redirect, mostrandolo nella console sotto «iOS URL scheme»
> [G5]. Le due affermazioni non sono conciliabili a partire dai soli estratti
> disponibili. *Non verificato il 2026-09-19: le pagine
> https://developers.google.com/identity/protocols/oauth2/native-app e
> https://developers.google.com/identity/protocols/oauth2/resources/best-practices
> sono bloccate dal proxy di rete; leggere la sezione iOS di entrambe prima di
> scrivere il codice del flusso di autorizzazione.* Non scegliere fra le due
> per intuizione: il meccanismo di redirect sbagliato produce un flusso che non
> rientra mai nell'app.

### 4.3 Nessun segreto nel binario

Regola non negoziabile (SPEC §8 e §14; `.claude/agents/security-release.md`
punto 1):

- **Nessun client secret, nessuna chiave, nessun certificato incorporato nel
  binario o nel repository.** La documentazione Expo lo dice nei termini più
  netti: «Never put any secret keys inside your application code, there is no
  secure way to do this!» [G8].
- Il **client ID** di un client iOS non è un segreto: identifica l'app, non la
  autorizza. Può stare nella configurazione. Il **refresh token**, invece, è un
  segreto dell'utente e va nel Keychain (§6).
- **Mai chiedere la password Google in un modulo dell'app** (SPEC §8).
  L'autorizzazione passa dal browser di sistema: «the web browser should share
  cookies with your system web browser so that users do not need to sign in
  again if they are already authenticated on the system browser» [G8].

---

## 5. Modalità di test contro schermata di consenso pubblicata

**Scelta richiesta all'utente,** e ha una conseguenza concreta che si sente
ogni settimana.

| | Stato «Testing» (in prova) | Stato «In production» (pubblicata) |
|---|---|---|
| Chi può accedere | solo gli utenti di test elencati nella schermata di consenso | qualunque account Google |
| Numero di utenti di test | fino a **100** [G9] | non applicabile |
| Scadenza dell'autorizzazione | «Authorizations by a test user will expire seven days from the time of consent» [G9] | — |
| Refresh token | **scadono dopo 7 giorni** [G9] | «refresh tokens generally don't expire unless they are revoked or remain unused for a prolonged period (typically six months)» [G9] |
| Conseguenza pratica | **riautenticazione periodica, circa ogni 7 giorni** | riautenticazione solo su revoca o inutilizzo prolungato |

Con la schermata in stato «Testing», quindi, l'app mostrerà `Accesso da
rinnovare` (§6) con cadenza circa settimanale e dovrai rifare l'accesso dal
telefono. Non è un difetto dell'app: è il comportamento documentato della
modalità di prova [G9].

> *Verifica parziale.* Questi numeri provengono dagli **estratti indicizzati**
> delle pagine ufficiali
> `https://developers.google.com/identity/protocols/oauth2/production-readiness/overview`,
> `https://developers.google.com/identity/protocols/oauth2` e
> `https://support.google.com/cloud/answer/15549945`, **tutte bloccate dal
> proxy di rete di questo ambiente**. *Non verificato il 2026-09-19:
> controllare su
> https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
> prima di scegliere lo stato della schermata di consenso.*

### «Pubblicare la schermata di consenso» non è «pubblicare l'app»

Distinzione richiesta dalla specifica (SPEC §1) e da non confondere mai:

| Operazione | Che cos'è | TrackStrong |
|---|---|---|
| **Pubblicare la schermata di consenso OAuth** | un'impostazione del **progetto Google Cloud**: cambia chi può autorizzare l'app e la durata dei refresh token. Non rende l'app scaricabile da nessuno, non la mette in nessun catalogo, non pubblica codice | **ammessa**: riguarda solo il tuo progetto Cloud |
| **Pubblicare l'app** (App Store, TestFlight, siti pubblici, marketplace) | distribuire il **binario** a terzi | **vietata** (SPEC §1) |

Pubblicare la schermata di consenso **non** comporta la pubblicazione
dell'app, e non comporta nemmeno che qualcun altro possa usare TrackStrong:
senza il binario installato non c'è nulla da autorizzare. L'unico effetto
rilevante è la fine delle riautenticazioni settimanali.

**Indicazione.** Se la riautenticazione settimanale è tollerabile, resta in
«Testing»: è la configurazione con la superficie minore. Se non lo è, la
pubblicazione della schermata di consenso è l'unico rimedio documentato — e
con un ambito non sensibile come `drive.appdata` non dovrebbe richiedere la
verifica dell'app [G2], con l'avvertenza di §3 sulla classificazione non
verificata direttamente.

---

## 6. Accesso, rinnovo e revoca dei token

### 6.1 Dove vengono conservati

Nel **Keychain di iOS**, tramite `expo-secure-store`. Dalla documentazione
ufficiale del modulo: «On iOS, values are stored using the keychain services as
`kSecClassGenericPassword`» [G10]. Nessun token in chiaro nel database, nei
file di configurazione, nei log o nel repository (SPEC §14).

Due avvertenze dalla stessa fonte [G10]:

1. «Due to the underlying nature of iOS Keychain, data stored with
   `expo-secure-store` will **persist across app uninstallations** when the app
   is reinstalled with the same bundle ID», con l'aggiunta «you should never
   rely on this implementation detail». Conseguenza: **disinstallare l'app non
   garantisce di aver rimosso il token.** Per rimuovere davvero l'accesso,
   revocalo (§6.3).
2. Esiste l'attributo `kSecAttrAccessible`, «which controls when the value is
   available to be fetched». Va scelto in modo che il token sia leggibile
   quando serve la sincronizzazione in background, senza renderlo disponibile a
   dispositivo bloccato più di quanto necessario. *Non verificato il
   2026-09-19: `expo-secure-store` è fra le dipendenze e fra i plugin di
   `apps/mobile/app.json`, ma **nessun codice dell'app lo usa ancora** e
   `kSecAttrAccessible` non è configurato da nessuna parte; da decidere e
   documentare al momento dell'implementazione.*

### 6.2 Cosa fa l'app quando il token non è più valido

Comportamento **implementato e verificato automaticamente** nel pacchetto di
sincronizzazione (non contro i server Google: vedi §10):

- L'app mostra lo stato **`Accesso da rinnovare`**
  (`packages/sync/src/protocol.ts`, `SYNC_STATUS_LABEL['accesso-da-rinnovare']`).
- **Un errore non è mai «archivio vuoto».** È scritto come principio nel
  protocollo (`packages/sync/src/protocol.ts`: «Token revocato, quota, spazio…»
  non equivalgono a archivio vuoto) e la specifica lo vieta esplicitamente:
  «interpretare errori di autorizzazione o rete come "archivio vuoto"» è fra le
  cose vietate (SPEC §8.1). Quindi un token revocato **non** provoca né la
  cancellazione dei dati locali né la creazione di un secondo programma
  iniziale.
- Gli errori di autorizzazione **non vengono ritentati**: ritentare non
  servirebbe e nasconderebbe all'utente un problema che deve vedere
  (`packages/sync/src/retry.ts`). L'app distingue token revocato, token
  scaduto e consenso mancante (`packages/sync/src/drive.ts`,
  `DriveAuthError`).
- **La registrazione della seduta continua.** Un problema di rete o di
  autorizzazione non interrompe la registrazione (SPEC §8.5).

Per rinnovare: apri l'app, tocca lo stato `Accesso da rinnovare` ed esegui di
nuovo l'accesso Google nel browser di sistema. Non serve reinstallare l'app e
non si perde nulla di locale.

### 6.3 Come revocare l'accesso

- **Dal tuo account Google:** nelle impostazioni dell'account Google, nella
  sezione dedicata alle app di terze parti con accesso all'account, rimuovi
  l'accesso di TrackStrong. *Non verificato il 2026-09-19: il percorso esatto
  nell'interfaccia dell'account non è verificabile da questo ambiente
  (`support.google.com` e `myaccount.google.com` non consultabili); controllare
  su https://support.google.com/accounts/answer/13533235 prima di procedere.*
- **Dall'app / a livello di protocollo:** la revoca lato Google si effettua
  sull'endpoint ufficiale **`https://oauth2.googleapis.com/revoke`**, dichiarato
  come `revocation_endpoint` dal documento di scoperta OpenID di Google,
  verificato direttamente il 2026-09-19 [G4].
- **Effetto della revoca:** le chiamate successive falliscono con errori di
  autorizzazione e l'app passa a `Accesso da rinnovare` (§6.2). **I dati locali
  non vengono toccati.** I dati già in `appDataFolder` restano nel tuo Drive
  fino a quando non li rimuovi tu; la guida ufficiale segnala che la cartella
  dati viene rimossa se l'utente disinstalla o scollega l'app e che l'utente
  può eliminarla a mano [G3].
- **Tre operazioni da non confondere** (SPEC §14): *eliminazione dal
  dispositivo* · *scollegamento dell'account* · *eliminazione dall'archivio
  sincronizzato*. Revocare il token è la seconda: non cancella né i dati locali
  né quelli remoti.

---

## 7. Aggiungere un secondo dispositivo

Flusso previsto dalla specifica (SPEC §8.3):

```
installazione → accesso Google → eventuale sblocco dell'archivio → recupero → uso offline
```

1. **Installazione.** Segui `INSTALL_IPHONE.md`. Con il percorso di firma
   gratuito ricorda che i dispositivi registrati sono al massimo 3 e scadono
   dopo 7 giorni.
2. **Accesso Google.** Stesso account Google del primo dispositivo, stesso
   progetto Cloud, stesso client iOS. Se la schermata di consenso è in
   «Testing», l'account deve essere fra gli utenti di test (§5).
3. **Recupero prima di tutto il resto.** **Regola vincolante:** se esiste già
   un archivio remoto, il secondo dispositivo **non crea un secondo programma
   iniziale**. «Non creare un secondo programma iniziale se esiste già quello
   remoto» (SPEC §8.3). Il nuovo dispositivo scarica e applica lo storico.
4. **Il primo recupero non deve perdere le modifiche in arrivo.** «Il primo
   recupero dello storico **non deve perdere** modifiche arrivate durante il
   download» (SPEC §8.1): non considerare il recupero concluso finché l'app non
   lo dichiara.
5. **Uso offline.** Concluso il recupero, il dispositivo funziona senza rete: il
   motore adattivo gira sul dispositivo (SPEC §1.2).
6. **Se esistono già due archivi indipendenti** (per esempio perché un
   dispositivo ha usato l'app prima di collegare Drive), l'app deve proporre una
   **riconciliazione non distruttiva**, non scegliere in silenzio (SPEC §8.3).
   Modifiche indipendenti si uniscono; modifiche incompatibili sullo stesso dato
   conservano le alternative e chiedono una scelta (SPEC §8.2).

---

## 8. Cambio di account Google

**Scelta richiesta all'utente,** con conferma esplicita.

- **Gli archivi restano separati.** `appDataFolder` è per-utente e per-app: la
  cartella dati di un account non è visibile all'altro [G3]. Cambiare account
  significa passare a un archivio remoto **diverso**, non «spostare» il tuo.
- **Nessun upload automatico sul nuovo account.** «Al cambio di account Google
  **non** caricare automaticamente i dati sul nuovo account» (SPEC §8.3). Il
  trasferimento richiede una **conferma esplicita**: l'app espone lo stato
  `Account Google cambiato: conferma richiesta`
  (`packages/sync/src/protocol.ts`, `trasferimento-da-confermare`).
- **I dati locali non si toccano** al cambio di account: restano nel database
  sul dispositivo.
- **I dati sul vecchio account restano dove sono.** Se vuoi rimuoverli, è
  un'operazione separata e distinta dallo scollegamento (SPEC §14).
- **Prima di cambiare account: backup verificato.** Il cambio di account è
  un'operazione che modifica quale archivio remoto è quello «vero» per l'app:
  non farlo senza un backup riletto con l'anteprima di importazione (SPEC §14).

---

## 9. Quote e limiti

### 9.1 Quello che ho verificato

- **Struttura delle quote.** I limiti della Drive API sono espressi in «quota
  units» e organizzati come **per minuto per progetto** e **per minuto per
  utente per progetto**; «provided you stay within the per-minute quotas,
  there's no limit to the number of requests you can make per day». Quando il
  limite per 60 secondi è raggiunto, bisogna attendere il rifornimento della
  quota, che avviene all'inizio dell'intervallo sincronizzato successivo
  (tipicamente dopo 60 secondi) [G11].
- **Errori di limite e rimedio.** «Additional rate limit checks on the Drive
  backend might generate a **429: Rate limit exceeded** response, and you
  should use an exponential backoff algorithm and try again later»; per tutti
  gli errori a tempo la guida prescrive un **truncated exponential backoff**
  [G11][G12].

### 9.2 Quello che NON ho potuto verificare

- **I valori numerici delle quote** (unità al minuto per progetto e per
  utente). *Non verificato il 2026-09-19: la pagina
  https://developers.google.com/workspace/drive/api/guides/limits è bloccata
  dal proxy di rete e gli estratti indicizzati non contengono la tabella
  numerica; controllare quella pagina, e le quote effettive del tuo progetto
  nella console Cloud, prima di contare su un numero.* Non usare cifre a
  memoria: per un'app personale a uso singolo il traffico è di ordini di
  grandezza inferiore a qualunque soglia plausibile, quindi il numero esatto
  non cambia la progettazione.
- **Se `appDataFolder` consumi la quota di archiviazione del tuo Drive.**
  `packages/sync/src/drive.ts` lo assume (e tratta lo spazio esaurito come caso
  reale, distinto dal superamento delle quote dell'API). *Non verificato il
  2026-09-19: gli estratti della pagina
  https://developers.google.com/workspace/drive/api/guides/appdata non lo
  confermano né lo smentiscono, e la pagina non è raggiungibile da questo
  ambiente; controllarla prima di dare una risposta all'utente sullo spazio
  occupato.* L'assunzione prudente (occupa la quota) è quella già implementata:
  se fosse falsa, l'app sarebbe solo più cauta del necessario.

### 9.3 Come l'app gestisce i limiti — attese progressive

**Implementato e verificato automaticamente** (non contro i server Google:
§10), in `packages/sync/src/retry.ts`:

| Parametro | Valore |
|---|---|
| Tentativi massimi, incluso il primo | 5 |
| Ritardo di base | 1 000 ms |
| Tetto al singolo ritardo | 32 000 ms |
| Jitter additivo massimo | 1 000 ms |

- Il ritardo è **esponenziale con componente casuale** (`1 + random`, `2 +
  random`, …), come prescritto dalla guida ufficiale sugli errori della Drive
  API [G12]. Il jitter evita che più operazioni ritentino in sincrono.
- Se il server indica **`Retry-After`** su un 429, quel valore **ha la
  precedenza** sul backoff calcolato: è il server a sapere quanto attendere
  (`backoffDelayMs`, `packages/sync/src/retry.ts`).
- **Classificazione degli errori** (`packages/sync/src/drive.ts`), coerente con
  la guida ufficiale: `userRateLimitExceeded` arriva con **HTTP 403**,
  `rateLimitExceeded` con **HTTP 429**; in entrambi i casi si applica il
  backoff [G12].
- **Non vengono ritentati:** token revocato, quota dell'API esaurita, spazio di
  archiviazione esaurito (`storageQuotaExceeded`, HTTP 403), file inesistente.
  Ritentarli nasconderebbe all'utente un problema che deve vedere (SPEC §8.5).
  Lo spazio esaurito ha un proprio stato visibile: `Spazio su Drive esaurito`
  (`packages/sync/src/protocol.ts`).
- **Upload dall'esito ignoto.** Un upload interrotto **può** essere andato a
  buon fine: il ritentativo verifica prima per `bundleId` (replicato negli
  `appProperties`, che la documentazione descrive come «private to the
  requesting app») invece di ricaricare, così non si creano duplicati
  [G1][G13]. Questo è il motivo per cui la specifica vieta di affidarsi
  all'unicità dei **nomi** dei file: il documento di discovery avverte che «the
  name of the file… isn't necessarily unique within a folder» [G1].

---

## 10. Verifiche non effettuate

Requisito di onestà della specifica (SPEC §15). Stato: **integrazione non
verificata contro i server reali**.

- **Nessuna chiamata reale ai server Google è stata effettuata.** In questo
  ambiente non esistono credenziali Google, non esiste un progetto Google Cloud
  autorizzato, non esiste un client OAuth, non esiste un token di accesso né di
  refresh, e nessun file è stato creato, letto o cancellato in nessun
  `appDataFolder`.
- **Nessun flusso OAuth è stato eseguito.** Nessuna schermata di consenso è
  stata vista, nessun `code_verifier` è stato scambiato, nessun token è stato
  revocato. Gli endpoint riportati in §4.1 e §6.3 sono stati letti dal
  documento di scoperta pubblico di Google [G4], **non** esercitati.
- **Il protocollo è stato verificato solo contro un'implementazione finta**
  conforme al contratto dell'API (`packages/sync/src/testing/inMemoryDrive.ts`,
  esercitata dalla suite in `packages/sync/test/`). Il file stesso elenca ciò
  che il finto **non** riproduce, e quelle limitazioni valgono come limiti di
  questo documento:
  - il comportamento reale di `changes.list` sotto concorrenza (collasso dei
    cambiamenti, ritardi di propagazione, ordine effettivo);
  - la validità e la scadenza reali dei `pageToken`;
  - il protocollo di upload ripristinabile (sessione, `308 Resume Incomplete`,
    header `Range`);
  - i codici e i `reason` HTTP reali, le **soglie di quota** effettive, i tempi
    reali di `Retry-After`;
  - il flusso OAuth, la revoca del consenso, il comportamento di
    `appDataFolder` alla disinstallazione dell'app;
  - la latenza, i limiti di dimensione dei file, l'eventuale consistenza
    differita dei metadati.
- **La console Google Cloud non è stata aperta.** Nessun progetto è stato
  creato, nessuna API abilitata, nessuna schermata di consenso configurata,
  nessun client OAuth registrato. I nomi delle voci di menu in §2 sono
  dichiarati **non verificati**.
- **`developers.google.com`, `support.google.com`, `cloud.google.com` e
  `console.cloud.google.com` sono bloccati dal proxy di rete** di questo
  ambiente (403 al CONNECT). Le affermazioni che dipendono solo da quelle
  pagine sono marcate come non verificate nel punto in cui compaiono.
- **Il codice che eseguirà OAuth e le chiamate HTTP a Drive non esiste
  ancora.** Al 2026-09-19 `apps/mobile` contiene la configurazione del
  progetto e le dipendenze necessarie (`expo-auth-session`, `expo-crypto`,
  `expo-web-browser`, `expo-secure-store` in `apps/mobile/package.json`), ma
  in `apps/mobile/src` **nessun file menziona OAuth, AuthSession, Drive o
  SecureStore**: il flusso di autorizzazione è **da scrivere**. Esistono il
  **contratto** verso Drive (`packages/sync/src/drive.ts`, senza nessuna
  chiamata HTTP) e il motore di protocollo che lo usa.

Classificazione secondo SPEC §15:

| Elemento | Stato |
|---|---|
| Protocollo di sincronizzazione (pacchetti, conflitti, recupero, attese progressive) | **implementato · verificato automaticamente** contro un finto |
| Contratto verso la Drive API (ambito, `spaces`, classificazione errori) | **implementato**, allineato al documento di discovery ufficiale [G1] |
| Flusso OAuth, PKCE, conservazione nel Keychain, revoca | **incompleto** (non implementato nell'app) |
| Integrazione con i server Google | **non verificata** |
| Quote numeriche e occupazione di spazio | **non verificate** |

---

## 11. Fonti

Tutte consultate il **2026-09-19**.

| Rif. | URL / origine | Esito | Cosa ne ho preso |
|---|---|---|---|
| G1 | `https://www.googleapis.com/discovery/v1/apis/drive/v3/rest` | **letta direttamente, HTTP 200** | Drive v3, revisione `20260913`; ambito `drive.appdata` con descrizione «See, create, and delete its own configuration data in your Google Drive»; parametro `spaces` con valori `drive` e `appDataFolder` su `files.list` e `changes.list`; `appProperties` «private to the requesting app»; «The name of the file… isn't necessarily unique within a folder» |
| G4 | `https://accounts.google.com/.well-known/openid-configuration` | **letta direttamente, HTTP 200** | `authorization_endpoint`, `token_endpoint`, **`revocation_endpoint` = `https://oauth2.googleapis.com/revoke`**, `code_challenge_methods_supported = ["plain","S256"]` |
| G2 | https://developers.google.com/workspace/drive/api/guides/api-specific-auth e le pagine di verifica degli ambiti sensibili/ristretti | **bloccata dal proxy** — solo estratti indicizzati | `drive.appdata` come ambito **non sensibile**; tempi indicativi della verifica per ambiti sensibili (3–5 giorni lavorativi) e ristretti (settimane) |
| G3 | https://developers.google.com/workspace/drive/api/guides/appdata | **bloccata dal proxy** — solo estratti indicizzati | cartella per-app, «Only the application that created the data in the `appDataFolder` can access it»; non accessibile dall'interfaccia di Drive; non si condivide, non si sposta fra spazi, non si mette nel cestino; la cartella può essere rimossa dall'utente |
| G5 | https://developers.google.com/identity/protocols/oauth2/native-app | **bloccata dal proxy** — solo estratti indicizzati | PKCE, `code_verifier` ≥ 43 caratteri e charset; impossibilità di tenere riservato il `client_secret` nelle app installate; client separato per piattaforma e divieto di usare un client «web» per iOS; client ID invertito mostrato come «iOS URL scheme» |
| G6 | https://developers.google.com/identity/protocols/oauth2/resources/best-practices | **bloccata dal proxy** — solo estratti indicizzati | «custom URI schemes are no longer supported» (attribuito ad Android e Chrome app in una seconda lettura: **contraddizione**, vedi §4.2); loopback **deprecato** per i client Android/Chrome app/iOS; OOB non più supportato |
| G9 | https://developers.google.com/identity/protocols/oauth2/production-readiness/overview · https://developers.google.com/identity/protocols/oauth2 · https://support.google.com/cloud/answer/15549945 | **bloccate dal proxy** — solo estratti indicizzati | stato «Testing»: fino a **100 utenti di test**; «Authorizations by a test user will expire seven days from the time of consent»; refresh token a scadenza **7 giorni**; in produzione i refresh token non scadono salvo revoca o inutilizzo prolungato (~6 mesi) |
| G11 | https://developers.google.com/workspace/drive/api/guides/limits | **bloccata dal proxy** — solo estratti indicizzati | quote in «quota units», per minuto per progetto e per minuto per utente per progetto; nessun limite giornaliero se si resta nelle quote al minuto; rifornimento all'intervallo successivo (~60 s). **Valori numerici non ottenuti** |
| G12 | https://developers.google.com/workspace/drive/api/guides/handle-errors | **bloccata dal proxy** — solo estratti indicizzati | 429 «Rate limit exceeded» → backoff esponenziale; truncated exponential backoff per gli errori a tempo. Citata anche nei commenti di `packages/sync/src/retry.ts` e `drive.ts` |
| G13 | https://developers.google.com/workspace/drive/api/guides/manage-uploads | **bloccata dal proxy** — citata in `packages/sync/src/drive.ts` | upload ripristinabili: «you should not assume that the server received all bytes sent in any given request» |
| G7 | `packages/@expo/config-types/src/ExpoConfig.ts`, ramo `sdk-57` di `expo/expo` | **letta direttamente** | `scheme`: «URL scheme(s) to link into your app… This is a build-time configuration»; `ios.bundleIdentifier` |
| G8 | `docs/pages/versions/unversioned/sdk/auth-session.mdx`, ramo `main` di `expo/expo` | **letta direttamente** | «Never put any secret keys inside your application code, there is no secure way to do this!»; necessità dello `scheme` per rientrare nell'app; condivisione dei cookie con il browser di sistema |
| G10 | `docs/pages/versions/unversioned/sdk/securestore.mdx`, ramo `main` di `expo/expo` | **letta direttamente** | iOS keychain services, `kSecClassGenericPassword`; persistenza attraverso la disinstallazione con lo stesso bundle ID + «you should never rely on this implementation detail»; `kSecAttrAccessible` |
| — | https://support.google.com/accounts/answer/13533235 | **bloccata dal proxy** | percorso di revoca nell'interfaccia dell'account Google: **non verificato** |
| — | `packages/sync/src/{drive,retry,protocol}.ts`, `packages/sync/src/testing/inMemoryDrive.ts` | lette nel repository | comportamento implementato dell'app: stati, attese progressive, classificazione errori, limiti del finto |

**Nota sul metodo.** Dove il proxy di rete ha impedito la lettura diretta delle
pagine Google, ho verificato quanto possibile contro gli **endpoint ufficiali
raggiungibili** (`www.googleapis.com/discovery/...` e
`accounts.google.com/.well-known/openid-configuration`), che sono la stessa
fonte da cui Google genera i client ufficiali e la configurazione OAuth. Il
resto è marcato come **non verificato** nel punto in cui compare, con l'URL da
controllare. Nessun numero, nessuna durata, nessun nome di menu e nessun
endpoint in questo documento è stato scritto a memoria senza dichiararne lo
stato di verifica.
