# Banco delle domande — capire l'intento prima di analizzare

Questo file è il cuore conversazionale del sistema. Serve alla sessione
principale (l'orchestratore), non ai sottoagenti: **un sottoagente non può fare
domande all'utente**, riceve un incarico e restituisce un referto.

## Il principio

> Un'analisi tecnicamente perfetta della domanda sbagliata è lavoro buttato.

Lo stesso immobile, con gli stessi numeri, è **un affare o uno scarto** a
seconda di cosa il decisore intende farci. Un trilocale a 92.000 € occupato dal
debitore è:

| Intento | Verdetto sullo stesso lotto |
|---|---|
| Flip rapido, capitale da rimettere in circolo in 12 mesi | **scarto** — la liberazione uccide il ROI annualizzato |
| Rivendita senza vincolo di tempo | forse — dipende dal prezzo |
| Tenere e affittare | **interessante** — l'occupazione conta meno, il rendimento è da canone |
| Casa per un familiare | il ROI non è nemmeno la metrica giusta |
| Prima casa (aliquota 2%) | cambia la fiscalità di acquisto **e** la plusvalenza |

**Non si avvia nessun fan-out prima di sapere quale riga è.**

## Regole per l'orchestratore

1. **Massimo 3–4 domande per volta.** Un interrogatorio di quindici domande
   fa abbandonare la conversazione. Si va a ondate.
2. **Ogni domanda deve cambiare il lavoro.** Prima di farla, chiediti: *cosa
   farei di diverso con ciascuna risposta?* Se la risposta è "niente", non è
   una domanda: è curiosità. Non farla.
3. **Proponi opzioni, non campi vuoti.** "Che ROI vuoi?" è una domanda cattiva.
   "15% / 20% / 25% — al 25% il sistema ti scarterà quasi tutto tranne i lotti
   al terzo esperimento" è una domanda utile.
4. **Dichiara la conseguenza** di ogni opzione. Il decisore deve poter scegliere
   sapendo cosa succede, non indovinando.
5. **Non chiedere ciò che è già nel profilo.** Leggi
   `profilo-investitore.md` prima di aprire bocca. Chiedere due volte la stessa
   cosa fa sembrare il sistema smemorato — ed erode la fiducia più di un errore.
6. **Non chiedere ciò che puoi leggere.** Se il dato è nella perizia,
   nell'avviso o nei dati di zona, vai a prenderlo. Le domande sono per ciò che
   solo il decisore sa: **le sue intenzioni e i suoi vincoli**.

---

## Ondata A — Profilo dell'investitore *(una volta, skill `/profilo`)*

Si fa una volta e si aggiorna quando cambia qualcosa. Produce
`profilo-investitore.md`, che diventa il charter di §1 del piano.

### A1. Capitale e liquidità
- Quanto capitale proprio puoi impegnare, **al picco**? (non il prezzo
  dell'immobile: il picco include imposte, lavori e mantenimento — sul caso di
  riferimento sono ~181.000 € su un'aggiudicazione da 92.000 €)
- In quanto tempo puoi mobilitarlo? **Il vincolo è il saldo: tipicamente 120
  giorni dall'aggiudicazione, non prorogabile.**
- Userai leva finanziaria? Se sì, hai già un istituto o una pre-delibera?

> *Perché conta:* definisce la fascia di prezzo accessibile e il rischio R5
> (mancato saldo = perdita di cauzione **e** immobile).

### A2. Obiettivo di rendimento — **la domanda che determina tutto**
- Che ROI minimo vuoi, sullo **scenario prudente**?

| Soglia | Prezzo base massimo compatibile¹ | Cosa comporta |
|---|---|---|
| 15% | ~112.000 € | Lotti al primo/secondo esperimento, più scelta |
| 20% | ~101.000 € | Selettivo |
| 25% | ~91.000 € | Quasi solo terzo/quarto esperimento: **più margine richiesto su lotti più rischiosi** |

¹ sul caso di riferimento: 70 mq, uscita 225.000 € prudenziali, occupato.
Ricalcolabile con `strumenti/soglie.py`.

- Il ROI ti interessa **assoluto** o **annualizzato**? Sono scelte diverse:
  l'annualizzato penalizza le operazioni lunghe e quindi gli immobili occupati.

### A3. Orizzonte e tolleranza al tempo
- Entro quanto vuoi rivedere il capitale?
- **Un immobile occupato dal debitore può richiedere 3–18 mesi solo per la
  liberazione.** È un no, un "dipende dal prezzo", o indifferente?
- Se a 3 mesi dalla messa in vendita non si vende: abbassi il prezzo, aspetti,
  o affitti?

### A4. Intento sull'immobile
- Rivendita dopo ristrutturazione (il perimetro di questo sistema)?
- Tenere e affittare? **Altro business case**: altra fiscalità, altro orizzonte,
  il modello ROI attuale non lo copre.
- Uso proprio o di un familiare? Cambia le aliquote e forse la metrica.
- Prima casa? **Registro al 2% invece del 9%** — e incide sulla plusvalenza.

### A5. Appetito di cantiere
- Vuoi immobili pronti o sei disposto a un cantiere pesante?
- Fino a che livello ti spingi: nessun intervento / rinfrescata /
  straordinaria / integrale con ridistribuzione?
- Hai già un'impresa e un tecnico di fiducia, o vanno trovati?

### A6. Forma dell'acquisto
- Persona fisica o società? **Se società, il modello economico va rifatto**
  (IVA detraibile, immobile come merce, utile come reddito d'impresa):
  serve il commercialista prima di procedere.

### A7. Geografia e tipologia
- Tutto Scandicci o zone specifiche? (centro, Casellina, Vingone, San Giusto,
  Le Bagnese, Badia a Settimo, fascia collinare / Scandicci Alto)
- Tagli: bilocali, trilocali, quadrilocali? Piano, ascensore, esterni?
- Esclusioni assolute? (piano terra, senza ascensore oltre il 2°, condomini
  grandi, zone che conosci e scarti)

### A8. Vincoli personali
- Quanto tempo tuo puoi metterci a settimana?
- Hai già fatto operazioni simili, o è la prima?
- C'è una scadenza esterna che ti vincola?

---

## Ondata B — Selezione dai risultati del filtro *(ad ogni tornata di ricerca)*

Il procacciatore restituisce N candidati. **Non si aprono N due diligence**:
ognuna costa 800–2.800 €, e con un tasso realistico di 1 aggiudicazione su 5–8
i cicli a vuoto si caricano sull'operazione riuscita.

Quindi si chiede, con i candidati sul tavolo:

- **Quali vuoi approfondire?** Presentali con: prezzo base, €/mq base sul €/mq
  di zona, stato occupativo, esperimento, data d'asta, e **la ragione per cui
  è in lista**.
- Se il decisore dice "tutti": **obietta una volta**, con il costo. Poi, se
  conferma, procedi — è il suo capitale.
- **Su quello che scarti, perché?** La risposta tara il pre-filtro per la
  tornata successiva. È il modo in cui il sistema impara i suoi gusti reali,
  che non coincidono mai del tutto col profilo dichiarato.
- **C'è una data d'asta vicina?** Se un lotto va in asta entro 7-10 giorni,
  l'ordine di lavoro cambia: prima quello, il resto dopo.

---

## Ondata C — Intento sul lotto specifico *(prima del fan-out)*

Queste si fanno **su un lotto scelto, prima di ingaggiare gli agenti**, perché
determinano *quali* agenti girano e cosa conta come "buono".

### C1. Cosa ci vuoi fare, in concreto
- Flip come da profilo, o questo è un caso diverso?
- **Livello di intervento ipotizzato**: nessuno / rinfrescata / straordinaria /
  integrale / premium?
  → Se ≥ integrale o se si parla di ridistribuzione, **entra l'architetto**.
  → Se "premium": avvisa che su un flip il mercato di zona ha un tetto e oltre
     quello si spende 100 per recuperare 60. Poi, se confermato, procedi.
- C'è qualcosa di specifico che ti ha attirato? (la zona, il prezzo, il taglio,
  il potenziale di ridistribuzione) — dice dove concentrare l'analisi.

### C2. Vincoli su questo lotto
- Fino a quando puoi decidere? (data d'asta meno il tempo di due diligence)
- La cauzione del 10% è disponibile subito?
- Il saldo entro il termine è coperto **senza** vendere altro?

### C3. Profondità richiesta
- Vuoi un **primo parere rapido** (mercato + prezzo base, mezz'ora) o
  l'**analisi completa** (fan-out, modello, soglia d'asta)?
- Hai già i documenti (avviso, perizia, relazione notarile) o vanno recuperati?

> Il livello di informazione disponibile **limita** il risultato ottenibile, e
> va detto subito, non a valutazione finita:
>
> | Hai | Puoi arrivare a |
> |---|---|
> | Indirizzo o zona | Inquadramento. **Nessuna soglia d'asta** |
> | Avviso di vendita | Valutazione preliminare |
> | Avviso + perizia | **Valutazione completa** — il minimo per una soglia d'offerta |
> | + relazione notarile + amministratore | Valutazione da rilancio vincolante |

---

## Ondata D — Domande che nascono dagli esperti *(dopo il fan-out)*

Ogni agente chiude il referto con una sezione **"Domande per il decisore"**:
massimo 3, in ordine di impatto, ognuna con *perché conta* e *cosa cambia
secondo la risposta*.

Compito dell'orchestratore:
1. **Raccogliere** le domande di tutti gli agenti.
2. **Deduplicare**: tre agenti che chiedono la stessa cosa la chiedono una volta.
3. **Ordinare per impatto** sul verdetto, non per ordine di arrivo.
4. **Tagliare a 3–4** le più pesanti. Le altre vanno nel documento come
   verifiche aperte, non nella chat.
5. **Chiedere in blocco**, con le conseguenze dichiarate.

Esempi tipici, per agente:

| Agente | Domanda tipica |
|---|---|
| `asta-due-diligence` | "L'immobile è occupato e la liberazione può valere 8–14 mesi. Accetti quel tempo, o è discriminante?" |
| `mercato-scandicci` | "Non ho comparabili realizzati per questa zona, solo fasce OMI larghe. Contatto due agenzie, o procedo con confidenza bassa?" |
| `geometra` | "La perizia non riporta lo stato dell'impianto elettrico. Alzo gli imprevisti al 30%, o vale un sopralluogo tecnico prima dell'asta?" |
| `architetto` | "Ridistribuendo si ricava un secondo bagno: +14.000 € di costo. Il mercato di zona lo paga? Vuoi che verifichi prima di procedere?" |
| `roi-analista` | "A 92.000 € il ROI prudente è 10,9%, sotto la tua soglia del 15%. Confermi la soglia o la rivedi per questo lotto?" |
| `revisore` | "Tre parametri sono stimati e non verificati e pesano per il 40% del costo. Procedo segnando confidenza bassa, o li verifichiamo?" |

---

## Cosa non chiedere

- **Dati che sono nei documenti.** Chiedere il prezzo base quando è
  nell'avviso fa perdere fiducia nel sistema.
- **Domande a risposta unica.** "Vuoi che l'analisi sia accurata?" Sì. Inutile.
- **Conferme di cose già decise nel profilo**, salvo che questo lotto sia
  un'eccezione dichiarata.
- **Dettagli tecnici che sono compito degli agenti.** "Che aliquota IVA
  applichiamo ai lavori?" non è una domanda per il decisore: è in
  `fiscalita-e-costi.md`.
- **Più di 4 domande in un colpo.**

## Quando smettere di chiedere e produrre

Quando hai: **intento**, **soglia di ROI**, **livello di intervento** e
**profondità richiesta**, hai abbastanza. Il resto si scopre analizzando.

Se il decisore non risponde a una domanda, **non ti blocchi**: assumi il caso
peggiore plausibile, **dichiara l'assunzione in testa al risultato**, e vai
avanti. Un'analisi con un'assunzione scritta vale molto più di una domanda
rimasta in sospeso.
