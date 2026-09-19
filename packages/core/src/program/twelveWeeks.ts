/**
 * Scheda iniziale: prime 12 settimane.
 *
 * Questi dati sono la TRASCRIZIONE della scheda fornita dall'utente
 * (`SPEC.md` §3). Non sono un programma clinicamente certificato e non vanno
 * modificati per "migliorarli": esercizi, volumi, intervalli di ripetizioni,
 * recuperi e progressioni sono il riferimento iniziale dell'utente.
 *
 * Se questo file e `SPEC.md` §3 divergono, questo file e' in difetto.
 * Il test `packages/core/test/twelveWeeks.test.ts` verifica la corrispondenza
 * voce per voce.
 *
 * ---------------------------------------------------------------------------
 * ASSUNZIONI DOCUMENTATE (decisioni reversibili, prese per poter procedere)
 *
 * A1. I recuperi non sono ripetuti dalla specifica per le settimane 1-4:
 *     si usano gli stessi valori della tabella completa, perche' sono una
 *     proprieta' dell'esercizio e non della fase.
 * A2. "Circa 4 / 3 / 2-3 ripetizioni in riserva" e' modellato come intervallo
 *     esatto per fase. La tolleranza sul "circa" sta nel motore adattivo
 *     (`engine/config.ts`), non qui: la prescrizione resta fedele al testo.
 * A3. Lo step-up usa la convenzione `bodyweightPlus` in tutte le settimane,
 *     con sovraccarico 0 kg nelle settimane 1-2 ("inizialmente senza
 *     manubri"). Cosi' lo storico resta confrontabile quando si aggiungono i
 *     manubri, invece di spezzarsi in due serie di dati separate.
 * A4. L'hip thrust alla macchina eredita il recupero dello stacco rumeno
 *     (120 s), perche' occupa la stessa posizione nella seduta.
 * A5. Il riscaldamento e' identico per A e B, come da specifica; la voce
 *     "serie leggere sul primo esercizio per le gambe" e' agganciata
 *     all'esercizio in posizione 1 e quella sul "primo esercizio superiore"
 *     alla posizione 2, che in entrambe le sedute sono rispettivamente un
 *     esercizio per le gambe e uno per la parte superiore.
 * ---------------------------------------------------------------------------
 */

import type {
  CardioPrescription,
  ExercisePrescription,
  SessionPrescription,
  WarmupItem,
} from '../domain/prescription.js';
import { durationControlTarget, exact, range, rest, rirTarget } from '../domain/prescription.js';

/**
 * Identificativi degli esercizi usati dalla scheda.
 * Duplicati qui come costanti locali per non creare una dipendenza circolare
 * con la libreria; il test verifica che esistano tutti in libreria.
 */
export const SCHEDULE_EXERCISE_IDS = {
  legPress: 'legPress',
  chestPressMachine: 'chestPressMachine',
  seatedCableRow: 'seatedCableRow',
  legCurl: 'legCurl',
  pallofPress: 'pallofPress',
  farmerCarry: 'farmerCarry',
  dumbbellRomanianDeadlift: 'dumbbellRomanianDeadlift',
  latPulldownFront: 'latPulldownFront',
  stepUp: 'stepUp',
  inclineDumbbellPress: 'inclineDumbbellPress',
  adductorMachine: 'adductorMachine',
  sideplankKneesDown: 'sideplankKneesDown',
  hipThrustMachine: 'hipThrustMachine',
  stationaryBike: 'stationaryBike',
} as const;

const E = SCHEDULE_EXERCISE_IDS;

/** Fase della scheda iniziale. Determina volumi, intervalli e margine. */
export type InitialPhase = 'weeks1to2' | 'weeks3to4' | 'weeks5to12';

/** Margine prescritto per fase (`SPEC.md` §3.6, §3.7, §3.8). */
export const PHASE_RIR = {
  // "Circa quattro ripetizioni in riserva"
  weeks1to2: rirTarget(4),
  // "Circa tre ripetizioni in riserva"
  weeks3to4: rirTarget(3),
  // "Generalmente due o tre ripetizioni in riserva"
  weeks5to12: rirTarget(2, 3),
} as const satisfies Record<InitialPhase, ReturnType<typeof rirTarget>>;

// ---------------------------------------------------------------------------
// Riscaldamento (SPEC.md §3.1) - identico per entrambe le sedute
// ---------------------------------------------------------------------------

