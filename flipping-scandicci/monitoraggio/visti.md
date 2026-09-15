# Registro dei lotti esaminati

Stato persistente della skill `/monitora-aste`. **Va letto prima di ogni giro di
monitoraggio e aggiornato dopo**: senza questo file il loop ri-segnala gli stessi
immobili ad ogni esecuzione.

## Esiti possibili

| Esito | Significato |
|---|---|
| `scartato` | Non supera il pre-filtro. Indicare **sempre** la ragione |
| `segnalato` | Supera il pre-filtro, in attesa di decisione |
| `in valutazione` | `/valuta-asta` in corso |
| `valutato-no` | Valutazione completa, verdetto negativo |
| `valutato-sì` | Valutazione completa, verdetto positivo, soglia fissata |
| `offerta presentata` | Cauzione versata |
| `aggiudicato a noi` | — |
| `aggiudicato ad altri` | **Registrare il prezzo**: è il miglior dato di mercato disponibile |
| `deserto` | Nessuna offerta. Attendere il ribasso e il nuovo esperimento |

## Lotti

| Rif. procedura | Indirizzo / zona | mq | Prezzo base | Esp. | Data asta | Visto il | Esito | Nota |
|---|---|---|---|---|---|---|---|---|
| *(nessun lotto ancora esaminato)* | | | | | | | | |

---

## Prezzi di aggiudicazione osservati

Tabella separata, e non è un archivio di consolazione: i prezzi a cui i lotti
vengono effettivamente aggiudicati sono il dato di mercato più affidabile che
esista su queste zone — più dei prezzi richiesti sui portali e più delle fasce
OMI. Alimenta l'agente `mercato-scandicci`.

| Data | Zona | mq | Prezzo base | Aggiudicazione | % sul base | €/mq | Stato immobile |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

## Note di andamento

Da compilare dopo alcuni mesi di osservazione — sono i dati che nessun portale
fornisce:

- Quanti esperimenti servono in media prima dell'aggiudicazione
- Ribasso cumulato tipico fra il primo esperimento e l'aggiudicazione
- Quali zone di Scandicci girano e quali restano deserte
- Rapporto medio fra prezzo di aggiudicazione e valore del ristrutturato
