/**
 * Migrazioni: database vuoto, percorso incrementale, archivio troppo recente.
 */

import { describe, expect, it } from 'vitest';

import {
  CURRENT_SCHEMA_VERSION,
  listColumns,
  listIndexes,
  listTables,
  META_PROTOCOL_VERSION,
  META_SCHEMA_VERSION,
  MIGRATIONS,
  migrate,
  openDatabaseTolerant,
  readMeta,
  readSchemaVersion,
  SchemaTooNewError,
  SUPPORTED_PROTOCOL_VERSION,
  writeMeta,
} from '@trackstrong/db';

import { DEVICE_ID, openTestDb, rawDriver, T0, WORKSPACE_ID } from './helpers.js';

/** Tabelle richieste dalla specifica §7. */
const TABELLE_ATTESE = [
  'coach_proposals',
  'conflicts',
  'devices',
  'equipment_instances',
  'exercise_overrides',
  'habit_entries',
  'measurements',
  'meta',
  'performed_cardio',
  'performed_exercises',
  'performed_sets',
  'physical_limitations',
  'planned_events',
  'profiles',
  'program_blocks',
  'program_cursor',
  'program_plans',
  'program_weeks',
  'progress_photos',
  'proposal_decisions',
  'recovery_check_ins',
  'session_drafts',
  'sessions',
  'settings',
  'sync_applied_operations',
  'sync_operations',
  'sync_state',
  'timers',
  'track_days',
  'workspaces',
] as const;

describe('migrazione da database vuoto', () => {
  it('crea tutte le tabelle richieste dalla specifica', () => {
    const driver = rawDriver();
    try {
      const result = migrate(driver);
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.applied).toEqual(MIGRATIONS.map((m) => m.version));

      const tabelle = listTables(driver);
      for (const attesa of TABELLE_ATTESE) {
        expect(tabelle, `manca la tabella "${attesa}"`).toContain(attesa);
      }
    } finally {
      driver.close();
    }
  });

  it('aggiorna meta con versione di schema e di protocollo', () => {
    const driver = rawDriver();
    try {
      migrate(driver);
      expect(readMeta(driver, META_SCHEMA_VERSION)).toBe(String(CURRENT_SCHEMA_VERSION));
      expect(readMeta(driver, META_PROTOCOL_VERSION)).toBe(String(SUPPORTED_PROTOCOL_VERSION));
      expect(readSchemaVersion(driver)).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      driver.close();
    }
  });

  it('crea gli indici dichiarati come necessari', () => {
    const driver = rawDriver();
    try {
      migrate(driver);
      const indici = listIndexes(driver);
      for (const atteso of [
        'idx_performed_sets_comparability',
        'idx_sessions_performed_date',
        'idx_sessions_status',
        'idx_planned_events_date',
        'idx_measurements_kind_date',
        'idx_sync_operations_sent_at',
        'idx_coach_proposals_decision',
        'ux_sessions_one_active_per_device',
        'idx_sync_operations_entity',
      ]) {
        expect(indici, `manca l'indice "${atteso}"`).toContain(atteso);
      }
    } finally {
      driver.close();
    }
  });

  it('e\' idempotente: una seconda chiamata non applica nulla', () => {
    const driver = rawDriver();
    try {
      migrate(driver);
      const seconda = migrate(driver);
      expect(seconda.applied).toEqual([]);
      expect(seconda.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      driver.close();
    }
  });
});

