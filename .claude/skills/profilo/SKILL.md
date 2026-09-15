---
name: profilo
description: Intervista il decisore per costruire o aggiornare il profilo di investimento — capitale, soglia di ROI, orizzonte, intento sull'immobile, appetito di cantiere, zone e vincoli — e lo scrive in profilo-investitore.md, che diventa il charter del progetto e la base di ogni valutazione successiva. Usala all'inizio, o quando qualcosa nel profilo cambia. Trigger: "costruiamo il profilo", "definiamo la strategia", "cambio obiettivi", "quanto capitale posso impegnare", "iniziamo".
---

# Profilo dell'investitore — l'intervista iniziale

Questa skill si fa **una volta**, e si rifà quando cambia qualcosa. Produce
`flipping-scandicci/profilo-investitore.md`, che è il **charter** del progetto
(§1 di `PIANO-PROGETTO.md`) e la base che ogni esperto legge prima di lavorare.

## Perché viene prima di tutto

Le soglie fissate qui determinano **il prezzo massimo che potrai offrire in
asta**. Non sono dichiarazioni d'intenti: entrano in `offerta_massima()` e
decidono quali lotti sono aggredibili e quali no.

E vanno fissate **adesso**, prima di guardare gli immobili — quando non ci si è
ancora affezionati a nessuno. Un obiettivo di ROI deciso davanti a una casa che
piace non è un obiettivo: è una giustificazione.

---

## Come condurla

Leggi `flipping-scandicci/riferimenti/domande-intake.md`, **ondata A**: contiene
il banco completo delle domande. Puoi ingaggiare l'agente `intervistatore` per
progettare il set, ma l'intervista la conduci tu: un sottoagente non può porre
domande al decisore.

Tre ondate da 3–4 domande. Usa `AskUserQuestion` con opzioni e **conseguenza
dichiarata** per ciascuna: mai un campo vuoto.

### Ondata 1 — capitale, rendimento, tempo
Sono le tre che vincolano tutto il resto.

**Capitale al picco.** Chiarisci subito l'equivoco più costoso: il capitale che
serve **non è il prezzo dell'immobile**. Sul caso di riferimento sono ~181.000 €
su un'aggiudicazione da 92.000 €, perché comprendono imposte, lavori,
mantenimento e provvigione. E il tratto duro è fra cauzione e saldo: **poche
settimane per mobilitare oltre 100.000 €**, con il termine di saldo che è
tipicamente 120 giorni e **non è prorogabile**.

**Soglia di ROI.** La domanda più importante dell'intervista. Presentala con le
conseguenze, ricalcolate con lo strumento:

```bash
python3 flipping-scandicci/strumenti/soglie.py --uscita-mq <EUR/mq di zona>
```

| Soglia | Prezzo base max compatibile¹ | Cosa comporta |
|---|---|---|
| 15% | ~112.000 € | Primo/secondo esperimento, più scelta |
| 20% | ~101.000 € | Selettivo |
| 25% | ~91.000 € | Quasi solo terzo/quarto esperimento |

¹ caso di riferimento: 70 mq, uscita 225.000 € prudenziali, occupato.

Dì in chiaro la cosa che non è ovvia: **una soglia più alta non dà più margine,
dà gli stessi margini su lotti più rischiosi.** Al 25% si finisce sui lotti che
il mercato ha già rifiutato due volte, e il collo di bottiglia si sposta dal
prezzo alla due diligence.

Chiedi anche se la metrica prevalente è il **ROI assoluto** o
l'**annualizzato**: il secondo penalizza le operazioni lunghe, e quindi gli
immobili occupati.

**Orizzonte.** Entro quanto vuole rivedere il capitale, e soprattutto: un
immobile occupato dal debitore può richiedere **3–18 mesi solo di liberazione**.
È un no, un "dipende dal prezzo", o indifferente? La risposta cambia metà dei
lotti disponibili.

### Ondata 2 — intento, cantiere, forma dell'acquisto

