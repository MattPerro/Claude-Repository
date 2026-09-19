/**
 * Costruttori di dati SINTETICI per i test.
 *
 * Nessun dato reale di Mattia: il nome e' "Atleta di prova" e i carichi sono
 * inventati per esercitare i casi limite. La specifica (§14) vieta dati
 * personali in test, log e screenshot condivisi.
 */

import {
  comparabilityKey,
  DEFAULT_ENGINE_CONFIG,
  EXERCISE_LIBRARY,
  buildSessionA,
  buildSessionB,
  buildThreeYearPlan,
  createIdGenerator,
  EMPTY_CHECK_IN,
  seededRandom,
  type BodySide,
  type DiscomfortReport,
  type EngineConfig,
  type EngineContext,
  type EquipmentInstance,
  type ExercisePrescription,
  type Instant,
  type LoadConvention,
  type LocalDate,
  type PerformedExercise,
  type PerformedSet,
  type Profile,
  type ProgramCursor,
  type ProgramPlan,
  type Session,
  type SessionHistoryEntry,
  type SessionSlot,
  type SetMetric,
  type TechniqueRating,
} from '@trackstrong/core';

export const TEST_WORKSPACE = 'ws-test';
export const TEST_PLAN_START: LocalDate = '2026-09-21';

/** Generatore di ID deterministico, cosi' i test sono riproducibili. */
export function testIdGenerator(seed = 42): () => string {
  let tick = 1_780_000_000_000;
  const gen = createIdGenerator(() => {
    tick += 1000;
    return tick;
  }, seededRandom(seed));
  return () => gen.newId();
}

/** Pressa di prova, con incremento minimo dichiarato di 5 kg. */
export const LEG_PRESS_A: EquipmentInstance = {
  id: 'eq-pressa-a',
  label: 'Pressa 45 gradi (prova)',
  kind: 'legPressMachine',
  location: 'Palestra di prova',
  loadStep: { stepKg: 5, minKg: 20, maxKg: 300, note: 'Pacco pesi a gradini da 5 kg.' },
  settingsNote: 'Sedile al foro 4.',
};

/** Una SECONDA pressa, diversa: i valori non sono confrontabili con la prima. */
export const LEG_PRESS_B: EquipmentInstance = {
  ...LEG_PRESS_A,
  id: 'eq-pressa-b',
  label: 'Pressa orizzontale (prova)',
  settingsNote: 'Sedile al foro 2.',
};

/** Attrezzo senza incremento configurato: il motore non deve inventare nulla. */
export const UNCONFIGURED_MACHINE: EquipmentInstance = {
  id: 'eq-non-configurata',
  label: 'Macchina non configurata (prova)',
  kind: 'chestPressMachine',
  location: null,
  loadStep: { stepKg: 0, minKg: null, maxKg: null, note: 'Incremento non ancora rilevato.' },
  settingsNote: null,
};

export const TEST_EQUIPMENT = new Map<string, EquipmentInstance>([
  [LEG_PRESS_A.id, LEG_PRESS_A],
  [LEG_PRESS_B.id, LEG_PRESS_B],
  [UNCONFIGURED_MACHINE.id, UNCONFIGURED_MACHINE],
]);

export function testProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-test',
    workspaceId: TEST_WORKSPACE,
    displayName: 'Atleta di prova',
    heightCm: 180,
    declaredWeightKg: 95,
    bodyGoal: null,
    sportGoal: null,
    programStartDate: TEST_PLAN_START,
    preferredWeekdays: [1, 4],
    availableMinutesPerSession: 70,
    sessionsPerWeek: 2,
    limitations: [],
    notes: null,
    revision: 1,
    ...overrides,
  };
}

export function testPlan(): ProgramPlan {
  return buildThreeYearPlan({ id: 'plan-test', startDate: TEST_PLAN_START });
}

export function testCursor(overrides: Partial<ProgramCursor> = {}): ProgramCursor {
  return {
    planVersion: 1,
    weekIndex: 6,
    repetitionCount: 0,
    completedSlots: [],
    enteredOn: '2026-10-26',
    ...overrides,
  };
}

