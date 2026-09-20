/**
 * Il motore adattivo attraverso la PERSISTENZA REALE.
 *
 * Questo file esiste per un difetto che nessun test aveva colto, e che era
 * grave: `performed_exercises.technique` non era scrivibile da nessun metodo
 * dei repository, restava sempre `null`, e il motore richiede
 * `technique === 'controlled'` per proporre un incremento.
 *
 * Conseguenza: **il motore adattivo non avrebbe potuto proporre un incremento
 * mai**, in nessuna circostanza. Tutti e 52 i test del motore passavano,
 * perche' costruiscono le esposizioni a mano invece di leggerle dal database.
 * Tutti e 79 i test della persistenza passavano, perche' nessuno chiedeva di
 * scrivere la tecnica.
 *
 * La lezione: due strati verificati separatamente non fanno un sistema
 * verificato. Qui il percorso e' completo, dal `record()` di una serie fino
 * alla proposta del coach.
 */

import { describe, expect, it } from 'vitest';
import {
  evaluate,
  EXERCISE_LIBRARY,
  buildSessionA,
  buildThreeYearPlan,
  comparabilityKey,
  createIdGenerator,
  seededRandom,
  type EquipmentInstance,
  type Instant,
  type LocalDate,
  type Profile,
  type SessionHistoryEntry,
} from '@trackstrong/core';
import type { createRepositories } from '@trackstrong/db';
import { openTestDb } from './helpers.js';

const PRESS = 'legPress';

/** Pressa di prova con incremento dichiarato di 5 kg. */
const PRESS_MACHINE: EquipmentInstance = {
  id: 'eq-pressa-prova',
  label: 'Pressa di prova',
  kind: 'legPressMachine',
  location: 'Palestra di prova',
  loadStep: { stepKg: 5, minKg: 20, maxKg: 300, note: null },
  settingsNote: null,
};

const START: LocalDate = '2026-09-21';

function testProfile(workspaceId: string): Profile {
  return {
    id: 'p',
    workspaceId,
    displayName: 'Atleta di prova',
    heightCm: 180,
    declaredWeightKg: 95,
    bodyGoal: null,
    sportGoal: null,
    programStartDate: START,
    preferredWeekdays: [1, 4],
    availableMinutesPerSession: 70,
    sessionsPerWeek: 2,
    limitations: [],
    notes: null,
    revision: 1,
  };
}

/**
 * Svolge una seduta completa passando dai repository: crea la sessione con la
 * fotografia congelata, aggiunge l'esercizio, dichiara la tecnica, registra
 * tre serie confermate e chiude.
 */
function performSession(
  repos: ReturnType<typeof createRepositories>,
  machine: EquipmentInstance,
  options: {
    readonly date: LocalDate;
    readonly at: Instant;
    readonly kg: number;
    readonly reps: number;
    readonly rir: number;
    readonly declareTechnique: boolean;
  },
): void {
  const week = 6;
  const prescription = buildSessionA(week);
  const press = prescription.exercises.find((e) => e.exerciseId === PRESS);
  if (press === undefined) throw new Error('pressa mancante nella scheda');

  const session = repos.sessions.start({
    plannedDate: options.date,
    slot: 'A',
    snapshot: {
      planVersion: 1,
      weekIndex: week,
      slot: 'A',
      blockId: 'y1b2-consolidamento',
      // Solo la pressa: la fotografia contiene la prescrizione
      // dell'esercizio che si svolge davvero.
      prescription: { ...prescription, exercises: [press] },
      capturedAt: options.at,
    },
    startedAt: options.at,
  });

  const performedExerciseId = repos.sessions.addExercise({
    sessionId: session.id,
    order: 1,
    exerciseId: PRESS,
    equipmentInstanceId: machine.id,
  });

  // IL PUNTO DI QUESTO TEST: dichiarare la tecnica attraverso il repository.
  if (options.declareTechnique) {
    repos.sessions.setTechnique(performedExerciseId, 'controlled');
  }

  for (let order = 1; order <= press.workingSets; order += 1) {
    const result = repos.sets.record({
      sessionId: session.id,
      performedExerciseId,
      order,
      role: 'working',
      exerciseId: PRESS,
      variantId: null,
      perSide: false,
      load: {
        convention: 'machineStack',
        kg: options.kg,
        equipmentInstanceId: machine.id,
      },
      metric: 'reps',
      reps: options.reps,
      seconds: null,
      side: 'both',
      rir: options.rir,
      note: null,
      status: 'completed',
      completedAt: options.at + order * 60_000,
    });
    expect(result.inserted).toBe(true);
  }

  repos.sessions.finish(session.id, options.at + 60 * 60_000, options.date);
}

