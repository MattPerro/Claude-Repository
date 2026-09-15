# Flipping Aste Scandicci — squadra di agenti

Sistema multiagente conversazionale per valutare il ritorno di operazioni di
**flipping immobiliare su case all'asta nel Comune di Scandicci (FI)**, con
l'impianto di project management in `PIANO-PROGETTO.md`.

Non è un'app: è una **configurazione di Claude Code**. Si conversa normalmente,
e sono le skill a ingaggiare gli agenti specializzati quando serve.

---

## Come si usa

### Si parte da qui

```
/esperti          # dove sta il progetto, chi c'è, cosa puoi chiedere
/profilo          # l'intervista iniziale: capitale, ROI, orizzonte, intento
```

`/profilo` va fatto **prima di guardare gli immobili**. Le soglie fissate lì
determinano il prezzo massimo che potrai offrire in asta: un obiettivo di ROI
deciso davanti a una casa che piace non è un obiettivo, è una giustificazione.

### Valutare un lotto

```
/valuta-asta      # e poi incolli il link PVP o la perizia
```

oppure, in linguaggio naturale:

> *"ho trovato questa asta a Scandicci, conviene? fino a quanto posso offrire?"*

**Il flusso comincia con delle domande, non con un'analisi.** L'intervistatore
progetta il set minimo — intento, soglia di ROI, livello di intervento,
profondità — e solo dopo parte il fan-out. Poi il revisore controlla i referti,
il modello gira, e si chiude con **una cifra**: il prezzo oltre il quale si
smette di rilanciare.

### Monitorare le nuove pubblicazioni

```
/loop 1d /monitora-aste          # controllo giornaliero
/loop /monitora-aste             # auto-ritmato
```

Il loop tiene stato in `monitoraggio/visti.md` e segnala **solo** i lotti che
superano la soglia. Un giro senza segnalazioni è il risultato normale.

### Gestire l'operazione come progetto

> *"apri questo lotto come progetto"* → `pm-progetto` crea charter, WBS,
> baseline di costo e registro dei rischi in `valutazioni/<riferimento>/`.

### Calcolare a mano

```bash
# il conto economico completo di un lotto
python3 strumenti/roi.py valutazioni/caso-riferimento/parametri-centrale.json \
        --sensibilita --offerta-massima 0.15

# la soglia di screening: prezzo base max/mq per un obiettivo di ROI
python3 strumenti/soglie.py --uscita-mq 3200 --roi 0.20
```

---

## Il pool

| Esperto | Cosa fa | Non fa |
|---|---|---|
| `procacciatore` | Trova lotti su PVP con **stato verificato e attuale**; applica il filtro derivato dal modello | Non valuta la convenienza, non stima ROI |
| `intervistatore` | Progetta le domande da porti, compila il briefing per tutti gli altri | Non stima, non valuta |
| `asta-due-diligence` | Perizia, avviso, relazione notarile: occupazione, gravami, abusi, condominio | Non prezza i lavori |
| `mercato-scandicci` | Prezzo di rivendita e tempi per zona omogenea, tre scenari con fonti | Non dà un numero singolo |
| `geometra` | Computo per capitoli, conformità, catasto, pratiche, istruttoria in Comune | Non afferma cosa il Comune permetterà |
| `architetto` | Ridistribuzione e livelli alti: alternative e loro ritorno | Non entra su rinfrescate e straordinarie |
| `revisore` | Controlla i referti prima del modello, **può respingere** | Non produce stime proprie |
| `roi-analista` | Esegue il modello, sensibilità, soglia massima d'asta | **Non fa aritmetica a mente** |
| `pm-progetto` | Artefatti PMBOK: charter, WBS, baseline, rischi, gate | Non orchestra |
| `consulente-executive` | Una pagina per decidere; costo opportunità e concentrazione | Non rifà né contraddice i numeri |

### Due vincoli da conoscere

**Gli esperti non conversano tra loro.** Ricevono un incarico e restituiscono un
referto. La riconciliazione — superfici incoerenti, doppi conteggi, durate
incomplete — è il lavoro dell'orchestratore, cioè della sessione principale
guidata da `.claude/skills/valuta-asta/SKILL.md`.

**Gli esperti non possono farti domande direttamente.** Ognuno chiude il referto
con le sue *"Domande per il decisore"*; l'orchestratore le raccoglie, deduplica,
ordina per impatto e te le porta raggruppate, massimo 3–4 per volta. È il motivo
per cui esiste l'`intervistatore`: progetta le domande, l'orchestratore le pone.

Per la stessa ragione **l'orchestratore non è un agente**: un sottoagente non
può chiederti una decisione di gate. `pm-progetto` è l'archivista del progetto,
non il suo cervello.

---

## I tre principi su cui è costruito

### 1. I numeri escono da uno script, non dal linguaggio

