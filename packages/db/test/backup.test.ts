/**
 * Esportazione e importazione del backup.
 *
 * §14: ripristino transazionale, gestione duplicati, anteprima, e soprattutto
 * "un file corrotto non deve cancellare lo storico".
 */

import { describe, expect, it } from 'vitest';

import { InvalidBackupError, SUPPORTED_PROTOCOL_VERSION } from '@trackstrong/db';

import {
  DEVICE_ID,
  openTestDb,
  startSyntheticSession,
  syntheticPlan,
  T0,
  WORKSPACE_ID,
  type TestContext,
} from './helpers.js';

/** Popola un archivio sintetico con un po' di tutto. */
function popola(ctx: TestContext): { readonly sessionId: string } {
  ctx.repos.program.savePlan(syntheticPlan(1));
  ctx.repos.program.initCursor(1, '2027-03-01');
  const { sessionId, exerciseId } = startSyntheticSession(ctx);
  for (const order of [1, 2, 3]) {
    ctx.repos.sets.record({
      sessionId,
      performedExerciseId: exerciseId,
      order,
      role: 'working',
      exerciseId: 'es-prova-1',
      variantId: null,
      perSide: false,
      load: { convention: 'machineStack', kg: 55 + order * 5, equipmentInstanceId: ctx.pressAId },
      metric: 'reps',
      reps: 9,
      seconds: null,
      side: 'both',
      rir: 2,
      note: null,
      status: 'completed',
      completedAt: T0 + order * 120_000,
    });
  }
  ctx.repos.sessions.finish(sessionId, T0 + 3_600_000, '2027-03-01');
  for (const [giorno, valore] of [
    ['2027-03-01', 90],
    ['2027-03-03', 89.4],
  ] as const) {
    ctx.repos.measurements.record({
      kind: 'weightKg',
      value: valore,
      measuredOn: giorno,
      recordedAt: T0,
    });
  }
  ctx.repos.proposals.save({
    source: 'adaptiveEngine',
    createdAt: T0,
    title: 'Proposta di prova',
    reason: 'Motivo sintetico.',
    change: { kind: 'hold', exerciseId: 'es-prova-1' },
    evidence: [],
    missingInformation: [],
    reevaluateOn: '2027-03-08',
    basePlanVersion: 1,
    requiresExplicitConfirmation: false,
  });
  return { sessionId };
}

