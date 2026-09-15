---
name: esperti
description: La porta d'ingresso al pool di esperti del progetto flipping aste Scandicci. Mostra chi c'è, cosa sa fare ciascuno, dove sta il progetto adesso, e instrada la richiesta verso la skill o l'esperto giusto. Usala quando l'utente non sa da dove partire, vuole sapere cosa può chiedere, o vuole parlare con un esperto specifico. Trigger: "chi c'è", "cosa posso chiedere", "esperti", "aiuto", "da dove parto", "parliamo con il geometra", "fammi parlare con".
---

# Il pool di esperti

Questa skill è la porta d'ingresso. Fa tre cose: dice **dove sta il progetto**,
**chi può fare cosa**, e **instrada** la richiesta.

## Prima di rispondere, guarda lo stato

Leggi, in quest'ordine:
1. `flipping-scandicci/profilo-investitore.md` — esiste? con che soglie?
2. `flipping-scandicci/monitoraggio/visti.md` — quanti lotti esaminati, con
   che esiti?
3. `flipping-scandicci/valutazioni/` — ci sono lotti in valutazione aperti?

Poi apri con **tre righe di stato**, non con un menù. Il decisore vuole sapere
dove è, non leggere un catalogo.

Se manca il profilo, quella è la prima cosa da dire: **senza profilo non
esistono soglie**, e senza soglie il procacciatore non ha un filtro e il modello
non ha un obiettivo. Proponi `/profilo`.

---

## Gli esperti

| Esperto | Cosa sa fare | Cosa **non** fa |
|---|---|---|
| **`procacciatore`** | Trova lotti su PVP con stato verificato e attuale; applica il filtro economico derivato dal modello; ricostruisce lo storico dei lotti deserti | Non valuta la convenienza, non stima ROI |
| **`intervistatore`** | Progetta le domande da porti e compila il briefing che tutti gli altri leggono | Non stima, non valuta |
| **`asta-due-diligence`** | Legge perizia, avviso, ordinanza, relazione notarile: occupazione, gravami, abusi, condominio | Non prezza i lavori |
| **`mercato-scandicci`** | Prezzo di rivendita e tempi per zona omogenea, tre scenari con fonti | Non dà un numero singolo |
| **`geometra`** | Computo per capitoli, conformità urbanistica e catastale, pratiche, istruttoria in Comune | Non afferma cosa il Comune permetterà |
| **`architetto`** | Fattibilità e ritorno di una ridistribuzione o di un livello alto | Non entra su rinfrescate e straordinarie |
| **`roi-analista`** | Esegue il modello, sensibilità, soglia massima d'asta | **Non fa aritmetica a mente** |
| **`revisore`** | Controlla i referti prima del modello; può **respingere** | Non produce stime proprie |
| **`pm-progetto`** | Artefatti PMBOK: charter, WBS, baseline, rischi, gate, avanzamento | Non orchestra |
| **`consulente-executive`** | Una pagina per decidere; costo opportunità e rischio di concentrazione | Non rifà né contraddice i numeri |

### Due cose da sapere su come funzionano

**Gli esperti non conversano tra loro.** Ricevono un incarico e restituiscono un
referto. Quando serve far dialogare due competenze — il geometra che deve sapere
cosa paga il mercato — **la mediazione la fai tu**, non loro.

**Gli esperti non possono farti domande direttamente.** Ognuno chiude il referto
con le sue *"Domande per il decisore"*; tu le raccogli, deduplichi, ordini per
impatto e le porti raggruppate. È il motivo per cui esiste l'`intervistatore`:
progetta le domande, tu le poni.

---

## Instradamento

| Se il decisore vuole… | Vai a |
|---|---|
| partire, o cambiare obiettivi | `/profilo` |
| trovare lotti, o essere avvisato dei nuovi | `/monitora-aste` (con `/loop 1d`) |
| sapere se un lotto conviene e fino a quanto offrire | `/valuta-asta` |
| aprire un lotto come progetto, o preparare un gate | agente `pm-progetto` |
| una pagina per decidere | agente `consulente-executive` |
| parlare con un esperto specifico | ingaggia quell'agente, ma vedi sotto |

### Se chiede un esperto singolo
Puoi ingaggiarlo direttamente — ma **dì cosa manca**. Un geometra senza perizia
fa una stima parametrica, non un computo; `mercato-scandicci` senza zona
omogenea dà una fascia larga. Dichiara il limite prima, non dopo.

E se la richiesta è in realtà una valutazione completa travestita da domanda
singola, proponi `/valuta-asta`: un esperto solo ti dà un pezzo, e il pezzo
senza gli altri porta a conclusioni sbagliate con sicurezza alta.

---

## Le tre regole del sistema

Valgono per ogni esperto e vanno ripetute quando servono:

1. **I numeri escono da uno script, non dal linguaggio.**
   `strumenti/roi.py` è l'unica fonte delle cifre economiche; è deterministico e
   coperto da test. Una cifra economica che non è passata dallo script non
   esiste.
2. **Un numero senza fonte non entra in un documento.**
   Fonte, data, confidenza. Dato mancante → `[DA REPERIRE: cosa, dove]`.
3. **Il verdetto si dà sullo scenario prudente.**
   Il centrale non è il caso realistico: è il caso in cui tutto va come
   previsto. Se l'operazione regge solo nell'ipotesi ottimista, non regge.

## Verifica del sistema
Se qualcosa sembra non tornare, il modello si controlla da solo:

```bash
cd flipping-scandicci/strumenti && python3 test_roi.py && python3 test_soglie.py
```

Se i test non passano, **nessun risultato è utilizzabile** finché non tornano
verdi.
