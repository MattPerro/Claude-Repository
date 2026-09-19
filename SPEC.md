# SPEC.md — Specifica autorevole di TrackStrong

Questo documento è la trascrizione normativa della specifica fornita dall'utente.
Dove il codice e questo documento divergono, **questo documento vince** e il codice
è in difetto.

Ultima verifica dei contenuti: **2026-09-19**.

---

## 1. Risultato atteso

Un'applicazione personale di allenamento che:

- sia installabile e utilizzabile autonomamente su iPhone 15 (non Pro);
- funzioni localmente, anche senza connessione;
- non richieda un computer acceso né un server di sviluppo;
- non venga pubblicata su App Store, TestFlight, siti pubblici o marketplace;
- abbia il codice in un repository GitHub **privato**;
- conservi stabilmente tutti i dati;
- sincronizzi i dati fra installazioni tramite **Google Drive dell'utente**;
- contenga un percorso di allenamento completo per **tre anni**;
- adatti le proposte ai progressi, al recupero e alla continuità;
- permetta di registrare rapidamente tutto durante le sedute;
- offra calendario, spiegazioni, timer, storico, grafici e controllo dei progressi.

### 1.1 Gerarchia delle priorità (vincolante nei conflitti di progetto)

1. Non perdere o alterare impropriamente i dati.
2. Non formulare progressioni ingiustificate o pericolose.
3. Essere semplice e veloce durante l'allenamento.
4. Avere timer, calendario e sincronizzazione affidabili.
5. Offrire una programmazione adattabile e comprensibile.
6. Avere un'eccellente qualità visiva.

### 1.2 Quattro cose da non confondere

| Cosa | Ruolo |
|---|---|
| GitHub | conserva il **codice**. Non è il backup degli allenamenti. |
| Database locale SQLite | conserva i **dati operativi**. Unica fonte di verità in uso. |
| Google Drive | permette **sincronizzazione e recupero**. |
| Motore adattivo | funziona **sul dispositivo**, senza rete. |

---

## 2. Profilo iniziale (dati dichiarati)

| Dato | Valore |
|---|---|
| Utilizzatore | Mattia |
| Dispositivo prioritario | iPhone 15 standard |
| Altezza | 183 cm |
| Peso iniziale **dichiarato** | 100 kg |
| Situazione | rientro dopo circa 4 anni senza allenamento |
| Massa grassa | dichiarata elevata, **percentuale sconosciuta** |
| Obiettivo sportivo | forza e preparazione atletica generale per la guida amatoriale di una moto in pista |
| Obiettivo corporeo | avvicinarsi a 90 kg migliorando la composizione corporea; 85 kg è un riferimento **eventuale**, non un obbligo |
| Frequenza | 2 allenamenti settimanali in palestra |
| Durata a regime | 65–75 minuti per seduta, doccia esclusa |
| Attività aggiuntive | camminate, cardio, giornate in pista |
| Unità | kg, cm, minuti, secondi |
| Fuso orario iniziale | Europe/Rome |
| Settimana | lunedì–domenica |

**Vietato inventare**: età, patologie, percentuale di grasso, frequenza cardiaca
massima, carichi iniziali, capacità tecniche.

Il peso dichiarato in profilo **non è una pesata datata** e non entra nei grafici
né nella media mobile.

Lunedì e giovedì possono essere **proposti**, non imposti.

I dati personali non entrano nei dati demo, nei log o nei file pubblicabili. Gli
eventuali file di bootstrap personale sono esclusi da Git (vedi `.gitignore`).

---

## 3. Programma iniziale: prime 12 settimane

Questa scheda è **il riferimento iniziale fornito dall'utente**. Non è un programma
clinicamente certificato. Esercizi, volumi e progressioni **non vanno modificati
arbitrariamente**: sono inseriti nell'app come dati strutturati e versionati.

### 3.1 Riscaldamento (entrambe le sedute)

