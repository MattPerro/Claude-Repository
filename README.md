# David — la tua app personale di nuoto 🏊

App **personale** (un solo utente) per gestire il percorso di nuoto verso due
obiettivi: **peso 88 kg** (fascia 87–89) ed estetica **"David di Michelangelo"**
(fisico asciutto e definito). È un **unico file `index.html`** autonomo: HTML +
CSS + JS in-line, **senza framework, senza build, senza server**. I dati restano
solo sul tuo dispositivo (`localStorage`, con fallback in memoria). Interfaccia
tutta in italiano.

## Come aprirla
- **Basta un doppio clic** su `index.html` (si apre nel browser). Funziona anche
  **offline** e **non fa alcuna chiamata di rete**: usa solo i font di sistema,
  nessuna risorsa esterna (nessun tracciamento, massima privacy).
- Su iPhone: aprila in **Safari** (puoi inviartela via AirDrop / iCloud Drive e
  aprirla da lì, oppure ospitarla su un URL a tua scelta).

## Aggiungere alla Home su iPhone
1. Apri `index.html` in **Safari**.
2. Tocca il pulsante **Condividi** (il quadrato con la freccia in alto).
3. Scegli **"Aggiungi alla schermata Home"** e conferma.
4. L'icona **David** comparirà tra le app: si apre a schermo intero, come un'app.

> Nota: per l'apertura da Home a schermo intero conviene servire il file da un
> indirizzo web (anche una cartella iCloud/Files va bene per aprirlo al volo).

## Le 4 schede
- **Oggi** — la seduta di oggi (o la prossima, se è riposo), con "Vai alla
  sessione" e "Cosa prevede". Striscia della settimana e mini-statistiche.
- **Piano** — calendario navigabile: assegna/cambia la seduta di un giorno
  (il cambio vale per **quel giorno della settimana**, tutte le settimane),
  spunta il "fatto", e **esporta i promemoria `.ics`**.
- **Sessione** — selettore A/B/C, blocchi ed esercizi con spunta persistente,
  clip animate "▶ Esecuzione", avviso schiena, barra "X/N" e "completa".
- **Progressi** — peso attuale + grafico verso 88 (con fascia 87–89), proiezione
  "David" morphabile, aderenza e streak, backup dei dati.

## Promemoria (perché `.ics` e non notifiche)
Le web-app **non possono inviare notifiche push in background** (limite di iOS).
Perciò dalla scheda **Piano** esporti un file **`.ics`** con gli eventi delle
**prossime 4 settimane**: ogni evento ha un **avviso la sera prima** all'orario
che scegli (default 21:00). Importalo nel **Calendario dell'iPhone** e l'**Apple
Watch** eredita gli avvisi. La lettura diretta dei dati sull'Apple Watch resta
una funzione dell'app nativa, non di questa versione "ponte".

## Backup e ripristino
Nella scheda **Progressi → Sicurezza dati**:
- **Esporta backup**: scarica un file `david-backup.json` con tutti i tuoi dati.
- **Importa backup**: ricarica un `.json` salvato in precedenza (unisce i dati).
- **Azzera dati**: cancella tutto (con conferma). Non reversibile.

Fai un backup ogni tanto: i dati vivono nel browser del dispositivo e possono
essere persi se svuoti la cache o cambi telefono.

## Sicurezza e onestà (importante)
- **Solo nuoto, nessun attrezzo.** Sessioni da 45–60 minuti.
- **Schiena (2 ernie lombari):** niente farfalla, rana "spinta"/a delfino
  aggressiva, tuffi o virate spinte; non inarcare mai la schiena per respirare;
  a secco niente sit-up/crunch o flessioni lombari sotto carico. L'app mostra
  avvisi chiari e segna in rosso i movimenti da evitare.
- La **proiezione del fisico "David" è un modello illustrato e indicativo**, non
  una foto né una previsione medica.
- Le **clip degli esercizi sono animazioni vettoriali** programmate, non video.

## Struttura del file
`index.html` è organizzato in sezioni commentate: token/CSS, storage, dati di
dominio (esercizi e sedute), date DST-safe, logica (streak, aderenza, `.ics`),
navigazione, render delle 4 schede, anteprima seduta, animazioni SVG e figura
"David", init. Nessuna dipendenza runtime.

## App nativa iOS (in sviluppo)
Questa web-app è la **versione "ponte"**. Il progetto dell'**app nativa iPhone**
— che legge automaticamente le nuotate in piscina da **Apple Salute** (Apple
Watch), con promemoria veri e aspetto nativo — si trova nella cartella
[`native/`](native/README-SETUP.md). Va aperto e compilato su un **Mac con
Xcode**: la guida passo-passo è in `native/README-SETUP.md`.

---
*Versione "ponte" in attesa dell'app nativa. Buone bracciate.*
