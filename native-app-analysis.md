# Da "David" web a app nativa iOS + Apple Watch — Analisi tecnica

*Analisi di fattibilità e progettazione per trasformare l'attuale web app di nuoto
(`index.html`) in un'app nativa iOS con app companion per Apple Watch, che raccoglie
automaticamente i dati della nuotata in piscina tramite l'Apple Watch e li legge da
Apple Health. Documento di sola analisi: nessun codice, nessun progetto creato.*

---

## TL;DR (in breve)

- **Sì, l'obiettivo è realizzabile** con i framework pubblici di Apple. L'Apple Watch,
  con l'allenamento **"Nuoto in piscina"**, registra già da solo (senza che tu tocchi
  nulla in acqua) distanza, vasche, tipo di nuotata, bracciate, battito, calorie e
  durata; questi dati finiscono in **Apple Health** e un'app nativa può **leggerli**.
  Peso e altezza li inserisci tu (o li legge da Health se già presenti). Niente altro
  a mano.
- **Un'importante precisazione onesta:** alcune metriche che vedi nell'app **Fitness**
  di Apple (in particolare lo **SWOLF** e la ripartizione fine per vasca) **non sono
  esposte** in modo diretto alle app di terze parti. L'app dovrà **ricalcolarle** dai
  dati grezzi (bracciate + tempo per vasca). Tutto il resto è disponibile.
- **Architettura consigliata:** partire da un'app **"in sola lettura"** che legge da
  Health le nuotate registrate dall'app Allenamento integrata di Apple. È la strada
  più affidabile, meno costosa e più veloce. L'opzione avanzata (app con proprio
  allenamento sul Watch) aggiunge molto lavoro senza migliorare la qualità dei dati.
- **Cosa si riusa dalla web app:** praticamente tutta la parte di "dominio" (piani
  A/B/C, catalogo esercizi con indicazioni, **regole di sicurezza per la schiena**,
  pattern settimanale, streak/aderenza, figura "David", grafico peso). Cambia solo la
  sorgente dati: il "fatto" della seduta e le metriche diventano **automatici** dalla
  nuotata registrata.
- **Costi Apple:** per provare sul tuo iPhone/Watch bastano un Mac e un Apple ID
  gratuito (con il limite dei **7 giorni**). Per TestFlight e per pubblicare sullo
  Store serve l'**Apple Developer Program, ~99 €/anno**.
- **Stima:** un MVP in sola lettura è un progetto **piccolo/contenuto**; la versione
  con allenamento personalizzato sul Watch è **sensibilmente più impegnativa**. Buona
  parte del setup (account, test) puoi seguirla tu; **lo sviluppo Swift richiede uno
  sviluppatore**.
- **Prossimo passo consigliato:** MVP nativo in sola lettura che riusa i piani/UI
  della web app e aggancia le nuotate da Health.

---

## 1) Verdetto di fattibilità

**Realizzabile, sì.** L'obiettivo — *l'Apple Watch cattura da solo le metriche della
nuotata in piscina, l'app le legge da Apple Health, e l'unico inserimento manuale sono
peso e altezza* — è pienamente ottenibile con i framework **pubblici** di Apple, senza
trucchi né API riservate.

Il meccanismo reale è questo:
1. Sull'Apple Watch avvii l'allenamento **"Nuoto in piscina"** (Pool Swim) dall'app
   **Allenamento** già presente nel Watch. Imposti una volta la **lunghezza della
   vasca** (25 m, 50 m, ecc.).
2. Durante la nuotata il Watch rileva **automaticamente** vasche, virate, tipo di
   nuotata e bracciate tramite gli accelerometri, più battito e calorie. Non devi
   toccare lo schermo (che è comunque bloccato dal **Water Lock**, vedi §2).
3. A fine allenamento il Watch salva un **HKWorkout** (un "allenamento" strutturato)
   in **Apple Health** sull'iPhone.
4. La tua app nativa, con il permesso di lettura Health che le concedi al primo avvio,
   **legge** quell'allenamento e le metriche collegate e li mostra/elabora.