let sequence = 0;
function nextSeq(): string {
  sequence += 1;
  return String(sequence).padStart(4, '0');
}

/** Descrizione compatta di una serie da creare nel test. */
export interface SetSpec {
  readonly reps?: number;
  readonly seconds?: number;
  readonly kg?: number | null;
  readonly rir?: number | null;
  readonly side?: BodySide;
  readonly status?: PerformedSet['status'];
  readonly role?: PerformedSet['role'];
}

export interface ExposureSpec {
  readonly exerciseId: string;
  readonly equipmentInstanceId?: string | null;
  readonly loadConvention?: LoadConvention;
  readonly metric?: SetMetric;
  readonly perSide?: boolean;
  readonly technique?: TechniqueRating | null;
  readonly discomfort?: DiscomfortReport | null;
  readonly sets: readonly SetSpec[];
  /** Sovrascrive la prescrizione congelata, per costruire casi limite. */
  readonly prescriptionOverride?: Partial<ExercisePrescription>;
}

export interface SessionSpec {
  readonly performedDate: LocalDate;
  readonly slot?: SessionSlot;
  readonly weekIndex?: number;
  readonly exposures: readonly ExposureSpec[];
  readonly startedAt?: Instant;
  readonly endedAt?: Instant;
}

/**
 * Costruisce una voce di storico completa e coerente: sessione, esercizi
 * svolti, serie, e fotografia della prescrizione.
 */
export function buildHistoryEntry(spec: SessionSpec): SessionHistoryEntry {
  const slot = spec.slot ?? 'A';
  const weekIndex = spec.weekIndex ?? 6;
  const base = slot === 'A' ? buildSessionA(weekIndex) : buildSessionB(weekIndex);
  const sessionId = `sess-${nextSeq()}`;

  const exercises: PerformedExercise[] = [];
  const sets: PerformedSet[] = [];
  const snapshotExercises: ExercisePrescription[] = [];

  spec.exposures.forEach((exposure, index) => {
    const libraryExercise = EXERCISE_LIBRARY.get(exposure.exerciseId);
    const fromBase = base.exercises.find((e) => e.exerciseId === exposure.exerciseId);
    const prescription: ExercisePrescription = {
      order: index + 1,
      exerciseId: exposure.exerciseId,
      variantId: null,
      workingSets: fromBase?.workingSets ?? 3,
      target: fromBase?.target ?? { min: 6, max: 8 },
      metric: exposure.metric ?? libraryExercise.metric,
      perSide: exposure.perSide ?? libraryExercise.perSide,
      effort: fromBase?.effort ?? { kind: 'rir', rir: { min: 2, max: 3 } },
      rest: fromBase?.rest ?? { minSeconds: 120, maxSeconds: 120 },
      loadConvention: exposure.loadConvention ?? libraryExercise.loadConvention,
      alternativeExerciseIds: fromBase?.alternativeExerciseIds ?? [],
      note: null,
      timePriority: fromBase?.timePriority ?? 1,
      ...exposure.prescriptionOverride,
    };
    snapshotExercises.push(prescription);

    const performedExerciseId = `pex-${nextSeq()}`;
    exercises.push({
      id: performedExerciseId,
      sessionId,
      order: index + 1,
      exerciseId: exposure.exerciseId,
      variantId: null,
      substitutedForExerciseId: null,
      equipmentInstanceId: exposure.equipmentInstanceId ?? null,
      // `?? 'controlled'` sarebbe un difetto: trasformerebbe un `null`
      // esplicito (tecnica NON dichiarata) in "controllata", cioe' proprio
      // l'errore che i test devono poter cogliere. Si distingue quindi
      // "campo assente" da "campo presente e null".
      technique: 'technique' in exposure ? exposure.technique : 'controlled',
      discomfort: exposure.discomfort ?? null,
      settingsNote: null,
      note: null,
      skipped: false,
    });

    const key = comparabilityKey({
      exerciseId: exposure.exerciseId,
      variantId: null,
      loadConvention: prescription.loadConvention,
      equipmentInstanceId: exposure.equipmentInstanceId ?? null,
      metric: prescription.metric,
      perSide: prescription.perSide,
    });

    exposure.sets.forEach((setSpec, setIndex) => {
      sets.push({
        id: `set-${nextSeq()}`,
        performedExerciseId,
        order: setIndex + 1,
        role: setSpec.role ?? 'working',
        load: {
          convention: prescription.loadConvention,
          kg: setSpec.kg === undefined ? null : setSpec.kg,
          equipmentInstanceId: exposure.equipmentInstanceId ?? null,
        },
        metric: prescription.metric,
        reps: prescription.metric === 'reps' ? (setSpec.reps ?? null) : null,
        seconds: prescription.metric === 'seconds' ? (setSpec.seconds ?? null) : null,
        side: setSpec.side ?? (prescription.perSide ? 'left' : 'both'),
        rir: setSpec.rir === undefined ? 2 : setSpec.rir,
        note: null,
        status: setSpec.status ?? 'completed',
        completedAt: 1_780_000_000_000,
        comparabilityKey: key,
      });
    });
  });

  const session: Session = {
    id: sessionId,
    workspaceId: TEST_WORKSPACE,
    plannedDate: spec.performedDate,
    performedDate: spec.performedDate,
    slot,
    status: 'completed',
    snapshot: {
      planVersion: 1,
      weekIndex,
      slot,
      blockId: 'y1b2-consolidamento',
      prescription: { ...base, exercises: snapshotExercises },
      capturedAt: 1_780_000_000_000,
    },
    checkIn: EMPTY_CHECK_IN,
    startedAt: spec.startedAt ?? 1_780_000_000_000,
    endedAt: spec.endedAt ?? 1_780_000_000_000 + 65 * 60_000,
    pausedMs: 0,
    note: null,
    ownerDeviceId: 'dev-test',
    revision: 1,
  };

  return { session, exercises, sets };
}