export const WARMUP: readonly WarmupItem[] = [
  {
    order: 1,
    label: '5 minuti di cyclette facile',
    detail:
      'Pedala per 5 minuti a ritmo comodo: devi poter parlare senza affanno. Serve ad alzare la temperatura, non ad affaticare.',
    estimatedSeconds: 300,
    warmupSetsOnExerciseOrder: null,
    warmupSetCount: 0,
  },
  {
    order: 2,
    label: '6-8 alzate da una panca senza carico',
    detail:
      'Siediti sul bordo della panca e alzati in piedi senza spingerti con le mani, 6-8 volte. Movimento lento e controllato.',
    estimatedSeconds: 60,
    warmupSetsOnExerciseOrder: null,
    warmupSetCount: 0,
  },
  {
    order: 3,
    label: "6-8 flessioni dell'anca portando indietro il bacino",
    detail:
      'In piedi, ginocchia morbide: porta il bacino indietro come per chiudere una portiera con il sedere, poi torna su. 6-8 ripetizioni.',
    estimatedSeconds: 60,
    warmupSetsOnExerciseOrder: null,
    warmupSetCount: 0,
  },
  {
    order: 4,
    label: 'Mobilizzazione controllata di spalle e caviglie',
    detail:
      'Circonduzioni lente delle spalle e oscillazioni della caviglia avanti e indietro, senza forzare e senza rimbalzi.',
    estimatedSeconds: 120,
    warmupSetsOnExerciseOrder: null,
    warmupSetCount: 0,
  },
  {
    order: 5,
    label: 'Due serie leggere sul primo esercizio per le gambe',
    detail:
      'Due serie facili sul primo esercizio della seduta, con un carico che ti lascia molto margine. Non contano come serie allenanti.',
    estimatedSeconds: 180,
    warmupSetsOnExerciseOrder: 1,
    warmupSetCount: 2,
  },
  {
    order: 6,
    label: 'Una serie leggera sul primo esercizio superiore',
    detail:
      'Una serie facile sul secondo esercizio della seduta, quello per la parte superiore. Non conta come serie allenante.',
    estimatedSeconds: 90,
    warmupSetsOnExerciseOrder: 2,
    warmupSetCount: 1,
  },
] as const;

/** Secondi totali stimati per il riscaldamento, serie leggere incluse. */
export const WARMUP_ESTIMATED_SECONDS = WARMUP.reduce(
  (sum, item) => sum + item.estimatedSeconds,
  0,
);

// ---------------------------------------------------------------------------
// Cardio per fase (SPEC.md §3.6, §3.7, §3.8, §3.9)
// ---------------------------------------------------------------------------

/** Cyclette finale, settimane 1-2: 8-10 minuti facili. */
export const CARDIO_WEEKS_1_2: CardioPrescription = {
  kind: 'steady',
  minutes: range(8, 10),
  intensityCue: 'facili',
  note: 'Ritmo comodo: devi poter parlare. Non e\' un test.',
};

/** Cyclette finale, settimane 3-4: gradualmente 12-15 minuti. */
export const CARDIO_WEEKS_3_4: CardioPrescription = {
  kind: 'steady',
  minutes: range(12, 15),
  intensityCue: 'facili',
  note: 'Aumenta gradualmente da 12 a 15 minuti nel corso delle due settimane.',
};

/** Cyclette finale, settimane 5-12: 12-15 minuti. */
export const CARDIO_WEEKS_5_12: CardioPrescription = {
  kind: 'steady',
  minutes: range(12, 15),
  intensityCue: 'facili',
  note: null,
};

/**
 * Alternativa facoltativa a intervalli, dalla settimana 7 e SOLO nella seduta B
 * (`SPEC.md` §3.9). `optIn: true` significa che va scelta espressamente: non si
 * attiva da sola per il trascorrere dei giorni.
 */
export const CARDIO_INTERVALS_FROM_WEEK_7: CardioPrescription = {
  kind: 'intervals',
  warmupMinutes: 3,
  rounds: 6,
  hardSeconds: 30,
  easySeconds: 60,
  cooldownMinutes: 3,
  intensityCue: 'sostenuti',
  note:
    'Totale 15 minuti. I tratti sostenuti NON sono sprint massimali: devi arrivare alla fine dei 30 secondi ' +
    'con la sensazione di poter continuare. Alternativa facoltativa: scegli tu se usarla.',
  optIn: true,
};

