# Profilo investitore

**Versione 2 — 19 settembre 2026**
Comune di Scandicci (FI) — Tribunale di Firenze

Questo documento è il **charter** del progetto (§1 di `PIANO-PROGETTO.md`) e la
base che ogni esperto legge prima di lavorare. Le soglie qui fissate entrano in
`offerta_massima()` e determinano il tetto d'offerta in asta.

> **Cosa è cambiato dalla v1.** Tre decisioni prese sulla base del referto di
> `mercato-scandicci` del 19/09/2026, delegate dal decisore ("fai te il meglio
> che puoi"):
> 1. **Binario straordinaria declassato** da alternativa a solo-rimedio
> 2. **Durate riviste**: `MESI_LIBERO` 11 → 13, `MESI_OCCUPATO` 18 → 20
> 3. **Soglie per zona** invece di una soglia unica, con durata zona-dipendente
>
> Il punto aperto n.1 (valori OMI) **resta aperto**: bloccato dalla policy di
> rete di questa sessione, non dal metodo. Vedi §Punti aperti.

---

## Capitale

| Voce | Valore |
|---|---|
| Disponibile al picco | **200.000 – 350.000 €** |
| Leva finanziaria | nessuna assunta — `[DA CONFERMARE]` |
| Tempo di mobilitazione | `[DA REPERIRE]` — presidiato dal decisore |

### Fabbisogno effettivo, per zona e taglio

Binario rinfrescata, immobile libero, 13 mesi, ROI 20% prudente:

| | Offerta max | **Picco di cassa** | **Entro 120 giorni** | Utile netto |
|---|---|---|---|---|
| Casellina 70 mq | 111.300 | **160.500** | 127.100 | 32.100 |
| Centro 70 mq | 120.100 | **170.100** | 136.700 | 34.000 |
| Casellina 110 mq | 183.800 | **254.000** | 206.100 | 50.800 |
| Centro 110 mq | 197.600 | **269.000** | 221.100 | 53.800 |

**Cassa totale da avere pronta**, incluse riserva di gestione (5%) e costo dei
cicli a vuoto (4.000–16.000 €):

| Scenario | Cassa totale |
|---|---|
| Taglio medio (70 mq) | **172.000 – 195.000 €** |
| Taglio grande (110 mq) | **272.000 – 298.000 €** |

Entrambi dentro la fascia dichiarata. Il taglio grande in Centro è al limite
superiore e richiede **221.000 € liquidi entro 120 giorni**.

> **Vincolo duro da presidiare (rischio R5).** Il termine di saldo è tipicamente
> **120 giorni dall'aggiudicazione e non è prorogabile**. Fra cauzione (10%) e
> saldo passano poche settimane. Mancare quel termine significa perdere
> **cauzione e immobile**. Il dato che decide se questo piano regge non è il
> totale, è **quanto del capitale è liquido entro 120 giorni**:
>
> | Liquidità entro 120 gg | Perimetro accessibile |
> |---|---|
> | ≥ 221.000 € | tutto, compresi i tagli grandi in Centro |
> | ≥ 137.000 € | tagli medi in tutte le zone core |
> | < 127.000 € | va rivista la fascia di prezzo, non il ROI |

---

## Obiettivi — criteri di successo

| Metrica | Soglia |
|---|---|
| ROI su capitale, **scenario prudente** | **≥ 20%** |
| Durata dall'aggiudicazione all'incasso | **≤ 12 mesi** *(vincolo rigido — vedi nota)* |
| Capitale massimo al picco | 350.000 € |
| Margine di sicurezza sul prezzo di uscita | ≥ 12% |

**Metrica prevalente: ROI annualizzato.** *(assunta — l'orizzonte rigido implica
che conti il rendimento per unità di tempo)*

> **Nota sul vincolo dei 12 mesi.** Con le durate riviste, la rinfrescata in
> zona core richiede **13 mesi** fino all'incasso, non 12. Il vincolo dei 12
> mesi è quindi **superato di un mese nello scenario prudente** e rispettato
> solo se saldo e pratiche filano senza intoppi.
>
> Non ho abbassato il vincolo a 13 mesi né rilassato la soglia: il modello gira
> su 13 mesi reali e il ROI annualizzato che ne esce (**18,3%**) è il numero
> onesto. La differenza fra i 12 mesi desiderati e i 13 effettivi è un mese di
> scarto da sapere, non da nascondere ritoccando i parametri.

---

## Intento

**Rivendita dopo ristrutturazione leggera.** Perimetro nativo del sistema.

Conseguenze fiscali attive:
- Imposta di registro **9%** + 100 € fisse (non prima casa)
- **Plusvalenza tassata**: opzione per l'imposta sostitutiva **26%**, da
  dichiarare **in atto** dal notaio (task F9.7 — si esercita in quel momento e
  non si recupera dopo)
- Valutare il **prezzo-valore** su base catastale in F6.3, se più favorevole

---

## Tolleranza e livelli di intervento

| Dimensione | Posizione |
|---|---|
| **Immobile occupato dal debitore** | **Escluso** — solo immobili liberi |
| **Livello di intervento** | **Rinfrescata** (unico binario ordinario) |
| **Straordinaria** | **Solo rimedio** — vedi decisione sotto |
| Integrale, ridistribuzione, premium | Esclusi |
| Invenduto oltre 3 mesi | `[DA DEFINIRE]` — gate G6 |

### Decisione 1 — La straordinaria è declassata a solo-rimedio

**Il numero.** Lo spread di prezzo fra "buono stato" (esito di una rinfrescata)
e "ristrutturato" (esito di una straordinaria) sul mercato fiorentino è
**+5% / +7% / +10%** nei tre scenari. Il break-even ne richiede **+11,5%**:

| | |
|---|---|
| Costo incrementale | 600 − 250 = **350 €/mq** |
| Ricavo incrementale, a 3.050 €/mq di base | +153 / **+214** / +305 €/mq |
| **Spread di break-even** | **+11,5%** — sopra l'estremo alto della forchetta |

Negativo in **tutti e tre** gli scenari, e in più aggiunge 2–3 mesi di cantiere
su una metrica annualizzata. Alle durate riviste il binario straordinaria
richiede **15 mesi** e rende il **15,7%** annualizzato: fuori sia dal vincolo
di durata sia dalla soglia di ROI.

**Decisione.** La straordinaria **non è più la valvola per allargare il flusso
di candidati**. Si ammette solo quando:
1. l'immobile **non è vendibile** in stato buono, **e**
2. lo sconto in asta finanzia **integralmente** l'intervento, **e**
3. la durata complessiva resta verificata dal modello, non assunta.

A parità di lotto, non si scelga mai la straordinaria sulla rinfrescata.

> **Decisione revisabile.** Lo spread +5/+10% poggia su fonti **non locali**,
> confidenza **bassa**. Il borsino Tecnocasa di Scandicci lo misura
> direttamente per zona e stato, e potrebbe ribaltare la conclusione. È il
> punto aperto n.2: quando diventa accessibile, questa decisione va rifatta.

### Conflitto risolto in v1 — orizzonte contro occupazione

Le risposte iniziali contenevano *"12 mesi di orizzonte"* e *"occupati
accettati se prezzati"*. Su 12 mesi la liberazione avrebbe avuto 1–4 mesi
contro i 3–18 tipici. Decisione del decisore: **si tengono i 12 mesi**, quindi
occupati **fuori perimetro**. Costo dichiarato: si scarta circa metà dei lotti,
ma si elimina **R1**, il rischio strutturale dell'asta.

---

## Forma dell'acquisto

**Persona fisica.** È lo scenario che `roi.py` copre. Se in futuro si valutasse
la società, il modello va rifatto col commercialista: IVA detraibile, immobile
come merce, utile come reddito d'impresa. Non è una variante, è un altro
progetto (`PIANO-PROGETTO.md` §11).

---

## Perimetro

**Geografia: tutto il Comune di Scandicci** per la *ricerca* — il vincolo vero
è la scarsità di lotti liberi in buono stato, e restringere la geografia
ridurrebbe un flusso già sottile.

Ma le zone **non sono equivalenti**, e la differenza non è nel prezzo: è nei
**tempi di assorbimento**, che con un orizzonte rigido sono il vincolo. Quindi
la soglia è zona-dipendente, non unica.

### Decisione 3 — Soglie per zona

Rinfrescata (250 €/mq), immobile libero, ROI 20% prudente. Uscita da referto
`mercato-scandicci` 19/09/2026 — **prezzi richiesti deflazionati −8%,
confidenza bassa**.

| Zona | Uscita €/mq | Assorbimento | Mesi totali | Base max 70 mq | Base max 110 mq | Perimetro |
|---|---|---|---|---|---|---|
| **Centro** | 3.260 | 3–4 mesi | 13 | **2.234** | **2.361** | ✅ core |
| **Casellina** | 3.080 | 3–4 mesi | 13 | **2.067** | **2.194** | ✅ core |
| Badia a Settimo / S. Colombano | 3.110 | 4–6 mesi | 15 | 2.086 | 2.216 | ⚠️ seconda scelta |
| Le Bagnese / San Giusto | 2.930 | 4–6 mesi | 15 | 1.919 | 2.049 | ⚠️ seconda scelta |
| Mosciano / Casignano / Giogoli | 3.440 | 6+ mesi | 17 | 2.383 | 2.517 | ❌ fuori orizzonte |
| S. Vincenzo a Torri / Marciola | 2.580 | 6+ mesi | 17 | 1.585 | 1.719 | ❌ fuori orizzonte |

> **Attenzione a come si legge questa tabella.** Mosciano ha la **soglia più
> alta** — 2.383 €/mq — perché ha i €/mq di uscita più alti del comune. Ma ha
> anche i tempi peggiori: 17 mesi totali contro un vincolo di 12. **La soglia
> da sola direbbe "vai"; l'orizzonte dice no.** Il filtro è la combinazione
> delle due colonne, non la soglia isolata.
>
> Con metrica annualizzata, un €/mq di uscita alto non compensa un
> assorbimento lento. È il contrario dell'intuizione, e vale la pena ricordarlo
> quando un lotto in collina sembrerà attraente.

La classificazione dell'assorbimento per zona è **inferenza su proxy di
liquidità** (profondità del segmento, corridoio tramviario T1, ticket medio),
confidenza **bassa**. Il dato per zona non esiste pubblicamente: solo le
agenzie locali lo hanno.

### Tipologia

Qualsiasi taglio residenziale, con una **regola nuova sugli indipendenti**.

Il referto ha trovato che sugli indipendenti il differenziale **non è di
tipologia ma di taglio**:

| Taglio | €/mq richiesti | Regola |
|---|---|---|
| Indipendenti **< 100 mq** | 3.700+ | **In perimetro**, e si applica un **premio**, non uno sconto |
| Indipendenti **> 130 mq** | 2.100 – 2.400 | **Fuori perimetro** con 12 mesi di orizzonte, salvo sconto d'asta eccezionale |

Sopra i 130 mq il ticket assoluto supera i 350.000 €, la platea si assottiglia
e i tempi vanno all'estremo alto. **Non usare mai il €/mq degli appartamenti
per un indipendente grande**: si sbaglia di decine di migliaia di euro.

Resta valida l'istruzione al `geometra` di alzare la riserva imprevisti su
questa tipologia (nessun condominio, ma imprevisti strutturali più alti).

### Esclusioni assolute
- Immobili **occupati** (da debitore o terzi)
- Locazione opponibile, quota indivisa, diritti reali di terzi
- Abusi **non sanabili**
- Ridistribuzione, integrale, premium
- Indipendenti oltre 130 mq
- Zone a assorbimento 6+ mesi (Mosciano-Giogoli, S. Vincenzo a Torri)
- Terreni, box isolati, immobili commerciali e produttivi

---

## Risorse

| Ruolo | Stato |
|---|---|
| Tecnico (geometra / architetto) | **disponibile** |
| Impresa esecutrice | **da individuare** — 4–6 settimane in F0 |
| Legale esecuzioni | da individuare |
| Commercialista | da individuare |
| Agenzia immobiliare | da individuare |

Il tecnico disponibile permette il **sopralluogo con il custode prima
dell'asta** (F3.6, F3.8): la verifica che alza di più la confidenza del computo.

Con il declassamento della straordinaria, il peso dell'impresa cala: una
rinfrescata è un cantiere leggero. Ma serve comunque, e con 13 mesi di durata
effettiva le 4–6 settimane di ricerca vanno in F0, non scoperte in F8.

---

## Decisione 2 — Durate riviste nel modello

`strumenti/soglie.py`: `MESI_LIBERO` **11 → 13**, `MESI_OCCUPATO` **18 → 20**.

**Il rilevamento.** I tempi di vendita pubblicati (~109 giorni, hinterland di
Firenze, Tecnocasa gen 2026) misurano il collocamento fino alla **proposta
accettata**, non fino al rogito. Lo scarto proposta → atto → incasso vale altri
2–3 mesi, che il modello non contava:

| Fase | Mesi |
|---|---|
| Collocamento fino a proposta accettata | 3,6 |
| Proposta → rogito → incasso | 2,0 – 3,0 |
| **Uscita fino all'incasso** | **5,6 – 6,6** *(il modello assumeva 3–4)* |

**Effetto.** ROI annualizzato dal 22,0% al **18,3%**; tetti d'offerta quasi
invariati (−10 €/mq circa). Il costo della correzione è quasi tutto sul
rendimento dichiarato, non sulla capacità d'offerta — cioè era una
sopravvalutazione del rendimento, non un errore di prezzo.

Aggiunto l'override `--mesi` per applicare durate zona-specifiche, e due test
(`test_durata_override`, `test_durate_riviste`) che impediscono di riportare
silenziosamente le durate ai valori ottimistici.

> **Ambiguità residua.** Non è accertato se i 109 giorni Tecnocasa arrivino alla
> proposta o al rogito: le due letture divergono di 2–3 mesi. **Una telefonata
> all'Ufficio Studi Tecnocasa lo risolve.** Ho adottato la lettura prudente.

---

## Punti aperti

| # | Punto | Assunzione adottata | Impatto |
|---|---|---|---|
| **1** | **Valori OMI 2S2025 per zona** | Prezzi richiesti dei portali, deflazionati −8%. Confidenza **bassa** | **Alto** — è il denominatore di ogni soglia |
| **2** | Borsino Tecnocasa per zona **e stato** | Spread buono→ristrutturato +5/+7/+10% da fonti non locali | **Alto** — può ribaltare la decisione 1 |
| 3 | Metodologia dei tempi di vendita Tecnocasa | Lettura prudente: fino alla proposta | Medio — decide la validità della decisione 2 |
| 4 | Tempo di mobilitazione del capitale | Non accertato | **Critico (R5)** — presidiato dal decisore |
| 5 | Comparabili **realizzati** per zona | Nessuno. Solo richiesti deflazionati | **Alto** — serve per un rilancio vincolante |
| 6 | Tempi di assorbimento per zona | Inferenza su proxy di liquidità, confidenza bassa | Alto — determina la classificazione del perimetro |
| 7 | Costo/mq reale per la rinfrescata | 250 €/mq parametrico | Alto — da tarare con due preventivi del tecnico |
| 8 | Criterio di ragguaglio delle superfici | I €/mq dei portali usano superfici dichiarate, le perizie ragguagli espliciti | Medio, **segno incerto** — ricalcolare sul primo lotto reale |

### Sul punto 1 — perché è bloccato e come si sblocca

La banca dati OMI, il borsino Tecnocasa, i portali aste e il sito del Comune
sono **bloccati dalla policy di rete aziendale di questa sessione**: verificato
con `curl`, 403 in CONNECT su tutti e quattro i domini.

**Non è un limite del metodo.** Su una macchina personale, fuori dalla rete
aziendale, `mercato-scandicci` raggiunge OMI senza ostacoli. Il modo più rapido
di chiudere il punto 1 è:

```bash
git clone https://github.com/MattPerro/Claude-Repository.git
cd Claude-Repository && claude
# poi: "chiedi a mercato-scandicci di mappare le zone OMI di Scandicci"
```

Consultazione OMI gratuita e senza login: *Agenzia delle Entrate → Quotazioni
immobiliari → Consultazione per indirizzo*, oppure l'app **OMI Mobile**.

**Finché il punto 1 è aperto: le soglie servono per lo screening, non per un
rilancio vincolante.** Prima di un'offerta, due agenzie locali.

---

## Prossimi passi

| # | Azione | Chi | Sblocca |
|---|---|---|---|
| 1 | Rieseguire `mercato-scandicci` da rete non filtrata | decisore + sistema | Punti 1, 2, 5 |
| 2 | Telefonata all'Ufficio Studi Tecnocasa sui tempi di vendita | decisore | Punto 3 |
| 3 | Accertare la liquidità entro 120 giorni | decisore | Punto 4 (critico) |
| 4 | Due preventivi di rinfrescata al tecnico disponibile | tecnico | Punto 7 |
| 5 | `/monitora-aste` con `/loop 1d`, filtro su liberi in zone core | sistema | Avvia il flusso |
| 6 | Individuare l'impresa esecutrice | decisore | F0, non rinviabile |

Il passo 1 è quello che cambia più cose: chiude tre punti aperti in un colpo e
porta la confidenza delle soglie da bassa a media.
