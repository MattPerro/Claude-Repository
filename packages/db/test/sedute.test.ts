/**
 * Sedute: una sola sessione attiva, bozze, fotografia congelata, integrita'.
 */

import { describe, expect, it } from 'vitest';

import { formatRange } from '@trackstrong/core';
import { ActiveSessionExistsError, SqlConstraintError } from '@trackstrong/db';

import {
  openTestDb,
  startSyntheticSession,
  syntheticExercisePrescription,
  syntheticPlan,
  syntheticSessionPrescription,
  syntheticSnapshot,
  T0,
  type TestContext,
} from './helpers.js';

describe('una sola sessione attiva per installazione', () => {
  it('avviare una seconda seduta mentre una e\' attiva viene rifiutato', () => {
    const ctx = openTestDb();
    const prima = ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(),
      startedAt: T0,
    });

    expect(() =>
      ctx.repos.sessions.start({
        plannedDate: '2027-03-04',
        slot: 'B',
        snapshot: syntheticSnapshot(1, 1, 'B'),
        startedAt: T0 + 3_600_000,
      }),
    ).toThrowError(ActiveSessionExistsError);

    const attive = ctx.db.driver.all<{ id: string }>(
      "SELECT id FROM sessions WHERE status = 'active'",
    );
    expect(attive.map((r) => r.id)).toEqual([prima.id]);
    ctx.close();
  });

  it('il vincolo e\' nel database: l\'inserimento diretto di una seconda attiva fallisce', () => {
    const ctx = openTestDb();
    ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(),
      startedAt: T0,
    });

    let catturato: unknown;
    try {
      ctx.db.driver.run(
        `INSERT INTO sessions (id, workspace_id, planned_date, slot, status,
           prescription_snapshot, plan_version, week_index, block_id, paused_ms,
           owner_device_id, revision, updated_at)
         VALUES ('seconda-attiva', ?, '2027-03-04', 'B', 'active', '{}', 1, 1, 'b1', 0, ?, 1, ?)`,
        [ctx.db.workspaceId, ctx.db.deviceId, T0],
      );
    } catch (error) {
      catturato = error;
    }
    expect(catturato).toBeInstanceOf(SqlConstraintError);
    expect((catturato as SqlConstraintError).kind).toBe('unique');
    ctx.close();
  });

  it('chiusa la prima, la seconda si avvia', () => {
    const ctx = openTestDb();
    const prima = ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(),
      startedAt: T0,
    });
    ctx.repos.sessions.finish(prima.id, T0 + 4_000_000, '2027-03-01');

    const seconda = ctx.repos.sessions.start({
      plannedDate: '2027-03-04',
      slot: 'B',
      snapshot: syntheticSnapshot(1, 1, 'B'),
      startedAt: T0 + 5_000_000,
    });
    expect(seconda.status).toBe('active');
    expect(ctx.repos.sessions.activeForThisDevice()?.id).toBe(seconda.id);
    ctx.close();
  });

  it('una seduta attiva su un altro dispositivo non blocca questa installazione', () => {
    const ctx = openTestDb();
    // Seduta attiva di un altro telefono: il vincolo e' PER dispositivo, la
    // specifica vieta di promettere un blocco globale infallibile offline.
    ctx.db.driver.run(
      `INSERT INTO sessions (id, workspace_id, planned_date, slot, status,
         prescription_snapshot, plan_version, week_index, block_id, paused_ms,
         owner_device_id, revision, updated_at)
       VALUES ('altrove', ?, '2027-03-01', 'A', 'active', '{}', 1, 1, 'b1', 0, 'altro-telefono', 1, ?)`,
      [ctx.db.workspaceId, T0],
    );
    const mia = ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(),
      startedAt: T0,
    });
    expect(mia.status).toBe('active');
    expect(ctx.repos.sessions.activeForThisDevice()?.id).toBe(mia.id);
    ctx.close();
  });

  it('riprende una seduta interrotta e somma il tempo di pausa', () => {
    const ctx = openTestDb();
    const seduta = ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(),
      startedAt: T0,
    });
    ctx.repos.sessions.pause(seduta.id, T0 + 600_000);
    expect(ctx.repos.sessions.byId(seduta.id)?.status).toBe('paused');

    const ripresa = ctx.repos.sessions.resume(seduta.id, T0 + 1_200_000);
    expect(ripresa.status).toBe('active');
    expect(ripresa.pausedMs).toBe(600_000);
    expect(ripresa.ownerDeviceId).toBe(ctx.db.deviceId);
    ctx.close();
  });
});