1. 5 minuti di cyclette facile.
2. 6–8 alzate da una panca senza carico.
3. 6–8 flessioni dell'anca portando indietro il bacino.
4. Mobilizzazione controllata di spalle e caviglie.
5. Due serie leggere sul primo esercizio per le gambe.
6. Una serie leggera sul primo esercizio superiore.

> Le serie di riscaldamento **non contano come serie allenanti** e **non attivano
> progressioni**.

### 3.2 Allenamento A — prescrizione completa dalle settimane 5–12

| # | Esercizio | Serie × ripetizioni | Recupero |
|---|---|---|---|
| 1 | Pressa per le gambe | 3 × 6–8 | 120 s |
| 2 | Chest press alla macchina | 3 × 6–8 | 120 s |
| 3 | Rematore seduto al cavo | 3 × 8–10 | 90 s |
| 4 | Leg curl | 2 × 10–12 | 60–90 s |
| 5 | Pallof press al cavo | 2 × 8–10 **per lato** | 45–60 s |
| 6 | Farmer carry con due manubri | 2 × 20–30 **secondi** | 60 s |
| 7 | Cyclette | secondo la fase | — |

### 3.3 Allenamento B — prescrizione completa dalle settimane 5–12

| # | Esercizio | Serie × ripetizioni | Recupero |
|---|---|---|---|
| 1 | Stacco rumeno con manubri | 3 × 6–8 | 120 s |
| 2 | Lat machine davanti al petto | 3 × 8–10 | 90 s |
| 3 | Step-up su gradino basso | 2 × 8 **per gamba** | 90 s **dopo entrambe le gambe** |
| 4 | Spinte con manubri su panca leggermente inclinata | 2 × 8–10 | 90 s |
| 5 | Macchina per gli adduttori | 2 × 12–15 | 60 s |
| 6 | Plank laterale con ginocchia appoggiate | 2 × 15–25 **secondi per lato** | 45–60 s |
| 7 | Cyclette | secondo la fase | — |

### 3.4 Alternativa già prevista

**Hip thrust alla macchina** al posto dello stacco rumeno quando la tecnica dello
stacco non è ancora adeguata, **da valutare con un istruttore**.

- A regime: 3 × 8–10.
- Nelle prime quattro settimane: 2 × 8–10.

Gli storici di stacco rumeno e hip thrust sono **distinti**.

### 3.5 Recuperi espressi come intervallo

Mostra il range e usa **il limite superiore** come durata iniziale del timer.

### 3.6 Settimane 1–2

- Due serie dei **primi quattro** esercizi.
- Una serie del **quinto** e del **sesto**.
- Circa **4 ripetizioni in riserva**.
- Pressa, chest press e stacco rumeno: **8–10** ripetizioni.
- Rematore, lat machine e spinte inclinate: **8–10**.
- Step-up: **6–8 per gamba**, inizialmente **senza manubri**.
- Leg curl: **10–12**.
- Adduttori: **12–15**.
- Pallof, farmer carry e plank: intervalli già indicati.
- Cyclette finale: **8–10 minuti facili**.

### 3.7 Settimane 3–4

- **Due serie** per tutti e sei gli esercizi.
- Mantieni gli intervalli della fase di rientro.
- Step-up a **8 per gamba**.
- Circa **3 ripetizioni in riserva**.
- Cyclette finale: gradualmente **12–15 minuti**.

### 3.8 Settimane 5–12

- Tabelle complete (§3.2 e §3.3).
- Generalmente **2 o 3 ripetizioni in riserva**.
- Cyclette finale: **12–15 minuti**.

### 3.9 Dalla settimana 7 — alternativa cardio facoltativa (solo seduta B)

- 3 minuti facili
- 6 cicli di **30 s sostenuti** + **60 s facili**
- 3 minuti facili
- **Totale 15 minuti**

I tratti sostenuti **non sono sprint massimali**. L'alternativa **non si attiva
automaticamente** per il trascorrere dei giorni: va scelta espressamente.

### 3.10 RIR

RIR = "ripetizioni in riserva": quante altre ripetizioni corrette si ritiene di
poter eseguire.

