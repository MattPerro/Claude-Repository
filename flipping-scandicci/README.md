# Flipping Aste Scandicci — squadra di agenti

Sistema multiagente conversazionale per valutare il ritorno di operazioni di
**flipping immobiliare su case all'asta nel Comune di Scandicci (FI)**, con
l'impianto di project management in `PIANO-PROGETTO.md`.

Non è un'app: è una **configurazione di Claude Code**. Si conversa normalmente,
e sono le skill a ingaggiare gli agenti specializzati quando serve.

---

## Come si usa

### Valutare un lotto

```
/valuta-asta                     # e poi incolli il link PVP o la perizia
```

oppure semplicemente, in linguaggio naturale:

> *"ho trovato questa asta a Scandicci, conviene? fino a quanto posso offrire?"*

Il flusso ingaggia in parallelo tre agenti (due diligence, mercato, cantiere),
riconcilia i loro output, esegue il modello economico e chiude con **una cifra**:
il prezzo oltre il quale si smette di rilanciare.

### Monitorare le nuove pubblicazioni

```
/loop 1d /monitora-aste          # controllo giornaliero
/loop /monitora-aste             # auto-ritmato
```

Il loop tiene stato in `monitoraggio/visti.md` e segnala **solo** i lotti che
superano il pre-filtro. Un giro senza segnalazioni è il risultato normale.

### Gestire l'operazione come progetto

> *"apri questo lotto come progetto"* → l'agente `pm-progetto` crea charter, WBS,
> baseline di costo e registro dei rischi in `valutazioni/<riferimento>/`.

### Calcolare a mano

```bash
python3 strumenti/roi.py valutazioni/caso-riferimento/parametri-centrale.json \
        --sensibilita --offerta-massima 0.15
```

---

## La squadra

| Agente | Cosa fa | Non fa |
|---|---|---|
| `asta-scout` | Trova e screma i lotti su PVP e gestori autorizzati | Non valuta la convenienza |
| `asta-due-diligence` | Legge perizia, avviso, relazione notarile: occupazione, gravami, abusi, condominio | Non stima i costi dei lavori |
| `mercato-scandicci` | Prezzo di rivendita e tempi, tre scenari, per zona omogenea | Non dà un numero singolo |
| `cantiere-stima` | Ambito e costo dei lavori, computo per capitoli | Non decide il livello di finitura senza il dato di mercato |
| `roi-analista` | Esegue il modello, sensibilità, soglia d'asta | **Non fa aritmetica a mente** |
| `pm-progetto` | Artefatti PMBOK, avanzamento, gate | Non riscrive la baseline in silenzio |

I sottoagenti non conversano tra loro: ricevono un incarico e restituiscono un
referto. La riconciliazione degli output — e delle loro contraddizioni — è il
lavoro dell'orchestratore, descritto in `.claude/skills/valuta-asta/SKILL.md`.

---

## I tre principi su cui è costruito

### 1. I numeri escono da uno script, non dal linguaggio

`strumenti/roi.py` è l'unica fonte delle cifre economiche. È deterministico e
coperto da test (`strumenti/test_roi.py`, 24 asserzioni).

```bash
cd strumenti && python3 test_roi.py
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
├── riferimenti/
│   ├── fiscalita-e-costi.md   norme, imposte, regole d'asta (con le voci [VERIFICARE])
│   └── fonti-dati.md          dove si prendono i dati e quanto valgono
├── strumenti/
│   ├── roi.py                 il modello
│   ├── test_roi.py            l'oracolo
│   └── esempio.json
├── valutazioni/
│   └── caso-riferimento/      i tre scenari del caso illustrativo
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