/** Contesto del motore pronto all'uso, con storico iniettabile. */
export function buildContext(options: {
  readonly history: readonly SessionHistoryEntry[];
  readonly today?: LocalDate;
  readonly config?: EngineConfig;
  readonly cursor?: ProgramCursor;
  readonly upcomingTrackDays?: readonly LocalDate[];
  readonly profile?: Profile;
}): EngineContext {
  return {
    now: 1_780_100_000_000,
    today: options.today ?? '2026-10-30',
    workspaceId: TEST_WORKSPACE,
    plan: testPlan(),
    cursor: options.cursor ?? testCursor(),
    library: EXERCISE_LIBRARY,
    equipment: TEST_EQUIPMENT,
    history: options.history,
    profile: options.profile ?? testProfile(),
    upcomingTrackDays: options.upcomingTrackDays ?? [],
    config: options.config ?? DEFAULT_ENGINE_CONFIG,
    newId: testIdGenerator(),
  };
}

/**
 * Due esposizioni consecutive PERFETTE sulla pressa: limite superiore
 * raggiunto, margine coerente, tecnica controllata, nessun fastidio.
 * E' il solo caso in cui il motore deve proporre un incremento.
 */
export function twoPerfectLegPressExposures(kg = 60): readonly SessionHistoryEntry[] {
  const sets: readonly SetSpec[] = [
    { reps: 8, kg, rir: 2 },
    { reps: 8, kg, rir: 2 },
    { reps: 8, kg, rir: 2 },
  ];
  return [
    buildHistoryEntry({
      performedDate: '2026-10-29',
      exposures: [
        { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: 'controlled', sets },
      ],
    }),
    buildHistoryEntry({
      performedDate: '2026-10-26',
      exposures: [
        { exerciseId: 'legPress', equipmentInstanceId: LEG_PRESS_A.id, technique: 'controlled', sets },
      ],
    }),
  ];
}