Per gli esercizi **a tempo** si usano soprattutto **durata e controllo**: non si
impone un RIR privo di significato.

### 3.11 Avanzamento

- Distingui **settimana di calendario** e **settimana di programma**.
- Una seduta saltata **non equivale** a una seduta completata.
- Dopo le sedute previste si propone il passaggio successivo, **con possibilità di
  ripetere la settimana**.
- Un'interruzione **non deve far avanzare automaticamente la fase**.

---

## 4. Programmazione triennale

L'app contiene un piano di riferimento per **tre anni dalla data di avvio**,
calcolato su **date reali**: tre anni non coincidono sempre con 156 settimane
esatte. Gli anni 2 e 3 non possono restare titoli o TODO.

Due sedute settimanali come struttura ordinaria. **Non si predicono i carichi in
kg futuri.**

### 4.1 Struttura su quattro livelli

1. Obiettivi annuali
2. Blocchi con finalità specifiche
3. Settimane e sedute A/B
4. Prescrizioni operative adattate ai dati

### 4.2 Ogni blocco deve avere

finalità · durata indicativa · esercizi · serie e ripetizioni · RIR o indicazione
equivalente · recuperi · cardio · alternative · criteri di ingresso · criteri di
revisione · gestione di recupero, mantenimento e interruzioni.

### 4.3 Struttura di riferimento

- **Anno 1**: rientro iniziale, consolidamento tecnico, forza generale, base
  aerobica, continuità.
- **Anno 2**: sviluppo sostenibile della forza relativa, consolidamento muscolare,
  capacità di ripetere gli sforzi, gestione dei periodi con più pista.
- **Anno 3**: consolidamento, lavoro sulle qualità realmente limitanti,
  alternanza personalizzata fra sviluppo, mantenimento e recupero.

È una **struttura progettuale**, non una previsione certa del livello raggiunto.

### 4.4 Divieti

- Copiare la stessa settimana per tre anni senza logica.
- Cambiare continuamente esercizi rendendo impossibile misurare i progressi.
- Aumentare l'intensità solo perché cambia l'anno.
- Introdurre test massimali obbligatori.
- Accumulare sedute perse da recuperare tutte insieme.

### 4.5 Durata delle sedute

La durata stimata deve considerare riscaldamento, lavoro, recuperi, lati, cambi di
attrezzo e cardio. **Non si rende compatibile una seduta troppo lunga comprimendo
arbitrariamente i recuperi.**

---

## 5. Motore adattivo locale

Deterministico, testabile e spiegabile. Funziona **senza rete e senza modello
linguistico esterno**.

### 5.1 Doppia progressione

Prima aumentano le **ripetizioni** entro l'intervallo, poi eventualmente il
**carico**.

Si propone un incremento **solo se tutte** queste condizioni sono vere:

1. tutte le serie allenanti previste raggiungono il **limite superiore**;
2. il **margine registrato** è coerente con la fase;
3. la **tecnica è dichiarata controllata**;
4. **non sono segnalati problemi**;
5. il risultato è confermato in **due esposizioni consecutive comparabili**.

Con dati insufficienti **non** si propone un aumento.

L'incremento è il **minimo realmente disponibile sull'attrezzatura**,
configurabile. **Non** una percentuale uguale per tutte le macchine. **Non**
derivato dal peso corporeo.

### 5.2 Inferenze vietate

- Un singolo allenamento negativo **non** dimostra un plateau.
- Una seduta saltata **non** dimostra sovrallenamento.
- I dati mancanti **non** sono risultati positivi.

### 5.3 Confronti

Distingui: peso totale del bilanciere · peso di **ciascun** manubrio · peso
indicato da **una specifica** macchina · corpo libero · sovraccarico aggiunto ·
assistenza · durata · varianti.

- Macchine differenti **non** sono equivalenti.
- **Non** si somma automaticamente il peso corporeo al volume dello step-up.
- Per gli esercizi a tempo si propongono prima miglioramenti **entro l'intervallo
  di durata**.

### 5.4 Proposte

