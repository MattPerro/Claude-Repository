# BACKUP_RESTORE.md — Backup, esportazione e ripristino

Come mettere al sicuro i dati, e come riportarli indietro.

Data di scrittura: **2026-09-19**.

> **La regola che conta più di tutte le altre**
>
> Fai un backup **verificato** prima di: disinstallare l'app, cambiare il
> bundle identifier, cambiare il team di firma, importare un file, o
> ripristinare.
>
> «Verificato» significa: hai aperto l'anteprima di importazione e hai visto i
> conteggi giusti. Un file che non hai mai provato a rileggere non è un backup,
> è un file.

---

## 1. Sincronizzazione e backup non sono la stessa cosa

La specifica (§14) chiede di distinguerli, perché proteggono da guasti diversi.

| | **Sincronizzazione (Drive)** | **Backup** |
|---|---|---|
| Cosa conserva | lo **stato corrente** | uno **stato passato**, datato |
| Protegge da | telefono perso, secondo dispositivo | **eliminazione accidentale**, importazione sbagliata, corruzione |
| Un'eliminazione sbagliata… | **si propaga** agli altri dispositivi | resta fuori: il file di ieri ha ancora il dato |
| Automatico | sì | no: lo lanci tu (con promemoria) |

Un'eliminazione accidentale sincronizzata è indistinguibile da un'eliminazione
voluta. **È per questo che serve un backup versionato oltre alla
sincronizzazione.**

---

## 2. Che cosa contiene un backup

Formato: **JSON**, `formatVersion: 1` (`BACKUP_FORMAT_VERSION`).

### Tabelle incluse (24)

Archivio e dispositivi · profilo e limitazioni fisiche · impostazioni ·
attrezzature e regolazioni personali · piani, blocchi, settimane e cursore del
programma · eventi pianificati · sessioni, esercizi svolti, serie, cardio ·
misurazioni · check-in di recupero · abitudini · giornate in pista · foto di
progresso (i riferimenti, non le immagini) · proposte del coach e decisioni ·
conflitti.

Le tabelle sono esportate **in ordine di dipendenza**, i padri prima dei figli,
così l'importazione non deve mai disattivare le chiavi esterne. Disattivare
`foreign_keys` durante un'importazione sarebbe il modo più semplice di far
entrare uno storico incoerente.

### Tabelle escluse, e perché

| Tabella | Perché è esclusa |
|---|---|
| `sync_operations`, `sync_applied_operations`, `sync_state` | sono lo stato della sincronizzazione **di questo dispositivo**. Reimportarle su un altro telefono gli farebbe credere di aver già inviato o applicato cose che non ha fatto |
| `timers` | un recupero in corso non è un dato da ripristinare |
| `session_drafts` | le bozze sono campi in compilazione, non fatti |
| `meta` | la versione di schema è quella del file di destinazione, non della copia |

### Le immagini non sono nel JSON

Il backup contiene i **riferimenti** alle foto di progresso, non i file. Le
immagini vanno copiate a parte. Se ripristini su un dispositivo nuovo, i
riferimenti esisteranno e le immagini no: l'app lo mostra come immagine mancante
invece di fingere.

### Avviso sui dati personali

Il file porta `containsPersonalData: true` quando contiene dati personali in
chiaro, e l'app **avvisa prima di produrlo** (requisito §14). Un backup
esportato è un file leggibile: niente lo protegge se lo metti in un altro cloud
o lo mandi per email.

---

## 3. Fare un backup

Dall'app: **Impostazioni → Backup ed esportazione → Backup completo**.

Produce un file `trackstrong-backup-AAAA-MM-GG.json` che puoi condividere con il
foglio di condivisione di iOS (salvarlo in `File`, in un altro cloud, mandarlo a
te stesso).

**Politica di conservazione consigliata**, da tenere manualmente:

