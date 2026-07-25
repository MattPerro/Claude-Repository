# David — app nativa iOS · guida per il Mac

Questo è il **progetto sorgente** dell'app nativa (iPhone) che legge le tue
nuotate in piscina da **Apple Salute** e mostra piani, progressi e promemoria.
Va **aperto e compilato su un Mac con Xcode** — io (l'assistente) giro su Linux
e non posso compilarlo né provarlo: quello si fa qui, sul tuo Mac.

> Onestà: è un ottimo **punto di partenza già scritto**, non un'app "pronta al
> negozio con un clic". Per rifinirla e pubblicarla sull'App Store è molto utile
> l'aiuto di uno **sviluppatore Swift**. Ma per **provarla sul tuo iPhone** puoi
> seguire i passi qui sotto.

## Cosa ti serve
- Un **Mac** con **Xcode** installato (gratis dall'App Store del Mac).
- Il tuo **iPhone** (e, per la parte nuoto, un **Apple Watch** + una piscina per i test veri).
- Un **Apple ID** (gratuito) per installarla sul tuo iPhone (l'app "scade" dopo
  7 giorni e va reinstallata). Per TestFlight/App Store serve l'**Apple Developer
  Program**, ~99 €/anno.

## Passi

### 1) Genera il progetto Xcode
Questo repo contiene il codice + una "ricetta" (`project.yml`) per generare il
progetto con **XcodeGen**. Apri l'app **Terminale** sul Mac e incolla:

```bash
# installa Homebrew se non ce l'hai: https://brew.sh
brew install xcodegen
cd <cartella-del-repo>/native
xcodegen generate
open David.xcodeproj
```

Si aprirà **Xcode** con il progetto `David`.

> In alternativa, senza XcodeGen: crea in Xcode un nuovo progetto *App* (SwiftUI,
> iOS) e **trascina dentro** la cartella `native/David/` (Copy items if needed).
> Poi imposta i permessi come al punto 3.

### 2) Firma l'app
In Xcode: seleziona il progetto **David** → scheda **Signing & Capabilities** →
spunta **Automatically manage signing** e scegli il tuo **Team** (il tuo Apple
ID). Se non c'è, aggiungilo da *Xcode → Settings → Accounts*.

### 3) Aggiungi la capability HealthKit
Sempre in **Signing & Capabilities** → **+ Capability** → **HealthKit**.
(I testi dei permessi Salute/Calendario sono già in `Info.plist`.)

### 4) Esegui sul tuo iPhone
Collega l'iPhone via cavo, selezionalo in alto in Xcode come destinazione e premi
**▶︎ (Run)**. La prima volta l'iPhone chiederà di **fidarti** dello sviluppatore:
*Impostazioni → Generali → VPN e gestione dispositivo → fidati*.

### 5) Concedi l'accesso ad Apple Salute
Al primo avvio l'app chiede l'accesso a Salute: **consenti** lettura (nuotate,
peso, altezza) e scrittura (peso/altezza). Puoi rivederlo in *Salute → Condivisione*.

### 6) Prova i dati delle nuotate
Le nuotate compaiono se registrate con l'app **Allenamento** dell'Apple Watch in
modalità **"Nuoto in piscina"** (imposta la lunghezza vasca). Il **Simulatore
non** riproduce una nuotata reale: per vedere dati veri serve una **piscina**.
Nel frattempo l'app mostra ciò che è già in Apple Salute.

## Struttura del progetto
```
native/
├─ project.yml                 ricetta XcodeGen
├─ README-SETUP.md             questa guida
└─ David/
   ├─ DavidApp.swift           avvio + schede (Oggi, Piano, Nuotate, Progressi, Impostazioni)
   ├─ Info.plist               testi permessi Salute/Calendario
   ├─ David.entitlements       HealthKit
   ├─ Assets.xcassets          colore accento + icona (placeholder)
   ├─ Models/
   │  ├─ Domain.swift          esercizi, sedute A/B/C, sicurezza schiena, date
   │  ├─ Store.swift           stato + persistenza locale + logica (streak/aderenza)
   │  ├─ HealthKitManager.swift lettura nuotate + peso/altezza (SWOLF/passo ricalcolati)
   │  ├─ Notifications.swift   promemoria locali veri (la sera prima)
   │  └─ CalendarService.swift aggiunge le sedute al Calendario (EventKit)
   └─ Views/                   schermate SwiftUI + componenti
```

## Cosa fa (e cosa no) — onestà
- **Fa**: legge nuotate (distanza, vasche, bracciate, battito, calorie), ricalcola
  SWOLF/passo, piani A/B/C, promemoria veri, peso verso 88 kg, avvisi schiena.
- **Non fa**: non avvia l'allenamento al posto tuo (resta un tap sul Watch); lo
  SWOLF è una stima; niente video reali della tecnica; nessuna sincronizzazione
  cloud (i dati restano sul dispositivo).

## Prossimi passi consigliati
1. Provala sul tuo iPhone (passi sopra) e verifica la lettura delle nuotate.
2. Se ti convince, coinvolgi uno **sviluppatore Swift** per: icona/immagini,
   rifinitura UI, eventuale app Watch con avvio guidato (WorkoutKit), TestFlight
   e pubblicazione su App Store.