/** Prima settimana in cui l'alternativa a intervalli puo' essere proposta. */
export const INTERVALS_AVAILABLE_FROM_WEEK = 7;

// ---------------------------------------------------------------------------
// Costruttori di prescrizione
// ---------------------------------------------------------------------------

interface ExerciseSpec {
  readonly order: number;
  readonly exerciseId: string;
  readonly workingSets: number;
  readonly target: ReturnType<typeof range>;
  readonly metric: 'reps' | 'seconds';
  readonly perSide: boolean;
  readonly restSpec: ReturnType<typeof rest>;
  readonly loadConvention: ExercisePrescription['loadConvention'];
  readonly timePriority: number;
  readonly note?: string;
  readonly alternatives?: readonly string[];
  /** Se presente sostituisce il RIR di fase (esercizi a tempo). */
  readonly effortOverride?: ExercisePrescription['effort'];
}

function buildExercise(spec: ExerciseSpec, phase: InitialPhase): ExercisePrescription {
  return {
    order: spec.order,
    exerciseId: spec.exerciseId,
    variantId: null,
    workingSets: spec.workingSets,
    target: spec.target,
    metric: spec.metric,
    perSide: spec.perSide,
    effort: spec.effortOverride ?? PHASE_RIR[phase],
    rest: spec.restSpec,
    loadConvention: spec.loadConvention,
    alternativeExerciseIds: spec.alternatives ?? [],
    note: spec.note ?? null,
    timePriority: spec.timePriority,
  };
}

/**
 * Indicazione di sforzo per gli esercizi a tempo.
 * La specifica (§3.10) vieta di imporre un RIR privo di significato: qui si
 * usano durata e controllo.
 */
const FARMER_CARRY_EFFORT = durationControlTarget(
  'Postura controllata per tutta la durata. Nessuna prova massimale di presa: se la presa cede, appoggia.',
);

const SIDE_PLANK_EFFORT = durationControlTarget(
  'Mantieni la linea fianco-spalla. Interrompi quando non riesci piu\' a mantenere la posizione.',
);

// ---------------------------------------------------------------------------
// SEDUTA A
// ---------------------------------------------------------------------------

/**
 * Specifiche della seduta A per fase.
 *
 * Settimane 1-2: due serie dei primi quattro esercizi, una del quinto e del
 * sesto; pressa e chest press a 8-10 (invece di 6-8).
 * Settimane 3-4: due serie per tutti e sei, intervalli della fase di rientro.
 * Settimane 5-12: tabella completa (§3.2).
 */
function sessionASpecs(phase: InitialPhase): readonly ExerciseSpec[] {
  const reentryRanges = phase !== 'weeks5to12';
  // Settimane 1-2: 2 serie sui primi quattro, 1 sul quinto e sesto.
  // Settimane 3-4 e 5-12: vedi sotto.
  const setsFirstFour = phase === 'weeks5to12' ? null : 2;
  const setsFifthSixth = phase === 'weeks1to2' ? 1 : 2;

  return [
    {
      order: 1,
      exerciseId: E.legPress,
      workingSets: setsFirstFour ?? 3,
      target: reentryRanges ? range(8, 10) : range(6, 8),
      metric: 'reps',
      perSide: false,
      restSpec: rest(120),
      loadConvention: 'machineStack',
      timePriority: 1,
      note: 'Bacino appoggiato e movimento controllato.',
    },
    {
      order: 2,
      exerciseId: E.chestPressMachine,
      workingSets: setsFirstFour ?? 3,
      target: reentryRanges ? range(8, 10) : range(6, 8),
      metric: 'reps',
      perSide: false,
      restSpec: rest(120),
      loadConvention: 'machineStack',
      timePriority: 1,
    },
    {
      order: 3,
      exerciseId: E.seatedCableRow,
      workingSets: setsFirstFour ?? 3,
      // 8-10 in tutte le fasi.
      target: range(8, 10),
      metric: 'reps',
      perSide: false,
      restSpec: rest(90),
      loadConvention: 'machineStack',
      timePriority: 2,
    },
    {
      order: 4,
      exerciseId: E.legCurl,
      workingSets: setsFirstFour ?? 2,
      target: range(10, 12),
      metric: 'reps',
      perSide: false,
      restSpec: rest(60, 90),
      loadConvention: 'machineStack',
      timePriority: 3,
    },
    {
      order: 5,
      exerciseId: E.pallofPress,
      workingSets: setsFifthSixth,
      target: range(8, 10),
      metric: 'reps',
      perSide: true,
      restSpec: rest(45, 60),
      loadConvention: 'machineStack',
      timePriority: 4,
      note: 'Per lato. Resisti alla rotazione, non spingere con le braccia.',
    },
    {
      order: 6,
      exerciseId: E.farmerCarry,
      workingSets: setsFifthSixth,
      target: range(20, 30),
      metric: 'seconds',
      perSide: false,
      restSpec: rest(60),
      loadConvention: 'perDumbbell',
      timePriority: 4,
      effortOverride: FARMER_CARRY_EFFORT,
      note: 'Peso di CIASCUN manubrio. Postura controllata, senza prova massimale di presa.',
    },
  ];
}