Il motore può proporre: mantenimento · incremento · riduzione temporanea ·
ripetizione della settimana · variazione del volume · alternativa compatibile ·
modifica del cardio · revisione del blocco. **Non solo "aggiungi peso".**

Ogni proposta mostra: dati utilizzati · ragione · modifica prevista · informazioni
mancanti · momento della rivalutazione.

Azioni disponibili: **accetta · modifica · rimanda · rifiuta · annulla**.

Le modifiche strutturali richiedono conferma. **Non si cambia silenziosamente la
seduta in corso.** Una proposta divenuta obsoleta non sovrascrive una revisione già
accettata su un altro dispositivo.

"Ho meno tempo oggi" produce una **selezione ragionata del lavoro**, non un taglio
indiscriminato dei recuperi.

---

## 6. Coach e intelligenza artificiale

| | Coach adattivo locale | Coach generativo |
|---|---|---|
| Obbligatorio | **Sì** | No |
| Sempre disponibile | Sì, offline | No |
| Necessario per allenarsi | Sì | **No** |
| Stato iniziale | attivo | **disattivato** |

Una raccolta di frasi predefinite **non** è AI generativa e non va chiamata così.

Un modello linguistico **non scrive direttamente** nel database. Flusso
obbligatorio:

```
proposta strutturata → validazione → controllo delle regole → anteprima → conferma → applicazione transazionale
```

Vanno rifiutati: output malformati · esercizi sconosciuti · unità incompatibili ·
modifiche fuori dai limiti.

Note e file importati sono **dati non fidati**, non istruzioni di sistema.

Il coach non certifica idoneità sportiva, non diagnostica infortuni, non sostituisce
un professionista sanitario. Vietati: riabilitazione, apnea, esercizi cervicali
zavorrati, test massimali non previsti.

---

## 7. Architettura locale e integrità dei dati

Tutte queste funzioni sono disponibili **offline**: programma e schede ·
registrazione · timer · istruzioni · calendario · storico · misurazioni · grafici ·
motore adattivo · proposte già salvate.

- Salvataggio **persistente**, non solo in RAM.
- Database **transazionale con migrazioni**.
- Ogni modifica confermata è salvata **localmente prima** di tentare la rete.
- Nella **stessa transazione**: la modifica ai dati **e** l'operazione da inviare
  alla sincronizzazione.

Entità da modellare: profilo · archivio/workspace · dispositivi · esercizi e
varianti · attrezzature · programmi e versioni · blocchi e settimane · prescrizioni
· eventi pianificati · sessioni · esercizi svolti · serie · timer · misurazioni ·
check-in · giornate in pista · proposte del coach · approvazioni e rifiuti ·
operazioni di sincronizzazione · conflitti · impostazioni.

Ogni sessione conserva una **fotografia della prescrizione** valida al suo avvio.
Le modifiche future **non riscrivono lo storico**.

Distingui: **prescritto · suggerito · precompilato · effettivamente eseguito**. I
progressi non si calcolano su valori soltanto suggeriti.

---

## 8. Google Drive e sincronizzazione

Drive è un **vero archivio di sincronizzazione bidirezionale**, non una destinazione
di esportazione.

- Google Drive API, preferendo **`appDataFolder`** e il **minimo ambito** necessario.
- OAuth con il flusso ufficialmente supportato per piattaforma. **Mai** chiedere la
  password Google in un modulo dell'app. **Mai** segreti condivisi nel binario.

### 8.1 Strategia (riferimento)

- Database locale su ogni dispositivo.
- **Registro persistente delle operazioni.**
- **Pacchetti immutabili** di operazioni su Drive.
- Identificativi univoci.
- Copie coerenti periodiche (snapshot) per velocizzare il recupero.
- Protocollo **versionato**.