describe('bozze dei campi in corso', () => {
  it('vengono salvate, recuperate alla ripresa e non contano come eseguite', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);

    ctx.repos.sessions.saveDraft({
      sessionId,
      performedExerciseId: exerciseId,
      setOrder: 2,
      side: 'both',
      fields: { loadKg: 62.5, reps: 8, note: 'sedile al foro 4' },
    });

    // Interruzione e ripresa.
    ctx.repos.sessions.pause(sessionId, T0 + 300_000);
    const ripresa = ctx.repos.sessions.resume(sessionId, T0 + 900_000);
    expect(ripresa.status).toBe('active');

    const bozze = ctx.repos.sessions.drafts(sessionId);
    expect(bozze).toHaveLength(1);
    expect(bozze[0]?.setOrder).toBe(2);
    expect(bozze[0]?.fields['loadKg']).toBe(62.5);
    expect(bozze[0]?.fields['note']).toBe('sedile al foro 4');

    // Una bozza NON e' una serie eseguita.
    expect(ctx.repos.sets.countWorkingCompleted(sessionId)).toBe(0);
    const riepilogo = ctx.repos.sessions.summary(sessionId);
    expect(riepilogo.drafts).toBe(1);
    expect(riepilogo.workingCompleted).toBe(0);
    expect(riepilogo.finalStatus).toBe('partial');
    ctx.close();
  });

  it('salvare due volte la stessa bozza la aggiorna, non la duplica', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    ctx.repos.sessions.saveDraft({
      sessionId,
      performedExerciseId: exerciseId,
      setOrder: 1,
      side: 'both',
      fields: { reps: 7 },
    });
    ctx.repos.sessions.saveDraft({
      sessionId,
      performedExerciseId: exerciseId,
      setOrder: 1,
      side: 'both',
      fields: { reps: 9 },
    });
    const bozze = ctx.repos.sessions.drafts(sessionId);
    expect(bozze).toHaveLength(1);
    expect(bozze[0]?.fields['reps']).toBe(9);
    ctx.close();
  });

  it('alla chiusura della seduta le bozze residue non diventano serie eseguite', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    ctx.repos.sessions.saveDraft({
      sessionId,
      performedExerciseId: exerciseId,
      setOrder: 3,
      side: 'both',
      fields: { reps: 8, loadKg: 60 },
    });
    const riepilogo = ctx.repos.sessions.finish(sessionId, T0 + 3_600_000, '2027-03-01');
    expect(riepilogo.workingCompleted).toBe(0);
    expect(riepilogo.drafts).toBe(0);
    expect(ctx.repos.sets.bySession(sessionId)).toHaveLength(0);
    ctx.close();
  });
});

describe('fotografia della prescrizione congelata', () => {
  it('modificare il piano non cambia lo storico di una seduta gia\' avviata', () => {
    const ctx = openTestDb();

    // Piano versione 1: primo esercizio a 3 serie, 8-10 ripetizioni.
    const pianoV1 = syntheticPlan(1);
    ctx.repos.program.savePlan(pianoV1);
    const prescrizioneV1 = pianoV1.blocks[0]?.weeks[0]?.sessions[0];
    expect(prescrizioneV1).toBeDefined();
    if (prescrizioneV1 === undefined) return;

    const seduta = ctx.repos.sessions.start({
      plannedDate: '2027-03-01',
      slot: 'A',
      snapshot: syntheticSnapshot(1, 1, 'A', prescrizioneV1),
      startedAt: T0,
    });

    // Revisione del programma: 5 serie, 12-15 ripetizioni.
    const prescrizioneV2 = syntheticSessionPrescription('A', [
      syntheticExercisePrescription(1, { workingSets: 5, target: { min: 12, max: 15 } }),
    ]);
    const pianoV2 = {
      ...syntheticPlan(2),
      blocks: [
        {
          ...(syntheticPlan(2).blocks[0] ?? pianoV1.blocks[0]!),
          weeks: [
            {
              index: 1,
              indexInBlock: 1,
              label: 'Settimana di prova 1',
              note: null,
              sessions: [prescrizioneV2],
              isDeload: false,
            },
          ],
        },
      ],
    };
    ctx.repos.program.savePlan(pianoV2, { revisionReason: 'Revisione di prova' });

    // Il piano corrente e' cambiato...
    expect(ctx.repos.program.currentPlan()?.version).toBe(2);
    expect(
      ctx.repos.program.currentPlan()?.plan.blocks[0]?.weeks[0]?.sessions[0]?.exercises[0]
        ?.workingSets,
    ).toBe(5);

    // ...ma la seduta gia' avviata continua a vedere la SUA fotografia.
    const riletta = ctx.repos.sessions.byId(seduta.id);
    const esercizioStorico = riletta?.snapshot.prescription.exercises[0];
    expect(riletta?.snapshot.planVersion).toBe(1);
    expect(esercizioStorico?.workingSets).toBe(3);
    expect(formatRange(esercizioStorico?.target ?? { min: 0, max: 0 })).toBe('8-10');

    // E le serie previste nel riepilogo restano quelle di allora.
    expect(ctx.repos.sessions.summary(seduta.id).workingPrescribed).toBe(
      (prescrizioneV1.exercises[0]?.workingSets ?? 0) +
        (prescrizioneV1.exercises[1]?.workingSets ?? 0),
    );
    ctx.close();
  });

  it('la versione precedente del piano resta consultabile', () => {
    const ctx = openTestDb();
    ctx.repos.program.savePlan(syntheticPlan(1));
    ctx.repos.program.savePlan(syntheticPlan(2), { revisionReason: 'Aggiustamento di prova' });

    expect(ctx.repos.program.planByVersion(1)?.plan.version).toBe(1);
    expect(ctx.repos.program.planByVersion(2)?.revisionReason).toBe('Aggiustamento di prova');
    const storia = ctx.repos.program.revisionHistory();
    expect(storia.map((r) => r.version)).toEqual([1, 2]);
    expect(storia[1]?.derivedFromVersion).toBe(1);
    ctx.close();
  });
});