Due precisazioni oneste che definiscono i limiti:
- **Non tutto ciò che mostra l'app Fitness di Apple è leggibile da terze parti.** Lo
  **SWOLF** e alcune viste per-vasca molto fini sono calcolate/mostrate da Apple ma non
  esposte come dato pronto in HealthKit. L'app dovrà **ricalcolarle** (fattibile, i dati
  grezzi ci sono). Vedi §2.
- **La cattura automatica richiede comunque un gesto iniziale:** *avviare* l'allenamento
  sul Watch. Non esiste un modo affidabile e approvabile dallo Store per far partire da
  solo un allenamento in piscina senza alcuna azione. Il "senza inserimento manuale" si
  riferisce ai **dati** (che non digiti mai), non all'avvio dell'allenamento, che resta
  un tap. Puoi anche usare l'avvio automatico allenamenti di watchOS, ma per il nuoto in
  piscina è meno affidabile che per corsa/camminata.

---

## 2) Cosa cattura davvero il Watch (e cosa arriva a HealthKit)

Per un allenamento **"Nuoto in piscina"** il Watch produce un `HKWorkout` con tipo
attività **`swimming`** e sottotipo "acqua di piscina". Ecco cosa è realmente
disponibile alle app di terze parti tramite HealthKit:

**Disponibile e leggibile in modo affidabile:**
- **Durata** (inizio/fine, tempo attivo e in pausa).
- **Distanza a nuoto** (`distanceSwimming`) — in metri, calcolata da vasche × lunghezza
  vasca.
- **Numero di vasche / conteggio vasche** — ricostruibile dagli **eventi** e segmenti
  dell'allenamento (ogni vasca genera un evento "lap").
- **Bracciate** (`swimmingStrokeCount`) — totali e per segmento.
- **Tipo di nuotata per segmento** — stile riconosciuto automaticamente (stile libero /
  crawl, dorso, rana, delfino/farfalla, misto). È salvato come **metadato dello stile di
  nuotata** sui segmenti dell'allenamento.
- **Battito cardiaco** (`heartRate`) — serie temporale campionata durante l'allenamento;
  da qui si ricavano medio/max e le zone.
- **Calorie attive e a riposo** (`activeEnergyBurned`, `basalEnergyBurned`).
- **Segmenti e pause/riposi** — gli **eventi dell'allenamento** (lap, segment, pause,
  resume) permettono di distinguere le vasche dai riposi a bordo vasca (il Watch mette
  in pausa automatica quando ti fermi).
- **Lunghezza della vasca** — salvata come metadato dell'allenamento; l'app la può
  leggere per validare distanze e passo.

**Derivabile (l'app lo calcola, non è un dato "pronto"):**
- **Passo/pace** (es. min/100 m) — si ricava da distanza e tempo per vasca/segmento.
- **SWOLF** (bracciate + secondi per vasca) — **non** esposto come metrica pronta di
  HealthKit; l'app lo ricalcola per vasca da bracciate ed eventi/tempo. È la metrica che
  vedi in Fitness ma che le app terze devono riprodurre da sé.

**Setup e vincoli pratici da conoscere:**
- **Lunghezza vasca:** va impostata sul Watch al primo avvio dell'allenamento in
  piscina (poi resta memorizzata). Se è sbagliata, distanza e passo sono sbagliati:
  vale la pena mostrarla in app e ricordare all'utente di verificarla.
- **Water Lock:** durante il nuoto in piscina il Watch attiva **automaticamente** il
  blocco schermo anti-acqua; si sblocca ruotando la Digital Crown a fine vasca. Questo è
  positivo per la cattura automatica (nessun tocco accidentale) ma significa che
  **durante la nuotata non si interagisce con l'app**: qualsiasi interazione è prima o
  dopo. Un'app watchOS può gestire il Water Lock a livello di dispositivo, ma per un MVP
  che usa l'app Allenamento integrata non serve.
- **Precisione:** il riconoscimento di stile e virate è ottimo in vasca regolare;
  nuotate "spezzate", cambi stile a metà vasca o esercizi tecnici (drill) possono essere
  classificati come "misto" o non riconosciuti bene. Da tenere presente per i piani
  molto tecnici della Sessione A.

---

## 3) Architettura consigliata

Propongo due opzioni e una raccomandazione chiara.

### Opzione A — App in **sola lettura** (consigliata)
L'utente nuota usando l'**app Allenamento integrata** del Watch (rodata, affidabile,
gestisce Water Lock, riconoscimento vasche, ecc.). La tua app nativa **legge** da Health
l'allenamento appena registrato e lo aggancia alla seduta pianificata (A/B/C).

- **Pro:** massima affidabilità dei dati (usi il motore di Apple, non uno tuo); molto
  meno codice; nessun bisogno di gestire sessioni di allenamento, sensori, Water Lock;
  meno rischi di approvazione sullo Store; puoi anche non avere affatto un'app sul Watch
  all'inizio (basta l'app iPhone che legge Health). Aggiornamenti automatici via
  *observer query* (vedi §4): appena finisci di nuotare, l'app "vede" la nuova nuotata.