Vietato: caricare/scaricare un unico database con "vince l'ultimo caricamento";
aprire un database operativo in una cartella sincronizzata; copiare i file di un
database mentre viene modificato; affidarsi all'unicità dei **nomi** dei file per
evitare duplicati; usare il solo orologio del dispositivo per decidere chi vince;
avanzare il cursore prima di aver persistito i dati; interpretare errori di
autorizzazione o rete come "archivio vuoto"; rimuovere prematuramente le
informazioni sulle cancellazioni; creare un file remoto per ogni aggiornamento del
timer.

Ogni operazione è **identificabile e applicabile una sola volta**, con origine,
entità, versione di base, versione del formato e informazioni causali.

Da gestire: invii ripetuti · risposte di rete perse · ricezione fuori ordine ·
upload e download interrotti · operazioni già applicate · cancellazioni concorrenti
· dispositivi offline a lungo. Il primo recupero dello storico **non deve perdere
modifiche arrivate durante il download**.

### 8.2 Conflitti

- Modifiche **indipendenti**: unione automatica. Una nuova pesata e un nuovo
  allenamento vanno **entrambi** conservati.
- Modifiche **incompatibili sullo stesso dato**: conserva le alternative e chiedi
  una scelta comprensibile. Esempio: la stessa serie corretta a 8 ripetizioni su un
  dispositivo e a 10 sull'altro → **nessuna delle due va scartata in silenzio**.
- Regole esplicite per: modifica vs modifica · modifica vs eliminazione · revisioni
  concorrenti del programma.
- **Non modificare da remoto una seduta in corso senza conferma.**

### 8.3 Nuovo dispositivo

`installazione → accesso Google → eventuale sblocco dell'archivio → recupero → uso offline`

Non creare un secondo programma iniziale se esiste già quello remoto. Se esistono due
archivi indipendenti, proponi una **riconciliazione non distruttiva**. Al cambio di
account Google **non** caricare automaticamente i dati sul nuovo account.

### 8.4 Quando sincronizzare

Al collegamento dell'account · all'apertura e al ritorno in primo piano · durante
l'uso con frequenza ragionevole · dopo modifiche importanti · alla conclusione della
seduta · quando torna la connessione · su comando manuale.

### 8.5 Stati da mostrare

`Salvato sul dispositivo` · `Modifiche in attesa` · `Sincronizzazione in corso` ·
`Sincronizzato con Drive alle…` · `Accesso da rinnovare` · `Conflitto da risolvere`

"Sincronizzato con Drive" **non** significa che gli altri dispositivi abbiano già
scaricato i dati. Un problema di rete **non** interrompe la registrazione.

---

## 9. Interfaccia

Navigazione: **Oggi · Calendario · Programma · Progressi · Coach**. Profilo e
impostazioni facilmente accessibili.

### 9.1 Durante la seduta si deve capire subito

quale esercizio · quale serie · quante ripetizioni o secondi · quale carico
l'ultima volta · cosa registrare · quanto recupero rimane.

Requisiti: numeri grandi · gerarchie chiare · comandi raggiungibili con una mano ·
tastiera numerica appropriata · **virgola decimale italiana** · contrasto elevato ·
feedback aptico discreto · area di tocco dei comandi principali **almeno 44 × 44
punti**.

Supporto: tema chiaro e scuro · caratteri ingranditi · screen reader · riduzione
delle animazioni · stati distinguibili **senza solo il colore**.

Nessun controllo essenziale coperto dalla tastiera. Nessun gesto nascosto
obbligatorio.

### 9.2 Obiettivi di usabilità verificabili

| Obiettivo | Soglia |
|---|---|
| Iniziare la seduta abituale dalla home | ≤ **2 tocchi** |
| Confermare una serie già compilata | **1 tocco** |
| Correggere un completamento accidentale | senza entrare nelle impostazioni |
| Salvare una serie | **nessuna attesa di rete** |
| Modali fra le serie | **nessuna** ripetitiva |

---

## 10. Registrazione delle sedute

Flusso: `avvio → check-in facoltativo → riscaldamento → esercizi → cardio → riepilogo`

Per ogni serie: esercizio e variante · riscaldamento o allenante · carico **e
convenzione** · ripetizioni o durata · lato se pertinente · RIR facoltativo · note ·
stato · timestamp.