**Intento.** Rivendita (il perimetro di questo sistema), tenere e affittare,
uso proprio o di un familiare, prima casa. Se la risposta non è "rivendita",
**dillo subito**: il modello ROI non copre la locazione, e la prima casa cambia
l'aliquota di registro dal 9% al 2% e incide sulla plusvalenza.

**Appetito di cantiere.** Fino a che livello: nessun intervento / rinfrescata /
straordinaria / integrale con ridistribuzione. E: c'è già un'impresa e un
tecnico di fiducia, o vanno trovati?

**Forma dell'acquisto.** Persona fisica o società. Se società, **fermati su
questo punto**: cambia tutto l'impianto fiscale (IVA detraibile, immobile come
merce, utile tassato come reddito d'impresa invece che plusvalenza) e il modello
va rifatto col commercialista. Non è una variante, è un altro progetto.

### Ondata 3 — geografia, tipologia, vincoli personali

Zone di Scandicci (centro, Casellina, Vingone, San Giusto, Le Bagnese, Badia a
Settimo, fascia collinare / Scandicci Alto), tagli, esclusioni assolute, tempo
personale disponibile, esperienza precedente, scadenze esterne.

Qui puoi essere più veloce: sono preferenze, non vincoli strutturali, e si
raffinano sull'uso reale.

---

## Cosa scrivere

`flipping-scandicci/profilo-investitore.md`:

```markdown
# Profilo investitore
Versione <n> — <data>

## Capitale
- Disponibile al picco: X EUR
- Tempo di mobilitazione: Y settimane
- Leva: sì/no — istituto, pre-delibera
- **Vincolo derivato:** fascia di prezzo accessibile

## Obiettivi (criteri di successo del charter)
| Metrica | Soglia |
|---|---|
| ROI su capitale, scenario prudente | X% |
| ROI annualizzato | Y% |
| Durata massima | Z mesi |
| Capitale massimo al picco | W EUR |
| Margine di sicurezza minimo | P% |
Metrica prevalente: assoluto | annualizzato

## Intento
Rivendita | affitto | uso proprio | prima casa. Conseguenze fiscali.

## Tolleranza
- Immobile occupato: accettato / solo con sconto / escluso
- Livello massimo di cantiere:
- Invenduto oltre 3 mesi: si abbassa il prezzo / si aspetta / si affitta

## Forma dell'acquisto
Persona fisica | società — e le conseguenze.

## Perimetro
Zone incluse, tagli, esclusioni assolute.

## Vincoli personali
Tempo settimanale, esperienza, scadenze.

## Soglie di screening derivate
Output di `soglie.py` per la soglia di ROI scelta: il prezzo base massimo al mq
che il procacciatore applicherà come filtro.

## Punti aperti
Quello che il decisore non ha voluto o potuto fissare ora, e l'assunzione
adottata nel frattempo.
```

**Chiudi eseguendo `soglie.py`** con la soglia scelta e le zone indicate, e
riporta la tabella nel profilo. È il ponte fra il charter e il lavoro del
procacciatore: senza quella tabella il filtro di ricerca non esiste.

---

## Regole

- **Massimo 4 domande per ondata.** Tre ondate, non un questionario.
- **Ogni opzione con la sua conseguenza.** Il decisore sceglie sapendo, non
  indovinando.
- **Non insistere su una domanda senza risposta.** Adotta l'assunzione peggiore
  plausibile, scrivila nella sezione *Punti aperti*, e vai avanti. Un profilo
  con tre assunzioni dichiarate è utilizzabile; un'intervista abbandonata a
  metà no.
- **Se il profilo esiste già**, non rifarlo da zero: mostralo, chiedi cosa
  cambia, aggiorna la versione e la data.
- **Non tradurre le preferenze in giudizi.** Se il decisore vuole il 25% e
  quasi nulla passerà il filtro, dillo una volta con i numeri e poi rispetta la
  scelta: è il suo capitale.

## Alla fine
Riassumi il profilo in cinque righe, di' quale sarà il **filtro di screening
effettivo** in €/mq, e proponi il passo successivo: `/monitora-aste` per far
partire la ricerca, o `/valuta-asta` se c'è già un lotto in mano.