- **Contro:** l'utente deve avviare l'allenamento dall'app Allenamento (un tap sul
  Watch), non dalla tua app; nessuna metrica "in diretta" dentro la tua app durante la
  nuotata (ma in acqua non la guardi comunque).
- **Affidabilità:** alta. **Sforzo:** contenuto.

### Opzione B — App con **proprio allenamento** sul Watch
La tua app watchOS avvia una sessione di allenamento nuoto propria
(`HKWorkoutSession` + `HKLiveWorkoutBuilder`) e/o usa **WorkoutKit** per inviare al
Watch un allenamento strutturato a intervalli (le tue serie 8×50 m, ecc.). L'app vede le
metriche **in tempo reale** e le salva lei stessa in Health.

- **Pro:** avvio dell'allenamento dalla *tua* app col nome della seduta ("Sessione B");
  possibilità di allenamenti a intervalli guidati; metriche live sul Watch.
- **Contro:** molto più lavoro e più superfici di errore (gestione stato allenamento,
  background, Water Lock, batteria, permessi movimento); **non migliora la qualità dei
  dati** rispetto ad Apple, anzi devi replicare tu la logica vasche/stile; richiede
  un'app Watch completa con relativi entitlement di background; più rischio in revisione
  App Store; test obbligatori in acqua.
- **Affidabilità:** buona ma tutta a tuo carico. **Sforzo:** alto.

### Raccomandazione per Mattia
**Parti dall'Opzione A.** Ti dà esattamente ciò che vuoi (dati automatici, solo
peso/altezza a mano) con il minimo di complessità e rischio. L'Opzione B è un'evoluzione
futura interessante (allenamenti a intervalli guidati con WorkoutKit) ma non è necessaria
per l'obiettivo e va valutata solo dopo che l'MVP funziona.

---

## 4) Dettagli HealthKit (permessi, dati, aggiornamenti, privacy)

**Abilitazioni nel progetto Xcode:**
- Capability **HealthKit** attiva sul target (e sul target Watch se presente).
- Per gli aggiornamenti automatici in background: la modalità **Background Delivery**
  di HealthKit.
- Per l'Opzione B: entitlement di **elaborazione allenamenti in background** sull'app
  Watch.

**Testi obbligatori nel file di configurazione (Info.plist):** Apple *rifiuta* l'app se
mancano. Servono in italiano, chiari:
- **NSHealthShareUsageDescription** (lettura): es. *"David legge dalla Salute le tue
  nuotate in piscina, il battito e il peso per mostrarti i progressi. I dati restano sul
  tuo dispositivo."*
- **NSHealthUpdateUsageDescription** (scrittura, se scrivi peso/altezza in Health): es.
  *"David può salvare nella Salute il peso e l'altezza che inserisci."*

