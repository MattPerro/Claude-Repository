# Fiscalità e costi di un acquisto all'asta — riferimento operativo

> **Avvertenza.** Questo file è la memoria di lavoro degli agenti, non un parere
> professionale. Le norme citate sono indicate con l'articolo per essere
> verificabili; le **aliquote e gli importi vanno riverificati ad ogni operazione**
> (la legge di bilancio le muove ogni anno). Prima di un rilancio vincolante,
> ogni voce marcata `[VERIFICARE]` va confermata dal professionista delegato,
> dal notaio o dal commercialista.

Ultimo aggiornamento dei contenuti: **settembre 2026**.
Foro competente per Scandicci: **Tribunale di Firenze**.

---

## 1. Le regole dell'asta che vincolano l'offerta

| Elemento | Regola | Fonte |
|---|---|---|
| Offerta minima | Non inferiore al **75%** del prezzo base: un'offerta inferiore di oltre un quarto è inefficace | art. 571 c.p.c. |
| Cauzione | Almeno il **10%** del prezzo offerto, versata prima dell'asta; **persa** in caso di mancato saldo | art. 571 c.p.c. / avviso di vendita |
| Rilancio minimo | Fissato nell'avviso di vendita, non dalla legge | avviso di vendita |
| Saldo prezzo | Entro il termine dell'avviso, in genere **120 giorni**, non prorogabile | art. 574 c.p.c. / ordinanza di delega |
| Modalità | Vendita telematica (asincrona o sincrona mista) è oggi la regola | art. 569 c.p.c., D.M. 32/2015 |
| Decreto di trasferimento | Emesso dopo il saldo; è il titolo di proprietà | art. 586 c.p.c. |
| Cancellazione gravami | Ordinata dal giudice col decreto; **l'onere pratico e il costo sono dell'aggiudicatario** | art. 586 c.p.c. |

**Conseguenza per il modello.** Il prezzo massimo che il modello calcola
(`offerta_massima`) va confrontato col 75% del prezzo base. Se la soglia
economica è **sotto** il minimo di legge, l'asta non è aggredibile a quel ROI:
si salta, non si "tira".

---

## 2. Imposte sull'acquisto

Due regimi **alternativi**, mai cumulabili. Dipende da chi è il venditore
nella procedura (il debitore esecutato), non dall'acquirente.

### Regime ordinario — imposta di registro
Il debitore è un privato (caso normale nelle esecuzioni immobiliari):

- **Imposta di registro 9%** sul valore, **2%** se ricorrono i requisiti prima casa
- **Imposta ipotecaria € 50 + catastale € 50** (fisse)
- Registro **minimo € 1.000** `[VERIFICARE]`

