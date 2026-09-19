/**
 * Migrazione 001 — schema iniziale.
 *
 * Copre le entita' elencate dalla specifica §7: profilo · archivio/workspace ·
 * dispositivi · esercizi e varianti · attrezzature · programmi e versioni ·
 * blocchi e settimane · prescrizioni · eventi pianificati · sessioni ·
 * esercizi svolti · serie · timer · misurazioni · check-in · giornate in
 * pista · proposte del coach · approvazioni e rifiuti · operazioni di
 * sincronizzazione · conflitti · impostazioni.
 *
 * ## Convenzioni valide per tutto lo schema
 *
 * - **Chiave primaria testuale (ULID)**. Gli ID nascono sul dispositivo
 *   (`@trackstrong/core`, `ids.ts`) e sono definitivi: non esistono ID
 *   provvisori da rimpiazzare dopo l'upload, ed e' questo che rende le
 *   operazioni di sincronizzazione applicabili una sola volta (§8).
 * - **`revision INTEGER NOT NULL`** su ogni entita' sincronizzabile: e' la
 *   versione di base con cui si riconoscono le modifiche concorrenti (§8.2).
 * - **`deleted_at INTEGER`** (tombstone) dove la cancellazione va propagata.
 *   Non si cancella fisicamente: "rimuovere prematuramente le informazioni
 *   sulle cancellazioni" e' fra i divieti espliciti della specifica (§8).
 *   Le tabelle senza `deleted_at` sono quelle in cui la riga non esiste
 *   indipendentemente dal padre (righe figlie in `ON DELETE CASCADE`) o in cui
 *   la cancellazione non ha senso (`meta`, i registri di sincronizzazione).
 * - **Date**: `..._date` / `..._on` sono `TEXT` in formato `YYYY-MM-DD`
 *   (`LocalDate` del dominio); `..._at` sono `INTEGER` in millisecondi epoch
 *   (`Instant`). Sono tipi diversi nel dominio e restano diversi qui.
 * - **Booleani**: `INTEGER` 0/1, con `CHECK (col IN (0,1))`.
 * - **Strutture annidate**: JSON in colonne `*_json`. Serializzare una
 *   prescrizione in 40 tabelle relazionali non aggiungerebbe integrita': il
 *   dato e' immutabile una volta congelato. Quello che NON viene mai
 *   nascosto in un JSON e' cio' su cui si interroga o si confronta (carico,
 *   convenzione, chiave di comparabilita', stato, date).
 */