/** Ricostruisce lo storico dal database, come farebbe l'app. */
function readHistory(
  repos: ReturnType<typeof createRepositories>,
): readonly SessionHistoryEntry[] {
  return repos.sessions.history(10).map((session) => ({
    session,
    exercises: repos.sessions.exercises(session.id),
    sets: repos.sets.bySession(session.id),
  }));
}

describe('il motore legge la persistenza reale', () => {
  it('con la tecnica dichiarata propone un incremento', () => {
    const { db, repos, pressAId } = openTestDb();
    const machine: EquipmentInstance = { ...PRESS_MACHINE, id: pressAId };

    // Due sedute identiche e perfette: limite superiore, margine coerente,
    // tecnica dichiarata, nessun fastidio.
    performSession(repos, machine, {
      date: '2026-10-26',
      at: 1_780_000_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });
    performSession(repos, machine, {
      date: '2026-10-29',
      at: 1_780_300_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });

    const history = readHistory(repos);
    expect(history).toHaveLength(2);

    const result = evaluate({
      now: 1_780_400_000_000,
      today: '2026-10-30',
      workspaceId: db.workspaceId,
      plan: buildThreeYearPlan({ id: 'plan', startDate: START }),
      cursor: {
        planVersion: 1,
        weekIndex: 6,
        repetitionCount: 0,
        completedSlots: [],
        enteredOn: '2026-10-26',
      },
      library: EXERCISE_LIBRARY,
      equipment: new Map([[machine.id, machine]]),
      history,
      profile: testProfile(db.workspaceId),
      upcomingTrackDays: [],
      newId: createIdGenerator(() => 1_780_400_000_000, seededRandom(1)).newId,
    });

    const increase = result.proposals.find((p) => p.change.kind === 'increaseLoad');
    expect(
      increase,
      `nessun incremento proposto. Proposte: ${result.proposals.map((p) => p.title).join(' | ')}`,
    ).toBeDefined();
    if (increase?.change.kind === 'increaseLoad') {
      expect(increase.change.fromKg).toBe(60);
      // 60 + il gradino di 5 kg configurato su QUESTA pressa.
      expect(increase.change.toKg).toBe(65);
    }
    db.close();
  });

  it('senza la tecnica dichiarata non propone nessun incremento', () => {
    // E' il comportamento corretto. Prima era l'UNICO comportamento
    // possibile, perche' la tecnica non era scrivibile.
    const { db, repos, pressAId } = openTestDb();
    const machine: EquipmentInstance = { ...PRESS_MACHINE, id: pressAId };

    for (const [date, at] of [
      ['2026-10-26', 1_780_000_000_000],
      ['2026-10-29', 1_780_300_000_000],
    ] as const) {
      performSession(repos, machine, {
        date,
        at,
        kg: 60,
        reps: 8,
        rir: 2,
        declareTechnique: false,
      });
    }

    const result = evaluate({
      now: 1_780_400_000_000,
      today: '2026-10-30',
      workspaceId: db.workspaceId,
      plan: buildThreeYearPlan({ id: 'plan', startDate: START }),
      cursor: {
        planVersion: 1,
        weekIndex: 6,
        repetitionCount: 0,
        completedSlots: [],
        enteredOn: '2026-10-26',
      },
      library: EXERCISE_LIBRARY,
      equipment: new Map([[machine.id, machine]]),
      history: readHistory(repos),
      profile: testProfile(db.workspaceId),
      upcomingTrackDays: [],
      newId: createIdGenerator(() => 1_780_400_000_000, seededRandom(1)).newId,
    });

    expect(result.proposals.filter((p) => p.change.kind === 'increaseLoad')).toEqual([]);
    const hold = result.proposals.find((p) => p.change.kind === 'hold');
    expect(hold?.missingInformation.map((m) => m.code)).toContain('noTechniqueDeclared');
    db.close();
  });

  it('la chiave di comparabilita salvata dal repository e quella attesa', () => {
    const { db, repos, pressAId } = openTestDb();
    const machine: EquipmentInstance = { ...PRESS_MACHINE, id: pressAId };
    performSession(repos, machine, {
      date: '2026-10-26',
      at: 1_780_000_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });

    const session = repos.sessions.history(1)[0];
    if (session === undefined) throw new Error('nessuna seduta');
    const sets = repos.sets.bySession(session.id);
    expect(sets.length).toBeGreaterThan(0);

    const expected = comparabilityKey({
      exerciseId: PRESS,
      variantId: null,
      loadConvention: 'machineStack',
      equipmentInstanceId: machine.id,
      metric: 'reps',
      perSide: false,
    });
    for (const set of sets) {
      expect(set.comparabilityKey).toBe(expected);
    }
    db.close();
  });

  it('un fastidio registrato dal repository blocca l incremento', () => {
    const { db, repos, pressAId } = openTestDb();
    const machine: EquipmentInstance = { ...PRESS_MACHINE, id: pressAId };

    performSession(repos, machine, {
      date: '2026-10-26',
      at: 1_780_000_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });
    performSession(repos, machine, {
      date: '2026-10-29',
      at: 1_780_300_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });

    // Fastidio dichiarato sull'ultima seduta, attraverso il repository.
    const latest = repos.sessions.history(1)[0];
    if (latest === undefined) throw new Error('nessuna seduta');
    const exercises = repos.sessions.exercises(latest.id);
    const first = exercises[0];
    if (first === undefined) throw new Error('nessun esercizio');
    repos.sessions.reportDiscomfort(first.id, {
      area: 'ginocchio destro',
      intensity: 3,
      note: null,
      stoppedExercise: false,
    });

    const result = evaluate({
      now: 1_780_400_000_000,
      today: '2026-10-30',
      workspaceId: db.workspaceId,
      plan: buildThreeYearPlan({ id: 'plan', startDate: START }),
      cursor: {
        planVersion: 1,
        weekIndex: 6,
        repetitionCount: 0,
        completedSlots: [],
        enteredOn: '2026-10-26',
      },
      library: EXERCISE_LIBRARY,
      equipment: new Map([[machine.id, machine]]),
      history: readHistory(repos),
      profile: testProfile(db.workspaceId),
      upcomingTrackDays: [],
      newId: createIdGenerator(() => 1_780_400_000_000, seededRandom(1)).newId,
    });

    expect(result.proposals.filter((p) => p.change.kind === 'increaseLoad')).toEqual([]);
    db.close();
  });

  it('la nota della seduta e la tecnica si conservano nel database', () => {
    const { db, repos, pressAId } = openTestDb();
    const machine: EquipmentInstance = { ...PRESS_MACHINE, id: pressAId };
    performSession(repos, machine, {
      date: '2026-10-26',
      at: 1_780_000_000_000,
      kg: 60,
      reps: 8,
      rir: 2,
      declareTechnique: true,
    });

    const session = repos.sessions.history(1)[0];
    if (session === undefined) throw new Error('nessuna seduta');

    repos.sessions.setNote(session.id, 'Palestra affollata, pressa occupata a lungo.');
    const reread = repos.sessions.byId(session.id);
    expect(reread?.note).toContain('affollata');

    const exercise = repos.sessions.exercises(session.id)[0];
    expect(exercise?.technique).toBe('controlled');

    repos.sessions.skipExercise(exercise?.id ?? '', true);
    expect(repos.sessions.exercises(session.id)[0]?.skipped).toBe(true);
    db.close();
  });
});