describe('esportazione e importazione', () => {
  it('esporta e reimporta su un database vuoto senza perdite', () => {
    const origine = openTestDb();
    const { sessionId } = popola(origine);
    const backup = origine.repos.backup.exportJson(T0 + 10_000_000);
    const conteggiOrigine = origine.repos.backup.export(T0).counts;
    origine.close();

    // Archivio nuovo, stesso identificativo di workspace (stesso utente).
    const destinazione = openTestDb({ bare: true });
    const anteprima = destinazione.repos.backup.preview(backup);
    expect(anteprima.totalDuplicates).toBe(0);
    expect(anteprima.totalNew).toBe(anteprima.totalInFile);
    expect(anteprima.sameWorkspace).toBe(true);

    const esito = destinazione.repos.backup.import(backup);
    expect(esito.skippedDuplicates).toBe(0);
    expect(esito.inserted).toBe(anteprima.totalInFile);

    const conteggiDestinazione = destinazione.repos.backup.export(T0).counts;
    for (const [tabella, quante] of Object.entries(conteggiOrigine)) {
      expect(conteggiDestinazione[tabella], `tabella ${tabella}`).toBe(quante);
    }

    // I dati sono davvero utilizzabili, non solo presenti.
    const seduta = destinazione.repos.sessions.byId(sessionId);
    expect(seduta?.status).toBe('partial');
    expect(seduta?.snapshot.prescription.exercises).toHaveLength(2);
    expect(destinazione.repos.sets.bySession(sessionId)).toHaveLength(3);
    expect(destinazione.repos.measurements.movingAverage('weightKg')).toHaveLength(2);
    expect(destinazione.repos.program.currentPlan()?.version).toBe(1);
    expect(destinazione.repos.workspace.profile()?.displayName).toBe('Atleta di prova');
    destinazione.close();
  });

  it('reimportare lo stesso backup non crea duplicati', () => {
    const ctx = openTestDb();
    popola(ctx);
    const backup = ctx.repos.backup.exportJson(T0);
    const conteggiPrima = ctx.repos.backup.export(T0).counts;

    const primo = ctx.repos.backup.import(backup);
    // Le righe erano gia' tutte presenti: tutte saltate.
    expect(primo.inserted).toBe(0);
    expect(primo.skippedDuplicates).toBeGreaterThan(0);

    const secondo = ctx.repos.backup.import(backup);
    expect(secondo.inserted).toBe(0);

    const conteggiDopo = ctx.repos.backup.export(T0).counts;
    expect(conteggiDopo).toEqual(conteggiPrima);

    // Anche le prestazioni non si sono moltiplicate.
    const serie = ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM performed_sets');
    expect(serie?.n).toBe(3);
    ctx.close();
  });

  it('l\'anteprima segnala i duplicati senza scrivere niente', () => {
    const ctx = openTestDb();
    popola(ctx);
    const backup = ctx.repos.backup.exportJson(T0);
    const righePrima = ctx.db.driver.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM performed_sets',
    )?.n;

    const anteprima = ctx.repos.backup.preview(backup);
    expect(anteprima.totalDuplicates).toBe(anteprima.totalInFile);
    expect(anteprima.totalNew).toBe(0);
    expect(anteprima.warnings.some((w) => w.includes('duplicat'))).toBe(true);
    expect(anteprima.warnings.some((w) => w.includes('dati personali'))).toBe(true);

    expect(
      ctx.db.driver.get<{ n: number }>('SELECT COUNT(*) AS n FROM performed_sets')?.n,
    ).toBe(righePrima);
    ctx.close();
  });

  it('segnala l\'esportazione con dati personali non cifrati', () => {
    const ctx = openTestDb();
    popola(ctx);
    const file = ctx.repos.backup.export(T0);
    expect(file.containsPersonalData).toBe(true);
    expect(file.workspaceId).toBe(WORKSPACE_ID);
    expect(file.deviceId).toBe(DEVICE_ID);
    // Lo stato di sincronizzazione NON viene esportato.
    expect(Object.keys(file.tables)).not.toContain('sync_state');
    expect(Object.keys(file.tables)).not.toContain('sync_operations');
    expect(Object.keys(file.tables)).not.toContain('timers');
    ctx.close();
  });
});