**Prezzo-valore.** Per immobili abitativi acquistati da persone fisiche, la base
imponibile può essere il **valore catastale** anziché il prezzo, se più basso.
La Corte Costituzionale (sent. **n. 6/2014**) ha dichiarato illegittima
l'esclusione delle vendite giudiziarie da questo meccanismo. `[VERIFICARE con il
professionista delegato: va richiesto espressamente, non è automatico]`

È una delle poche leve fiscali vere del flipping all'asta: su un immobile
aggiudicato ben sotto mercato, il catastale può essere sensibilmente più basso
del prezzo. Nel modello si attiva con `usa_prezzo_valore: true` e
`valore_catastale`.

### Regime IVA
Il debitore è un soggetto IVA (impresa) e la cessione è imponibile:

- **IVA** al 4% / 10% / 22% secondo tipologia e requisiti
- Imposte di registro, ipotecaria e catastale in misura **fissa**

**Attenzione:** se acquisti tramite una tua società, cambia tutto l'impianto
(detraibilità IVA, l'immobile come merce, tassazione dell'utile come reddito
d'impresa invece che plusvalenza). Il modello non copre questo scenario:
va rifatto col commercialista.

---

## 3. Costi accessori dell'acquisto

| Voce | Ordine di grandezza | Nota |
|---|---|---|
| Compenso del professionista delegato | tariffa del D.M. 227/2015, a scaglioni | `[VERIFICARE]` nell'avviso: a volte è a carico dell'aggiudicatario per la fase di trasferimento |
| Spese di trasferimento | registrazione, trascrizione, note, bolli | quantificate dal delegato dopo l'aggiudicazione |
| Cancellazione ipoteche e pignoramenti | per ogni iscrizione/trascrizione da cancellare | **conta le iscrizioni nella relazione notarile**: non è un costo unico |
| Nessun notaio | — | nelle vendite delegate il titolo è il decreto, non un atto notarile: **si risparmia l'onorario** |
| Nessuna provvigione d'agenzia in acquisto | — | vantaggio strutturale dell'asta |

---

## 4. Il costo che affonda i conti: la liberazione

Se l'immobile è **occupato dal debitore o da terzi senza titolo opponibile**,
serve l'**ordine di liberazione** (art. 560 c.p.c.), eseguito dal custode.

- Tempi realistici: **da 3 a 18 mesi** dopo il decreto `[VERIFICARE caso per caso col custode]`
- Costo: assistenza legale, attività del custode, a volte un accordo economico
  col debitore per uscita volontaria (spesso più rapido ed economico del forzoso)
- **Costo nascosto vero:** i mesi. Ogni mese di attesa è IMU, condominio,
  interessi e ROI annualizzato che scende.

Se c'è un **contratto di locazione opponibile** (registrato, con data anteriore
al pignoramento), l'immobile si compra **con l'inquilino dentro**: verificare
durata residua e canone. Per un flipping è normalmente **una ragione di scarto**.

Gradazione del rischio, dalla migliore alla peggiore:
**libero** → **occupato dal debitore** → **occupato da terzi senza titolo** →
**locato con contratto opponibile**.

---

## 5. Condominio

**Art. 63 disp. att. c.c.**: l'acquirente è obbligato **in solido** per le spese
condominiali dell'**anno in corso e del precedente**. Sono soldi che escono
subito, e che nella perizia a volte sono indicati e a volte no.

Da chiedere **sempre** all'amministratore prima dell'asta:
- arretrati dei due anni rilevanti
- **lavori straordinari deliberati** (un cappotto o un rifacimento facciata
  deliberato prima dell'acquisto può valere decine di migliaia di euro)
- stato del fondo e contenziosi in corso

---

## 6. Urbanistica e catasto

**Il vantaggio dell'asta.** L'art. 46 co. 5 DPR 380/2001 esclude la nullità
dell'atto per immobili acquisiti in **procedura esecutiva**, e concede
**120 giorni dal decreto** per presentare domanda di **permesso in sanatoria**.
Un abuso sanabile, quindi, non blocca l'acquisto — ma va **prezzato**:

- costo tecnico della pratica + oneri + **sanzione**
- rischio che l'abuso sia **non sanabile** (difformità non conformi alla
  disciplina urbanistica vigente e a quella dell'epoca: doppia conformità)

> Un abuso **non sanabile** è motivo di scarto, non di sconto: su un immobile da
> rivendere, l'irregolarità si trasferisce al tuo acquirente e blocca il rogito
> o il suo mutuo.

Da leggere nella perizia: conformità urbanistica, conformità catastale,
agibilità, APE, conformità degli impianti.

---

## 7. Ristrutturazione

Nel modello i lavori si esprimono come **€/mq × mq**, con sopra:

- **riserva imprevisti 15%** di default — su un immobile all'asta, spesso visto
  male e in cattivo stato, è il minimo prudenziale; su edifici ante-1970 senza
  documentazione impianti, alzarla a 25–30%
- **IVA 10%** su manutenzione straordinaria e recupero (22% su alcune forniture
  di "beni significativi") `[VERIFICARE]`
- **tecnico 10%** sui lavori: progetto, direzione lavori, sicurezza, pratiche,
  aggiornamento catastale

Le fasce €/mq vanno prese dal mercato locale al momento del progetto, con almeno
**due preventivi di imprese fiorentine** — non da medie nazionali. Vedi
`fonti-dati.md`.

### Detrazioni: perché non contano quasi nulla in un flipping
Le detrazioni per ristrutturazione si recuperano in **10 anni** di dichiarazioni
e richiedono capacità fiscale; se rivendi entro 18 mesi, la quota residua
segue regole di trasferimento e comunque **non entra nella cassa del progetto**.
Il modello le ignora per scelta. `[VERIFICARE l'aliquota vigente 2026 se
l'operazione dovesse allungarsi o cambiare natura]`

---

## 8. Uscita: la plusvalenza è la voce più sottovalutata

**Art. 67 co. 1 lett. b) TUIR**: la cessione di un immobile **entro 5 anni**
dall'acquisto genera plusvalenza tassabile, salvo che sia stato
**abitazione principale** del cedente o dei familiari per la maggior parte
del periodo.

- Base imponibile: **prezzo di cessione − (costo di acquisto + costi inerenti
  documentati)**. I costi di ristrutturazione documentati **riducono** la base:
  fatture intestate e tracciate, sempre.
- Opzione **imposta sostitutiva 26%** richiesta al notaio in atto
  (art. 1 co. 496 L. 266/2005), alternativa alla tassazione IRPEF progressiva.
  Con redditi medio-alti la sostitutiva conviene quasi sempre. `[VERIFICARE]`
- **Gli oneri finanziari non sono costi inerenti**: gli interessi non abbattono
  la plusvalenza. Il modello li tiene fuori dalla base, correttamente.

Un flipping è per definizione infra-quinquennale: **il 26% sul margine va messo
nel conto dal primo giorno**, non scoperto al rogito.

---

## 9. Mantenimento durante il possesso

| Voce | Nota |
|---|---|
| **IMU** | Seconda casa, aliquota del **Comune di Scandicci** `[VERIFICARE la delibera dell'anno]`. Nessuna esenzione: non è abitazione principale |
| Condominio ordinario | quota mensile corrente |
| Utenze | anche a immobile vuoto: quote fisse, più il cantiere |
| Assicurazione | fabbricato + RC durante i lavori |
| Interessi | se c'è leva |

---

## 10. Vendita

- **Provvigione d'agenzia** 3% + IVA 22% lato venditore `[VERIFICARE, trattabile]`
- Home staging, fotografie, planimetrie
- **APE** obbligatorio
- **Tempi di mercato**: i mesi di invenduto sono un costo. Vanno stimati sui
  dati locali, non sperati.

---

## 11. Checklist minima prima di un rilancio

- [ ] Perizia del CTU letta integralmente, non solo il sommario
- [ ] Avviso di vendita letto: termine saldo, cauzione, rilancio, oneri a carico
- [ ] Stato occupativo accertato e prezzato in mesi
- [ ] Relazione notarile: gravami contati, non stimati
- [ ] Amministratore contattato: arretrati + lavori deliberati
- [ ] Conformità urbanistica e catastale: sanabile o non sanabile
- [ ] Due preventivi lavori, non una media al mq
- [ ] Comparabili di vendita **realizzati** (non richieste) nella stessa zona
- [ ] Regime fiscale di acquisto e di uscita confermati
- [ ] `offerta_massima` calcolata e **confrontata col 75% del prezzo base**
- [ ] Soglia di rilancio scritta **prima** di entrare in asta