| Quando | Quanti conservare |
|---|---|
| Dopo ogni blocco di programma (8 settimane circa) | 1, conservato a lungo |
| Ogni 2 settimane (promemoria dell'app, `backupReminderDays: 14`) | gli ultimi 4 |
| Prima di ogni operazione a rischio (disinstallazione, nuova firma, importazione) | 1, prima di procedere |

Tenere **più file datati** è il punto: un solo file sovrascritto ogni volta non
protegge da un'eliminazione accidentale notata dopo una settimana.

### Se lo spazio non basta

L'esportazione scrive un file nel contenitore dell'app prima di condividerlo. Se
lo spazio del dispositivo è insufficiente, l'operazione **fallisce e lo dice**:
non produce un file troncato. Un file troncato è peggio di nessun file, perché
sembra un backup.

---

## 4. Esportazioni CSV

Per guardare i dati in un foglio di calcolo. Tre file distinti, perché mescolare
serie, sessioni e misurazioni in una tabella sola non ha senso:

| File | Contenuto |
|---|---|
| `serie.csv` | una riga per serie: data, esercizio, variante, ruolo (riscaldamento/allenante), **carico e convenzione**, ripetizioni o secondi, lato, RIR, stato, note |
| `sessioni.csv` | una riga per sessione: data prevista, data di esecuzione, seduta A/B, stato, durata netta, pause, minuti cardio, note |
| `misurazioni.csv` | una riga per misurazione: tipo, valore, unità, data, metodo (per la massa grassa), note |

**La colonna della convenzione di carico non è decorativa.** Senza di essa un
foglio di calcolo non sa distinguere 20 kg per manubrio da 20 kg totali, né sa
che il valore di una macchina vale solo su quella macchina. Se fai grafici a
mano, raggruppa per convenzione e per attrezzo.

Il CSV usa la **virgola decimale italiana** e il **punto e virgola** come
separatore di campo, così si apre correttamente in Excel e Numbers con le
impostazioni italiane.

Un'esportazione CSV **non è un backup**: è una vista. Non si può reimportare.

---

## 5. Importare: prima l'anteprima

L'importazione è in **due passaggi**, e il primo non scrive niente.

### Passaggio 1 — anteprima (`preview`)

Valida il file e mostra:

- versione del formato e dello schema del file;
- se appartiene **allo stesso archivio** (`sameWorkspace`) o a un altro;
- per ogni tabella: **righe nel file**, **righe nuove**, **duplicati già
  presenti**;
- gli **avvisi** da leggere prima di confermare.

Se il file non è un backup valido, l'anteprima lancia `InvalidBackupError`, il
cui messaggio finisce con: *«Lo storico locale non è stato modificato.»* Ed è
vero: l'anteprima non apre nessuna transazione di scrittura.

### Passaggio 2 — importazione (`import`)

Transazionale: **o entra tutto, o non entra niente**.

La validazione riga per riga avviene **dentro** la transazione. Così un file che
sembra valido nell'involucro ma è corrotto a metà fa rotolare indietro anche le
righe già scritte.

#### Gestione dei duplicati

| Opzione | Comportamento | Quando |
|---|---|---|
| `skip` (**predefinito**) | una riga con `id` già presente viene ignorata | rende l'importazione **ripetibile**: reimportare lo stesso file due volte non crea duplicati |
| `overwrite` | la riga locale viene sostituita | **va chiesto espressamente**: una riga locale più recente andrebbe perduta |

Un test verifica che importare due volte lo stesso backup non produca duplicati.

---

## 6. Il ripristino non tocca subito gli altri dispositivi

La specifica (§14) è esplicita, e il comportamento la rispetta.

Un'importazione genera operazioni di sincronizzazione come qualsiasi altra
modifica, quindi **prima o poi** si propagherà. Ma:

1. l'app **mostra gli effetti** (l'anteprima) e **chiede conferma** prima di
   scrivere;
2. la propagazione avviene alla sincronizzazione successiva, non
   istantaneamente;
3. le operazioni generate portano una `cause` che dichiara che vengono da un
   ripristino, così sono riconoscibili nella diagnostica.

Se stai ripristinando su un dispositivo nuovo mentre un altro dispositivo ha
dati più recenti, **scollega prima la sincronizzazione**, importa, controlla, e
solo dopo ricollega. Altrimenti stai facendo convergere due archivi in una
direzione che non hai scelto.

---

## 7. File corrotto o incompatibile

Tre casi, tre comportamenti distinti, tutti coperti da test:

| Caso | Comportamento | Storico locale |
|---|---|---|
| JSON malformato | `InvalidBackupError` in anteprima | **intatto** |
| Involucro valido, righe corrotte a metà | transazione annullata | **intatto** |
| `formatVersion` superiore a quella supportata | rifiutato con messaggio esplicito | **intatto** |

**Un file corrotto non cancella lo storico.** È il requisito §14, e non è
garantito da una promessa: è garantito dal fatto che la scrittura è una sola
transazione e che nulla viene eliminato preventivamente. Non esiste un `DELETE`
prima dell'importazione.

---

## 8. Aggiornare l'app senza perdere i dati

