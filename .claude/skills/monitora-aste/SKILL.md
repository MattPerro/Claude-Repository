---
name: monitora-aste
description: Sorveglia le nuove pubblicazioni di aste immobiliari a Scandicci e segnala solo i lotti che superano un pre-filtro economico. Pensata per girare in modo ricorrente con /loop. Usala quando l'utente vuole essere avvisato dei nuovi lotti, tenere d'occhio il mercato delle aste, o seguire un'asta in avvicinamento. Trigger: "monitora le aste", "avvisami se escono nuovi lotti", "controlla se ci sono aste nuove a Scandicci".
---

# Monitoraggio continuo delle aste a Scandicci

Questa skill è fatta per essere **ripetuta**, non eseguita una volta. Il modo
corretto di usarla è dentro un loop:

```
/loop 1d /monitora-aste          # controllo giornaliero
/loop /monitora-aste             # auto-ritmato: decido io la cadenza
```

## Il rischio di un loop di ricerca, e come si disinnesca

Un loop senza criterio di arresto produce rumore a ogni giro e ti allena a
ignorarlo. Il valore di questa skill sta quasi tutto nel **silenzio**: se non
c'è niente che supera il filtro, il giro corretto non dice nulla.

Tre regole che tengono il loop utile:

1. **Stato persistente.** `flipping-scandicci/monitoraggio/visti.md` elenca i
   lotti già valutati con il loro esito. Leggilo **prima** di ogni ricerca e
   aggiornalo dopo. Senza questo file il loop ri-segnala gli stessi immobili
   ogni giorno.
2. **Soglia prima della segnalazione.** Un lotto si segnala solo se supera il
   pre-filtro economico qui sotto. Non si segnala "per completezza".
3. **Niente da dire → non dire niente.** Un giro a vuoto è un successo. Chiudi
   con una riga sola: *"nessun nuovo lotto oltre soglia al <data>"*, e marca il
   giro come `noop`.

## Cosa fa un giro

### 1. Leggi lo stato
`flipping-scandicci/monitoraggio/visti.md` — riferimenti già visti ed esito.
Crea il file se non esiste.

### 2. Cerca
Ingaggia **`asta-scout`** per le pubblicazioni nuove o modificate sul Comune di
Scandicci, Tribunale di Firenze.

Cambiamenti che contano su lotti **già visti**:
- nuovo esperimento con **prezzo base ribassato** (un lotto scartato al primo
  giro può rientrare al terzo)
- data d'asta che si avvicina — se avevi verifiche aperte, ora scadono
- **stato occupativo cambiato** (ordine di liberazione eseguito): è la
  variazione che più sposta un giudizio

### 3. Pre-filtro
Prima di spendere un'analisi completa, uno sbarramento grossolano su
prezzo base, superficie, stato occupativo e €/mq di zona.

Lo scopo è **escludere a basso costo**, non stimare. Un lotto che supera il
pre-filtro non è un affare: è un candidato che merita la valutazione vera.

Scarta senza esitare: locazione opponibile, quota indivisa, diritti reali di
terzi, abuso non sanabile, tipologia fuori perimetro.

### 4. Segnala, e solo allora
Per ogni lotto che passa, **massimo cinque righe**:

```
<riferimento> — <indirizzo, zona> — <mq>
Base: X EUR (esperimento n, ribasso cumulato Y%) | Minimo 75%: Z EUR
Stato: <occupativo> | Asta: <data>
Perché merita: <una riga>
Rischio principale: <una riga>
→ /valuta-asta <riferimento> per l'analisi completa
```

Non lanciare la valutazione completa da dentro il loop senza che l'utente la
chieda: una due diligence completa a ogni giro su ogni lotto è uno spreco, e
il giro deve restare leggero.

**Eccezione**, l'unica: un lotto la cui asta cade entro **7 giorni** e che ha
superato il pre-filtro. Lì il tempo è il vincolo e vale segnalarlo con urgenza
esplicita, perché aspettare il giro successivo può voler dire perdere la data.

### 5. Aggiorna lo stato
Scrivi in `visti.md` ogni lotto esaminato:

```
| Rif. | Indirizzo | Base | Esperimento | Visto il | Esito | Nota |
```

Esiti: `scartato` (con ragione), `segnalato`, `in valutazione`, `valutato-no`,
`valutato-sì`, `aggiudicato ad altri`, `deserto`.

Lo storico è un patrimonio: dopo qualche mese dice come si muovono i prezzi base
a Scandicci, quanti esperimenti servono prima dell'aggiudicazione, quali zone
girano. Sono dati che nessun portale ti dà, e che alimentano
`mercato-scandicci`.

## Cadenza

Le pubblicazioni non sono un flusso rapido: **una volta al giorno è abbondante**,
due volte a settimana è ragionevole per non consumare attenzione a vuoto.

In modalità auto-ritmata, stringi la cadenza solo per una ragione precisa — una
data d'asta che si avvicina su un lotto in valutazione — e riallargala subito
dopo. Un loop che si sveglia ogni ora su un mercato che si muove ogni settimana
brucia budget e produce rumore.

## Chiudere il loop
Quando l'obiettivo è raggiunto — lotto aggiudicato, o l'utente dice basta —
chiudi il loop invece di lasciarlo girare. Un monitoraggio dimenticato è un
costo silenzioso.
