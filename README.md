# TrackStrong

App personale di allenamento per Mattia: offline-first, dati su SQLite locale,
sincronizzazione bidirezionale sul proprio Google Drive, percorso di allenamento
di tre anni e un motore adattivo deterministico che funziona senza rete.

Non è pubblicata su nessuno store. Il repository è privato e contiene **codice,
test, documentazione e dati sintetici**: non è il backup degli allenamenti.

---

## Stato reale del progetto

Questa tabella è la cosa più importante del documento. La specifica (§15) vieta
di dichiarare verificato ciò che non è stato verificato, e questo ambiente di
sviluppo è un container **Linux**: non ha Mac, Xcode, iPhone, simulatore iOS né
credenziali Google.

| Area | Stato | Come lo so |
|---|---|---|
| Dominio, unità, convenzioni di carico, date | **verificato automaticamente** | 271 test su Node |
| Scheda delle prime 12 settimane | **verificato automaticamente** | 61 test, voce per voce contro `SPEC.md` §3 |
| Libreria di 14 esercizi con guide offline | **verificato automaticamente** | 29 test |
| Piano triennale (27 blocchi, 157 settimane) | **verificato automaticamente** | 36 test |
| Motore adattivo | **verificato automaticamente** | 52 test, scritti per cogliere i comportamenti vietati |
| Timer persistenti | **verificato automaticamente** | 36 test, inclusi sospensione e cambio d'orologio |
| SQLite, migrazioni, scrittura transazionale | **verificato automaticamente** | 79 test |
| Protocollo di sincronizzazione | **verificato automaticamente contro un finto conforme all'API** | 26 test |
| Contrasto e accessibilità dei token visivi | **verificato automaticamente** | 53 test con formule WCAG 2.1 |
| Interfaccia dell'app | **implementata, NON verificata** | nessun simulatore né dispositivo qui |
| Driver `expo-sqlite` | **implementato, NON verificato su dispositivo** | firme controllate sul pacchetto pubblicato, comportamento no |
| Integrazione OAuth con Google | **NON implementata** | nessuna credenziale; `developers.google.com` bloccato dal proxy di rete |
| Build firmata per iPhone | **NON prodotta** | serve un Mac con Xcode: vedi `INSTALL_IPHONE.md` |
| Prove utente | **nessuna** | non inventate |

**429 test eseguiti, 429 passati.** Il comando per riprodurlo è in §3.

### Cosa manca per poterla usare in palestra

In ordine. I dettagli sono in `QA_REPORT.md`.

1. **Build firmata sul tuo iPhone.** Serve un Mac con Xcode: procedura completa
   in `INSTALL_IPHONE.md`.
2. **Verifica su dispositivo** della registrazione delle serie, dei timer e
   della persistenza. Finché non succede, l'interfaccia è codice non provato.
3. **OAuth Google**, per far funzionare la sincronizzazione. La configurazione è
   documentata in `GOOGLE_DRIVE_SETUP.md`, ma c'è un punto ancora aperto: la
   documentazione di Google è contraddittoria su quali schemi di redirect siano
   ancora supportati per le app iOS, e va risolto **prima** di scrivere il
   flusso, perché un redirect sbagliato non torna mai nell'app.

Il punto 1 e il punto 2 si possono fare subito. Il punto 3 richiede di creare un
progetto Google Cloud, cosa che non ho fatto: creare risorse remote a tuo nome
richiede la tua autorizzazione.

---

## 1. Come è organizzato

```
packages/core/    dominio puro: nessun import da React Native, Expo o rete.
                  Gira su Node, quindi è testabile per intero in mezzo secondo.
packages/db/      SQLite: 30 tabelle, migrazioni, 9 repository.
packages/sync/    protocollo Drive: operazioni, pacchetti, conflitti, cursore.
apps/mobile/      app Expo (iOS prioritario).
.claude/agents/   i nove specialisti usati per scrivere e rivedere il progetto.
```

