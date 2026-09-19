/**
 * Serie: doppio tocco, carico non applicabile, comparabilita'.
 */

import { describe, expect, it } from 'vitest';

import { comparabilityKey } from '@trackstrong/core';
import { InvalidSetError, setIdempotencyKey } from '@trackstrong/db';

import { openTestDb, startSyntheticSession, T0, type TestContext } from './helpers.js';

function serieDiProva(
  ctx: TestContext,
  sessionId: string,
  exerciseId: string,
  overrides: Partial<Parameters<TestContext['repos']['sets']['record']>[0]> = {},
): Parameters<TestContext['repos']['sets']['record']>[0] {
  return {
    sessionId,
    performedExerciseId: exerciseId,
    order: 1,
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
    completedAt: T0 + 60_000,
    ...overrides,
  };
}

describe('de-duplicazione del doppio tocco', () => {
  it('due inserimenti identici producono una sola riga', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const input = serieDiProva(ctx, sessionId, exerciseId);

    const primo = ctx.repos.sets.record(input);
    const secondo = ctx.repos.sets.record(input);

    expect(primo.inserted).toBe(true);
    // Il secondo tocco e' un NO-OP verificabile, non un errore.
    expect(secondo.inserted).toBe(false);
    expect(secondo.set.id).toBe(primo.set.id);

    expect(ctx.repos.sets.bySession(sessionId)).toHaveLength(1);
    expect(ctx.repos.sets.countWorkingCompleted(sessionId)).toBe(1);
    ctx.close();
  });

  it('il doppio tocco non accoda una seconda operazione di sincronizzazione', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const input = serieDiProva(ctx, sessionId, exerciseId);
    ctx.repos.sets.record(input);
    const operazioniPrima = ctx.db.driver.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sync_operations WHERE entity_table = 'performed_sets'",
    )?.n;
    ctx.repos.sets.record(input);
    const operazioniDopo = ctx.db.driver.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM sync_operations WHERE entity_table = 'performed_sets'",
    )?.n;
    expect(operazioniDopo).toBe(operazioniPrima);
    ctx.close();
  });

  it('il vincolo e\' in SQL: l\'inserimento diretto di un duplicato fallisce', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const risultato = ctx.repos.sets.record(serieDiProva(ctx, sessionId, exerciseId));
    const chiave = setIdempotencyKey({
      sessionId,
      performedExerciseId: exerciseId,
      order: 1,
      side: 'both',
    });
    expect(risultato.set.idempotencyKey).toBe(chiave);

    // Nessun debounce dell'interfaccia: il database rifiuta.
    expect(() =>
      ctx.db.driver.run(
        `INSERT INTO performed_sets (id, session_id, performed_exercise_id, order_index, role,
           load_convention, load_kg, equipment_instance_id, metric, reps, side, status,
           completed_at, comparability_key, idempotency_key, revision, updated_at)
         VALUES ('altro-id', ?, ?, 1, 'working', 'machineStack', 60, ?, 'reps', 9, 'both',
                 'completed', ?, 'chiave', ?, 1, ?)`,
        [sessionId, exerciseId, ctx.pressAId, T0, chiave, T0],
      ),
    ).toThrowError(/UNIQUE constraint failed/);
    ctx.close();
  });

  it('serie diverse alla stessa posizione ma su lati diversi restano due serie', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const base = serieDiProva(ctx, sessionId, exerciseId, { perSide: true });
    const sinistra = ctx.repos.sets.record({ ...base, side: 'left' });
    const destra = ctx.repos.sets.record({ ...base, side: 'right' });
    expect(sinistra.inserted).toBe(true);
    expect(destra.inserted).toBe(true);
    expect(ctx.repos.sets.countWorkingCompleted(sessionId)).toBe(2);
    ctx.close();
  });
});