Note su: macchina, sedile, schienale, maniglia, altezza del gradino, presa.

Precompila dall'ultima prestazione comparabile. **I valori precompilati non sono
eseguiti.**

`Completa serie` deve: **validare → salvare → confermare → avviare recupero**. Il
doppio tocco **non** crea duplicati. La bozza dei campi in corso viene salvata. Se il
salvataggio fallisce, **non** si finge che sia riuscito.

Permetti: correzione · annullamento · aggiunta o salto di serie · riordino ·
sostituzione · pausa · termine anticipato · ripresa dopo interruzione.

Per la sostituzione chiedi: **solo oggi** oppure **anche nel programma futuro**.

Una sola sessione attiva per installazione. Per la stessa seduta condivisa fra
dispositivi: dispositivo principale e **trasferimento esplicito**. Non promettere un
blocco globale infallibile offline.

Il riepilogo distingue: **eseguito · saltato · parziale · non registrato**, e mostra
durata totale, pause, serie eseguite, cardio, note e confronto con la seduta
precedente.

---

## 11. Timer, notifiche, calendario

Timer distinti per: recupero · esercizi temporizzati · cardio · intervalli · durata
complessiva. Comandi: pausa · riprendi · +15 s · −15 s · salta.

Il recupero parte **dopo la conferma della serie**. Per gli esercizi unilaterali
gestisci entrambi i lati senza raddoppiare impropriamente le serie; per lo step-up il
recupero principale è **dopo entrambe le gambe**.

**Non usare il solo `setInterval` come fonte di verità**: persisti stato, durata e
scadenza; usa riferimenti temporali appropriati; gestisci i cambi dell'orologio.

Al rientro nell'app: il tempo è coerente · un recupero scaduto risulta terminato ·
**nessuna serie viene completata automaticamente**.

Il trascorrere del tempo **non dimostra** l'esecuzione del cardio: serve conferma.

Le notifiche di sistema sono **locali al dispositivo**: non sincronizzarne gli
identificativi; permetti di scegliere su quali dispositivi ricevere promemoria.
Gestisci permessi negati, silenzioso e Focus senza promesse irrealistiche.

Calendario: vista mese e settimana · sedute pianificate, completate, parziali,
saltate, riprogrammate · cardio, camminate, giornate in pista · ricorrenze con
modifica della singola occorrenza o delle future. Lo spostamento mantiene identità e
collegamenti, senza duplicati. **Data prevista** ed **esecuzione effettiva** restano
separate. Gestisci fusi orari, cambio dell'ora e anni bisestili. **Non pianificare
tutte le notifiche dei tre anni contemporaneamente**: usa una finestra aggiornabile.

---

## 12. Libreria degli esercizi

Ogni esercizio, **inclusa l'alternativa hip thrust**, ha una guida offline completa:
nome · attrezzatura · muscoli principalmente coinvolti · impostazione · esecuzione per
passaggi · respirazione di base · indicazioni rapide · errori comuni · accorgimenti
per il rientro · varianti · regolazioni personali.

Accorgimenti da conservare:

| Esercizio | Accorgimento |
|---|---|
| Pressa | bacino appoggiato e movimento controllato |
| Stacco rumeno | bacino indietro, manubri vicini; **non serve arrivare a terra** |
| Step-up | gradino stabile inizialmente basso, corpo libero, appoggio quando necessario |
| Farmer carry | postura controllata, **senza prova massimale di presa** |
| Plank | **interrompere quando non si mantiene la posizione** |

La guida breve è disponibile in seduta; l'approfondimento si apre su richiesta. **Non
inventare video, collegamenti o illustrazioni.** Il testo basta anche senza immagini o
connessione. L'utilità per la moto è presentata come **finalità della preparazione
generale**, non garanzia di miglioramento sul giro.

---

## 13. Progressi, corpo, recupero, moto

### 13.1 Allenamento