**Lettura delle nuotate:**
- Tipo attività **`HKWorkoutActivityType.swimming`**; filtrare gli allenamenti di nuoto
  (e, volendo, solo "acqua di piscina").
- Per ogni allenamento: leggere gli **eventi** (vasche, segmenti, pause) e i **campioni
  collegati**: `distanceSwimming`, `swimmingStrokeCount`, `heartRate`,
  `activeEnergyBurned`, oltre a durata e metadati (lunghezza vasca, stile per segmento).
- Query tipiche: `HKSampleQuery` per lo storico; `HKAnchoredObjectQuery` per prendere
  solo le novità dall'ultima volta.

**Aggiornamenti automatici ("appena finisco, l'app lo sa"):**
- **`HKObserverQuery`** + **`enableBackgroundDelivery`**: iOS sveglia l'app quando
  compare una nuova nuotata in Health, così l'app segna la seduta come "fatta" e
  aggiorna statistiche senza che tu apra nulla. Per il nuoto la frequenza di consegna in
  background è comunque periodica (non istantanea al secondo), ma più che sufficiente.

**Peso e altezza:**
- Lettura: `bodyMass` (peso) e `height` (altezza) da Health, se già presenti (es. da
  bilancia connessa o inserimenti precedenti). Così spesso **non devi inserirli affatto**.
- Scrittura: l'app può **anche scrivere** in Health il peso/altezza che digiti, con il
  permesso di scrittura. Utile: il valore inserito una volta è disponibile ovunque. In
  alternativa puoi tenerli solo dentro l'app. Consiglio: leggere da Health e offrire
  l'inserimento manuale come fallback, con opzione "salva anche nella Salute".

**Privacy e regole App Store (importanti):**
- I dati Health **restano sul dispositivo**; l'app non li invia a server (coerente con
  l'attuale filosofia "nessun account, nessun server" della web app).
- Apple ha regole rigide: i dati di HealthKit **non possono** essere usati per
  pubblicità o venduti, e serve una **privacy policy**. Va compilata la sezione privacy
  su App Store Connect. Trattandosi di app personale che non trasmette dati, la conformità
  è semplice ma va dichiarata correttamente.

---

## 5) Mappatura del dominio web → nativo

Buona notizia: gran parte della logica è pura "conoscenza di dominio" e si trasferisce
uno-a-uno. Consiglio di isolarla in un **pacchetto Swift condiviso** riusato da iPhone e
Watch.

**Porta in modo pulito (invariato nella sostanza):**
- **Piani A/B/C** (`SESS`): "Tecnica & postura", "Resistenza & cardio", "Misto
  leggero/recupero", con durate e focus. Diventano modelli Swift.
- **Catalogo esercizi** (`EX`) con indicazioni (cue) e nomi. Le clip animate SVG
  possono essere reimplementate in **SwiftUI/Canvas** o mantenute come asset; non sono
  prioritarie per l'MVP.
- **Regole di sicurezza schiena (ernie lombari):** l'elenco dei **movimenti vietati**
  (farfalla, rana spinta/delfino, sit-up/crunch, flessioni lombari sotto carico, tuffi e
  virate spinte) e le controindicazioni per esercizio (`hernia`, cue `contra`). **Da
  mantenere identiche e ben visibili** — è un vincolo di sicurezza, non estetico. Idea
  nativa in più: se la nuotata letta da Health contiene **stile "farfalla/delfino"**,
  mostrare un **avviso gentile** ("rilevata farfalla: attenzione alla schiena").
- **Pattern settimanale** (`pattern`: Lun A, Gio B, Sab C), assegnazione seduta al
  giorno-settimana.
- **Streak e aderenza** (`streakWeeks`, `adherence`): stessa logica, ma alimentata dalle
  sedute **auto-rilevate**.
- **Figura "David" morphabile** e **grafico peso**: portabili in SwiftUI (Charts nativo
  per il peso, disegno vettoriale per il David). La proiezione % grasso/kg resta un
  **modello indicativo** con lo stesso disclaimer.
