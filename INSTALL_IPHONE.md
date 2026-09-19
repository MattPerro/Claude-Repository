# INSTALL_IPHONE.md — Installazione privata di TrackStrong su iPhone 15

Procedura per costruire TrackStrong su un Mac con Xcode e installarlo su un
iPhone 15 (non Pro) **a uso personale**.

- **Data di verifica delle fonti: 2026-09-19.** Ogni affermazione su limiti,
  durate, costi e procedure porta un riferimento `[Fn]` alla tabella
  [§12 Fonti](#12-fonti).
- L'app **non** viene pubblicata su App Store, TestFlight, siti pubblici o
  marketplace (SPEC §1). Questa procedura non prevede alcuna distribuzione a
  terzi.
- **Questa procedura non è stata eseguita.** Vedi
  [§11 Verifiche non effettuate](#11-verifiche-non-effettuate). Non esiste
  nessuna build firmata di TrackStrong.

---

## 0. Cosa produce questa procedura, e cosa non produce

| Produce | Non produce |
|---|---|
| Un'app installata sull'iPhone, avviabile dalla schermata Home | Un'app pubblicata o distribuibile |
| Funzionamento **senza Expo Go, senza Metro, senza debugger, senza Mac acceso** — a condizione di compilare in configurazione **Release**, perché le build di produzione esportano il progetto e incorporano i file nel binario nativo [F10] | Un'installazione **permanente senza rinnovi**: la firma scade (§7) |
| Dati conservati nel contenitore dell'app sul dispositivo | Un backup: il backup è un'operazione separata (SPEC §14) |

> **Vincolo da tenere presente da subito.** Con il percorso gratuito i profili
> di provisioning scadono **7 giorni dopo l'emissione** e Apple scrive che
> dopo la scadenza «you'll need to rebuild and reinstall your app to your
> device» [F1]. Nessuna variante di questa procedura elimina i rinnovi
> periodici: cambia solo la loro frequenza.

---

## 1. Prerequisiti

**Scelta richiesta all'utente:** nessuna in questa sezione, ma se il Mac non
soddisfa il requisito di macOS la procedura si ferma qui.

1. **Un Mac.** `npx expo run:ios` «can only be run on a Mac, and Xcode must be
   installed» [F10].
2. **Xcode e macOS.** Sulla tabella ufficiale delle versioni di Xcode,
   consultata il 2026-09-19 [F8]:

   | Xcode | Versioni di macOS supportate |
   |---|---|
   | 26.6 | macOS Tahoe 26.2 – 26.x |
   | 26.5 | macOS Tahoe 26.2 – 26.x |
   | 26.4.1 | macOS Tahoe 26.2 – 26.x |
   | 26.3 | macOS Sequoia 15.6 – macOS Tahoe 26.x |
   | 26 | macOS Sequoia 15.6 – macOS Tahoe 26.x |

   Il changelog ufficiale di Expo SDK 57 risulta indicare **Xcode 26.4 o
   superiore** come minimo, ma la pagina `https://expo.dev/changelog/sdk-57`
   **non è raggiungibile da questo ambiente** e il dato proviene solo
   dall'estratto indicizzato: *Non verificato il 2026-09-19: controllare su
   https://expo.dev/changelog/sdk-57 prima di procedere.* Si noti inoltre che
   nella tabella Apple del 2026-09-19 **non esiste una riga «Xcode 26.4»**: la
   prima 26.4.x elencata è la 26.4.1 [F8].
   **Conseguenza operativa:** installa **Xcode 26.4.1 o successivo**, che
   richiede **macOS Tahoe 26.2 o successivo** [F8].
3. **Strumenti a riga di comando di Xcode.** Apri Xcode, menu Xcode >
   Settings…, pannello **Locations**, e installa la versione più recente dal
   menu **Command Line Tools** [F11].
4. **CocoaPods.** Serve per le dipendenze native iOS; si installa come gem Ruby
   [F11]. In un progetto Expo l'installazione dei pod è gestita dal comando di
   compilazione, che esegue `npx pod-install` quando cambiano le dipendenze
   [F10].
5. **Node.** Il monorepo dichiara `"engines": { "node": ">=22.12" }`
   (`/home/user/Claude-Repository/package.json`). Usa una versione che
   soddisfi quel vincolo.
6. **Versione di iOS sul telefono.** Il target di distribuzione iOS di Expo SDK
   57 è **iOS 16.4** (`s.platforms = { :ios => '16.4' }` nel podspec di
   `expo-modules-core`, ramo `sdk-57`) [F12]. Un iPhone 15 è ampiamente sopra
   questa soglia.
7. **Spazio su disco.** *Non verificato il 2026-09-19: lo spazio richiesto da
   Xcode e dai componenti delle piattaforme è indicato nella scheda di Xcode
   sul Mac App Store e nei Componenti di Xcode; controllarlo lì prima di
   procedere.* Non usare stime: Xcode più i componenti delle piattaforme
   occupa decine di gigabyte e il primo download può fallire per spazio
   insufficiente.
8. **Collegamento fra Mac e iPhone.** Un cavo USB-C (l'iPhone 15 ha la porta
   USB-C) oppure l'associazione senza fili. L'associazione si fa con **Device
   Hub**: dal menu della destinazione di esecuzione scegli **Manage Devices** e
   associa il dispositivo al Mac, via cavo o senza fili [F6].
9. **Un Apple Account.** Vedi §2.

---

## 2. Account Apple e firma

**Scelta richiesta all'utente:** percorso **gratuito** (personal team) oppure
**Apple Developer Program a pagamento**. Le conseguenze sono nella tabella di
§8. Entrambi i percorsi installano la stessa app; cambiano i rinnovi e i
limiti.

In Xcode l'accesso si fa da **Xcode > Settings > Apple Accounts**, dove si
accede «with your Apple Developer Program or personal Apple Account» [F6]:
Xcode accetta quindi anche un Apple Account senza abbonamento.

### 2.1 Percorso gratuito (Apple Account, «personal team»)

Verificato su `https://developer.apple.com/support/compare-memberships/` il
2026-09-19 [F1]:

| Vincolo | Valore ufficiale |
|---|---|
| App ID | «You can register up to 10 App IDs, which expire after 7 days.» |
| Dispositivi | «You can register up to 3 devices, which expire after 7 days.» |
| App installate insieme, per dispositivo | «You can install up to 3 apps per device.» |
| Profilo di provisioning | «Provisioning profiles that enable apps to be installed on a device will expire 7 days from issuance. You'll need to rebuild and reinstall your app to your device after expiration.» |
| Costo | Nessuno. La registrazione come «Apple Developer» non ha costi e, per definizione di Apple, «developers can't distribute apps» [F4] |

Il percorso gratuito include esplicitamente «On-device testing using Xcode
(with a Personal Team)» [F1]: è sufficiente per l'uso previsto qui.

**Durata e rinnovo:** ogni **7 giorni** [F1]. Il rinnovo consiste nel
ricostruire e reinstallare l'app dal Mac con Xcode (§5). Non è un'operazione
automatica e richiede il Mac e il cavo (o l'associazione senza fili).

**Limiti sulle capability con il personal team.** Secondo la Technical Q&A
QA1915 di Apple, selezionando il team «(Personal Team)» si può firmare l'app
ma «you will only be able to run your app on your own personal devices», i
pulsanti Validate ed Export dell'organizer non sono disponibili e non si può
caricare l'app sull'App Store; alcune funzioni (per esempio gli acquisti in
app) richiedono un account a pagamento [F13]. **Questo riferimento proviene
dagli estratti indicizzati della pagina, non da una lettura diretta:** *Non
verificato il 2026-09-19: controllare su
https://developer.apple.com/library/archive/qa/qa1915/_index.html prima di
procedere.*

### 2.2 Percorso a pagamento (Apple Developer Program)

- **Costo:** «The Apple Developer Program is 99 USD per membership year, or in
  local currency where available.» [F2]
- **Dispositivi:** «Members of the Apple Developer Program and Apple Developer
  Enterprise Program can register up to 100 of the following devices, per
  product family, per membership year», elencando fra gli altri iPhone e iPad
  [F3].
- **App ID:** la pagina di confronto non applica ai membri del programma i
  limiti «10 App ID che scadono dopo 7 giorni» e «3 app per dispositivo»,
  elencati solo fra i limiti della registrazione gratuita [F1]. *Non verificato
  il 2026-09-19: un tetto numerico esplicito agli App ID per i membri del
  programma non è indicato sulle pagine consultate; controllare su
  https://developer.apple.com/support/compare-memberships/ prima di contare su
  un numero.*
- **In più rispetto al gratuito:** gestione di Certificates, Identifiers &
  Profiles, notarizzazione del software Mac, App Store Connect, TestFlight,
  Xcode Cloud, supporto tecnico sul codice [F1]. **Per TrackStrong nessuna di
  queste voci è necessaria**: App Store Connect e TestFlight sono esclusi dalla
  specifica (SPEC §1).

**Durata del certificato e del profilo:** *Non verificato il 2026-09-19: le
pagine ufficiali consultate
(https://developer.apple.com/support/certificates/,
https://developer.apple.com/help/account/certificates/certificates-overview/,
https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile/)
descrivono tipi, revoca e sostituzione dei certificati ma **non** dichiarano
una durata in mesi o anni per i certificati Apple Development né per i profili
di sviluppo. Non assumere «un anno»: leggi la data di scadenza effettiva in
Xcode (Signing & Capabilities) o nel portale Certificates, Identifiers &
Profiles, e annota quella.* L'unica durata dichiarata sulla pagina dei
certificati riguarda il certificato intermedio Apple Worldwide Developer
Relations, «that expires on February 20, 2030» [F14] — che è un'altra cosa.

Nota correlata, verificata: nel portale esiste l'opzione di creare un
**profilo di provisioning offline valido 7 giorni**, e per app che devono
funzionare offline per più di 30 giorni dal primo avvio va inoltrata una
richiesta di «extended offline provisioning profile validity support» [F9].

### 2.3 Capability non disponibili

Sulla tabella ufficiale delle capability iOS, consultata il 2026-09-19, le voci
indicate come riservate ai programmi a pagamento (ADP/ADEP) e quindi **non**
disponibili a un account gratuito sono: 5G Network Slicing, DriverKit Family
MIDI (solo sviluppo), Family Controls (solo sviluppo), FileProvider Testing
Mode (solo sviluppo), ID Verifier – Display Only, MDM Managed Associated
Domains, SIM Inserted for Wireless Carriers. Per **Maps** la pagina precisa:
«If you aren't a member of the Apple Developer Program, you can use the MapKit
framework but you can't provide routing directions.» [F4]

**TrackStrong non usa nessuna di queste capability.** Le funzioni previste
dalla specifica (database locale, timer, notifiche locali, accesso HTTPS a
Google Drive, Keychain) non compaiono fra le voci riservate.

> **Avvertenza di onestà.** La lettura della tabella [F4] è stata fatta
> attraverso un riassunto automatico della pagina. È diffusa la convinzione che
> alcune capability tipiche (per esempio le **notifiche push remote**, iCloud o
> gli App Groups) richiedano l'abbonamento a pagamento, e la lettura ottenuta
> **non** le elenca fra quelle riservate. *Non verificato il 2026-09-19: se in
> futuro TrackStrong dovesse aggiungere una capability, controllare la riga
> corrispondente su
> https://developer.apple.com/help/account/reference/supported-capabilities-ios/
> prima di procedere.* Le **notifiche locali** (timer di recupero, promemoria)
> non sono una capability e non compaiono in quella tabella.

---

## 3. Registrazione del dispositivo

Con la firma automatica non serve registrare il dispositivo a mano.

1. Associa l'iPhone al Mac con **Device Hub** (menu della destinazione di
   esecuzione > **Manage Devices**), via cavo o senza fili [F6].
2. Nel pannello **Signing & Capabilities**, sotto **Signing**, attiva
   **Automatically manage signing** [F7].
3. Scegli l'iPhone come destinazione di esecuzione. «When you enable the
   "Automatically manage signing" option, Xcode registers the device and
   creates the development provisioning profile for you. If a Register button
   appears under Signing, click it to add it to the provisioning profile.»
   [F6]

Con il percorso gratuito i dispositivi registrati sono al massimo **3** e
«expire after 7 days» [F1]. Con il programma a pagamento sono fino a **100 per
famiglia di prodotto per anno di abbonamento** [F3].

> Nota su una tensione fra due pagine Apple. La pagina «Devices overview» parla
> solo dei membri dei programmi a pagamento e non menziona gli account gratuiti
> [F3], mentre la pagina di confronto delle iscrizioni documenta esplicitamente
> la registrazione di «up to 3 devices» per la registrazione gratuita [F1]. Non
> è una contraddizione sui fatti: sono due pagine con ambiti diversi. Per il
> percorso gratuito vale [F1].

---

## 4. Developer Mode su iOS

Testo verificato integralmente il 2026-09-19 [F5].

**Quando serve.** «Enable Developer Mode on a device to run your app on the
device through Xcode.» Serve anche per eseguire un'app installata da un file
`.ipa`: «To run your iOS, iPadOS, visionOS, or watchOS app that you install
from an iOS Package Archive, enable Developer Mode on that device.» [F7]
Non riguarda le app dell'App Store né TestFlight: «The feature doesn't affect
ordinary installation techniques, such as buying apps from the App Store or
participating in a TestFlight team.» [F5]

**Dove appare.** «Developer Mode only appears in Settings if you initiate
pairing or if you previously paired the device to a Mac.» [F5] Quindi:
**prima** associa l'iPhone al Mac, **poi** cerca la voce nelle Impostazioni.

**Come si attiva** [F5]:

1. Sul dispositivo, in **Privacy & Security** (Privacy e sicurezza), attiva
   l'interruttore **Developer Mode** sotto **Security**.
2. Compare un avviso: «An alert appears to warn you that Developer Mode
   reduces the security of your device.» Per continuare, toccare **Restart**.
3. Dopo il riavvio compare un secondo avviso di conferma: «In iOS and iPadOS,
   swipe up, tap Enable in the dialog, and enter your device passcode.»

**Cosa comporta.** «Developer Mode protects people from inadvertently
installing potentially harmful software, and reduces attack vectors exposed by
developer-only functionality»; attivarlo **riduce la sicurezza del
dispositivo** (è il testo dell'avviso) e fa comparire le impostazioni
Developer sul dispositivo [F5]. Per disattivarlo: stesso interruttore, poi
riavvio; «After you turn off Developer Mode, you can't run apps from Xcode on
the device until you turn on Developer Mode again.» [F5]

---

## 5. Procedura passo per passo

**Scelta richiesta all'utente:** §5A (tutto da riga di comando) oppure §5B
(firma e compilazione dentro Xcode). §5B è il percorso indicato dalla
preferenza dichiarata («build locale su Mac con Xcode») e va usato la prima
volta; §5A è più rapido nelle ripetizioni.

### 5.0 Comune a entrambi

```bash
cd /percorso/del/monorepo          # la cartella che contiene apps/mobile
npm install
```

Genera il progetto nativo iOS (prebuild). Il comando crea le cartelle native a
partire dalla configurazione dell'app [F3-Expo]:

```bash
cd apps/mobile
npx expo prebuild -p ios --clean
```

- `--clean` «deletes any existing native directories before generating» ed è
  «the safest way to use the prebuild command» [F9-Expo]. Senza `--clean` le
  esecuzioni successive stratificano le modifiche sui file esistenti
  [F9-Expo].
- Il comando avverte se il repository ha modifiche non committate: «you'll be
  warned if you have any uncommitted changes to your git code repository, as
  this option will delete and recreate all of your native project files»
  [F9-Expo]. Fai il commit prima.
- Le cartelle `ios` e `android` sono normalmente elencate in `.gitignore`
  [F9-Expo]: sono rigenerabili, non sono la fonte di verità.

Prima del prebuild verifica la configurazione dell'app. Valori presenti in
`apps/mobile/app.json` al 2026-09-19:

| Chiave | Valore attuale | Perché conta | Fonte |
|---|---|---|---|
| `ios.bundleIdentifier` | `com.example.trackstrong` — **da sostituire** | Identità dell'app sul dispositivo. Deve essere **unico e stabile**: cambiarlo crea un'app diversa con un contenitore dati diverso (§6). Sostituiscilo **ora**, prima della prima build, con qualcosa tipo `com.tuonome.trackstrong`: cambiarlo dopo costa i dati | «The bundle identifier for your iOS standalone app.» [F12] |
| `scheme` | `trackstrong` | Schema URL per il ritorno dal browser dopo l'accesso Google. «This is a build-time configuration»: va deciso prima della build. Attenzione: il redirect di Google richiede **in aggiunta** lo schema derivato dal client ID invertito (vedi `GOOGLE_DRIVE_SETUP.md` §4.2) | [F12] |
| `ios.supportsTablet` | `true` | L'app è già configurata per girare a piena risoluzione su iPad (§9) | «Whether your standalone iOS app supports tablet screen sizes. Defaults to `false`.» [F12] |
| `ios.infoPlist.ITSAppUsesNonExemptEncryption` | `false` | Dichiarazione di conformità all'esportazione, richiesta quando si usa `expo-secure-store`. Riguarda la pubblicazione su App Store/TestFlight, che qui **non** avviene | [F13-Expo] |

### 5A. Compilazione e firma dalla riga di comando

```bash
# Debug su dispositivo collegato (richiede il server Metro attivo)
npx expo run:ios --device

# Build autonoma, senza Metro: OBBLIGATORIA per l'uso quotidiano
npx expo run:ios --configuration Release --device
```

- `npx expo run:ios` «can only be run on a Mac, and Xcode must be installed»
  [F10].
- `-d, --device [device]`: «Device name or ID to build the app on. You can pass
  `--device` without arguments to select a device from a list of available
  options.» [F10]
- Firma: «Expo CLI will automatically sign the device for development, install
  the app, and launch it.» Se sul Mac non ci sono profili di sviluppo
  configurati, «you'll need to set them up manually outside of Expo CLI»
  seguendo la guida indicata da Expo [F10] — cioè §5B.
- **Perché Release.** «Production builds will export the project and embed the
  files in the native binary before installing them on a device.» [F10] È
  questo che rende l'app utilizzabile senza Metro e con il Mac spento. Una
  build Debug **dipende** dal server di sviluppo.
- Limite dichiarato da Expo: «This build is not automatically code signed for
  submission to the Apple App Store.» [F10] Per TrackStrong è irrilevante: non
  c'è nessuna sottomissione.

### 5B. Compilazione e firma dentro Xcode (percorso principale)

1. Apri il workspace generato:

   ```bash
   xed ios
   ```

   `xed ios` è il comando indicato da Expo per aprire il progetto in Xcode
   [F10]. In alternativa apri a mano `apps/mobile/ios/<NomeApp>.xcworkspace`
   (il **workspace**, non il `.xcodeproj`, perché le dipendenze sono gestite da
   CocoaPods).
2. **Accedi con l'account Apple:** Xcode > Settings > **Apple Accounts**, e
   accedi «with your Apple Developer Program or personal Apple Account» [F6].
3. **Scegli il team di firma.** Nel pannello **Signing & Capabilities**
   dell'editor di progetto, premi **Set Up Signing** sotto **Signing** se
   compare; nel foglio scegli il team dal menu **Team**, inserisci un bundle ID
   unico nel campo **Bundle Identifier** e premi **Set Up**. Se il bundle ID
   non è unico, Xcode mostra un avviso e disattiva il pulsante. Se **Set Up
   Signing** non compare, attiva **Automatically manage signing**, assegna il
   progetto a un team e inserisci il bundle ID nello stesso pannello [F6].
   - Con l'account gratuito il team è quello con l'etichetta **(Personal
     Team)** [F13].
   - Il bundle ID deve coincidere con `ios.bundleIdentifier` della
     configurazione Expo, altrimenti il prossimo `prebuild` lo riscrive.
4. **Scegli lo schema e la destinazione.** «In the toolbar, choose a scheme
   from the pop-up menu on the left of the run-destination», poi scegli
   l'iPhone come destinazione fisica [F6]. Se il dispositivo non è
   nell'elenco: **Manage Devices** e associalo con Device Hub [F6].
5. **Imposta la configurazione Release.** Per una build che funzioni senza
   Metro: dalla barra dei menu, **Product > Scheme > Edit Scheme**, seleziona
   **Run** nella barra laterale e imposta **Build configuration** su
   **Release** [F2-Expo].
6. **Compila e installa.** «To build and run the app on the selected simulated
   or physical device, click the Run button in the toolbar or choose Product >
   Run.» [F6] La prima volta su un dispositivo fisico «Xcode needs to register
   the device and create a provisioning profile that contains the device»
   [F6].
7. **Sul telefono:** se l'app non parte, controlla Developer Mode (§4). Al
   primo collegamento il telefono chiede di fidarsi del computer: accetta e
   inserisci il codice.
8. **Verifica che sia davvero autonoma.** Scollega il cavo, chiudi Xcode,
   **spegni il Mac**, metti l'iPhone in modalità aereo e apri l'app. Se si
   avvia e funziona, la build è autonoma. Se mostra un errore di connessione al
   bundler, hai compilato in Debug: torna al punto 5.

### 5C. Variante: esportare un file `.ipa` (opzionale)

Serve solo se vuoi installare senza ricompilare, per esempio su un secondo
dispositivo tuo. Procedura ufficiale [F7]:

1. **Product > Archive** con la destinazione corretta.
2. Nell'organizer **Archives**: seleziona l'archivio, **Distribute App**,
   scegli **Debugging**, **Distribute**, rivedi i dettagli, **Export**, scegli
   la cartella.
3. Installa il file `.ipa` sul dispositivo registrato con **Device Hub** o
   **Apple Configurator** [F7].
4. Ricorda: per eseguire un'app installata da `.ipa` serve **Developer Mode**
   sul dispositivo [F7].

Il numero di dispositivi utilizzabili resta quello di §3. Non consegnare il
file `.ipa` a terzi (§10).

### 5D. Aggiornamenti solo JavaScript durante lo sviluppo

Dopo la prima build, se modifichi solo codice JS/TS non serve ricompilare:
`npx expo start` avvia il solo bundler Metro e l'app già installata carica il
nuovo bundle [F3-Expo]. **Questo vale solo per le build Debug** e richiede il
Mac acceso: non è il modo in cui l'app va usata in palestra. Per l'uso reale
serve una build Release (§5A/§5B), che incorpora il bundle nel binario [F10].

---

## 6. Aggiornare l'app mantenendo i dati

I dati operativi di TrackStrong stanno nel **contenitore dell'app** sul
dispositivo (database SQLite locale, SPEC §7 e §1.2). La regola pratica è:

| Operazione | Effetto sui dati |
|---|---|
| Reinstallare **sopra** la stessa app, **stesso bundle id**, **stessa identità di firma** | **Preserva** il contenitore |
| **Disinstallare** l'app (tenere premuto > Rimuovi app > Elimina app) | **Cancella** il contenitore |
| **Cambiare `ios.bundleIdentifier`** | Nasce un'app **diversa**, con contenitore **vuoto**. I vecchi dati restano nell'app precedente finché quella esiste |
| **Cambiare il team di firma** (da personal team a programma a pagamento, o viceversa) | Vedi l'avvertenza sotto: va trattato come operazione **potenzialmente distruttiva** |
| `npx expo prebuild --clean` | Riscrive solo il progetto nativo **sul Mac**. Non toglie l'app dal telefono e non toglie dati dal telefono [F9-Expo] |

> ### Regola vincolante
> **Backup verificato prima di qualsiasi operazione che possa cancellare il
> contenitore dell'app.** «Verificato» significa: backup eseguito **e** riletto
> con l'anteprima di importazione, non solo prodotto (SPEC §14). Nessuna
> disinstallazione, nessun cambio di bundle id e nessun cambio di team di firma
> prima di quel controllo.

**Avvertenza sul cambio di identità di firma.** È noto che iOS rifiuti di
installare una build sopra un'app già presente firmata con un'identità
diversa, costringendo a disinstallare — e la disinstallazione cancella il
contenitore. *Non verificato il 2026-09-19: non ho trovato questo
comportamento enunciato su una pagina Apple ufficiale fra quelle consultate;
controllare su https://developer.apple.com/support/compare-memberships/ e sulla
documentazione di Xcode prima di procedere.* Fino a verifica, **trattalo come
vero**: passare dal percorso gratuito a quello a pagamento (o cambiare Apple
Account) è un'operazione da fare **solo dopo un backup verificato**.

**Nota sui token, non sui dati di allenamento.** I segreti salvati con
`expo-secure-store` finiscono nel Keychain iOS e la documentazione Expo
avverte: «data stored with `expo-secure-store` will persist across app
uninstallations when the app is reinstalled with the same bundle ID», pur
aggiungendo «you should never rely on this implementation detail» [F13-Expo].
Conseguenza pratica: **la disinstallazione può cancellare i tuoi allenamenti e
insieme lasciare in giro il token di accesso a Google.** Se disinstalli per
liberarti dell'accesso, revoca il consenso dal tuo account Google (vedi
`GOOGLE_DRIVE_SETUP.md` §6).

**Sequenza di aggiornamento consigliata:**

1. Backup completo dall'app + esportazione JSON; verifica il backup con
   l'anteprima di importazione (SPEC §14).
2. Commit del codice (serve anche per l'avviso di `--clean` [F9-Expo]).
3. `npx expo prebuild -p ios --clean`.
4. Build Release su dispositivo (§5A o §5B) con **lo stesso** bundle id e
   **lo stesso** team.
5. Apri l'app e controlla che lo storico ci sia **prima** di considerare
   l'aggiornamento riuscito.

---

## 7. Scadenza della firma

**Cosa dice la fonte.** Per il percorso gratuito: «Provisioning profiles that
enable apps to be installed on a device will expire 7 days from issuance.
You'll need to rebuild and reinstall your app to your device after
expiration.» [F1]

**Cosa accade in pratica.** Alla scadenza l'app installata non si avvia più e
va ricostruita e reinstallata. Il *rimedio* è testuale e verificato
(«rebuild and reinstall» [F1]); la formulazione «l'app non si avvia più» è la
descrizione pratica del sintomo e **non** è citata verbatim da Apple: *Non
verificato il 2026-09-19: il messaggio di errore esatto mostrato da iOS alla
scadenza non è documentato sulle pagine consultate; controllare su
https://developer.apple.com/support/compare-memberships/ se serve la
formulazione ufficiale.*

**Come si rinnova.** Ripeti §5A o §5B con lo **stesso** bundle id e lo
**stesso** team di firma. Non serve disinstallare. Non serve toccare i dati.

**I dati locali sopravvivono alla scadenza.** La scadenza riguarda la **firma**,
non il contenitore dell'app: il contenitore viene rimosso quando l'app viene
**disinstallata** (§6), non quando il profilo scade. Quindi: profilo scaduto +
reinstallazione sopra la stessa app = dati ancora lì.

> **Questo non è un permesso per non fare backup.** Un'app che non si avvia è
> anche un'app da cui non puoi esportare i dati finché non ricostruisci la
> build. Se in quel momento il Mac non è disponibile, l'unica copia utile è
> quella che hai già fatto. Tieni backup e sincronizzazione Drive attivi
> **prima** che il profilo scada, non dopo.

**Pianificazione dei rinnovi.**

| Percorso | Frequenza del rinnovo | Cosa serve |
|---|---|---|
| Gratuito | ogni 7 giorni [F1] | Mac + Xcode + cavo/associazione, ~5–15 minuti |
| A pagamento | la durata effettiva **non è dichiarata** sulle fonti consultate: leggi la data in Xcode o nel portale (§2.2) | idem, più l'abbonamento attivo |

---

## 8. Differenze fra percorso gratuito e a pagamento

| Voce | Gratuito (personal team) | Apple Developer Program |
|---|---|---|
| Costo annuale | nessuno [F1] | 99 USD per anno di abbonamento, o valuta locale dove disponibile [F2] |
| Scadenza del profilo di provisioning | 7 giorni dall'emissione; poi «rebuild and reinstall» [F1] | non dichiarata sulle pagine consultate: leggere la data reale (§2.2) |
| App ID | fino a 10, scadono dopo 7 giorni [F1] | limite numerico non dichiarato sulle pagine consultate [F1] |
| App installabili insieme per dispositivo | 3 [F1] | limite non applicato fra i vincoli del gratuito [F1] |
| Dispositivi | 3, scadono dopo 7 giorni [F1] | fino a 100 per famiglia di prodotto per anno [F3] |
| Prova su dispositivo con Xcode | sì, «with a Personal Team» [F1] | sì |
| Certificates, Identifiers & Profiles | no [F1] | sì [F1] |
| App Store Connect / TestFlight / Xcode Cloud | no [F1] | sì [F1] — **non usati da TrackStrong** (SPEC §1) |
| Distribuzione ad altri | no: «developers can't distribute apps» [F4]; con Personal Team «only… your own personal devices» [F13] | sì, ma **fuori dallo scopo** di questo progetto |
| Capability riservate | non disponibili le voci elencate in §2.3 [F4] | disponibili [F4] |
| Adeguato a TrackStrong | **sì**, al prezzo di un rinnovo settimanale | sì, con rinnovi meno frequenti e un costo annuale |

**Raccomandazione.** Parti dal percorso **gratuito**: non richiede spese e
copre tutto ciò che la specifica chiede. Passa a quello a pagamento solo se il
rinnovo settimanale diventa insostenibile — e in quel caso **fai prima un
backup verificato**, perché il cambio di team di firma è da trattare come
distruttivo (§6).

---

## 9. iPad

**Scelta richiesta all'utente:** se vuoi l'app anche su iPad.

- **La stessa build può installarsi su iPad**, perché la firma di sviluppo
  copre i dispositivi registrati e l'iPad è una delle famiglie di prodotto
  elencate da Apple [F3]. Con il percorso gratuito l'iPad occupa **uno dei 3
  dispositivi** disponibili, che «expire after 7 days» [F1].
- **Serve registrare l'iPad** come in §3 e **attivare Developer Mode** anche
  sull'iPad [F5].
- **Aspetto grafico:** il valore predefinito di `ios.supportsTablet` è `false`
  [F12], ma in `apps/mobile/app.json` è già impostato a `true` (con
  `requireFullScreen: false`): l'app è quindi configurata per girare a piena
  risoluzione su iPad. **L'interfaccia su iPad non è stata provata** (§11), e
  la specifica richiede leggibilità durante la seduta (SPEC §9): verificala
  prima di considerare l'iPad supportato.
- **I dati non passano dal cavo.** iPhone e iPad restano due installazioni
  distinte con due contenitori distinti: l'allineamento avviene **solo** via
  Google Drive (SPEC §8.3, e `GOOGLE_DRIVE_SETUP.md` §7). Installare su iPad
  **non** copia lo storico.

---

## 10. Cosa NON fare

1. **Nessun jailbreak.** Non è previsto, non è necessario e comprometterebbe il
   dispositivo su cui vivono i tuoi dati.
2. **Nessun certificato enterprise improprio.** L'Apple Developer Enterprise
   Program è destinato alla distribuzione interna di un'organizzazione; usarlo
   per un'app personale, o usare certificati di terzi per farsi firmare l'app,
   è fuori dalle regole del programma. Il percorso corretto è quello di §2.
3. **Nessuna distribuzione a terzi.** Niente App Store, TestFlight, siti
   pubblici, marketplace (SPEC §1). Nessun invio del file `.ipa` ad altre
   persone: con il personal team la firma copre «your own personal devices»
   [F13].
4. **Nessun servizio di firma o di installazione di terze parti** che chieda il
   tuo Apple Account, le tue credenziali o il tuo certificato.
5. **Nessun servizio cloud di build o distribuzione senza autorizzazione
   esplicita.** EAS Build esiste e Expo lo indica come alternativa
   («You can build the app in the cloud from any computer using `eas build -p
   ios`» [F10]), ma comporta il caricamento del progetto su
   un'infrastruttura di terzi e ha dei costi. **Non è autorizzato in questo
   progetto**: richiede un'autorizzazione esplicita dell'utente, che al
   2026-09-19 non è stata data. Il percorso documentato qui è quello locale.
6. **Nessun segreto nel binario e nessuna credenziale nel repository.** Vale
   anche qui: «Never put any secret keys inside your application code, there is
   no secure way to do this!» [F7-Expo]. Le cartelle `ios`/`android` generate
   non vanno in git [F9-Expo].
7. **Nessuna disinstallazione «per pulire»** prima di un backup verificato
   (§6).
8. **Nessun codice scaricato da Drive ed eseguito.** Google Drive sincronizza
   **dati**, non aggiorna il binario (SPEC §14). L'app si aggiorna solo
   ricompilando dal Mac.

---

## 11. Verifiche non effettuate

Requisito di onestà della specifica (SPEC §15). Stato: **non verificato su
dispositivo**.

- **Questa procedura non è stata eseguita.** L'ambiente in cui è stato scritto
  questo documento è un **container Linux** (`Linux 6.18.44`, piattaforma
  `linux`): **non c'è un Mac, non c'è Xcode, non c'è un iPhone collegato, non
  ci sono credenziali Apple**.
- **Non esiste nessuna build firmata di TrackStrong.** Nessun `expo prebuild`,
  nessuna compilazione, nessun archivio, nessun `.ipa`, nessun profilo di
  provisioning è stato prodotto.
- **Nessun passaggio dell'interfaccia di Xcode è stato eseguito o visto.** I
  nomi dei menu e dei pannelli citati sono quelli della documentazione Apple
  verificata il 2026-09-19 [F5][F6][F7]; non sono stati confrontati con una
  schermata reale. Se Xcode mostra etichette diverse, **vince Xcode**:
  ricontrolla la fonte.
- **Nessun dato reale è stato installato, migrato, esportato o ripristinato.**
  Le affermazioni di §6 e §7 sul contenitore dell'app derivano dal modello di
  esecuzione di iOS e dalle fonti citate, **non** da una prova su dispositivo.
  In particolare l'avvertenza sul cambio di team di firma è dichiarata **non
  verificata**.
- **Nessun rinnovo di firma è stato provato.** La finestra di 7 giorni è un
  dato documentato [F1], non un'osservazione.
- **`apps/mobile` contiene la configurazione del progetto Expo** (`app.json`,
  `package.json` con `expo ~57.0.24`, `react-native 0.86.3`, `react 19.2.3`),
  ma **non è mai stato compilato**: nessun `prebuild` è stato eseguito, non
  esiste una cartella `ios`, e l'app non è stata avviata su nessun dispositivo
  né simulatore. I comandi di §5 sono corretti rispetto alla documentazione
  ufficiale di Expo, ma **non sono stati eseguiti su questo repository**.
- **Il bundle identifier è ancora il segnaposto `com.example.trackstrong`.**
  Va sostituito prima della prima build (§5.0); farlo dopo comporta la perdita
  del contenitore dati (§6).

Prima checklist da riempire **dopo** la prima esecuzione reale, con date:
associazione del dispositivo · Developer Mode attivo · build Debug avviata ·
build Release avviata **a Mac spento e in modalità aereo** · reinstallazione
sopra l'app esistente con dati intatti · rinnovo dopo scadenza del profilo.

---

## 12. Fonti

Tutte consultate il **2026-09-19**.

| Rif. | URL | Esito | Cosa ne ho preso |
|---|---|---|---|
| F1 | https://developer.apple.com/support/compare-memberships/ | letta | 10 App ID / 3 dispositivi / 3 app per dispositivo / profili validi 7 giorni + «rebuild and reinstall»; contenuto del gratuito e del programma |
| F2 | https://developer.apple.com/programs/whats-included/ | letta | «The Apple Developer Program is 99 USD per membership year, or in local currency where available.» |
| F3 | https://developer.apple.com/help/account/devices/devices-overview | letta | «up to 100 … devices, per product family, per membership year» e l'elenco delle famiglie (iPhone, iPad, …) |
| F4 | https://developer.apple.com/help/account/reference/supported-capabilities-ios/ | letta (riassunto automatico) | capability riservate ai programmi a pagamento; limitazione di Maps; definizione di «Apple Developer» |
| F5 | https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device (e la variante `.md`) | letta integralmente tramite `.md` | quando serve Developer Mode, percorso Privacy & Security > Security, avviso, Restart, Enable + codice, disattivazione |
| F6 | https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices.md | letta | Xcode > Settings > Apple Accounts (anche account personale); Set Up Signing; menu Team; bundle ID unico; Automatically manage signing; registrazione automatica del dispositivo; Manage Devices / Device Hub; Product > Run |
| F7 | https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices.md | letta | registrazione automatica in Xcode; Product > Archive; Distribute App > Debugging > Export; installazione con Device Hub o Apple Configurator; Developer Mode necessario per le app installate da `.ipa` |
| F8 | https://developer.apple.com/support/xcode/ | letta | tabella Xcode ↔ macOS: 26.6/26.5/26.4.1 richiedono macOS Tahoe 26.2+; 26.3 e 26 da macOS Sequoia 15.6; **nessuna riga «Xcode 26.4»** |
| F9 | https://developer.apple.com/help/account/provisioning-profiles/provisioning-profile-updates/ | letta | profilo di provisioning **offline** valido 7 giorni; richiesta per validità offline estesa oltre 30 giorni |
| F13 | https://developer.apple.com/library/archive/qa/qa1915/_index.html | **non letta direttamente** (solo estratti indicizzati) | limiti del «(Personal Team)»: solo dispositivi personali, Validate/Export non disponibili, nessun caricamento su App Store |
| F14 | https://developer.apple.com/support/certificates/ | letta | **non** dichiara durate per i certificati Apple Development; unica data indicata: certificato intermedio WWDR «expires on February 20, 2030» |
| — | https://developer.apple.com/help/account/certificates/certificates-overview/ | letta | nessuna durata di validità dichiarata |
| — | https://developer.apple.com/help/account/provisioning-profiles/create-a-development-provisioning-profile/ | letta | passi di creazione; «If you use automatic signing, Xcode manages development provisioning profiles for you»; nessuna durata dichiarata |
| F2-Expo | `docs/pages/guides/local-app-production.mdx` (ramo `main` di `expo/expo`) | letta | «Product > Scheme > Edit Scheme. Select Run in the sidebar and set Build configuration to Release» |
| F3-Expo | `docs/pages/guides/local-app-development.mdx` | letta | `npx expo run:ios`; prebuild automatico se le cartelle native mancano; `--device`; `--configuration Release`; `npx expo start` per il solo Metro |
| F7-Expo | `docs/pages/versions/unversioned/sdk/auth-session.mdx` | letta | «Never put any secret keys inside your application code, there is no secure way to do this!»; necessità di `scheme` per il redirect |
| F9-Expo | `docs/pages/workflow/continuous-native-generation.mdx` | letta | prebuild genera `ios`/`android`; `--clean` cancella e rigenera; avviso sulle modifiche git non committate; `ios`/`android` in `.gitignore` |
| F10 | `docs/pages/more/expo-cli.mdx` | letta | «can only be run on a Mac, and Xcode must be installed»; `--device`; `--scheme`; `--configuration Release` e «not automatically code signed for submission»; `xed ios`; `npx expo prebuild -p ios --clean`; «Production builds will export the project and embed the files in the native binary»; firma automatica da CLI; `eas build -p ios` come alternativa in cloud |
| F11 | `docs/_getting-started-macos-ios.md` (ramo `main` di `facebook/react-native-website`) | letta | Xcode Command Line Tools da Settings > Locations; CocoaPods come gem Ruby |
| F12 | `packages/@expo/config-types/src/ExpoConfig.ts`, ramo `sdk-57` di `expo/expo` | letta | descrizioni ufficiali di `ios.bundleIdentifier`, `ios.supportsTablet` («Defaults to `false`»), `scheme` («build-time configuration») |
| F13-Expo | `docs/pages/versions/unversioned/sdk/securestore.mdx` | letta | iOS Keychain, `kSecClassGenericPassword`; persistenza dei valori attraverso la disinstallazione con lo stesso bundle ID; «you should never rely on this implementation detail» |
| — | `packages/expo-modules-core/ExpoModulesCore.podspec`, ramo `sdk-57` | letta | `:ios => '16.4'` (target di distribuzione) |
| — | https://expo.dev/changelog/sdk-57 | **bloccata dal proxy di rete** | minimo Xcode 26.4 **non verificato** (solo estratto indicizzato) |
| — | https://docs.expo.dev/… | **bloccata dal proxy di rete** | per questo le fonti Expo sopra sono i **file sorgente ufficiali** della documentazione, letti da `raw.githubusercontent.com/expo/expo` |

**Nota sul metodo.** In questo ambiente `docs.expo.dev` ed `expo.dev` sono
bloccati dal proxy di rete. Dove serviva la documentazione Expo ho letto i
**file sorgente della documentazione ufficiale** nel repository `expo/expo`
(ramo `main` per le guide, ramo `sdk-57` per i tipi e i podspec), che è la
stessa fonte da cui il sito viene generato. Le voci marcate «non letta
direttamente» derivano da estratti indicizzati e vanno considerate **non
verificate**.