Dettagli e motivazioni delle scelte: `ARCHITECTURE.md`.

---

## 2. Prerequisiti

| | Per sviluppare e far girare i test | Per installare sull'iPhone |
|---|---|---|
| Node | **≥ 22.12** (serve `node:sqlite`) | idem |
| Sistema | qualunque (Linux, macOS, Windows) | **macOS** |
| Xcode | — | **obbligatorio** (vedi `INSTALL_IPHONE.md` per la versione) |
| Account Apple | — | anche gratuito, con limiti importanti |
| Account Google | — | solo per la sincronizzazione |

---

## 3. Installare le dipendenze e far girare i test

```bash
git clone <url-del-tuo-repository-privato> trackstrong
cd trackstrong
npm install
```

Poi, tutti e tre i comandi devono passare:

```bash
npm run typecheck                            # tsc -b sui tre pacchetti
npm test                                     # 429 test su Node
npx tsc --noEmit -p apps/mobile/tsconfig.json # typecheck dell'app
```

Altri comandi utili:

```bash
npm test -- packages/core/test/engine.test.ts     # solo il motore adattivo
npm test -- packages/core/test/twelveWeeks.test.ts # fedeltà della tua scheda
npm test -- packages/db                            # persistenza
npm test -- packages/sync                          # protocollo Drive
npm run test:watch                                 # in ascolto durante lo sviluppo
```

`node:sqlite` stampa un `ExperimentalWarning`: è normale su Node 22 e non
indica un problema.

---

## 4. I tuoi dati: dove metterli

**Non sono nel codice, ed è deliberato.** La specifica (§2) vieta i dati
personali nei file pubblicabili. Hai due strade:

### A. Onboarding (sempre disponibile)

Al primo avvio l'app chiede nome, data di inizio, giorni preferiti, durata
disponibile e attrezzature. I valori finiscono nel database locale, che non è in
Git. Restano modificabili da Impostazioni.

### B. Bootstrap locale (comodità)

Se preferisci non ridigitarli a ogni reinstallazione:

```bash
cd apps/mobile/src
cp bootstrap.local.example.ts bootstrap.local.ts
# apri bootstrap.local.ts e metti i tuoi dati
```

Verifica che sia ignorato da Git **prima** di fare commit:

```bash
git check-ignore -v apps/mobile/src/bootstrap.local.ts
# deve stampare: .gitignore:27:bootstrap.local.*  apps/mobile/src/bootstrap.local.ts
```

Se il file non esiste, l'onboarding parte con i campi vuoti e non si rompe
niente.

---

## 5. Installare sull'iPhone

**Procedura completa: `INSTALL_IPHONE.md`.** Riassunto dei passaggi, che vanno
eseguiti su un Mac:

```bash
npm install
cd apps/mobile
# 1. Cambia il bundle identifier in app.json con uno tuo
#    (es. com.tuonome.trackstrong): quello attuale è un segnaposto.
npx expo prebuild --platform ios
open ios/TrackStrong.xcworkspace
# 2. In Xcode: seleziona il tuo team di firma, collega l'iPhone, esegui.
```

La build risultante funziona **senza Expo Go, senza Metro, senza debugger e
senza computer acceso**, perché una build di produzione incorpora il bundle
JavaScript nel binario.

Tre cose da sapere prima di cominciare, documentate con le fonti Apple in
`INSTALL_IPHONE.md`:

- con un **account Apple gratuito** il profilo di firma scade **dopo 7 giorni**
  e va rifatta la build; ci sono limiti sul numero di app e di dispositivi;
- con il **programma a pagamento** (99 USD/anno) i limiti sono molto più larghi,
  ma **nessun percorso è permanente senza rinnovi**;