- **Backup dati:** meno necessario se usi Health + iCloud, ma export/import JSON resta
  utile.

**Sostituito da dati di Health (il cuore del cambiamento):**
- **"Seduta fatta":** oggi è una spunta manuale (`toggleDone`); diventa
  **auto-rilevata** — quando compare in Health una nuotata compatibile (giorno/durata),
  l'app la associa alla seduta pianificata e la segna come completata. Meglio prevedere
  una conferma/associazione manuale come rete di sicurezza.
- **Spunte per esercizio** (`exchecks`): restano manuali (Health non sa quale drill hai
  fatto), ma l'app può **pre-compilare** i dati oggettivi (distanza, vasche, stili,
  battito) accanto alla lista esercizi.
- **Peso:** l'inserimento manuale attuale diventa **opzionale** — letto da Health se
  disponibile.
- **Promemoria `.ics`:** sostituibili da **notifiche locali** native (le app native, a
  differenza delle web app, possono notificare; cade il limite che aveva costretto all'
  `.ics`). Volendo, con **WorkoutKit** si può anche *programmare* l'allenamento sul Watch.

**Nuove metriche mostrabili (che la web app non aveva):** distanza, passo/100 m, vasche,
SWOLF (ricalcolato), battito medio/zone, calorie — tutte per singola seduta e come trend
nel tempo, arricchendo la scheda "Progressi".

---

## 6) Percorso di test sul tuo Mac