`strumenti/roi.py` è l'unica fonte delle cifre economiche, e `strumenti/soglie.py`
deriva da esso le soglie di screening. Entrambi deterministici e coperti da test
(40 asserzioni in totale).

```bash
cd strumenti && python3 test_roi.py && python3 test_soglie.py
```

Il motivo: un loop agentico funziona quando esiste un criterio di verità
esterno. Su una valutazione economica quel criterio non è il consenso fra
agenti — è un calcolo ripetibile. Senza di esso, più iterazioni producono
solo cifre più convincenti, non più giuste.

Se il modello va cambiato, si cambia **con il test**: `roi.py` e `test_roi.py`
insieme, verde prima di usare i risultati.

### 2. Un numero senza fonte non entra in un documento

Ogni €/mq, ogni aliquota, ogni tempo porta fonte, data e livello di confidenza.
Quando un dato manca si scrive `[DA REPERIRE: cosa, dove]` e si va avanti.
Vedi `riferimenti/fonti-dati.md`.

### 3. Il verdetto si dà sullo scenario prudente

Tre scenari sempre: prudente, centrale, ottimista. Il centrale non è il caso
realistico — è il caso in cui tutto va come previsto. Se l'operazione regge
solo nell'ipotesi ottimista, non regge.

### 4. Si chiede prima di analizzare

Lo stesso lotto, con gli stessi numeri, è un affare o uno scarto a seconda
dell'intento. Un trilocale occupato a 92.000 €:

| Intento | Verdetto |
|---|---|
| Flip rapido, capitale da rimettere in circolo in 12 mesi | **scarto** — la liberazione uccide il ROI annualizzato |
| Rivendita senza vincolo di tempo | forse, dipende dal prezzo |
| Tenere e affittare | interessante — ma **altro business case**, il modello non lo copre |
| Prima casa | cambia l'aliquota di registro dal 9% al 2% |

Il banco delle domande è in `riferimenti/domande-intake.md`, con la regola che
le governa: **ogni domanda deve cambiare il lavoro.** Se la risposta non cambia
niente, non è una domanda, è curiosità.

---

## Il risultato normale è "no"

Il caso di riferimento in `PIANO-PROGETTO.md` §4 usa parametri del tutto
ordinari — base 120.000 €, 70 mq, occupato dal debitore, lavori a 600 €/mq — e
il verdetto è **scartare**: sullo scenario prudente il tetto d'offerta
compatibile con un ROI del 15% è 84.170 €, sotto il minimo di legge di 90.000 €
(75% del prezzo base, art. 571 c.p.c.).

Non è un difetto della calibrazione. Le aste convenienti sono una minoranza, e
il valore di questo sistema si misura su **quanti lotti sbagliati ferma prima
della cauzione** — non su quanti ne approva.

Due cifre da tenere presenti, entrambe in `PIANO-PROGETTO.md`:

- **Picco di esposizione ~181.000 €** su un'aggiudicazione da 92.000 €. Il
  capitale da confrontare col proprio non è il prezzo dell'immobile (§5.3).
- **1 aggiudicazione su 5–8 due diligence.** I cicli a vuoto si caricano
  sull'operazione riuscita: 3.200–19.600 € di costo da ammortizzare (§4.6).

---

## Struttura

```
flipping-scandicci/
├── PIANO-PROGETTO.md          il documento di sintesi PMBOK: fasi, task, costi, rischi, gate
├── profilo-investitore.md     creato da /profilo — il charter
├── riferimenti/
│   ├── domande-intake.md      il banco delle domande, per ondate
│   ├── fiscalita-e-costi.md   norme, imposte, regole d'asta (con le voci [VERIFICARE])
│   └── fonti-dati.md          dove si prendono i dati e quanto valgono
├── strumenti/
│   ├── roi.py                 il modello economico
│   ├── soglie.py              deriva le soglie di screening dal modello
│   ├── test_roi.py            l'oracolo del modello
│   ├── test_soglie.py         l'oracolo delle soglie
│   └── esempio.json
├── valutazioni/
│   ├── caso-riferimento/      i tre scenari del caso illustrativo
│   └── <rif>/briefing.md      l'intento tradotto in istruzioni per gli esperti
└── monitoraggio/
    └── visti.md               storico dei lotti, alimenta le stime di mercato
```

Agenti in `.claude/agents/`, skill in `.claude/skills/`.

---

## Limiti, dichiarati

Copre l'acquisto da **persona fisica** di residenziale in **esecuzione
immobiliare**, con rivendita. Non copre l'acquisto tramite società (fiscalità
completamente diversa), la locazione come uscita, la gestione di più operazioni
in parallelo, né le procedure concorsuali.

Gli agenti **non sostituiscono i professionisti**: preparano e strutturano il
lavoro di legale, tecnico e commercialista, e indicano quando servono. Le norme
citate portano l'articolo per essere verificate, non per essere applicate così
come sono. Dettaglio in `PIANO-PROGETTO.md` §11.