Il database vive nel contenitore protetto dell'app. Sopravvive a:

- ✅ una nuova build installata **sopra** la precedente, con **lo stesso bundle
  identifier** e **lo stesso team di firma**;
- ✅ la scadenza del profilo di firma (l'app non si avvia più, ma i dati sono
  ancora lì: rinnovando la firma tornano);
- ✅ il riavvio del telefono, un aggiornamento di iOS.

**Non** sopravvive a:

- ❌ la **disinstallazione** dell'app;
- ❌ un **cambio di bundle identifier** (per iOS è un'altra app);
- ❌ un **cambio di team di firma** (iOS può rifiutare l'installazione sopra e
  richiedere di disinstallare).

Per i dettagli della firma e dei rinnovi vedi `INSTALL_IPHONE.md`.

### Migrazioni dello schema

Una build nuova con uno schema più recente applica le migrazioni
**automaticamente e in transazione** alla prima apertura. Le migrazioni sono
verificate da test, incluso il percorso incrementale da una versione precedente.

### Un'app vecchia con un archivio nuovo

Se apri una build **vecchia** su un database già migrato da una build più
recente:

- `migrate()` lancia `SchemaTooNewError` **prima di qualunque scrittura**;
- `openDatabaseTolerant()` lo cattura e l'app parte comunque;
- viene bloccata **la sola sincronizzazione**, e l'app lo dice;
- **i dati locali restano leggibili e scrivibili.**

Non c'è nessun percorso in cui una build vecchia corrompe un archivio nuovo.

---

## 9. Nuovo dispositivo: due strade

### A. Recupero da Drive (la strada normale)

```
installazione → accesso Google → recupero → uso offline
```

Il primo recupero scarica snapshot e pacchetti. Lo `startPageToken` viene preso
**prima** di iniziare il download, così le modifiche arrivate **durante** il
recupero non vengono perse. Se esiste già un archivio remoto, **non** viene
creato un secondo programma iniziale.

**Oggi per il ripristino da Drive basta l'accesso Google**, perché la cifratura
lato client non è implementata. Se un domani lo fosse, servirebbe **anche la
chiave**, e questo documento andrebbe corretto: vedi `PRIVACY.md` §5.

### B. Importazione di un file di backup

Utile se Drive non è collegato, o per tornare a uno stato passato. Segui §5.

### Se esistono due archivi indipendenti

Può succedere: hai usato l'app su due telefoni senza collegarli. L'app propone
una **riconciliazione non distruttiva** invece di far vincere uno dei due. Le
modifiche indipendenti si uniscono, quelle incompatibili diventano conflitti
visibili da risolvere.

---

## 10. Promemoria

`AppSettings.backupReminderDays` vale **14** per impostazione predefinita. Il
promemoria è una notifica **locale** al dispositivo: puoi scegliere su quali
dispositivi riceverlo, e disattivarlo.

---

## 11. Stato di implementazione, onesto

La specifica (§15) vieta di dichiarare completa una funzione rappresentata solo
da un pulsante. Ecco lo stato reale:

| Funzione | Stato |
|---|---|
| Esportazione JSON completa (`export`, `exportJson`) | **implementata, verificata automaticamente** |
| Anteprima di importazione (`preview`) | **implementata, verificata automaticamente** |
| Importazione transazionale (`import`) | **implementata, verificata automaticamente** |
| Gestione duplicati `skip` / `overwrite` | **implementata, verificata automaticamente** |
| Rifiuto di file corrotti e incompatibili | **implementata, verificata automaticamente** |
| Migrazioni e `SchemaTooNewError` | **implementate, verificate automaticamente** |
| Esportazione CSV | **non ancora implementata** nel livello di persistenza: il formato è specificato qui, il codice no |
| Promemoria di backup | impostazione presente; la programmazione della notifica vive nell'app |
| Copia delle immagini delle foto di progresso | **non implementata** |
| Cifratura lato client dei backup | **non implementata** (vedi `PRIVACY.md` §5) |

Nessuna di queste funzioni è stata provata **su un dispositivo**: in questo
ambiente non esistono né iPhone né simulatore. Sono verificate da test su Node
contro SQLite. Vedi `QA_REPORT.md`.

---

## 12. Comandi di verifica

```bash
npx vitest run packages/db/test/backup.test.ts
```

Casi coperti: esportazione e reimportazione senza perdita · file corrotto con
transazione annullata e storico intatto · importazione ripetuta senza duplicati
· schema più recente del codice con dati ancora leggibili.