**Cosa serve:** un **Mac** con **Xcode** (gratuito dall'App Store del Mac), il tuo
**iPhone** e il tuo **Apple Watch**.

**Struttura del progetto Xcode (Opzione A):**
- Un **target app iOS** (SwiftUI) — l'app principale, che legge Health e mostra
  piani/progressi.
- (Facoltativo, per l'Opzione A) un **target Watch App** solo se vuoi comodità/
  complicazioni sul polso; per il puro "leggo le nuotate" può bastare l'app iPhone.
- Un **pacchetto Swift condiviso** con la logica di dominio (piani, sicurezza, streak).

**Provare senza spendere:** con un **Apple ID gratuito** puoi installare l'app sul tuo
iPhone/Watch da Xcode, ma con il limite: la firma scade dopo **7 giorni** (poi va
reinstallata) e ci sono limiti al numero di app. Va benissimo per provare, scomodo per
uso quotidiano prolungato.

**TestFlight e App Store:** per installazioni stabili (fino a 90 giorni via TestFlight) e
per pubblicare serve l'**Apple Developer Program (~99 €/anno)**.

**Come si testa una nuotata senza piscina — limiti veri:**
- Il **Simulatore** di Xcode può simulare l'app e persino dati Health inseriti a mano,
  ma **non** riproduce una vera nuotata (niente sensori, niente Water Lock, niente
  riconoscimento vasche).
- Per validare davvero la cattura serve una **nuotata reale in piscina con l'Apple Watch
  al polso**. In fase di sviluppo si può però lavorare su **allenamenti già registrati**
  in Health (ne bastano un paio reali) e su dati di prova per costruire e rifinire tutta
  la parte di lettura/visualizzazione.

**Trappole realistiche da mettere in conto:**
- **Water Lock:** in acqua non si interagisce; ogni interfaccia va pensata per prima/dopo.
- **Permessi Health al primo avvio:** l'utente deve concedere i permessi; se li nega, la
  UI deve spiegare bene come riattivarli (Impostazioni → Salute). I permessi di lettura
  in HealthKit sono per privacy "opachi": l'app non sa *se* un dato manca perché non c'è o
  perché non hai dato il permesso — va gestito con messaggi chiari.
- **Lunghezza vasca sbagliata** sul Watch = metriche sbagliate: prevedere un controllo.
- **Ritardo del background:** l'aggiornamento automatico dopo la nuotata può richiedere
  qualche minuto, non è istantaneo.
- **Schermata schiena:** mantenere gli avvisi ben visibili anche nella versione nativa.

---

## 7) Stima di impegno e costi

*Stime indicative, non un preventivo; dipendono molto da chi sviluppa e dalla rifinitura
grafica.*

**Costi Apple:**
- Prova personale sul tuo iPhone/Watch: **0 €** (limite 7 giorni).
- TestFlight + pubblicazione App Store: **~99 €/anno** (Apple Developer Program).
- Nessun costo server: l'app resta offline/on-device.

**Impegno di sviluppo:**
- **MVP Opzione A (sola lettura):** progetto **piccolo/contenuto**. Comprende: lettura
  nuotate da Health, aggancio alla seduta pianificata, riuso dei piani A/B/C e delle
  regole di sicurezza, scheda progressi con metriche + peso. Ordine di grandezza: poche
  settimane di lavoro di uno sviluppatore, meno se si riusa molto della logica esistente.
- **Opzione B (allenamento proprio sul Watch / intervalli WorkoutKit):**
  **sensibilmente più impegnativa** — app Watch completa, gestione sessione allenamento,
  background, test in acqua ripetuti. Da mesi-persona a seconda dell'ambizione.

**Cosa puoi fare tu vs. cosa serve a uno sviluppatore:**
- **Tu (non tecnico):** installare Xcode; iscriverti all'Apple Developer Program;
  fornire/validare i contenuti di dominio (già ottimi nella web app); fare le **nuotate
  di test** e dare feedback; gestire testi, privacy policy e materiali App Store;
  provare le build via TestFlight.
- **Serve uno sviluppatore Swift:** scrivere l'app SwiftUI, integrare HealthKit
  (permessi, query, background), portare la logica di dominio, gestire la revisione App
  Store. La web app è un'ottima **specifica funzionale**: riduce molto il lavoro di
  analisi.

---

## 8) Rischi, cautele oneste e prossimo passo

**Rischi / cautele:**
- **SWOLF e metriche "alla Fitness":** vanno **ricalcolate**, non lette pronte; il
  risultato può differire leggermente da quanto mostra l'app Apple. Da comunicare con
  onestà, come già fai per la figura "David".
- **Riconoscimento nuotata imperfetto** su drill tecnici e cambi stile a metà vasca:
  parte della Sessione A potrebbe essere classificata come "misto". L'associazione
  automatica seduta↔nuotata va sempre **confermabile a mano**.
- **Permessi Health opachi:** serve una UX di onboarding curata per non lasciare
  l'utente col dubbio "perché non vedo dati?".
- **Avvio allenamento:** resta un tap sul Watch (o avvio automatico meno affidabile per
  la piscina). Il "zero inserimento manuale" vale per i **dati**, non per l'avvio.
- **Revisione App Store:** l'uso di dati Health richiede testi e privacy corretti; con
  l'Opzione A i rischi sono bassi.
- **Manutenzione:** un'app nativa va ricompilata/aggiornata nel tempo (nuove versioni
  iOS/watchOS, scadenza certificati), a differenza del file HTML "eterno".

**Prossimo passo consigliato (concreto):**
Realizzare un **MVP nativo in sola lettura (Opzione A)** che:
1. legga da Apple Health le nuotate in piscina (distanza, vasche, stili, battito,
   calorie, durata) e ne ricalcoli passo e SWOLF;
2. riusi tali e quali i **piani A/B/C**, il **catalogo esercizi** e soprattutto le
   **regole di sicurezza per la schiena** della web app;
3. **auto-segni** la seduta come completata quando compare una nuotata compatibile
   (con conferma manuale);
4. legga **peso/altezza** da Health (inserimento manuale solo come fallback);
5. mostri **Progressi** con grafico peso, figura "David" e le nuove metriche di nuoto.

Questo MVP centra l'obiettivo con il minor rischio e costo, e lascia aperta la strada
all'Opzione B (allenamenti a intervalli guidati con WorkoutKit) come evoluzione futura.

---

*Documento di analisi. Nessun file del repository è stato modificato; nessun codice o
progetto è stato generato.*