// ---------------------------------------------------------------------------
// SEDUTA B
// ---------------------------------------------------------------------------

function sessionBSpecs(phase: InitialPhase): readonly ExerciseSpec[] {
  const reentryRanges = phase !== 'weeks5to12';
  const setsFirstFour = phase === 'weeks5to12' ? null : 2;
  const setsFifthSixth = phase === 'weeks1to2' ? 1 : 2;

  // Step-up: 6-8 per gamba nelle settimane 1-2, 8 per gamba dalla 3.
  const stepUpTarget = phase === 'weeks1to2' ? range(6, 8) : exact(8);
  const stepUpNote =
    phase === 'weeks1to2'
      ? 'Gradino stabile e basso. Inizialmente SENZA manubri: sovraccarico 0 kg. Appoggiati quando serve.'
      : 'Gradino stabile e basso. Aggiungi manubri solo quando 8 ripetizioni per gamba sono controllate.';

  return [
    {
      order: 1,
      exerciseId: E.dumbbellRomanianDeadlift,
      workingSets: setsFirstFour ?? 3,
      target: reentryRanges ? range(8, 10) : range(6, 8),
      metric: 'reps',
      perSide: false,
      restSpec: rest(120),
      loadConvention: 'perDumbbell',
      timePriority: 1,
      note:
        'Peso di CIASCUN manubrio. Bacino indietro, manubri vicini alle gambe. Non serve arrivare a terra.',
      alternatives: [E.hipThrustMachine],
    },
    {
      order: 2,
      exerciseId: E.latPulldownFront,
      workingSets: setsFirstFour ?? 3,
      target: range(8, 10),
      metric: 'reps',
      perSide: false,
      restSpec: rest(90),
      loadConvention: 'machineStack',
      timePriority: 1,
      note: 'Davanti al petto.',
    },
    {
      order: 3,
      exerciseId: E.stepUp,
      workingSets: setsFirstFour ?? 2,
      target: stepUpTarget,
      metric: 'reps',
      perSide: true,
      // Recupero DOPO entrambe le gambe (SPEC §3.3).
      restSpec: rest(90),
      loadConvention: 'bodyweightPlus',
      timePriority: 2,
      note: stepUpNote,
    },
    {
      order: 4,
      exerciseId: E.inclineDumbbellPress,
      workingSets: setsFirstFour ?? 2,
      target: range(8, 10),
      metric: 'reps',
      perSide: false,
      restSpec: rest(90),
      loadConvention: 'perDumbbell',
      timePriority: 2,
      note: 'Panca leggermente inclinata. Peso di CIASCUN manubrio.',
    },
    {
      order: 5,
      exerciseId: E.adductorMachine,
      workingSets: setsFifthSixth,
      target: range(12, 15),
      metric: 'reps',
      perSide: false,
      restSpec: rest(60),
      loadConvention: 'machineStack',
      timePriority: 3,
    },
    {
      order: 6,
      exerciseId: E.sideplankKneesDown,
      workingSets: setsFifthSixth,
      target: range(15, 25),
      metric: 'seconds',
      perSide: true,
      restSpec: rest(45, 60),
      loadConvention: 'timeOnly',
      timePriority: 4,
      effortOverride: SIDE_PLANK_EFFORT,
      note: 'Per lato, ginocchia appoggiate. Interrompi quando non mantieni la posizione.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Assemblaggio delle sedute
// ---------------------------------------------------------------------------

function cardioFor(phase: InitialPhase, weekIndex: number, slot: 'A' | 'B'): CardioPrescription[] {
  const base =
    phase === 'weeks1to2'
      ? CARDIO_WEEKS_1_2
      : phase === 'weeks3to4'
        ? CARDIO_WEEKS_3_4
        : CARDIO_WEEKS_5_12;

  // L'alternativa a intervalli esiste SOLO nella seduta B e SOLO dalla
  // settimana 7. Resta facoltativa (`optIn: true`): compare come alternativa
  // accanto al lavoro continuo, non lo sostituisce.
  if (slot === 'B' && weekIndex >= INTERVALS_AVAILABLE_FROM_WEEK) {
    return [base, CARDIO_INTERVALS_FROM_WEEK_7];
  }
  return [base];
}

export function phaseForWeek(weekIndex: number): InitialPhase {
  if (weekIndex <= 2) return 'weeks1to2';
  if (weekIndex <= 4) return 'weeks3to4';
  return 'weeks5to12';
}

const FOCUS_A =
  'Spinta di gambe, spinta orizzontale e tirata orizzontale, piu\' controllo del tronco alla rotazione e presa.';
const FOCUS_B =
  'Flessione delle anche, tirata verticale e appoggio su una gamba, piu\' controllo laterale del tronco.';

/** Costruisce la seduta A per la settimana indicata (1-12). */
export function buildSessionA(weekIndex: number): SessionPrescription {
  const phase = phaseForWeek(weekIndex);
  return {
    slot: 'A',
    title: 'Allenamento A',
    focus: FOCUS_A,
    warmup: WARMUP,
    exercises: sessionASpecs(phase).map((spec) => buildExercise(spec, phase)),
    cardio: cardioFor(phase, weekIndex, 'A'),
  };
}

/** Costruisce la seduta B per la settimana indicata (1-12). */
export function buildSessionB(weekIndex: number): SessionPrescription {
  const phase = phaseForWeek(weekIndex);
  return {
    slot: 'B',
    title: 'Allenamento B',
    focus: FOCUS_B,
    warmup: WARMUP,
    exercises: sessionBSpecs(phase).map((spec) => buildExercise(spec, phase)),
    cardio: cardioFor(phase, weekIndex, 'B'),
  };
}

/**
 * Applica l'alternativa hip thrust al posto dello stacco rumeno
 * (`SPEC.md` §3.4).
 *
 * Volumi: 2 x 8-10 nelle prime quattro settimane, 3 x 8-10 a regime.
 * Lo storico resta DISTINTO da quello dello stacco rumeno, perche' cambia
 * l'esercizio e quindi la chiave di comparabilita'.
 *
 * La specifica indica che la scelta va valutata con un istruttore: l'app la
 * offre come alternativa prevista, non la impone e non giudica la tecnica.
 */
export function withHipThrustAlternative(
  session: SessionPrescription,
  weekIndex: number,
): SessionPrescription {
  if (session.slot !== 'B') {
    throw new Error("L'alternativa hip thrust si applica solo alla seduta B.");
  }
  const workingSets = weekIndex <= 4 ? 2 : 3;
  const replaced = session.exercises.map<ExercisePrescription>((ex) =>
    ex.exerciseId === E.dumbbellRomanianDeadlift
      ? {
          ...ex,
          exerciseId: E.hipThrustMachine,
          workingSets,
          target: range(8, 10),
          // A4: eredita il recupero della posizione che occupa.
          rest: rest(120),
          loadConvention: 'machineStack',
          alternativeExerciseIds: [E.dumbbellRomanianDeadlift],
          note:
            'Alternativa prevista allo stacco rumeno quando la tecnica dello stacco non e\' ancora adeguata. ' +
            'Da valutare con un istruttore. Lo storico resta separato da quello dello stacco.',
        }
      : ex,
  );
  return { ...session, exercises: replaced };
}

/** Le due sedute della settimana indicata, in ordine A poi B. */
export function buildWeekSessions(weekIndex: number): readonly SessionPrescription[] {
  return [buildSessionA(weekIndex), buildSessionB(weekIndex)];
}

/** Numero di settimane coperte dalla scheda iniziale. */
export const INITIAL_SCHEDULE_WEEKS = 12;
