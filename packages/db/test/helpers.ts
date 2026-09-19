/**
 * Utilita' dei test di `@trackstrong/db`.
 *
 * Tutti i dati qui sono SINTETICI: l'atleta si chiama "Atleta di prova", i
 * carichi e le misure sono inventati per il test. Nessun dato personale reale
 * entra nei test (§14: "Dati sintetici per test e screenshot condivisi").
 */

import {
  createIdGenerator,
  durationControlTarget,
  exact,
  FakeClock,
  range,
  rest,
  rirTarget,
  seededRandom,
  type Clock,
  type ExercisePrescription,
  type IdGenerator,
  type Instant,
  type LocalDate,
  type PrescriptionSnapshot,
  type ProgramPlan,
  type SessionPrescription,
  type SessionSlot,
} from '@trackstrong/core';
import {
  createRepositories,
  migrate,
  openDatabase,
  openNodeSqlite,
  SUPPORTED_PROTOCOL_VERSION,
  type Database,
  type Repositories,
  type SqlDriver,
} from '@trackstrong/db';

/** 1 marzo 2027, 09:00 UTC: istante fisso, per test riproducibili. */
export const T0: Instant = Date.UTC(2027, 2, 1, 9, 0, 0);

export const WORKSPACE_ID = '01JTESTWORKSPACE0000000001';
export const DEVICE_ID = '01JTESTDEVICE00000000000A1';
export const OTHER_DEVICE_ID = '01JTESTDEVICE00000000000B2';

export interface TestContext {
  readonly driver: SqlDriver;
  readonly db: Database;
  readonly repos: Repositories;
  readonly clock: FakeClock;
  readonly ids: IdGenerator;
  /** Attrezzo sintetico "pressa A". */
  readonly pressAId: string;
  /** Attrezzo sintetico "pressa B": stessa categoria, macchina diversa. */
  readonly pressBId: string;
  close(): void;
}

function makeClockAndIds(): { clock: FakeClock; ids: IdGenerator } {
  const clock = new FakeClock(T0);
  // Sorgente casuale deterministica: gli ULID dei test sono riproducibili.
  const ids = createIdGenerator(() => clock.now(), seededRandom(20270301));
  return { clock, ids };
}

/** Driver in memoria, senza migrazioni applicate. */
export function rawDriver(): SqlDriver {
  return openNodeSqlite({ location: ':memory:' });
}

export interface OpenOptions {
  readonly deviceId?: string;
  /** Applica le migrazioni solo fino a questa versione. */
  readonly targetVersion?: number;
  /** Salta la creazione di archivio, profilo e attrezzature. */
  readonly bare?: boolean;
}