export const MIGRATION_001_SQL = `
-- ---------------------------------------------------------------------------
-- meta: versione dello schema e del protocollo.
-- Non e' un'entita' sincronizzata (e' un fatto locale del file), quindi e'
-- l'unica tabella con chiave testuale non-ULID: una mappa chiave/valore.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Archivio, dispositivi, profilo, impostazioni
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
  id                     TEXT PRIMARY KEY NOT NULL,
  name                   TEXT NOT NULL,
  created_at             INTEGER NOT NULL,
  google_account_id      TEXT,
  google_account_email   TEXT,
  sync_protocol_version  INTEGER NOT NULL,
  revision               INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  deleted_at             INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS devices (
  id                TEXT PRIMARY KEY NOT NULL,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  platform          TEXT NOT NULL CHECK (platform IN ('ios','ipados','android','other')),
  first_seen_at     INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0,1)),
  revision          INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS profiles (
  id                            TEXT PRIMARY KEY NOT NULL,
  workspace_id                  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  display_name                  TEXT NOT NULL,
  height_cm                     REAL,
  -- Peso DICHIARATO in configurazione. Non e' una pesata: sta qui e non in
  -- measurements proprio per non poter finire nei grafici (§2, §15).
  declared_weight_kg            REAL,
  body_goal_json                TEXT,
  sport_goal                    TEXT,
  program_start_date            TEXT NOT NULL,
  preferred_weekdays_json       TEXT NOT NULL DEFAULT '[]',
  available_minutes_per_session INTEGER NOT NULL,
  sessions_per_week             INTEGER NOT NULL,
  notes                         TEXT,
  revision                      INTEGER NOT NULL,
  updated_at                    INTEGER NOT NULL,
  deleted_at                    INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS physical_limitations (
  id                        TEXT PRIMARY KEY NOT NULL,
  profile_id                TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  note                      TEXT,
  affected_exercise_ids_json TEXT NOT NULL DEFAULT '[]',
  active                    INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  recorded_on               TEXT NOT NULL,
  revision                  INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL,
  deleted_at                INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS settings (
  id                               TEXT PRIMARY KEY NOT NULL,
  workspace_id                     TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  time_zone                        TEXT NOT NULL,
  theme                            TEXT NOT NULL CHECK (theme IN ('system','light','dark')),
  keep_screen_awake                INTEGER NOT NULL CHECK (keep_screen_awake IN (0,1)),
  haptics_enabled                  INTEGER NOT NULL CHECK (haptics_enabled IN (0,1)),
  rest_timer_notifications         INTEGER NOT NULL CHECK (rest_timer_notifications IN (0,1)),
  session_reminders                INTEGER NOT NULL CHECK (session_reminders IN (0,1)),
  hours_before_track_day           INTEGER NOT NULL,
  auto_sync_enabled                INTEGER NOT NULL CHECK (auto_sync_enabled IN (0,1)),
  auto_sync_min_interval_minutes   INTEGER NOT NULL,
  client_encryption_enabled        INTEGER NOT NULL CHECK (client_encryption_enabled IN (0,1)),
  sync_progress_photos             INTEGER NOT NULL CHECK (sync_progress_photos IN (0,1)),
  generative_coach_enabled         INTEGER NOT NULL CHECK (generative_coach_enabled IN (0,1)),
  backup_reminder_days             INTEGER NOT NULL,
  reminder_time_of_day             TEXT NOT NULL,
  revision                         INTEGER NOT NULL,
  updated_at                       INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Attrezzature e regolazioni personali per esercizio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_instances (
  id            TEXT PRIMARY KEY NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  location      TEXT,
  -- Incremento REALE di questo attrezzo: 0 significa "non configurato", e il
  -- motore in quel caso non propone aumenti (§9).
  step_kg       REAL NOT NULL DEFAULT 0,
  min_kg        REAL,
  max_kg        REAL,
  step_note     TEXT,
  settings_note TEXT,
  revision      INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS exercise_overrides (
  id                             TEXT PRIMARY KEY NOT NULL,
  workspace_id                   TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  exercise_id                    TEXT NOT NULL,
  variant_id                     TEXT,
  preferred_equipment_instance_id TEXT REFERENCES equipment_instances(id) ON DELETE SET NULL,
  -- Regolazioni annotate: sedile, schienale, maniglia, altezza del gradino,
  -- presa (§10, "Note su: macchina, sedile, schienale, maniglia...").
  settings_note                  TEXT,
  default_load_kg                REAL,
  step_kg                        REAL,
  hidden                         INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0,1)),
  note                           TEXT,
  revision                       INTEGER NOT NULL,
  updated_at                     INTEGER NOT NULL,
  deleted_at                     INTEGER,
  UNIQUE (workspace_id, exercise_id, variant_id)
) STRICT;

-- ---------------------------------------------------------------------------
-- Programma: piani versionati, blocchi, settimane, cursore
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS program_plans (
  id                   TEXT PRIMARY KEY NOT NULL,
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Versione progressiva del piano per questo archivio. Una revisione crea
  -- una riga nuova: il piano precedente resta consultabile (§8).
  version              INTEGER NOT NULL,
  format_version       INTEGER NOT NULL,
  derived_from_version INTEGER,
  revision_reason      TEXT,
  start_date           TEXT NOT NULL,
  horizon_years        INTEGER NOT NULL,
  last_date            TEXT NOT NULL,
  plan_json            TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  revision             INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  deleted_at           INTEGER,
  UNIQUE (workspace_id, version)
) STRICT;

CREATE TABLE IF NOT EXISTS program_blocks (
  id                   TEXT PRIMARY KEY NOT NULL,
  plan_id              TEXT NOT NULL REFERENCES program_plans(id) ON DELETE CASCADE,
  block_key            TEXT NOT NULL,
  order_index          INTEGER NOT NULL,
  name                 TEXT NOT NULL,
  phase                TEXT NOT NULL,
  purpose              TEXT NOT NULL,
  planned_weeks        INTEGER NOT NULL,
  start_week_index     INTEGER NOT NULL,
  year_number          INTEGER NOT NULL,
  interruption_policy  TEXT NOT NULL,
  entry_criteria_json  TEXT NOT NULL DEFAULT '[]',
  review_criteria_json TEXT NOT NULL DEFAULT '[]',
  revision             INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  UNIQUE (plan_id, block_key)
) STRICT;

CREATE TABLE IF NOT EXISTS program_weeks (
  id             TEXT PRIMARY KEY NOT NULL,
  block_id       TEXT NOT NULL REFERENCES program_blocks(id) ON DELETE CASCADE,
  week_index     INTEGER NOT NULL,
  index_in_block INTEGER NOT NULL,
  label          TEXT NOT NULL,
  note           TEXT,
  is_deload      INTEGER NOT NULL DEFAULT 0 CHECK (is_deload IN (0,1)),
  sessions_json  TEXT NOT NULL,
  revision       INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  UNIQUE (block_id, week_index)
) STRICT;

CREATE TABLE IF NOT EXISTS program_cursor (
  id                   TEXT PRIMARY KEY NOT NULL,
  workspace_id         TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_version         INTEGER NOT NULL,
  -- Settimana di PROGRAMMA, distinta dalla settimana di calendario (§7).
  week_index           INTEGER NOT NULL,
  repetition_count     INTEGER NOT NULL DEFAULT 0,
  completed_slots_json TEXT NOT NULL DEFAULT '[]',
  entered_on           TEXT NOT NULL,
  revision             INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Calendario: eventi pianificati (sedute, cardio, camminate, pistate)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS planned_events (
  id              TEXT PRIMARY KEY NOT NULL,
  workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('session','cardio','walk','trackDay','other')),
  planned_date    TEXT NOT NULL,
  -- Serie ricorrente a cui l'evento appartiene: spostare una occorrenza non
  -- deve spostare tutte le altre (§11).
  recurrence_id   TEXT,
  -- Data originaria, se l'evento e' stato spostato: lo storico del calendario
  -- resta leggibile e lo spostamento non diventa una cancellazione.
  moved_from_date TEXT,
  session_id      TEXT,
  week_index      INTEGER,
  slot            TEXT CHECK (slot IS NULL OR slot IN ('A','B')),
  title           TEXT NOT NULL,
  note            TEXT,
  minutes         INTEGER,
  status          TEXT NOT NULL DEFAULT 'planned'
                  CHECK (status IN ('planned','done','skipped','moved','cancelled')),
  revision        INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
) STRICT;

-- ---------------------------------------------------------------------------
-- Sedute effettivamente svolte
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id                     TEXT PRIMARY KEY NOT NULL,
  workspace_id           TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  planned_event_id       TEXT REFERENCES planned_events(id) ON DELETE SET NULL,
  planned_date           TEXT NOT NULL,
  -- NULL fino a quando la seduta non e' stata svolta: "prevista" e "svolta"
  -- non sono la stessa data e non vanno confuse (§7).
  performed_date         TEXT,
  slot                   TEXT NOT NULL CHECK (slot IN ('A','B')),
  status                 TEXT NOT NULL
                         CHECK (status IN ('planned','active','paused','completed','partial','skipped')),
  -- FOTOGRAFIA della prescrizione valida all'avvio. Congelata: le revisioni
  -- future del programma non riscrivono lo storico (§7).
  prescription_snapshot  TEXT NOT NULL,
  plan_version           INTEGER NOT NULL,
  week_index             INTEGER NOT NULL,
  block_id               TEXT NOT NULL,
  check_in_json          TEXT,
  started_at             INTEGER,
  ended_at               INTEGER,
  paused_ms              INTEGER NOT NULL DEFAULT 0,
  note                   TEXT,
  -- Dispositivo che possiede la seduta attiva. Il trasferimento fra
  -- dispositivi e' esplicito (§10): niente blocco globale promesso offline.
  owner_device_id        TEXT,
  revision               INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  deleted_at             INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS performed_exercises (
  id                          TEXT PRIMARY KEY NOT NULL,
  session_id                  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  order_index                 INTEGER NOT NULL,
  exercise_id                 TEXT NOT NULL,
  variant_id                  TEXT,
  substituted_for_exercise_id TEXT,
  equipment_instance_id       TEXT REFERENCES equipment_instances(id) ON DELETE RESTRICT,
  technique                   TEXT CHECK (technique IS NULL OR technique IN ('controlled','uncertain','broke')),
  discomfort_json             TEXT,
  settings_note               TEXT,
  note                        TEXT,
  skipped                     INTEGER NOT NULL DEFAULT 0 CHECK (skipped IN (0,1)),
  revision                    INTEGER NOT NULL,
  updated_at                  INTEGER NOT NULL,
  UNIQUE (session_id, order_index)
) STRICT;

CREATE TABLE IF NOT EXISTS performed_sets (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  performed_exercise_id TEXT NOT NULL REFERENCES performed_exercises(id) ON DELETE CASCADE,
  order_index           INTEGER NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('warmup','working')),
  load_convention       TEXT NOT NULL CHECK (load_convention IN
                          ('barbellTotal','perDumbbell','machineStack','bodyweight',
                           'bodyweightPlus','assisted','timeOnly')),
  -- NULLABLE per costruzione: 'bodyweight' e 'timeOnly' non hanno carico 0,
  -- hanno carico NON APPLICABILE. Il CHECK sotto rende impossibile scrivere
  -- uno 0 al posto di un NULL (§3, "un carico senza convenzione non ha
  -- significato"; units.ts, requiresNoLoad).
  load_kg               REAL,
  equipment_instance_id TEXT REFERENCES equipment_instances(id) ON DELETE RESTRICT,
  metric                TEXT NOT NULL CHECK (metric IN ('reps','seconds')),
  reps                  INTEGER,
  seconds               INTEGER,
  side                  TEXT NOT NULL CHECK (side IN ('left','right','both')),
  rir                   INTEGER,
  note                  TEXT,
  status                TEXT NOT NULL CHECK (status IN ('completed','skipped','draft','voided')),
  completed_at          INTEGER,
  -- Calcolata alla conferma e CONSERVATA: i confronti restano riproducibili
  -- anche se cambia il codice che li ha generati (§9, units.ts).
  comparability_key     TEXT NOT NULL,
  -- Chiave di idempotenza: (sessione, esercizio svolto, ordine, lato).
  -- E' il meccanismo contro il doppio tocco (§10): un secondo inserimento
  -- identico e' un no-op verificabile, non un duplicato. Sta in SQL e non
  -- in un debounce dell'interfaccia perche' un debounce non protegge da un
  -- riavvio dell'app, da un rientro in primo piano o da un retry di rete.
  idempotency_key       TEXT NOT NULL UNIQUE,
  revision              INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  CHECK (load_kg IS NULL OR load_convention NOT IN ('bodyweight','timeOnly')),
  CHECK (load_kg IS NULL OR load_kg >= 0),
  CHECK (load_convention NOT IN ('machineStack','assisted') OR equipment_instance_id IS NOT NULL),
  CHECK ((metric = 'reps' AND seconds IS NULL) OR (metric = 'seconds' AND reps IS NULL)),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS performed_cardio (
  id              TEXT PRIMARY KEY NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('steady','intervals')),
  minutes         REAL NOT NULL,
  rounds_completed INTEGER,
  intensity_note  TEXT,
  -- true SOLO se l'utente ha confermato: il trascorrere del tempo non
  -- dimostra il cardio (§13).
  confirmed       INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0,1)),
  revision        INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
) STRICT;

-- Bozze dei campi in corso di compilazione (§10: "La bozza dei campi in corso
-- viene salvata"). Tabella separata da performed_sets perche' una bozza NON
-- e' una serie eseguita e non deve poter essere contata per sbaglio.
CREATE TABLE IF NOT EXISTS session_drafts (
  id                    TEXT PRIMARY KEY NOT NULL,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  performed_exercise_id TEXT REFERENCES performed_exercises(id) ON DELETE CASCADE,
  set_order             INTEGER,
  side                  TEXT,
  fields_json           TEXT NOT NULL,
  revision              INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  UNIQUE (session_id, performed_exercise_id, set_order, side)
) STRICT;

-- ---------------------------------------------------------------------------
-- Timer persistiti. La verita' del timer e' una SCADENZA salvata qui, non un
-- setInterval (§11): al rientro nell'app un recupero scaduto deve risultare
-- terminato, e nessuna serie viene completata automaticamente.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS timers (
  id                    TEXT PRIMARY KEY NOT NULL,
  workspace_id          TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id            TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  performed_set_id      TEXT,
  kind                  TEXT NOT NULL CHECK (kind IN ('rest','exercise','cardioInterval','other')),
  status                TEXT NOT NULL CHECK (status IN ('running','paused','expired','cancelled','acknowledged')),
  duration_seconds      INTEGER NOT NULL,
  started_at            INTEGER NOT NULL,
  -- Scadenza assoluta: e' questa la fonte di verita'.
  expires_at            INTEGER NOT NULL,
  paused_at             INTEGER,
  remaining_ms_at_pause INTEGER,
  -- Base monotona al momento dell'avvio: consente di accorgersi che
  -- l'orologio di sistema e' stato spostato a mano (§11).
  monotonic_base        REAL,
  note                  TEXT,
  revision              INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  CHECK (status <> 'paused' OR paused_at IS NOT NULL)
) STRICT;

-- ---------------------------------------------------------------------------
-- Corpo, recupero, abitudini, pista, foto
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS measurements (
  id           TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN
                 ('weightKg','waistCm','chestCm','hipsCm','thighCm','armCm','neckCm','bodyFatPercent')),
  value        REAL NOT NULL,
  measured_on  TEXT NOT NULL,
  recorded_at  INTEGER NOT NULL,
  -- Obbligatorio per bodyFatPercent: una percentuale senza metodo non e' un
  -- dato interpretabile (§15, body.ts).
  method       TEXT,
  note         TEXT,
  revision     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER,
  CHECK (kind <> 'bodyFatPercent' OR method IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS recovery_check_ins (
  id            TEXT PRIMARY KEY NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  check_in_date TEXT NOT NULL,
  sleep_hours   REAL,
  sleep_quality INTEGER,
  energy        INTEGER,
  stress        INTEGER,
  soreness      INTEGER,
  note          TEXT,
  recorded_at   INTEGER NOT NULL,
  revision      INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS habit_entries (
  id                TEXT PRIMARY KEY NOT NULL,
  workspace_id      TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entry_date        TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('walk','cardio','nutritionNote','other')),
  minutes           REAL,
  -- Calorie e proteine sono dati MANUALI e facoltativi: nessuna caloria
  -- bruciata viene calcolata dall'app (§15).
  manual_kcal       REAL,
  manual_protein_g  REAL,
  note              TEXT,
  recorded_at       INTEGER NOT NULL,
  revision          INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS track_days (
  id                  TEXT PRIMARY KEY NOT NULL,
  workspace_id        TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  track_date          TEXT NOT NULL,
  circuit             TEXT NOT NULL,
  session_count       INTEGER NOT NULL,
  minutes_per_session REAL,
  fatigue_json        TEXT NOT NULL DEFAULT '{}',
  best_lap_seconds    REAL,
  average_lap_seconds REAL,
  note                TEXT,
  recorded_at         INTEGER NOT NULL,
  revision            INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER
) STRICT;

CREATE TABLE IF NOT EXISTS progress_photos (
  id           TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  photo_date   TEXT NOT NULL,
  local_path   TEXT NOT NULL,
  note         TEXT,
  -- Disattivata per default: le foto si sincronizzano solo se l'utente lo
  -- attiva espressamente (§16).
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0,1)),
  recorded_at  INTEGER NOT NULL,
  revision     INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  deleted_at   INTEGER
) STRICT;

-- ---------------------------------------------------------------------------
-- Proposte del coach, approvazioni e rifiuti
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coach_proposals (
  id                              TEXT PRIMARY KEY NOT NULL,
  workspace_id                    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source                          TEXT NOT NULL CHECK (source IN ('adaptiveEngine','generativeCoach','userRequest')),
  created_at                      INTEGER NOT NULL,
  title                           TEXT NOT NULL,
  reason                          TEXT NOT NULL,
  change_json                     TEXT NOT NULL,
  evidence_json                   TEXT NOT NULL DEFAULT '[]',
  missing_information_json        TEXT NOT NULL DEFAULT '[]',
  reevaluate_on                   TEXT NOT NULL,
  base_plan_version               INTEGER NOT NULL,
  target_week_index               INTEGER,
  target_slot                     TEXT CHECK (target_slot IS NULL OR target_slot IN ('A','B')),
  decision                        TEXT NOT NULL
                                  CHECK (decision IN ('pending','accepted','modified','deferred','rejected','undone','superseded')),
  decided_at                      INTEGER,
  decision_note                   TEXT,
  requires_explicit_confirmation  INTEGER NOT NULL DEFAULT 0 CHECK (requires_explicit_confirmation IN (0,1)),
  revision                        INTEGER NOT NULL,
  updated_at                      INTEGER NOT NULL,
  deleted_at                      INTEGER
) STRICT;

-- Storico delle decisioni: una proposta accettata e poi annullata lascia
-- DUE righe qui. Serve a mostrare "cosa e' stato accettato e quando" (§9).
CREATE TABLE IF NOT EXISTS proposal_decisions (
  id          TEXT PRIMARY KEY NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES coach_proposals(id) ON DELETE CASCADE,
  decision    TEXT NOT NULL
              CHECK (decision IN ('pending','accepted','modified','deferred','rejected','undone','superseded')),
  decided_at  INTEGER NOT NULL,
  note        TEXT,
  applied     INTEGER NOT NULL DEFAULT 0 CHECK (applied IN (0,1)),
  applied_at  INTEGER,
  device_id   TEXT,
  revision    INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Sincronizzazione
-- ---------------------------------------------------------------------------
-- Coda/registro delle operazioni da inviare. Ogni riga nasce nella STESSA
-- transazione della modifica ai dati che descrive (§7).
CREATE TABLE IF NOT EXISTS sync_operations (
  id              TEXT PRIMARY KEY NOT NULL,
  workspace_id    TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  entity_table    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  op_kind         TEXT NOT NULL CHECK (op_kind IN ('upsert','softDelete')),
  -- Versione di base su cui la modifica e' stata fatta: serve a distinguere
  -- una modifica indipendente da una modifica concorrente (§8.2).
  base_revision   INTEGER,
  revision        INTEGER NOT NULL,
  format_version  INTEGER NOT NULL,
  payload_json    TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  -- Contatore causale locale: ordina le operazioni SENZA affidarsi
  -- all'orologio del dispositivo, che la specifica vieta di usare come
  -- criterio per decidere chi vince (§8).
  lamport         INTEGER NOT NULL,
  cause           TEXT,
  bundle_id       TEXT,
  -- NULL = ancora in coda. Non si avanza il cursore prima di aver
  -- persistito (§8).
  sent_at         INTEGER,
  attempt_count   INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT
) STRICT;

-- Registro delle operazioni GIA' applicate: rende l'applicazione idempotente
-- anche se un pacchetto arriva due volte o fuori ordine (§8).
CREATE TABLE IF NOT EXISTS sync_applied_operations (
  id              TEXT PRIMARY KEY NOT NULL,
  operation_id    TEXT NOT NULL UNIQUE,
  origin_device_id TEXT NOT NULL,
  entity_table    TEXT NOT NULL,
  entity_id       TEXT NOT NULL,
  applied_at      INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS sync_state (
  id                    TEXT PRIMARY KEY NOT NULL,
  workspace_id          TEXT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  remote_cursor         TEXT,
  last_pulled_at        INTEGER,
  last_pushed_at        INTEGER,
  last_snapshot_at      INTEGER,
  google_account_id     TEXT,
  google_account_email  TEXT,
  protocol_version      INTEGER NOT NULL,
  -- Se non nullo, la sincronizzazione e' bloccata ma i dati locali restano
  -- utilizzabili (§14: "blocca SOLO la sincronizzazione incompatibile").
  sync_blocked_reason   TEXT,
  revision              INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
) STRICT;

-- Conflitti incompatibili sullo stesso dato: si conservano ENTRAMBE le
-- alternative e si chiede una scelta. Nessuna delle due viene scartata in
-- silenzio (§8.2).
CREATE TABLE IF NOT EXISTS conflicts (
  id                   TEXT PRIMARY KEY NOT NULL,
  workspace_id         TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_table         TEXT NOT NULL,
  entity_id            TEXT NOT NULL,
  kind                 TEXT NOT NULL
                       CHECK (kind IN ('updateUpdate','updateDelete','programRevision','other')),
  local_payload_json   TEXT NOT NULL,
  remote_payload_json  TEXT NOT NULL,
  local_revision       INTEGER,
  remote_revision      INTEGER,
  remote_origin_device_id TEXT,
  detected_at          INTEGER NOT NULL,
  resolution           TEXT NOT NULL DEFAULT 'pending'
                       CHECK (resolution IN ('pending','keepLocal','keepRemote','merged','keepBoth')),
  resolved_at          INTEGER,
  resolved_payload_json TEXT,
  note                 TEXT,
  revision             INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
) STRICT;

-- ---------------------------------------------------------------------------
-- Indici: solo su cio' che viene realmente interrogato.
-- ---------------------------------------------------------------------------
-- Precompilazione dall'ultima prestazione comparabile, a ogni serie (§10).
CREATE INDEX IF NOT EXISTS idx_performed_sets_comparability
  ON performed_sets (comparability_key, completed_at);
CREATE INDEX IF NOT EXISTS idx_performed_sets_session
  ON performed_sets (session_id);
CREATE INDEX IF NOT EXISTS idx_performed_sets_exercise
  ON performed_sets (performed_exercise_id);
-- Storico e calendario.
CREATE INDEX IF NOT EXISTS idx_sessions_performed_date ON sessions (performed_date);
CREATE INDEX IF NOT EXISTS idx_sessions_status         ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_planned_events_date     ON planned_events (planned_date);
-- Grafici e media mobile.
CREATE INDEX IF NOT EXISTS idx_measurements_kind_date  ON measurements (kind, measured_on);
-- Coda di sincronizzazione: "quali operazioni devo ancora inviare".
CREATE INDEX IF NOT EXISTS idx_sync_operations_sent_at ON sync_operations (sent_at);
-- Proposte da decidere.
CREATE INDEX IF NOT EXISTS idx_coach_proposals_decision ON coach_proposals (decision);

-- ---------------------------------------------------------------------------
-- UNA SOLA SESSIONE ATTIVA PER INSTALLAZIONE (§10).
--
-- Indice UNIQUE parziale: il vincolo e' nel database, non solo in un
-- controllo applicativo che si puo' aggirare con una seconda schermata o con
-- una ripresa dopo un crash. NON e' un blocco globale fra dispositivi: la
-- specifica vieta esplicitamente di promettere un blocco globale infallibile
-- offline. Qui si garantisce l'unicita' PER owner_device_id.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_one_active_per_device
  ON sessions (owner_device_id)
  WHERE status = 'active' AND owner_device_id IS NOT NULL AND deleted_at IS NULL;
`;