describe('file corrotto', () => {
  it('un JSON illeggibile non tocca il database', () => {
    const ctx = openTestDb();
    popola(ctx);
    const prima = ctx.repos.backup.export(T0).counts;

    expect(() => ctx.repos.backup.import('{ questo non e\' json ')).toThrowError(
      InvalidBackupError,
    );
    expect(ctx.repos.backup.export(T0).counts).toEqual(prima);
    ctx.close();
  });

  it('un backup corrotto a meta\' annulla la transazione e lascia lo storico intatto', () => {
    const origine = openTestDb();
    popola(origine);
    const testo = origine.repos.backup.exportJson(T0);
    origine.close();

    // Destinazione con uno storico PROPRIO, che non deve essere toccato.
    const destinazione = openTestDb();
    const suo = startSyntheticSession(destinazione);
    destinazione.repos.sets.record({
      sessionId: suo.sessionId,
      performedExerciseId: suo.exerciseId,
      order: 1,
      role: 'working',
      exerciseId: 'es-prova-1',
      variantId: null,
      perSide: false,
      load: { convention: 'machineStack', kg: 45, equipmentInstanceId: destinazione.pressAId },
      metric: 'reps',
      reps: 10,
      seconds: null,
      side: 'both',
      rir: 3,
      note: 'storico locale che deve sopravvivere',
      status: 'completed',
      completedAt: T0 + 60_000,
    });
    destinazione.repos.measurements.record({
      kind: 'weightKg',
      value: 87,
      measuredOn: '2027-04-01',
      recordedAt: T0,
    });
    destinazione.repos.sessions.finish(suo.sessionId, T0 + 3_000_000, '2027-04-01');
    const contiPrima = destinazione.repos.backup.export(T0).counts;

    // Corruzione realistica: l'involucro e' valido, il file contiene
    // tabelle valide, e una riga a meta' di `performed_sets` ha una colonna
    // inesistente. La validazione riga-per-riga sta DENTRO la transazione,
    // quindi le righe precedenti (workspaces, profiles, sessions...) erano
    // gia' state scritte quando l'errore scatta.
    const parsato = JSON.parse(testo) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    const serie = parsato.tables['performed_sets'];
    expect(serie).toBeDefined();
    expect(serie?.length).toBeGreaterThan(1);
    if (serie?.[1] !== undefined) {
      serie[1]['colonna_che_non_esiste'] = 'spazzatura';
    }
    const corrotto = JSON.stringify(parsato);

    expect(() => destinazione.repos.backup.import(corrotto)).toThrowError(InvalidBackupError);

    // Nulla e' stato scritto: nemmeno le righe che precedevano l'errore.
    expect(destinazione.repos.backup.export(T0).counts).toEqual(contiPrima);
    // Lo storico locale e' intatto e ancora leggibile.
    const serieLocali = destinazione.repos.sets.bySession(suo.sessionId);
    expect(serieLocali).toHaveLength(1);
    expect(serieLocali[0]?.note).toBe('storico locale che deve sopravvivere');
    expect(destinazione.repos.measurements.series('weightKg')).toHaveLength(1);
    destinazione.close();
  });

  it('un backup con formato piu\' recente viene rifiutato', () => {
    const ctx = openTestDb();
    popola(ctx);
    const prima = ctx.repos.backup.export(T0).counts;
    const file = ctx.repos.backup.export(T0);
    const futuro = JSON.stringify({ ...file, formatVersion: 99 });
    expect(() => ctx.repos.backup.import(futuro)).toThrowError(/piu' recente/);
    expect(ctx.repos.backup.export(T0).counts).toEqual(prima);
    ctx.close();
  });

  it('una riga senza id viene rifiutata', () => {
    const ctx = openTestDb();
    popola(ctx);
    const file = ctx.repos.backup.export(T0);
    const rotto = JSON.parse(JSON.stringify(file)) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    const misure = rotto.tables['measurements'];
    if (misure?.[0] !== undefined) delete misure[0]['id'];
    expect(() => ctx.repos.backup.import(JSON.stringify(rotto))).toThrowError(/"id" testuale/);
    ctx.close();
  });
});

describe('ripristino su un dispositivo che ha gia\' le proprie righe uniche', () => {
  it('le righe a riga unica per archivio vengono riconosciute come duplicati', () => {
    // `settings` e `program_cursor` hanno UNIQUE(workspace_id): un backup che
    // arriva da un altro telefono porta id diversi ma lo stesso archivio.
    const origine = openTestDb();
    origine.repos.program.savePlan(syntheticPlan(1));
    origine.repos.program.initCursor(1, '2027-03-01');
    const backup = origine.repos.backup.exportJson(T0);
    origine.close();

    const destinazione = openTestDb();
    // La destinazione ha gia' un SUO cursore, con un altro identificativo.
    destinazione.repos.program.savePlan(syntheticPlan(1));
    destinazione.repos.program.initCursor(1, '2027-05-01');
    const suoCursore = destinazione.db.driver.get<{ id: string }>(
      'SELECT id FROM program_cursor LIMIT 1',
    );

    const esito = destinazione.repos.backup.import(backup);
    expect(esito.skippedDuplicates).toBeGreaterThan(0);

    // Un solo cursore, e resta quello locale.
    const cursori = destinazione.db.driver.all<{ id: string; entered_on: string }>(
      'SELECT id, entered_on FROM program_cursor',
    );
    expect(cursori).toHaveLength(1);
    expect(cursori[0]?.id).toBe(suoCursore?.id);
    expect(cursori[0]?.entered_on).toBe('2027-05-01');
    destinazione.close();
  });
});

describe('importazione di un archivio diverso', () => {
  it('avvisa che si stanno unendo due archivi', () => {
    const origine = openTestDb();
    popola(origine);
    const file = origine.repos.backup.export(T0);
    origine.close();

    const destinazione = openTestDb({ bare: true });
    destinazione.repos.workspace.ensureWorkspace(
      'Archivio di prova',
      T0,
      SUPPORTED_PROTOCOL_VERSION,
    );
    const altroArchivio = JSON.stringify({ ...file, workspaceId: 'archivio-diverso' });
    const anteprima = destinazione.repos.backup.preview(altroArchivio);
    expect(anteprima.sameWorkspace).toBe(false);
    expect(anteprima.warnings.some((w) => w.includes('archivio diverso'))).toBe(true);
    destinazione.close();
  });
});