/** Database migrato, con archivio e attrezzature sintetiche. */
export function openTestDb(options: OpenOptions = {}): TestContext {
  const driver = rawDriver();
  if (options.targetVersion !== undefined) {
    migrate(driver, options.targetVersion);
  }
  const { clock, ids } = makeClockAndIds();
  const db = openDatabase(driver, {
    workspaceId: WORKSPACE_ID,
    deviceId: options.deviceId ?? DEVICE_ID,
    clock,
    ids,
  });
  const repos = createRepositories(db);

  let pressAId = '';
  let pressBId = '';
  if (options.bare !== true) {
    repos.workspace.ensureWorkspace('Archivio di prova', T0, SUPPORTED_PROTOCOL_VERSION);
    repos.workspace.registerDevice('Telefono di prova', 'ios', T0);
    repos.workspace.saveProfile({
      displayName: 'Atleta di prova',
      heightCm: 175,
      // Valore SINTETICO dichiarato in configurazione: non e' una pesata.
      declaredWeightKg: 88,
      bodyGoal: null,
      sportGoal: 'Preparazione generale di prova',
      programStartDate: '2027-03-01',
      preferredWeekdays: [1, 4],
      availableMinutesPerSession: 70,
      sessionsPerWeek: 2,
    });
    repos.sync.initState(SUPPORTED_PROTOCOL_VERSION);
    pressAId = repos.workspace.saveEquipment({
      label: 'Pressa di prova A',
      kind: 'legPressMachine',
      stepKg: 5,
      minKg: 10,
    });
    pressBId = repos.workspace.saveEquipment({
      label: 'Pressa di prova B',
      kind: 'legPressMachine',
      stepKg: 5,
      minKg: 15,
    });
  }

  return {
    driver,
    db,
    repos,
    clock,
    ids,
    pressAId,
    pressBId,
    close: () => {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Prescrizioni sintetiche
// ---------------------------------------------------------------------------

export function syntheticExercisePrescription(
  order: number,
  overrides: Partial<ExercisePrescription> = {},
): ExercisePrescription {
  return {
    order,
    exerciseId: `es-prova-${String(order)}`,
    variantId: null,
    workingSets: 3,
    target: range(8, 10),
    metric: 'reps',
    perSide: false,
    effort: rirTarget(2, 3),
    rest: rest(90, 120),
    loadConvention: 'machineStack',
    alternativeExerciseIds: [],
    note: null,
    timePriority: 1,
    ...overrides,
  };
}

export function syntheticSessionPrescription(
  slot: SessionSlot = 'A',
  exercises: readonly ExercisePrescription[] = [
    syntheticExercisePrescription(1),
    syntheticExercisePrescription(2, { workingSets: 2 }),
  ],
): SessionPrescription {
  return {
    slot,
    title: `Seduta di prova ${slot}`,
    focus: 'Seduta sintetica usata solo dai test.',
    warmup: [
      {
        order: 1,
        label: 'Riscaldamento di prova',
        detail: 'Cinque minuti facili.',
        estimatedSeconds: 300,
        warmupSetsOnExerciseOrder: null,
        warmupSetCount: 0,
      },
    ],
    exercises,
    cardio: [],
  };
}

export function syntheticSnapshot(
  planVersion = 1,
  weekIndex = 1,
  slot: SessionSlot = 'A',
  prescription: SessionPrescription = syntheticSessionPrescription(slot),
): PrescriptionSnapshot {
  return {
    planVersion,
    weekIndex,
    slot,
    blockId: 'blocco-prova-1',
    prescription,
    capturedAt: T0,
  };
}

/** Piano sintetico minimo, con un blocco e due settimane. */
export function syntheticPlan(version = 1, startDate: LocalDate = '2027-03-01'): ProgramPlan {
  const weeks = [1, 2].map((index) => ({
    index,
    indexInBlock: index,
    label: `Settimana di prova ${String(index)}`,
    note: null,
    sessions: [syntheticSessionPrescription('A'), syntheticSessionPrescription('B')],
    isDeload: false,
  }));
  return {
    id: `piano-prova-${String(version)}`,
    version,
    formatVersion: 1,
    startDate,
    horizonYears: 3,
    lastDate: '2030-02-28',
    years: [
      {
        number: 1,
        title: 'Anno di prova',
        objectives: ['Obiettivo sintetico'],
        caveat: 'Struttura progettuale, non una previsione.',
        blockIds: ['blocco-prova-1'],
      },
    ],
    blocks: [
      {
        id: 'blocco-prova-1',
        order: 1,
        name: 'Blocco di prova',
        phase: 'reentry',
        purpose: 'Blocco sintetico per i test.',
        plannedWeeks: 2,
        startWeekIndex: 1,
        weeks,
        entryCriteria: [
          { id: 'ingresso-1', description: 'Sempre ammesso.', rule: { kind: 'always' } },
        ],
        reviewCriteria: [],
        interruptionPolicy: 'Nessuna politica particolare: e\' un blocco di prova.',
        yearNumber: 1,
      },
    ],
    revisionReason: version === 1 ? null : `Revisione di prova ${String(version)}`,
    derivedFromVersion: version === 1 ? null : version - 1,
  };
}

/** Esercizio a tempo, per i casi `timeOnly`. */
export function timeOnlyPrescription(order: number): ExercisePrescription {
  return syntheticExercisePrescription(order, {
    metric: 'seconds',
    target: exact(30),
    loadConvention: 'timeOnly',
    effort: durationControlTarget('Mantieni la posizione.'),
  });
}

/** Avvia una seduta sintetica e restituisce id di seduta e primo esercizio. */
export function startSyntheticSession(
  ctx: TestContext,
  options: {
    readonly snapshot?: PrescriptionSnapshot;
    readonly plannedDate?: LocalDate;
    readonly startedAt?: Instant;
  } = {},
): { readonly sessionId: string; readonly exerciseId: string } {
  const session = ctx.repos.sessions.start({
    plannedDate: options.plannedDate ?? '2027-03-01',
    slot: 'A',
    snapshot: options.snapshot ?? syntheticSnapshot(),
    startedAt: options.startedAt ?? T0,
  });
  const exerciseId = ctx.repos.sessions.addExercise({
    sessionId: session.id,
    order: 1,
    exerciseId: 'es-prova-1',
    equipmentInstanceId: ctx.pressAId,
  });
  return { sessionId: session.id, exerciseId };
}

/** Clock di sistema reale, per i test di prestazione. */
export function realClock(): Clock {
  return {
    now: () => Date.now(),
    monotonic: () => performance.now(),
    timeZone: () => 'Europe/Rome',
  };
}