- **i dati sopravvivono** a una reinstallazione sopra la stessa app con lo stesso
  bundle identifier e lo stesso team di firma. **Non** sopravvivono a una
  disinstallazione, a un cambio di bundle identifier o di team.
  **Fai un backup verificato prima.**

Non sono previsti jailbreak né certificati enterprise impropri. Non è previsto
nessun servizio cloud di build: la procedura è locale, come richiesto.

---

## 6. Google Drive

**Procedura completa: `GOOGLE_DRIVE_SETUP.md`.**

- Drive conserva **pacchetti immutabili di operazioni** in `appDataFolder`, non
  un database caricato e riscaricato.
- Ambito richiesto: `drive.appdata`, cioè **solo la cartella privata
  dell'app**. L'app non vede i tuoi file su Drive.
- OAuth con **PKCE**, senza client secret: nessun segreto nel binario.
- L'app **non chiede mai** la tua password Google.
- Drive sincronizza **dati**, non aggiorna il binario dell'app.

**Stato: non implementata.** La porta è collegata e il protocollo è testato
contro un finto conforme all'API, ma il flusso OAuth reale non esiste e non è
stato provato contro i server di Google. Finché non lo è, l'app mostra «Non
collegato» e tutto il resto funziona offline.

### Aggiungere un secondo dispositivo

```
installazione → accesso Google → recupero → uso offline
```

Se esiste già un archivio remoto, **non** viene creato un secondo programma
iniziale. Al cambio di account Google gli archivi restano **separati**: un
trasferimento richiede una conferma esplicita, non avviene per errore.

---

## 7. Backup

**Procedura completa: `BACKUP_RESTORE.md`.**

La regola breve: **fai un backup verificato prima di disinstallare, cambiare
firma, cambiare bundle identifier o importare un file.** «Verificato» significa
che hai aperto l'anteprima di importazione e hai visto i conteggi giusti.

Sincronizzazione e backup **non** sono la stessa cosa: un'eliminazione
accidentale si propaga con la sincronizzazione, mentre il backup di ieri ha
ancora il dato.

---

## 8. Costi

| | Costo |
|---|---|
| Il codice, i test, l'uso dell'app | **0** |
| Account Apple gratuito (profilo da rinnovare ogni 7 giorni) | **0** |
| Apple Developer Program (profili di durata molto maggiore) | **99 USD/anno** (verificato sulle pagine Apple, 2026-09-19) |
| Google Drive | incluso nel tuo spazio Google; i dati di allenamento sono piccoli |
| Servizi cloud di build o distribuzione | **non usati**, e non lo saranno senza la tua autorizzazione |
| Provider di AI generativa | **non usato**; la funzione è disattivata e non implementata |

---

## 9. Che cosa fa il coach, e che cosa non fa

Il **coach adattivo locale** è obbligatorio, deterministico e funziona offline.
Propone: mantenimento, aumento di ripetizioni, aumento di carico, riduzione
temporanea, ripetizione della settimana, variazione del volume, sostituzione,
modifica del cardio, revisione del blocco, e riorganizzazione della seduta
quando hai meno tempo.

Propone un **aumento di carico solo se** tutte queste cose sono vere: tutte le
serie allenanti al limite superiore dell'intervallo, margine registrato coerente
con la fase, tecnica dichiarata controllata, nessun fastidio segnalato, e
risultato confermato in **due esposizioni consecutive confrontabili**. Con un
dato mancante **non** propone un aumento: dice cosa manca.

L'incremento è il **gradino minimo del tuo attrezzo**, non una percentuale. Se
l'attrezzo non è configurato, la proposta arriva ma **dichiara** che il valore va
confermato in palestra.

Il coach **non** certifica idoneità sportiva, **non** diagnostica infortuni,
**non** sostituisce un professionista sanitario, e **non** attribuisce i tempi
sul giro alla palestra.

Il **coach generativo** non è implementato ed è disattivato. Non è un pulsante
che non fa niente: è un'impostazione che vale `false`. Dettagli:
`COACH_RULES.md` §9.

