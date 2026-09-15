# Progetto "Flipping Aste Scandicci" — Documento di sintesi

**Impianto:** PMBOK, scalato a un'operazione immobiliare singola a decisore unico.
**Versione:** 1.0 — settembre 2026
**Perimetro geografico:** Comune di Scandicci (FI) — Tribunale di Firenze

> **Natura di questo documento.** È il *template di progetto* dell'operazione:
> fasi, task, costi, rischi e punti di decisione. Le cifre del **caso di
> riferimento** sono calcolate con `strumenti/roi.py` su parametri **illustrativi**
> (vedi §4): servono a mostrare la struttura economica e gli ordini di grandezza,
> **non sono la valutazione di un immobile reale**. Ogni lotto vero apre la sua
> cartella in `valutazioni/<riferimento>/` con i suoi numeri.
>
> Le voci fiscali e normative sono in `riferimenti/fiscalita-e-costi.md`, con
> l'indicazione di cosa va riverificato ad ogni operazione.

---

## Indice

1. [Project charter](#1-project-charter)
2. [Stakeholder e ruoli](#2-stakeholder-e-ruoli)
3. [WBS — fasi, task, deliverable](#3-wbs--fasi-task-deliverable)
4. [Baseline dei costi](#4-baseline-dei-costi)
5. [Calendario e vincoli temporali](#5-calendario-e-vincoli-temporali)
6. [Registro dei rischi](#6-registro-dei-rischi)
7. [Stage gate — i punti di uscita](#7-stage-gate--i-punti-di-uscita)
8. [Qualità e approvvigionamenti](#8-qualità-e-approvvigionamenti)
9. [Monitoraggio e controllo](#9-monitoraggio-e-controllo)
10. [Chiusura](#10-chiusura)
11. [Limiti dichiarati del piano](#11-limiti-dichiarati-del-piano)

---

## 1. Project charter

### 1.1 Business case
Acquisire immobili residenziali in vendita forzata nel Comune di Scandicci a un
prezzo significativamente inferiore al valore di mercato del ristrutturato,
riqualificarli e rivenderli, realizzando un margine sul capitale investito
superiore a quello di impieghi alternativi a rischio comparabile.

La leva economica dell'operazione è **lo sconto in acquisto**, non
l'apprezzamento del mercato. Se il conto regge solo ipotizzando che i prezzi
salgano, il progetto non ha un business case: ha una scommessa.

### 1.2 Obiettivi e criteri di successo

| Obiettivo | Metrica | Soglia | Come si misura |
|---|---|---|---|
| Redditività | ROI su capitale proprio, **scenario prudente** | **≥ 15%** | output di `roi.py` |
| Redditività annualizzata | ROI annualizzato, scenario prudente | **≥ 12%** | output di `roi.py` |
| Durata | dall'aggiudicazione all'incasso | **≤ 18 mesi** | calendario di progetto |
| Capitale | esposizione massima di capitale proprio | **≤ soglia definita dal decisore** | profilo di cassa, §5.3 |
| Margine di sicurezza | scarto tra prezzo di uscita atteso e di pareggio | **≥ 12%** | output di `roi.py` |

> **La soglia di ROI del charter determina il prezzo massimo d'asta.** Non è una
> dichiarazione d'intenti: è l'input di `offerta_massima()`. Alzare la soglia
> abbassa il tetto d'offerta e riduce il numero di lotti aggredibili. È una
> scelta di posizionamento da fare **prima** di guardare gli immobili, quando
> non ci si è ancora affezionati a nessuno.

### 1.3 Perimetro

**Dentro:** immobili residenziali (appartamenti e piccole unità indipendenti)
in procedura esecutiva o concorsuale nel Comune di Scandicci; piena proprietà;
ristrutturazione finalizzata alla rivendita; vendita a privati.

**Fuori:** terreni, box e cantine isolati, immobili commerciali e produttivi;
quote indivise; immobili con locazione opponibile di durata residua
significativa; abusi non sanabili; acquisto tramite società (richiede un piano
fiscale diverso — vedi §11); locazione come strategia di uscita.

### 1.4 Vincoli

| Vincolo | Natura | Implicazione |
|---|---|---|
| **Saldo prezzo entro il termine dell'avviso** (tipicamente 120 giorni, non prorogabile) | **Duro, legale** | Mancarlo = perdita della cauzione **e** dell'immobile. Governa tutto il piano finanziario |
| Offerta minima ≥ 75% del prezzo base (art. 571 c.p.c.) | Duro, legale | Se il tetto economico è sotto, il lotto non è aggredibile |
| Cauzione ≥ 10% dell'offerta, a rischio | Duro, finanziario | Immobilizzata prima di sapere l'esito |
| Capitale proprio disponibile | Duro | Definisce la fascia di prezzo accessibile |
| Tempi di liberazione non controllabili | Morbido, esogeno | Rischio R1, §6 |
| Tempi della pubblica amministrazione (pratiche edilizie) | Morbido, esogeno | Vanno messi nel calendario, non sperati |

### 1.5 Assunzioni
1. Le quotazioni di uscita si stimano a **prezzi correnti**, senza apprezzamento.
2. La riserva per imprevisti sui lavori è **≥ 15%**, elevata a **20–30%** su
   immobili ante-1970, senza documentazione impianti, o non ispezionati dal CTU.
3. L'operazione è infra-quinquennale: **la plusvalenza è tassata** (26% in
   imposta sostitutiva) e sta nel conto dal primo giorno.
4. L'acquisto è di **persona fisica**, non di società.
5. Le detrazioni fiscali per ristrutturazione **non entrano** nel piano di cassa
   (si recuperano in 10 anni, l'immobile si vende prima).

### 1.6 Criteri di abbandono
Il progetto si ferma, su un lotto o in generale, se:
- il ROI prudente scende sotto la soglia del charter e non risale con azioni concrete;
- emerge un abuso **non sanabile**;
- il termine di saldo diventa non rispettabile;
- la liberazione supera i mesi ipotizzati oltre il margine di contingenza;
- tre tornate d'asta consecutive non producono lotti oltre soglia → si rivede il
  perimetro (zona, tipologia, soglia di ROI), non si abbassa la disciplina.

---

## 2. Stakeholder e ruoli

| Ruolo | Chi | Responsabilità | Quando entra |
|---|---|---|---|
| **Sponsor / decisore** | il proprietario del capitale | Approva charter, soglie, ogni gate. Decide i rilanci | sempre |
| **Project manager** | agente `pm-progetto` + decisore | Artefatti, avanzamento, gate | F0 |
| **Analisi economica** | agente `roi-analista` + `roi.py` | Modello, soglia d'asta, sensibilità | F4 |
| **Due diligence** | agente `asta-due-diligence` + **legale** | Rischi legali e occupativi | F3 |
| **Mercato** | agente `mercato-scandicci` + **agenzie locali** | Prezzo e tempi di uscita | F1, F4 |
| **Tecnico** | **geometra o architetto** + `cantiere-stima` | Sopralluogo, computo, pratiche, DL | F3, F8 |
| **Impresa esecutrice** | da selezionare | Lavori | F8 |
| **Legale esecuzioni** | da individuare | Liberazione, opposizioni | F3, F7 |
| **Commercialista** | da individuare | Regime fiscale, plusvalenza | F0, F10 |
| **Agenzia immobiliare** | da selezionare | Commercializzazione | F9 |

**Controparti non controllabili** — non sono fornitori, non rispondono a te, e i
loro tempi sono un rischio, non una variabile di piano:

| Controparte | Ruolo | Perché conta |
|---|---|---|
| **Professionista delegato** | Gestisce la vendita, quantifica le spese di trasferimento | Interlocutore unico post-aggiudicazione |
| **Custode giudiziario** | Visite, esecuzione dell'ordine di liberazione | Determina i tempi di F7 |
| **Amministratore di condominio** | Arretrati, delibere di lavori | Fonte dell'esposizione ex art. 63 disp. att. c.c. |
| **Debitore esecutato / occupanti** | — | Determinano la durata e il costo di F7 |

> **Gli agenti non sostituiscono i professionisti.** Preparano il lavoro, lo
> strutturano e lo rendono verificabile. La firma su una due diligence legale,
> su un computo e su un regime fiscale la mette una persona con una
> responsabilità professionale.

---

## 3. WBS — fasi, task, deliverable

Undici fasi. Le F2–F4 sono **cicliche**: si ripetono su ogni lotto candidato e
la grande maggioranza dei cicli finisce in uno scarto. È il funzionamento
normale, non un fallimento.

### F0 — Avvio e governance *(una volta, ~2 settimane)*

| # | Task | Deliverable | Responsabile |
|---|---|---|---|
| F0.1 | Definire soglie di ROI, durata e capitale | Charter approvato | Sponsor |
| F0.2 | Accertare il capitale disponibile e i tempi di liquidità | Profilo di cassa | Sponsor |
| F0.3 | Impostare il regime fiscale (persona fisica vs società) | Parere del commercialista | Commercialista |
| F0.4 | Individuare legale, tecnico, commercialista | Rubrica dei fornitori | PM |
| F0.5 | Verificare l'accesso alle fonti (PVP, OMI, gestori) | Monitoraggio attivo | PM |
| F0.6 | Definire la strategia di finanziamento | Piano finanziario | Sponsor |

**Gate G0:** charter approvato, capitale confermato, regime fiscale chiarito.

### F1 — Intelligence di mercato *(una volta, ~3 settimane; poi aggiornamento trimestrale)*

| # | Task | Deliverable |
|---|---|---|
| F1.1 | Mappare le zone omogenee OMI di Scandicci | Mappa delle zone con fasce €/mq |
| F1.2 | Rilevare i valori del ristrutturato per zona e tipologia | Tabella di riferimento |
| F1.3 | Stimare i tempi di assorbimento per segmento | Tempi medi per zona |
| F1.4 | Raccogliere comparabili **realizzati** da 2–3 agenzie | Archivio comparabili |
| F1.5 | Rilevare le fasce €/mq di ristrutturazione da imprese locali | Fasce di costo |
| F1.6 | Definire il profilo del lotto target | Criteri di screening |

**Gate G1:** perimetro operativo definito con dati, non con impressioni.

### F2 — Ricerca e screening *(ciclica, continua)*

| # | Task | Deliverable |
|---|---|---|
| F2.1 | Monitorare le pubblicazioni (skill `monitora-aste`) | Lista candidati |
| F2.2 | Scaricare avviso, perizia, ordinanza per lotto | Fascicolo documenti |
| F2.3 | Pre-filtro economico | Passa / scarta con ragione |
| F2.4 | Aggiornare il registro `monitoraggio/visti.md` | Storico |

### F3 — Due diligence *(ciclica, 2–4 settimane per lotto)*

| # | Task | Deliverable | Note |
|---|---|---|---|
| F3.1 | Analisi della perizia del CTU | Estrazione rischi | agente + revisione umana |
| F3.2 | Verifica dello stato occupativo | Mesi e costo di liberazione | **il task più importante** |
| F3.3 | Relazione notarile: conteggio dei gravami | Elenco iscrizioni da cancellare | costo *per iscrizione* |
| F3.4 | Conformità urbanistica e catastale | Sanabile / non sanabile | soglia di scarto |
| F3.5 | Contatto con l'amministratore | Arretrati + **lavori deliberati** | voce spesso assente dalla perizia |
| F3.6 | **Visita con il custode** | Verbale di sopralluogo | insostituibile |
| F3.7 | Condizioni dell'avviso di vendita | Termini, cauzione, oneri | vincolo di cassa |
| F3.8 | Sopralluogo tecnico | Note per il computo | se l'accesso è possibile |

**Gate G2:** il lotto supera la due diligence, o si scarta.

### F4 — Valutazione e strategia d'offerta *(ciclica, ~1 settimana)*

| # | Task | Deliverable |
|---|---|---|
| F4.1 | Stima del prezzo di uscita, tre scenari | Forchetta con fonti |
| F4.2 | Computo dei lavori per capitoli | Costo con intervallo |
| F4.3 | Riconciliazione dei parametri (superfici, doppi conteggi, durate) | `parametri.json` |
| F4.4 | Esecuzione del modello sui tre scenari | Output di `roi.py` |
| F4.5 | Analisi di sensibilità | Griglia + lettura |
| F4.6 | Calcolo dell'offerta massima e **confronto col 75% del base** | Soglia, aggredibile o no |
| F4.7 | Verifica della disponibilità di cassa entro il termine di saldo | Conferma finanziaria |

**Gate G3 — GO / NO-GO D'ASTA.** Il più importante del progetto: è l'ultimo
punto in cui si esce a costo quasi nullo. La soglia di rilancio si scrive
**prima** di entrare in asta.

### F5 — Partecipazione all'asta *(1–2 settimane)*

| # | Task | Deliverable |
|---|---|---|
| F5.1 | Registrazione al portale telematico | Iscrizione attiva |
| F5.2 | Versamento della cauzione | Ricevuta |
| F5.3 | Presentazione dell'offerta | Offerta depositata |
| F5.4 | Partecipazione ai rilanci **entro la soglia scritta** | Esito |
| F5.5 | Se aggiudicato: verbale | Verbale di aggiudicazione |
| F5.6 | Se non aggiudicato: registrare il prezzo di aggiudicazione altrui | Dato di mercato |

> **La regola di F5.4 è l'intero senso del progetto.** Il rilancio è l'unico
> momento in cui la disciplina va tenuta sotto pressione emotiva e a tempo. Il
> numero è stato calcolato a mente fredda: in asta non si ricalcola.
>
> F5.6 non è un premio di consolazione: i prezzi di aggiudicazione altrui sono
> il miglior dato di mercato esistente su quelle zone, e vanno nell'archivio.

### F6 — Saldo e trasferimento *(entro il termine dell'avviso — vincolo duro)*

| # | Task | Deliverable |
|---|---|---|
| F6.1 | Attivare la liquidità o il finanziamento | Fondi disponibili |
| F6.2 | Quantificare le spese di trasferimento col delegato | Prospetto |
| F6.3 | Scegliere il regime fiscale (incl. **prezzo-valore**, se applicabile) | Istanza al delegato |
| F6.4 | Versare il saldo **entro il termine** | Quietanza |
| F6.5 | Ottenere il decreto di trasferimento | Decreto |
| F6.6 | Seguire la cancellazione dei gravami | Gravami cancellati |
| F6.7 | Domanda di sanatoria, se serve — **entro 120 giorni dal decreto** | Domanda depositata |
| F6.8 | Intestazioni: catasto, IMU, condominio, utenze | Pratiche fatte |

**Gate G4:** proprietà acquisita, gravami in cancellazione.

### F7 — Liberazione *(0–18 mesi — la fase a varianza più alta)*

| # | Task | Deliverable |
|---|---|---|
| F7.1 | Verificare lo stato dell'ordine di liberazione | Stato |
| F7.2 | Valutare l'accordo per l'uscita volontaria | Accordo o via forzosa |
| F7.3 | Seguire l'esecuzione con il custode | Verbale di immissione |
| F7.4 | Presa in consegna, cambio serrature, messa in sicurezza | Immobile disponibile |
| F7.5 | Rilevare i costi di mantenimento del periodo | Consuntivo |

> Se l'immobile è **libero**, questa fase non esiste e il progetto guadagna mesi
> di ROI annualizzato. Vale un premio di prezzo in sede d'asta, e va quantificato
> nel modello, non intuito.
>
> L'accordo per l'uscita volontaria (F7.2) è quasi sempre più economico
> dell'esecuzione forzosa: un contributo al debitore che vale 4 mesi di attesa
> costa meno dei 4 mesi.

### F8 — Ristrutturazione *(3–8 mesi)*

| # | Task | Deliverable |
|---|---|---|
| F8.1 | Progetto e scelta del livello di intervento | Progetto |
| F8.2 | Pratiche edilizie (CILA / SCIA / permesso) | Titolo abilitativo |
| F8.3 | Computo metrico e capitolato | Capitolato per le gare |
| F8.4 | **Almeno due preventivi sullo stesso capitolato** | Preventivi confrontabili |
| F8.5 | Contratto d'appalto con penali e SAL | Contratto firmato |
| F8.6 | Esecuzione e direzione lavori | SAL |
| F8.7 | Varianti: solo se approvate contro la contingenza | Registro delle varianti |
| F8.8 | Collaudi, certificazioni impianti, **APE** | Certificazioni |
| F8.9 | Aggiornamento catastale | Catasto allineato |

**Gate G5** *(prima di firmare l'appalto)*: preventivi contro baseline. Se lo
sforo erode il ROI sotto la soglia del charter, si rivede l'ambito dei lavori —
non si firma sperando.

### F9 — Commercializzazione e vendita *(2–8 mesi)*

| # | Task | Deliverable |
|---|---|---|
| F9.1 | Fissare il prezzo di listino sul dato di mercato aggiornato | Prezzo |
| F9.2 | Fotografie, planimetrie, home staging | Materiale |
| F9.3 | Mandato all'agenzia (o vendita diretta) | Mandato |
| F9.4 | Gestione visite e trattative | Proposte |
| F9.5 | Accettazione della proposta e preliminare | Preliminare |
| F9.6 | Rogito | Atto |
| F9.7 | Opzione **imposta sostitutiva 26%** dichiarata **in atto** | Opzione esercitata |

**Gate G6** *(dopo 3 mesi di invenduto)*: il prezzo è fuori mercato o il
prodotto non corrisponde? Decisione su prezzo, canale o strategia di uscita
alternativa. **Non si aspetta passivamente**: ogni mese di invenduto ha un costo
misurabile.

> F9.7 va detto al notaio **durante l'atto**. È un'opzione che si esercita in
> quel momento e non si recupera dopo. Dimenticarla su un margine di 30.000 euro
> costa migliaia di euro di differenza fra sostitutiva e IRPEF progressiva.

### F10 — Chiusura *(1 mese)*

| # | Task | Deliverable |
|---|---|---|
| F10.1 | Consuntivo economico contro baseline | Conto economico finale |
| F10.2 | Dichiarazione e versamento della plusvalenza | Adempimenti |
| F10.3 | Calcolo del ROI realizzato contro previsto | Scostamenti |
| F10.4 | **Lezioni apprese**, con taratura dei parametri del modello | Documento |
| F10.5 | Aggiornare le fasce di costo e prezzo per il ciclo successivo | Riferimenti aggiornati |

**Gate G7:** progetto chiuso, parametri del modello tarati sul dato reale.

> F10.4 è la fase che rende il secondo progetto migliore del primo. Lo scarto tra
> €/mq preventivato e consuntivato, tra mesi stimati e reali, tra prezzo atteso e
> rogitato: sono i tre numeri che tarano `roi.py` per il ciclo successivo.

---

## 4. Baseline dei costi

### 4.1 Caso di riferimento

Parametri illustrativi, non un immobile reale:
trilocale **70 mq**, prezzo base **120.000 €**, aggiudicazione ipotizzata
**92.000 €** (76,7% del base, sopra il minimo di legge di 90.000 €), lavori
**600 €/mq**, immobile **occupato dal debitore**, acquisto da persona fisica
senza leva finanziaria.

File: `valutazioni/caso-riferimento/parametri-prudente.json`
Comando: `python3 strumenti/roi.py valutazioni/caso-riferimento/parametri-prudente.json --sensibilita --offerta-massima 0.20`

### 4.2 Budget per fase — scenario centrale

| Fase | Voce | Importo € | Tipo |
|---|---|---|---|
| F0–F1 | Avvio, consulenze iniziali, dati di mercato | 1.000 – 2.500 | Costo di progetto |
| F2 | Ricerca e documenti (per lotto) | 0 – 300 | Costo di progetto |
| F3 | Due diligence (per lotto: accessi, visure, tecnico) | 800 – 2.500 | Costo di progetto |
| F5 | Cauzione 10% | 9.200 | *Anticipo, non costo* |
| F6 | **Prezzo di aggiudicazione** | 92.000 | Investimento |
| F6 | Imposte di acquisto (registro 9% + fisse) | 8.380 | Investimento |
| F6 | Oneri accessori (delegato, trasferimento, gravami) | 5.700 | Investimento |
| | **Totale acquisto** | **106.080** | |
| F7 | Liberazione (legale, custode, accordo) | 5.000 | Costo |
| F7–F9 | Mantenimento (IMU, condominio, utenze) + arretrati | 5.575 | Costo |
| | **Totale mantenimento e liberazione** | **10.575** | |
| F8 | Lavori nudi (600 €/mq × 70) | 42.000 | Investimento |
| F8 | Riserva imprevisti (15%) | 6.300 | **Contingenza dichiarata** |
| F8 | IVA sui lavori (10%) | 4.830 | Investimento |
| F8 | Tecnico (10% + IVA 22%) | 5.124 | Investimento |
| F8 | Oneri e pratiche | 6.000 | Investimento |
| | **Totale ristrutturazione** | **64.254** | |
| F9 | Provvigione agenzia (3% + IVA) + marketing | 10.711 | Costo |
| | **COSTO TOTALE DI PROGETTO** | **191.620** | |
| F10 | Imposta su plusvalenza (26%) | 14.808 | Costo fiscale |

### 4.3 Conto economico e rendimento

| | Prudente | Centrale | Ottimista |
|---|---|---|---|
| Prezzo di uscita | 225.000 | 238.000 | 250.000 |
| Costo totale | 194.069 | 191.620 | 189.134 |
| **Utile netto** | **19.980** | **31.572** | **42.451** |
| ROI su capitale | 10,9% | 17,5% | 23,9% |
| ROI annualizzato | 7,1% | 13,7% | 23,9% |
| Durata (mesi) | 18 | 15 | 12 |
| Prezzo di pareggio | 196.975 | 193.714 | 190.454 |
| Margine di sicurezza | 12,5% | 18,6% | 23,8% |
| Offerta massima per ROI 15% *(soglia charter)* | **84.170** | 96.572 | 108.239 |
| Offerta massima per ROI 20% | 75.616 | 87.501 | 98.690 |

Differenze fra scenari: prezzo di uscita, durata (18 / 15 / 12 mesi) e riserva
imprevisti (20% / 15% / 10%).

### 4.4 Cosa dice questo caso — la lettura scomoda

Il charter (§1.2) impone la soglia di **ROI ≥ 15% sullo scenario prudente**.
L'offerta minima di legge è **90.000 €** (75% di 120.000). Incrociando le due
cose:

| Scenario | ROI a 92.000 € | Offerta max per ROI 15% | Sopra il minimo di 90.000? |
|---|---|---|---|
| **Prudente** *(fa fede)* | **10,9%** | **84.170** | **no** |
| Centrale | 17,5% | 96.572 | sì |
| Ottimista | 23,9% | 108.239 | sì |

**Verdetto: lotto da scartare.** Sullo scenario prudente il tetto d'offerta
compatibile col charter è 84.170 €, cioè **sotto il minimo di legge**: non
esiste un'offerta ammissibile che rispetti la disciplina del progetto.

Il lotto sembra funzionare solo se si legge il verdetto sullo scenario centrale —
ed è esattamente il modo in cui queste operazioni si sbagliano. Il centrale non
è il caso "realistico": è il caso in cui *tutto va come previsto* — mercato che
tiene i 238.000 €, liberazione in 5 mesi, cantiere entro il 15% di imprevisti.
Tre cose insieme, su un immobile occupato comprato a scatola chiusa.

A ritroso, il numero utile: perché questo lotto passasse il charter, il prezzo
base dovrebbe essere **al massimo ~112.000 €** (perché il 75% cada sotto gli
84.170 € di tetto). A 120.000 € di base **non c'è spazio**, e nessuna trattativa
può crearlo: in asta il pavimento è di legge.

Quattro conclusioni strutturali, valide oltre il caso:

1. **Lo scenario su cui si legge il verdetto conta più dei numeri.** Lo stesso
   lotto, stessi dati, è da scartare sul prudente e interessante sul centrale.
   È la ragione per cui la regola va fissata nel charter in F0, prima di vedere
   gli immobili.
2. **La soglia di ROI determina il tetto d'offerta.** Fra il 15% e il 20% il
   tetto si muove di 8.500 € sul prudente. È una scelta di posizionamento, non
   un'aspirazione.
3. **Il 75% del prezzo base taglia fuori la maggior parte dei lotti.** Quando il
   prezzo base è ancora vicino al mercato non c'è margine da prendere. I lotti
   aggredibili sono tipicamente al secondo o terzo esperimento — e lì il ribasso
   ha una causa, che va trovata in perizia prima di considerarla un'occasione.
4. **La plusvalenza al 26% si mangia circa un terzo del margine lordo**
   (14.808 € su 46.380 € di utile ante imposta, scenario centrale). Un modello
   che la ignora sovrastima il rendimento di metà.

> Questo caso di riferimento è costruito su parametri **plausibili ma
> ordinari**: prezzo base non particolarmente basso, immobile occupato, lavori
> a 600 €/mq. Il risultato — scartare — è l'esito normale. Un sistema di
> valutazione che approvasse un lotto così non servirebbe a niente.

### 4.5 Riserve

| Riserva | Importo | Governata da | Dove sta |
|---|---|---|---|
| **Contingenza** (rischi noti: imprevisti di cantiere) | 6.300 € (15% dei lavori) | PM, entro l'ambito | **dentro** il modello ROI |
| **Riserva di gestione** (ignoto: allungamento della liberazione, sforo di durata) | ~9.500 € (5% del costo totale) | Sponsor, fuori ambito | **fuori** dal modello ROI |

> **Divergenza dichiarata.** La riserva di gestione non è nel modello ROI: il
> budget di progetto è quindi più prudente dell'output di `roi.py` di circa
> 9.500 €. È una scelta, non una dimenticanza. Se la riserva viene consumata,
> il ROI reale scende sotto quello modellato di circa 5 punti percentuali.

### 4.6 Il costo che il modello ROI non vede: il tasso di successo

`roi.py` valuta **un lotto**. Ma le fasi F2–F4 si ripetono su molti lotti e
si spende su ognuno anche quando si scarta o non si aggiudica.

Con un tasso di aggiudicazione realistico di **1 lotto su 5–8 istruiti**, i
costi di due diligence dei cicli a vuoto si caricano sull'operazione riuscita:

| | Costo |
|---|---|
| Due diligence per lotto (F2+F3) | 800 – 2.800 € |
| Cicli a vuoto per un'aggiudicazione | 4 – 7 |
| **Carico da ammortizzare sul lotto vinto** | **3.200 – 19.600 €** |

Su un utile centrale di 31.572 €, il caso peggiore è **oltre il 60% del
margine**. È la ragione per cui il pre-filtro di F2.3 deve essere severo: ogni
due diligence completa su un lotto che si scarterà è margine bruciato
sull'operazione che verrà.

**Conseguenza pratica:** una due diligence completa si apre solo dopo il
pre-filtro economico, mai "per curiosità". E il verdetto negativo va dato il
prima possibile, non il più accuratamente possibile.

---

## 5. Calendario e vincoli temporali

### 5.1 Durata complessiva

| Fase | Ottimista | Centrale | Prudente |
|---|---|---|---|
| F0–F1 (una volta) | 3 sett. | 5 sett. | 8 sett. |
| F2–F4 (per lotto) | 3 sett. | 5 sett. | 8 sett. |
| F5 asta | 1 sett. | 2 sett. | 2 sett. |
| F6 saldo e trasferimento | 6 sett. | 12 sett. | **17 sett. (limite)** |
| F7 liberazione | 0 | 5 mesi | 12 mesi |
| F8 ristrutturazione | 3 mesi | 5 mesi | 8 mesi |
| F9 vendita | 2 mesi | 4 mesi | 8 mesi |
| F10 chiusura | 2 sett. | 4 sett. | 6 sett. |
| **Dall'aggiudicazione all'incasso** | **~10 mesi** | **~15 mesi** | **~24 mesi** |

Lo scenario prudente sfonda il vincolo di durata del charter (18 mesi): la
combinazione di liberazione lunga e mercato lento è il modo tipico in cui un
flipping all'asta si trasforma in un immobilizzo. Se si materializza, G6
diventa una decisione seria, non una formalità.

### 5.2 Percorso critico

```
F3.2 stato occupativo ──┐
F4.4 modello ───────────┼─→ G3 GO/NO-GO ─→ F5 asta ─→ F6 SALDO ⚠ ─→ F7 liberazione ⚠
F4.7 conferma cassa ────┘                                                    │
                                                                             ▼
                          F10 ←── F9 vendita ⚠ ←── F8 ristrutturazione ←─────┘
```

Tre punti critici (⚠):

**F6 — il saldo.** Vincolo **duro**: se i fondi non ci sono entro il termine, si
perdono cauzione e immobile. Non ha mitigazione a posteriori: la liquidità va
verificata **prima** dell'offerta (task F4.7), non dopo l'aggiudicazione.

**F7 — la liberazione.** Il punto a varianza maggiore e fuori dal tuo controllo.
Non comprime il percorso critico con più risorse: si può solo negoziare.

**F9 — la vendita.** Varianza alta e non accorciabile con la spesa. Il prezzo di
listino si fissa sul dato di mercato di quel momento, non su quello del business
case di un anno prima.

### 5.3 Profilo di cassa — la parte che si sottovaluta

Il capitale non serve tutto insieme. Serve **in un ordine preciso e stretto**:

| Momento | Uscita | Cumulato |
|---|---|---|
| Prima dell'asta | Cauzione 10% | 9.200 |
| Entro il termine di saldo | Saldo + imposte + oneri | 106.080 |
| Durante F7 | Liberazione + mantenimento | ~112.000 |
| F8, per SAL | Lavori a stato di avanzamento | ~176.000 |
| F9 | Marketing, provvigione al rogito | **~181.000 (picco)** |
| Rogito | **Incasso** | −238.000 |
| F10 | Plusvalenza | +14.808 |

**Picco di esposizione: ~181.000 €** su un'operazione da 92.000 € di
aggiudicazione. È il numero da confrontare col capitale disponibile — non il
prezzo dell'immobile.

Il tratto duro è fra la cauzione e il saldo: **poche settimane per mobilitare
oltre 100.000 €**. Se la liquidità dipende da un finanziamento, l'istruttoria
va **aperta prima dell'asta**, non dopo l'aggiudicazione.

---

## 6. Registro dei rischi

Probabilità e impatto: A alta, M media, B bassa.
Impatto economico riferito al caso di §4.

| # | Rischio | Fase | P | I | Impatto | Risposta | Residuo |
|---|---|---|---|---|---|---|---|
| **R1** | Liberazione più lunga del previsto | F7 | **A** | **A** | 6–12 mesi, 8.000–20.000 € fra costi e ROI perso | Prezzare i mesi nel modello; accordo per uscita volontaria; legale ingaggiato prima dell'asta | **Alto** — non eliminabile |
| **R2** | Sforo dei costi di lavori | F8 | **A** | M | 10–30% dei lavori | Due preventivi sullo stesso capitolato; contingenza 15–30%; contratto con penali e SAL; nessuna variante senza approvazione | Medio |
| **R3** | Prezzo di uscita inferiore all'atteso | F9 | M | **A** | 10–15% del ricavo | Verdetto sullo scenario prudente; margine di sicurezza ≥ 12%; comparabili realizzati | Medio |
| **R4** | Abuso edilizio non emerso o non sanabile | F3, F6 | M | **A** | Immobile non rivendibile | Verifica urbanistica come **criterio di scarto**; tecnico sui documenti prima dell'asta; 120 giorni per la sanatoria | Basso se F3.4 è fatto bene |
| **R5** | **Mancato saldo nel termine** | F6 | B | **Massimo** | Perdita di cauzione + immobile | F4.7 obbligatoria prima dell'offerta; istruttoria aperta prima dell'asta; liquidità confermata | Basso, ma **catastrofico** |
| **R6** | Lavori condominiali deliberati non rilevati | F3, F8 | M | M | 5.000–40.000 € | Contatto con l'amministratore + ultimi 3 verbali di assemblea (F3.5) | Basso |
| **R7** | Gravami più numerosi del previsto | F6 | M | B | 500–3.000 € | Relazione notarile letta e iscrizioni **contate** | Basso |
| **R8** | Rilancio oltre la soglia in sede d'asta | F5 | **A** | **A** | Erosione o azzeramento del margine | Soglia scritta **prima**; nessun ricalcolo in asta; se possibile, chi rilancia non è chi si è affezionato al lotto | **Da presidiare** — rischio comportamentale, non tecnico |
| **R9** | Vendita lenta oltre i mesi previsti | F9 | M | M | 500–800 €/mese + ROI annualizzato | Prezzo sul dato corrente; gate G6 a 3 mesi | Medio |
| **R10** | Mercato di Scandicci in flessione | F8–F9 | B | **A** | 5–15% del ricavo | Nessun apprezzamento nelle assunzioni; durata contenuta; margine di sicurezza | Medio — esogeno |
| **R11** | Stato reale peggiore della perizia | F3, F8 | M | M | 10–25% dei lavori | Visita con il custode (F3.6); imprevisti al 25–30% se non ispezionato | Medio |
| **R12** | Vizio fiscale (regime sbagliato, sostitutiva dimenticata) | F6, F9 | B | M | 3.000–15.000 € | Commercialista in F0; prezzo-valore valutato in F6.3; **opzione 26% dichiarata in atto** (F9.7) | Basso |
| **R13** | Aggiudicazione a un rilancio superiore di terzi | F5 | **A** | B | Costo di due diligence perso | Accettato: è il modello di business (§4.6). Registrare il prezzo altrui come dato di mercato | Accettato |
| **R14** | Opposizione o sospensione della procedura | F5–F6 | B | **A** | Blocco, capitale immobilizzato | Verificare i contenziosi in F3; legale sulla regolarità della procedura | Basso |

### I due rischi da guardare per primi

**R1 (liberazione)** è il rischio strutturale dell'asta: alto in probabilità,
alto in impatto, e con un residuo che resta alto **dopo** tutte le mitigazioni.
Non si elimina — si prezza. La conseguenza operativa è che un immobile **libero**
vale un premio in sede d'asta, e quel premio si calcola col modello.

**R8 (rilancio oltre soglia)** è l'unico rischio interamente sotto il tuo
controllo e l'unico che nessuno strumento può presidiare al posto tuo. Tutto
questo impianto — gli agenti, il modello, i gate — produce un numero. Se in asta
quel numero viene superato "per una volta", l'impianto non è servito a niente.

---

## 7. Stage gate — i punti di uscita

Ogni gate è una decisione esplicita con un costo di uscita crescente.

| Gate | Quando | Domanda | Costo di uscita | Chi decide |
|---|---|---|---|---|
| **G0** | Fine F0 | Il capitale e il regime fiscale sono confermati? | ~0 | Sponsor |
| **G1** | Fine F1 | Il perimetro è definito su dati? | ~2.000 € | Sponsor |
| **G2** | Fine F3 | Il lotto supera la due diligence? | 800–2.800 € | PM + legale |
| **G3** | Fine F4 | **Si va in asta, e fino a quale cifra?** | 800–2.800 € | **Sponsor** |
| **G4** | Fine F6 | Proprietà acquisita, gravami in cancellazione? | *cauzione + immobile* | PM |
| **G5** | Prima dell'appalto | I preventivi tengono la baseline? | costo acquisto | Sponsor |
| **G6** | 3 mesi di invenduto | Prezzo, canale o strategia? | costo pieno | Sponsor |
| **G7** | Fine F10 | Consuntivo e lezioni apprese | — | PM |

### G3 è il gate che conta

Fino a G3 si esce per il costo di una due diligence. Dopo G3 — cioè dopo aver
versato la cauzione — si esce perdendo il 10% dell'offerta, e dopo
l'aggiudicazione non si esce più: si finisce l'operazione o si vende in perdita.

Per questo la qualità di tutto il sistema si misura su G3: quanti lotti sbagliati
ha fermato prima della cauzione.

### Dopo G4, la regola del costo affondato

Da G4 in avanti il capitale è impegnato e la tentazione è giustificare ogni spesa
aggiuntiva per "salvare l'operazione". La contabilità corretta guarda **il
residuo**: quanto serve da qui alla vendita, contro quanto si incasserà. Ciò che
è già stato speso non entra in nessuna decisione futura.

In termini operativi: a G5 e G6 si rieseguono `roi.py` **sui costi residui**, non
sul business case originario. Se il ROI sul residuo è negativo, la decisione
razionale è vendere allo stato in cui si è, anche in perdita sul totale.

---

## 8. Qualità e approvvigionamenti

### 8.1 Criteri di qualità

| Ambito | Criterio |
|---|---|
| Dati di mercato | Ogni €/mq con fonte, data e confidenza. Comparabili realizzati preferiti alle richieste |
| Modello economico | Solo output di `roi.py`. `test_roi.py` verde prima di usare i risultati |
| Due diligence | Ogni affermazione col riferimento a documento e pagina. Nessuna stima al posto di una verifica |
| Lavori | Capitolato scritto; due preventivi confrontabili; SAL con verifica; certificazioni complete |
| Documenti di progetto | Ogni costo riconciliato col modello. Se divergono, **il modello ha ragione** |

### 8.2 Approvvigionamenti

| Fornitura | Criterio | Contratto |
|---|---|---|
| Legale esecuzioni | Esperienza sul Tribunale di Firenze | A prestazione |
| Tecnico (geometra/architetto) | Pratiche a Scandicci, disponibilità per DL | Preventivo per fasi |
| Impresa | **Due preventivi sullo stesso capitolato**; referenze verificate; regolarità DURC | Appalto con SAL e penali di ritardo |
| Agenzia | Comparabili realizzati in zona; tempi medi di vendita dimostrati | Mandato a tempo, provvigione trattata |
| Commercialista | Competenza su plusvalenze immobiliari | A consulenza |

> Il preventivo unico è la prassi peggiore del settore: senza un secondo
> preventivo sullo **stesso** capitolato non esiste un prezzo di mercato, esiste
> un prezzo. Ed è per questo che F8.3 (capitolato) viene **prima** di F8.4:
> due preventivi su capitolati diversi non sono confrontabili.

---

## 9. Monitoraggio e controllo

### 9.1 Cadenza

| Cosa | Quando | Artefatto |
|---|---|---|
| Ricerca lotti | quotidiana / bisettimanale (skill `monitora-aste`) | `monitoraggio/visti.md` |
| Stato di progetto | settimanale in F6–F9 | `valutazioni/<rif>/stato.md` |
| Riesecuzione del modello | ad ogni variazione di parametro rilevante | output di `roi.py` |
| Riesame dei rischi | ad ogni gate + mensile in F7–F8 | `rischi.md` |
| Avanzamento lavori | ad ogni SAL | verbale di SAL |

### 9.2 Indicatori

| Indicatore | Formula | Allarme |
|---|---|---|
| **CV** — scostamento di costo | valore realizzato − costo effettivo | < −5% del budget di fase |
| **SV** — scostamento di tempo | valore realizzato − valore pianificato | > 1 mese sul percorso critico |
| **EAC** — stima a finire | costo effettivo + costo residuo stimato | EAC > baseline + contingenza |
| **ROI proiettato** | `roi.py` su costi effettivi + residui | < soglia del charter |
| Contingenza consumata | speso / contingenza | > 50% a metà cantiere |
| Mesi di invenduto | — | > 3 → gate G6 |

**L'indicatore che decide è l'ultimo ricalcolo del ROI proiettato.** CV e SV
dicono che qualcosa si è mosso; il ROI proiettato dice se conviene ancora. Su
un'operazione singola è la sola domanda che conta.

### 9.3 Gestione delle variazioni

1. Ogni variazione si registra con **data, causa, impatto su costo e tempo**.
2. Le varianti di cantiere si approvano **contro la contingenza**, non
   "a consuntivo". Una variante non approvata prima è uno sforo, non una variante.
3. Se l'impatto cumulato porta il ROI proiettato sotto la soglia del charter,
   si apre un gate **fuori calendario**.
4. Una baseline riscritta in silenzio non è una baseline: le revisioni si
   numerano e si datano.

---

## 10. Chiusura

### 10.1 Criteri di chiusura
- [ ] Rogito perfezionato e prezzo incassato
- [ ] **Opzione per l'imposta sostitutiva 26% dichiarata in atto** (se applicabile)
- [ ] Plusvalenza dichiarata e versata
- [ ] Fornitori saldati, garanzie e certificazioni consegnate all'acquirente
- [ ] Utenze e condominio intestati all'acquirente
- [ ] Consuntivo economico chiuso e confrontato con la baseline
- [ ] Documentazione archiviata (serve per 5 anni ai fini della plusvalenza)

### 10.2 Lezioni apprese — i numeri da tarare

Il valore di F10 è rendere il ciclo successivo più preciso. Tre scarti da
misurare e riportare nei riferimenti:

| Scarto | Effetto sul modello |
|---|---|
| €/mq preventivato vs consuntivato | ricalibra `costo_mq` e `imprevisti_pct` |
| Mesi stimati vs reali, per fase | ricalibra `mesi_totali` e `mesi_liberazione` |
| Prezzo atteso vs rogitato | ricalibra le fasce di `mercato-scandicci` |

Domande da rispondere per iscritto:
1. La soglia di ROI del charter era giusta, o ha escluso lotti che si sono
   rivelati buoni? (dal dato di F5.6: i prezzi di aggiudicazione altrui)
2. Il pre-filtro di F2.3 ha scartato bene? Quante due diligence complete sono
   finite in uno scarto che il pre-filtro poteva cogliere?
3. Quale rischio del registro si è materializzato, e la risposta ha funzionato?
4. Quale parametro del modello è stato il più sbagliato?

Aggiorna `riferimenti/fonti-dati.md` e `riferimenti/fiscalita-e-costi.md` con
quanto si è imparato. Se il modello va cambiato, si cambia con il test
(`test_roi.py`), non a mano sul foglio.

---

## 11. Limiti dichiarati del piano

Onestà su cosa questo impianto **non** copre:

1. **Acquisto tramite società.** Cambia tutto: IVA detraibile, immobile come
   merce, utile tassato come reddito d'impresa invece che plusvalenza,
   ammortamenti. `roi.py` non lo modella. Se l'operazione va lì, serve un piano
   fiscale rifatto con il commercialista.
2. **Portafoglio.** Il piano governa **un'operazione alla volta**. Operazioni in
   parallelo introducono concorrenza sul capitale, sul tempo e sugli stessi
   fornitori: serve un livello di programma, non di progetto.
3. **Locazione come uscita.** Il perimetro è la rivendita. Tenere e affittare è
   un altro business case, con altra fiscalità e altro orizzonte.
4. **Procedure non esecutive.** Aste concorsuali, fallimentari e concordatarie
   hanno regole in parte diverse. Il piano è tarato sulle esecuzioni
   immobiliari.
5. **Nessun parere professionale.** Norme e aliquote sono indicate con la loro
   fonte per essere **verificate**, non per essere applicate così come sono.
   Prima di un rilancio vincolante servono legale, tecnico e commercialista.
6. **Aliquote e regimi cambiano.** Tutto ciò che è marcato `[VERIFICARE]` in
   `riferimenti/fiscalita-e-costi.md` va riletto ad ogni operazione: la legge di
   bilancio muove le aliquote ogni anno.

---

## Appendice — mappa degli artefatti

```
flipping-scandicci/
├── PIANO-PROGETTO.md              questo documento
├── README.md                      come si usa la squadra di agenti
├── riferimenti/
│   ├── fiscalita-e-costi.md       norme, imposte, regole d'asta
│   └── fonti-dati.md              fonti e loro affidabilità
├── strumenti/
│   ├── roi.py                     il modello (unica fonte dei numeri)
│   ├── test_roi.py                l'oracolo del modello
│   └── esempio.json               parametri di esempio
├── valutazioni/<riferimento>/     una cartella per lotto
│   ├── parametri-{prudente,centrale,ottimista}.json
│   ├── charter.md  wbs.md  costi.md  rischi.md  stato.md
│   └── analisi.md                 il verdetto
└── monitoraggio/
    └── visti.md                   storico dei lotti esaminati
```

| Agente | Fase | Ruolo |
|---|---|---|
| `asta-scout` | F2 | Trova e screma i lotti |
| `asta-due-diligence` | F3 | Cosa si compra davvero |
| `mercato-scandicci` | F1, F4 | Prezzo e tempi di uscita |
| `cantiere-stima` | F4, F8 | Ambito e costo dei lavori |
| `roi-analista` | F4 | Modello, soglia d'asta, sensibilità |
| `pm-progetto` | tutte | Artefatti, avanzamento, gate |

| Skill | Uso |
|---|---|
| `/valuta-asta` | Valutazione completa di un lotto → soglia d'offerta |
| `/monitora-aste` | Sorveglianza ricorrente, pensata per `/loop` |