describe('carico non applicabile', () => {
  it('una serie a corpo libero salva load_kg NULL, non 0', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const risultato = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, {
        load: { convention: 'bodyweight', kg: null, equipmentInstanceId: null },
      }),
    );
    expect(risultato.set.load.kg).toBeNull();

    const riga = ctx.db.driver.get<{ load_kg: number | null }>(
      'SELECT load_kg FROM performed_sets WHERE id = ?',
      [risultato.set.id],
    );
    expect(riga?.load_kg).toBeNull();
    expect(riga?.load_kg).not.toBe(0);
    ctx.close();
  });

  it('una serie a tempo salva load_kg NULL e i secondi', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const risultato = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, {
        load: { convention: 'timeOnly', kg: null, equipmentInstanceId: null },
        metric: 'seconds',
        reps: null,
        seconds: 35,
      }),
    );
    expect(risultato.set.load.kg).toBeNull();
    expect(risultato.set.seconds).toBe(35);
    expect(risultato.set.reps).toBeNull();
    ctx.close();
  });

  it('un carico su una convenzione che non lo ammette viene rifiutato', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    expect(() =>
      ctx.repos.sets.record(
        serieDiProva(ctx, sessionId, exerciseId, {
          load: { convention: 'bodyweight', kg: 0, equipmentInstanceId: null },
        }),
      ),
    ).toThrowError(InvalidSetError);
    // Anche il database lo rifiuta, non solo la validazione applicativa.
    expect(() =>
      ctx.db.driver.run(
        `INSERT INTO performed_sets (id, session_id, performed_exercise_id, order_index, role,
           load_convention, load_kg, metric, reps, side, status, completed_at,
           comparability_key, idempotency_key, revision, updated_at)
         VALUES ('forzata', ?, ?, 9, 'working', 'bodyweight', 0, 'reps', 8, 'both',
                 'completed', ?, 'k', 'k-forzata', 1, ?)`,
        [sessionId, exerciseId, T0, T0],
      ),
    ).toThrowError(/CHECK constraint failed/);
    ctx.close();
  });

  it('una serie confermata senza carico su una convenzione che lo richiede viene rifiutata', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    expect(() =>
      ctx.repos.sets.record(
        serieDiProva(ctx, sessionId, exerciseId, {
          load: { convention: 'barbellTotal', kg: null, equipmentInstanceId: null },
        }),
      ),
    ).toThrowError(InvalidSetError);
    ctx.close();
  });
});

describe('chiave di comparabilita\'', () => {
  it('e\' salvata sulla riga e diversa fra due macchine diverse', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const secondoEsercizio = ctx.repos.sessions.addExercise({
      sessionId,
      order: 2,
      exerciseId: 'es-prova-1',
      equipmentInstanceId: ctx.pressBId,
    });

    const suA = ctx.repos.sets.record(serieDiProva(ctx, sessionId, exerciseId));
    const suB = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, secondoEsercizio, {
        performedExerciseId: secondoEsercizio,
        load: { convention: 'machineStack', kg: 60, equipmentInstanceId: ctx.pressBId },
      }),
    );

    expect(suA.set.comparabilityKey).not.toBe(suB.set.comparabilityKey);
    // Stesso esercizio, stesso numero, macchina diversa: non confrontabili.
    expect(suA.set.comparabilityKey).toContain(ctx.pressAId);
    expect(suB.set.comparabilityKey).toContain(ctx.pressBId);

    const daDb = ctx.db.driver
      .all<{ comparability_key: string }>(
        'SELECT comparability_key FROM performed_sets ORDER BY order_index',
      )
      .map((r) => r.comparability_key);
    expect(daDb).toEqual([suA.set.comparabilityKey, suB.set.comparabilityKey]);
    ctx.close();
  });

  it('coincide con quella calcolata dal dominio', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const risultato = ctx.repos.sets.record(serieDiProva(ctx, sessionId, exerciseId));
    expect(risultato.set.comparabilityKey).toBe(
      comparabilityKey({
        exerciseId: 'es-prova-1',
        variantId: null,
        loadConvention: 'machineStack',
        equipmentInstanceId: ctx.pressAId,
        metric: 'reps',
        perSide: false,
      }),
    );
    ctx.close();
  });
});