describe('stato finale calcolato', () => {
  it('e\' "partial" se non tutte le serie previste sono confermate', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    // La fotografia prevede 3 + 2 = 5 serie allenanti.
    for (const order of [1, 2]) {
      ctx.repos.sets.record(base(ctx, sessionId, exerciseId, order));
    }
    const riepilogo = ctx.repos.sessions.finish(sessionId, T0 + 3_600_000, '2027-03-01');
    expect(riepilogo.workingPrescribed).toBe(5);
    expect(riepilogo.workingCompleted).toBe(2);
    expect(riepilogo.finalStatus).toBe('partial');
    expect(ctx.repos.sessions.byId(sessionId)?.status).toBe('partial');
    ctx.close();
  });

  it('e\' "completed" solo quando tutte le serie previste sono confermate', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    for (const order of [1, 2, 3, 4, 5]) {
      ctx.repos.sets.record(base(ctx, sessionId, exerciseId, order));
    }
    const riepilogo = ctx.repos.sessions.finish(sessionId, T0 + 3_600_000, '2027-03-01');
    expect(riepilogo.finalStatus).toBe('completed');
    expect(ctx.repos.sessions.byId(sessionId)?.status).toBe('completed');
    expect(ctx.repos.sessions.byId(sessionId)?.performedDate).toBe('2027-03-01');
    ctx.close();
  });

  it('le serie di riscaldamento non contano come allenanti', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    for (const order of [1, 2, 3, 4, 5]) {
      ctx.repos.sets.record({ ...base(ctx, sessionId, exerciseId, order), role: 'warmup' });
    }
    const riepilogo = ctx.repos.sessions.finish(sessionId, T0 + 3_600_000, '2027-03-01');
    expect(riepilogo.warmupCompleted).toBe(5);
    expect(riepilogo.workingCompleted).toBe(0);
    expect(riepilogo.finalStatus).toBe('partial');
    ctx.close();
  });
});

describe('integrita\' referenziale', () => {
  it('foreign_keys e\' attivo', () => {
    const ctx = openTestDb();
    const riga = ctx.db.driver.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(riga?.foreign_keys).toBe(1);
    ctx.close();
  });

  it('un inserimento con riferimento inesistente fallisce', () => {
    const ctx = openTestDb();
    let catturato: unknown;
    try {
      ctx.db.driver.run(
        `INSERT INTO sessions (id, workspace_id, planned_date, slot, status,
           prescription_snapshot, plan_version, week_index, block_id, paused_ms, revision, updated_at)
         VALUES ('orfana', 'archivio-che-non-esiste', '2027-03-01', 'A', 'planned',
                 '{}', 1, 1, 'b1', 0, 1, ?)`,
        [T0],
      );
    } catch (error) {
      catturato = error;
    }
    expect(catturato).toBeInstanceOf(SqlConstraintError);
    expect((catturato as SqlConstraintError).kind).toBe('foreignKey');
    ctx.close();
  });

  it('una serie che punta a una seduta inesistente fallisce', () => {
    const ctx = openTestDb();
    const { exerciseId } = startSyntheticSession(ctx);
    expect(() =>
      ctx.db.driver.run(
        `INSERT INTO performed_sets (id, session_id, performed_exercise_id, order_index, role,
           load_convention, load_kg, metric, reps, side, status, completed_at,
           comparability_key, idempotency_key, revision, updated_at)
         VALUES ('orfana', 'seduta-inesistente', ?, 1, 'working', 'barbellTotal', 40,
                 'reps', 8, 'both', 'completed', ?, 'k', 'k-orfana', 1, ?)`,
        [exerciseId, T0, T0],
      ),
    ).toThrowError(/FOREIGN KEY constraint failed/);
    ctx.close();
  });

  it('una serie su un attrezzo inesistente fallisce', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    expect(() =>
      ctx.repos.sets.record({
        ...base(ctx, sessionId, exerciseId, 1),
        load: {
          convention: 'machineStack',
          kg: 60,
          equipmentInstanceId: 'attrezzo-che-non-esiste',
        },
      }),
    ).toThrowError(/FOREIGN KEY constraint failed/);
    ctx.close();
  });
});

function base(
  ctx: TestContext,
  sessionId: string,
  performedExerciseId: string,
  order: number,
): Parameters<TestContext['repos']['sets']['record']>[0] {
  return {
    sessionId,
    performedExerciseId,
    order,
    role: 'working',
    exerciseId: 'es-prova-1',
    variantId: null,
    perSide: false,
    load: { convention: 'machineStack', kg: 60, equipmentInstanceId: ctx.pressAId },
    metric: 'reps',
    reps: 9,
    seconds: null,
    side: 'both',
    rir: 2,
    note: null,
    status: 'completed',
    completedAt: T0 + order * 60_000,
  };
}