describe('migrazione incrementale 001 -> 002', () => {
  it('applica solo la 002 su un database fermo alla 001', () => {
    const driver = rawDriver();
    try {
      const prima = migrate(driver, 1);
      expect(prima.applied).toEqual([1]);
      expect(readSchemaVersion(driver)).toBe(1);
      // La colonna della 002 non c'e' ancora.
      expect(listColumns(driver, 'performed_sets')).not.toContain('prefilled');
      expect(listIndexes(driver)).not.toContain('idx_sync_operations_entity');

      const seconda = migrate(driver);
      expect(seconda.fromVersion).toBe(1);
      expect(seconda.applied).toEqual([2]);
      expect(readSchemaVersion(driver)).toBe(2);
      expect(listColumns(driver, 'performed_sets')).toContain('prefilled');
      expect(listIndexes(driver)).toContain('idx_sync_operations_entity');
    } finally {
      driver.close();
    }
  });

  it('conserva le righe scritte prima della 002 e applica il valore predefinito', () => {
    const driver = rawDriver();
    try {
      migrate(driver, 1);
      driver.run(
        `INSERT INTO workspaces (id, name, created_at, sync_protocol_version, revision, updated_at)
         VALUES ('w1', 'Archivio di prova', ?, 1, 1, ?)`,
        [T0, T0],
      );
      driver.run(
        `INSERT INTO sessions (id, workspace_id, planned_date, slot, status,
           prescription_snapshot, plan_version, week_index, block_id, paused_ms, revision, updated_at)
         VALUES ('s1', 'w1', '2027-03-01', 'A', 'completed', '{}', 1, 1, 'b1', 0, 1, ?)`,
        [T0],
      );
      driver.run(
        `INSERT INTO performed_exercises (id, session_id, order_index, exercise_id, skipped, revision, updated_at)
         VALUES ('pe1', 's1', 1, 'es-prova-1', 0, 1, ?)`,
        [T0],
      );
      driver.run(
        `INSERT INTO performed_sets (id, session_id, performed_exercise_id, order_index, role,
           load_convention, load_kg, metric, reps, side, status, completed_at,
           comparability_key, idempotency_key, revision, updated_at)
         VALUES ('ps1', 's1', 'pe1', 1, 'working', 'barbellTotal', 40, 'reps', 8, 'both',
                 'completed', ?, 'chiave-prova', 'idem-prova', 1, ?)`,
        [T0, T0],
      );

      migrate(driver);

      const riga = driver.get<{ id: string; prefilled: number; reps: number }>(
        'SELECT id, prefilled, reps FROM performed_sets WHERE id = ?',
        ['ps1'],
      );
      expect(riga?.reps).toBe(8);
      expect(riga?.prefilled).toBe(0);
    } finally {
      driver.close();
    }
  });
});

describe('archivio piu\' recente del codice', () => {
  it('lancia SchemaTooNewError senza toccare i dati', () => {
    const ctx = openTestDb();
    const { driver } = ctx;
    // Un'app futura ha alzato la versione dello schema.
    writeMeta(driver, META_SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION + 7));

    expect(() => migrate(driver)).toThrowError(SchemaTooNewError);
    try {
      migrate(driver);
      expect.unreachable('migrate() doveva lanciare');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaTooNewError);
      const tipizzato = error as SchemaTooNewError;
      expect(tipizzato.foundVersion).toBe(CURRENT_SCHEMA_VERSION + 7);
      expect(tipizzato.supportedVersion).toBe(CURRENT_SCHEMA_VERSION);
    }
    ctx.close();
  });

  it('i dati restano leggibili e la sola sincronizzazione risulta bloccata', () => {
    // Si costruisce un archivio con dati reali, poi si alza la versione.
    const primo = openTestDb();
    primo.repos.measurements.record({
      kind: 'weightKg',
      value: 87.4,
      measuredOn: '2027-03-02',
      recordedAt: T0,
    });
    writeMeta(primo.driver, META_SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION + 1));

    // La stessa connessione viene riaperta dal codice "vecchio".
    const risultato = openDatabaseTolerant(primo.driver, {
      workspaceId: WORKSPACE_ID,
      deviceId: DEVICE_ID,
    });

    expect(risultato.schemaTooNew).toBeInstanceOf(SchemaTooNewError);
    expect(risultato.db.syncBlockedReason).not.toBeNull();

    // I dati ci sono ancora e si leggono.
    const righe = risultato.db.driver.all<{ value: number }>(
      'SELECT value FROM measurements ORDER BY measured_on',
    );
    expect(righe).toHaveLength(1);
    expect(righe[0]?.value).toBeCloseTo(87.4, 5);

    // E il profilo sintetico e' intatto.
    const profilo = risultato.db.driver.get<{ display_name: string }>(
      'SELECT display_name FROM profiles LIMIT 1',
    );
    expect(profilo?.display_name).toBe('Atleta di prova');

    primo.close();
  });
});