Sedute previste e completate · sedute parziali **separate** · serie allenanti
eseguite · carichi e ripetizioni per esercizi **comparabili** · RIR disponibile ·
durata · minuti cardio · progressi negli esercizi a tempo · evoluzione dei blocchi.

Il volume `carico × ripetizioni` è utilizzabile dove sensato, con convenzione
esplicita. **Non** confrontare secondi, ripetizioni e distanze come equivalenti.
**Non** generare una "forza totale" sommando carichi di esercizi diversi. **Non**
inventare calorie bruciate.

### 13.2 Corpo

Peso · circonferenza vita · altre circonferenze facoltative · obiettivi.

Percentuale di grasso **solo se inserita**, con **metodo e data**. Non dedurla dal
peso.

Per il peso: misurazioni e **media mobile di sette giorni sulle osservazioni
presenti, indicando quante sono**. Non inventare dati mancanti. Non trasformare il
peso di profilo in una pesata datata. **Non promettere una data certa per i 90 kg.**

Foto di progresso: facoltative, protette, **mai trasmesse a un provider AI per
impostazione predefinita**; sincronizzazione **esplicita**.

### 13.3 Recupero

Sonno, energia, stress, indolenzimento e note **facoltativi**. Tendenze descrittive.
**Nessun punteggio sanitario o diagnosi inventati.**

### 13.4 Modulo moto

Data · circuito · numero e durata dei turni · fatica generale · fatica di
gambe/avambracci/spalle/collo · note · tempi facoltativi.

**Non attribuire automaticamente i tempi sul giro alla palestra.** Vicino alle
pistate mostra un promemoria sul recupero: riferimento iniziale **circa 72 ore**
dall'ultima seduta impegnativa, presentato come **criterio prudenziale
configurabile**, non come garanzia. **L'app non va utilizzata durante la guida.**

---

## 14. Privacy, backup, recupero

- **Nessuna telemetria predefinita. Nessun dato personale nei log.** Dati sintetici
  per test e screenshot condivisi.
- Token e segreti negli **archivi sicuri della piattaforma**.
- Per la cifratura lato client: **librerie consolidate**, non crittografia inventata.
  La chiave **non** va conservata in chiaro accanto ai dati cifrati. Documenta
  **precisamente** cosa è cifrato e cosa non lo è. Il termine **end-to-end** è vietato
  se la protezione non è implementata **e verificata**.
- Distingui **sincronizzazione dello stato corrente** e **backup recuperabile di stati
  precedenti**. Un'eliminazione accidentale può propagarsi: mantieni copie versionate
  con una politica di conservazione chiara.
- Previsti: backup completo versionato · esportazione JSON · esportazione CSV di
  serie, sessioni e misurazioni · anteprima di importazione · validazione ·
  ripristino transazionale · gestione duplicati · promemoria backup · gestione spazio
  insufficiente.
- Un file corrotto **non deve cancellare lo storico**. Avvisa quando un'esportazione
  contiene dati personali non cifrati. Il ripristino **non** sovrascrive
  immediatamente gli altri dispositivi: mostra gli effetti e chiedi conferma.
- Distingui: **eliminazione dal dispositivo · scollegamento account · eliminazione
  dall'archivio sincronizzato**.
- Versiona protocollo e dati: un'app vecchia non deve corrompere un archivio
  aggiornato. Quando serve, blocca **solo la sincronizzazione** incompatibile,
  preservando i dati locali.
- Google Drive sincronizza **dati**, non aggiorna il binario. **Non scaricare ed
  eseguire codice arbitrario da Drive.**

---

## 15. Onestà nella rendicontazione (vincolo di processo)

È **vietato** dichiarare:

- eseguiti test non eseguiti;
- verificato su iPhone ciò che è stato provato soltanto nel browser o su Node;
- funzionante un'integrazione simulata;
- completata una funzione rappresentata solo da un pulsante;
- clinicamente validato un programma revisionato soltanto da agenti AI;
- "pronta per la produzione" un'app solo perché compila.

La checklist di stato distingue sempre: **implementato · verificato automaticamente ·
verificato su dispositivo · non verificato · incompleto**.