describe('ultima prestazione comparabile', () => {
  it('non restituisce una serie con chiave diversa', () => {
    const ctx = openTestDb();
    const primaSeduta = startSyntheticSession(ctx);
    const suB = ctx.repos.sessions.addExercise({
      sessionId: primaSeduta.sessionId,
      order: 2,
      exerciseId: 'es-prova-1',
      equipmentInstanceId: ctx.pressBId,
    });

    // Sulla macchina B, piu' recente.
    ctx.repos.sets.record(
      serieDiProva(ctx, primaSeduta.sessionId, suB, {
        performedExerciseId: suB,
        load: { convention: 'machineStack', kg: 80, equipmentInstanceId: ctx.pressBId },
        completedAt: T0 + 600_000,
      }),
    );

    const chiaveA = comparabilityKey({
      exerciseId: 'es-prova-1',
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: ctx.pressAId,
      metric: 'reps',
      perSide: false,
    });

    // Non esiste storico sulla macchina A: la serie su B non va restituita.
    expect(ctx.repos.sets.lastComparable(chiaveA)).toBeNull();

    // Ora si registra anche su A, ma piu' vecchia.
    ctx.repos.sets.record(
      serieDiProva(ctx, primaSeduta.sessionId, primaSeduta.exerciseId, {
        load: { convention: 'machineStack', kg: 55, equipmentInstanceId: ctx.pressAId },
        completedAt: T0 + 60_000,
      }),
    );
    const ultimaA = ctx.repos.sets.lastComparable(chiaveA);
    expect(ultimaA?.load.kg).toBe(55);
    expect(ultimaA?.comparabilityKey).toBe(chiaveA);
    ctx.close();
  });

  it('ignora bozze, serie saltate e serie annullate', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const confermata = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, {
        order: 1,
        load: { convention: 'machineStack', kg: 50, equipmentInstanceId: ctx.pressAId },
        completedAt: T0 + 10_000,
      }),
    );
    // Piu' recente ma annullata.
    const annullata = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, {
        order: 2,
        load: { convention: 'machineStack', kg: 70, equipmentInstanceId: ctx.pressAId },
        completedAt: T0 + 20_000,
      }),
    );
    ctx.repos.sets.void_(annullata.set.id, 'tocco accidentale');
    // Piu' recente ma saltata.
    ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, {
        order: 3,
        status: 'skipped',
        completedAt: null,
        load: { convention: 'machineStack', kg: 90, equipmentInstanceId: ctx.pressAId },
      }),
    );

    const ultima = ctx.repos.sets.lastComparable(confermata.set.comparabilityKey);
    expect(ultima?.id).toBe(confermata.set.id);
    expect(ultima?.load.kg).toBe(50);
    ctx.close();
  });

  it('la cronologia comparabile e\' ordinata dalla piu\' recente', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    for (const [order, kg, t] of [
      [1, 50, 10_000],
      [2, 55, 20_000],
      [3, 60, 30_000],
    ] as const) {
      ctx.repos.sets.record(
        serieDiProva(ctx, sessionId, exerciseId, {
          order,
          load: { convention: 'machineStack', kg, equipmentInstanceId: ctx.pressAId },
          completedAt: T0 + t,
        }),
      );
    }
    const chiave = comparabilityKey({
      exerciseId: 'es-prova-1',
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: ctx.pressAId,
      metric: 'reps',
      perSide: false,
    });
    expect(ctx.repos.sets.comparableHistory(chiave).map((s) => s.load.kg)).toEqual([60, 55, 50]);
    ctx.close();
  });
});

describe('annullamento di una serie confermata', () => {
  it('la esclude dai conteggi e la conserva come fatto', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const prima = ctx.repos.sets.record(serieDiProva(ctx, sessionId, exerciseId, { order: 1 }));
    const seconda = ctx.repos.sets.record(serieDiProva(ctx, sessionId, exerciseId, { order: 2 }));
    expect(ctx.repos.sets.countWorkingCompleted(sessionId)).toBe(2);

    const annullata = ctx.repos.sets.void_(seconda.set.id, 'doppio tocco riconosciuto');
    expect(annullata.status).toBe('voided');
    expect(ctx.repos.sets.countWorkingCompleted(sessionId)).toBe(1);

    // La riga esiste ancora: l'annullamento e' a sua volta un fatto.
    expect(ctx.repos.sets.byId(seconda.set.id)).not.toBeNull();
    expect(ctx.repos.sessions.summary(sessionId).voided).toBe(1);
    expect(ctx.repos.sessions.summary(sessionId).workingCompleted).toBe(1);

    // L'annullamento ha generato la sua operazione di sincronizzazione.
    const cause = ctx.repos.sync
      .operationsFor('performed_sets', seconda.set.id)
      .map((op) => op.cause);
    expect(cause).toContain('annullamento serie');
    expect(prima.set.status).toBe('completed');
    ctx.close();
  });
});

describe('correzione di una serie', () => {
  it('aggiorna il valore, alza la revisione e la marca come digitata', () => {
    const ctx = openTestDb();
    const { sessionId, exerciseId } = startSyntheticSession(ctx);
    const registrata = ctx.repos.sets.record(
      serieDiProva(ctx, sessionId, exerciseId, { prefilled: true }),
    );
    expect(registrata.set.prefilled).toBe(true);
    expect(registrata.set.revision).toBe(1);

    const corretta = ctx.repos.sets.correct(registrata.set.id, { reps: 10 });
    expect(corretta.reps).toBe(10);
    expect(corretta.revision).toBe(2);
    // Un valore corretto e' stato digitato: non e' piu' "precompilato".
    expect(corretta.prefilled).toBe(false);

    const operazioni = ctx.repos.sync.operationsFor('performed_sets', registrata.set.id);
    expect(operazioni).toHaveLength(2);
    expect(operazioni[1]?.baseRevision).toBe(1);
    expect(operazioni[1]?.revision).toBe(2);
    ctx.close();
  });
});