---

## 10. Il programma

Le prime 12 settimane sono **la tua scheda**, trascritta come dati versionati e
verificata voce per voce da 61 test. Non è stata modificata, migliorata o
riordinata.

Dal terzo mese il piano copre **tre anni dalla data di avvio**, calcolati su
date reali: 27 blocchi su 157 settimane di programma, ciascuno con finalità,
durata, schemi, margini, recuperi, cardio, alternative, criteri di ingresso
verificabili sui tuoi dati e criteri di revisione.

Il piano **non contiene nessun carico in kg per il futuro**: prescrivere oggi
quanto solleverai fra due anni sarebbe un numero inventato. I carichi nascono
dai dati registrati.

> **Avvertenza.** Il percorso oltre le prime 12 settimane è una **struttura
> progettuale**, scritta e rivista da agenti AI. **Non è clinicamente
> certificato** e non sostituisce il parere di un medico o di un istruttore
> qualificato. L'alternativa hip thrust allo stacco rumeno, come dice la tua
> stessa scheda, va valutata con un istruttore.

Dettagli: `TRAINING_MODEL.md`.

---

## 11. Documentazione

| File | Contenuto |
|---|---|
| `SPEC.md` | la tua specifica come documento normativo. Se il codice divergesse, **il codice è in difetto** |
| `ARCHITECTURE.md` | struttura, offline-first, transazioni, versionamento |
| `TRAINING_MODEL.md` | modello di allenamento, assunzioni, classificazione onesta delle affermazioni |
| `COACH_RULES.md` | regole del motore, condizioni per un aumento, inferenze vietate |
| `SYNC_PROTOCOL.md` | protocollo Drive nel dettaglio |
| `GOOGLE_DRIVE_SETUP.md` | progetto Cloud, OAuth, token, secondo dispositivo |
| `INSTALL_IPHONE.md` | firma, installazione, aggiornamento, rinnovi |
| `PRIVACY.md` | dati raccolti, cifratura (cosa è e cosa **non** è), tre cancellazioni |
| `BACKUP_RESTORE.md` | backup, esportazioni, ripristino, file corrotti |
| `QA_REPORT.md` | test eseguiti, difetti classificati, cosa resta non verificato |
| `CHANGELOG.md` | cronologia delle modifiche |
| `CLAUDE.md` | istruzioni per chi (o cosa) lavora su questo repository |

---

## 12. Come è stato scritto

Nove specialisti definiti in `.claude/agents/`, con compiti, divieti e formato
di report espliciti, e la regola che **l'autore di una parte non è il suo unico
revisore**.

Tre difetti reali sono stati trovati dai test e corretti durante il lavoro,
tutti e tre di un tipo che passa inosservato a una lettura del codice:

1. l'orizzonte triennale lasciava scoperti gli ultimi 3-4 giorni, perché tre
   anni sono 156 settimane **più un resto**;
2. una proposta di aumento usava il gradino di carico predefinito senza
   dichiarare che non veniva dall'attrezzo reale;
3. un pacchetto Drive rifiutato per corruzione **transitoria** non veniva mai
   più riletto, perché il cursore era già avanzato oltre: una perdita silenziosa
   di dati.

---

## 13. Avvertenze

- L'app **non va utilizzata durante la guida**.
- Il riferimento delle **72 ore** fra l'ultima seduta impegnativa e una giornata
  in pista è un **criterio prudenziale configurabile**, non una garanzia.
- L'obiettivo di **90 kg** è un riferimento: l'app **non indica una data certa**
  per raggiungerlo, e non genera obiettivi nutrizionali da informazioni
  incomplete.
- La percentuale di massa grassa esiste **solo se inserita**, con metodo e data:
  non viene dedotta dal peso.
- Il peso dichiarato nel profilo **non è una pesata**: non compare nei grafici né
  nella media mobile a 7 giorni.
