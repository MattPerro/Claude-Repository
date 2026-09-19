/**
 * Piano di riferimento per tre anni.
 *
 * Copre l'intero orizzonte calcolato su DATE REALI (156 o 157 settimane a
 * seconda della data di avvio e degli anni bisestili coinvolti), su quattro
 * livelli: anni -> blocchi -> settimane con sedute A/B -> prescrizioni.
 *
 * ---------------------------------------------------------------------------
 * COS'E' E COSA NON E'
 *
 * E' una STRUTTURA PROGETTUALE: dice quali schemi, quali margini e quali
 * recuperi si usano in ciascun blocco, e a quali condizioni si passa al
 * blocco successivo.
 *
 * NON E' una previsione del livello che verra' raggiunto, e non contiene
 * nessun carico in kg per il futuro: prescrivere oggi "80 kg alla pressa fra
 * due anni" sarebbe un numero inventato. I carichi nascono dai dati reali
 * attraverso il motore adattivo.
 *
 * NON E' clinicamente certificato: e' stato scritto e rivisto da agenti AI,
 * che non sono professionisti sanitari abilitati.
 * ---------------------------------------------------------------------------
 *
 * SCELTE DI PROGETTO DICHIARATE
 *
 * P1. Il POOL DI ESERCIZI resta stabile per tre anni. La specifica (§4.4)
 *     vieta sia di copiare la stessa settimana per tre anni sia di cambiare
 *     continuamente esercizi rendendo impossibile misurare i progressi. La
 *     variazione avviene su schemi (serie x ripetizioni), margine, recuperi,
 *     priorita' e cardio - non sull'elenco degli esercizi. Con due sedute a
 *     settimana, uno storico confrontabile sullo stesso esercizio vale piu'
 *     della varieta'.
 * P2. L'intensita' NON aumenta perche' cambia l'anno: ogni blocco di sviluppo
 *     ha criteri di ingresso verificabili sui dati registrati. Se non sono
 *     soddisfatti, il blocco precedente si ripete.
 * P3. Nessun test massimale, in nessun blocco.
 * P4. L'ULTIMO blocco ha durata variabile e assorbe la differenza fra 156 e
 *     157 settimane: cosi' il piano copre l'orizzonte reale senza settimane
 *     avanzo ne' settimane mancanti.
 * P5. Le sedute perse non si accumulano: la settimana si ripete o si prosegue,
 *     mai "recupera tre sedute insieme" (§4.4).
 */

import type { LocalDate } from '../time.js';
import { planningHorizon } from '../time.js';
import type {
  ExercisePrescription,
  SessionPrescription,
  CardioPrescription,
} from '../domain/prescription.js';
import { range, rest, rirTarget } from '../domain/prescription.js';
import type {
  BlockEntryCriterion,
  BlockReviewCriterion,
  ProgramBlock,
  ProgramPhaseKind,
  ProgramPlan,
  ProgramWeek,
  ProgramYear,
} from '../domain/program.js';
import { PROGRAM_PLAN_FORMAT_VERSION } from '../domain/program.js';
import {
  SCHEDULE_EXERCISE_IDS as E,
  buildSessionA,
  buildSessionB,
  CARDIO_WEEKS_5_12,
  CARDIO_INTERVALS_FROM_WEEK_7,
  WARMUP,
} from './twelveWeeks.js';

// ---------------------------------------------------------------------------
// Archetipi di schema
// ---------------------------------------------------------------------------

/**
 * Uno schema descrive COME si allena in un blocco, non CON QUANTI KG.
 *
 * Le posizioni si riferiscono all'ordine nella seduta:
 *  1-2 = esercizi principali (pressa/chest press; stacco/lat machine)
 *  3-4 = esercizi complementari
 *  5-6 = tronco e presa
 */
export interface SchemeSpec {
  readonly id: string;
  readonly label: string;
  /** Serie allenanti per le posizioni 1-2, 3-4, 5-6. */
  readonly sets: readonly [number, number, number];
  /** Intervallo di ripetizioni per le posizioni 1-2 e 3-4. */
  readonly repsMain: readonly [number, number];
  readonly repsSecondary: readonly [number, number];
  /** Recupero in secondi per le posizioni 1-2, 3-4, 5-6 (min, max). */
  readonly restMain: readonly [number, number];
  readonly restSecondary: readonly [number, number];
  readonly restCore: readonly [number, number];
  /** Margine prescritto. */
  readonly rir: readonly [number, number];
  /** Cardio del blocco. */
  readonly cardio: CardioPrescription;
  /** Alternativa cardio facoltativa, solo seduta B. `null` se non prevista. */
  readonly optionalCardioB: CardioPrescription | null;
  /** Una frase che spiega a Mattia cosa cambia in questo blocco. */
  readonly rationale: string;
}

function steady(min: number, max: number, cue: string, note: string | null): CardioPrescription {
  return { kind: 'steady', minutes: range(min, max), intensityCue: cue, note };
}

/**
 * Consolidamento tecnico: lo schema delle settimane 5-12 della scheda
 * iniziale, usato come riferimento anche piu' avanti.
 */
const SCHEME_TECHNICAL: SchemeSpec = {
  id: 'technical',
  label: 'Consolidamento tecnico',
  sets: [3, 3, 2],
  repsMain: [6, 8],
  repsSecondary: [8, 10],
  restMain: [120, 120],
  restSecondary: [90, 90],
  restCore: [45, 60],
  rir: [2, 3],
  cardio: CARDIO_WEEKS_5_12,
  optionalCardioB: CARDIO_INTERVALS_FROM_WEEK_7,
  rationale:
    'Schemi stabili e margine di 2-3 ripetizioni: lo scopo e\' rendere ripetibile la tecnica prima di spingere sui carichi.',
};

/**
 * Forza generale: ripetizioni piu' basse sui due esercizi principali, con lo
 * stesso recupero. Il volume totale scende leggermente, quindi la seduta non
 * si allunga e i recuperi non vanno toccati.
 */
const SCHEME_STRENGTH: SchemeSpec = {
  id: 'strength',
  label: 'Forza generale',
  sets: [3, 3, 2],
  repsMain: [5, 7],
  repsSecondary: [8, 10],
  restMain: [120, 150],
  restSecondary: [90, 90],
  restCore: [45, 60],
  rir: [2, 3],
  cardio: steady(12, 15, 'facili', 'Il cardio resta facile: qui la priorita\' e\' la qualita\' delle serie.'),
  optionalCardioB: CARDIO_INTERVALS_FROM_WEEK_7,
  rationale:
    'Ripetizioni un po\' piu\' basse sui due esercizi principali e recupero fino a 150 secondi. Serve a esprimere forza con la tecnica gia\' consolidata.',
};

/**
 * Consolidamento muscolare: ripetizioni piu' alte e una serie in piu' sul
 * tronco. Recuperi dei principali riportati a 120 s perche' l'intensita'
 * relativa e' minore.
 */
const SCHEME_MUSCLE: SchemeSpec = {
  id: 'muscle',
  label: 'Consolidamento muscolare',
  sets: [3, 3, 2],
  repsMain: [8, 10],
  repsSecondary: [10, 12],
  restMain: [90, 120],
  restSecondary: [75, 90],
  restCore: [45, 60],
  rir: [2, 2],
  cardio: steady(12, 15, 'facili', null),
  optionalCardioB: CARDIO_INTERVALS_FROM_WEEK_7,
  rationale:
    'Ripetizioni piu\' alte e margine di 2: piu\' lavoro per serie a parita\' di durata della seduta.',
};

/**
 * Capacita' di ripetere gli sforzi: recuperi piu' brevi a parita' di schema,
 * piu' lavoro a intervalli sulla cyclette. E' la qualita' che serve per
 * sostenere turni di pista ripetuti.
 */
const SCHEME_REPEAT_EFFORTS: SchemeSpec = {
  id: 'repeatEfforts',
  label: 'Ripetere gli sforzi',
  sets: [3, 2, 2],
  repsMain: [8, 10],
  repsSecondary: [10, 12],
  // Recuperi piu' brevi sono l'OBIETTIVO di questo blocco, dichiarato nello
  // schema: non sono una compressione per far stare la seduta nel tempo.
  restMain: [75, 90],
  restSecondary: [60, 75],
  restCore: [45, 45],
  rir: [2, 3],
  cardio: steady(12, 15, 'facili', null),
  optionalCardioB: {
    kind: 'intervals',
    warmupMinutes: 3,
    rounds: 6,
    hardSeconds: 45,
    easySeconds: 75,
    cooldownMinutes: 3,
    intensityCue: 'sostenuti',
    note:
      'Totale 18 minuti. I tratti sostenuti NON sono sprint massimali. Alternativa facoltativa: scegli tu se usarla.',
    optIn: true,
  },
  rationale:
    'Stessi esercizi con recuperi piu\' brevi e intervalli sulla cyclette: l\'obiettivo dichiarato del blocco e\' tollerare sforzi ripetuti, come nei turni di pista.',
};

/**
 * Mantenimento: il minimo che conserva quanto costruito, con margine ampio.
 * Usato nei periodi con molta pista e nelle fasi di consolidamento.
 */
const SCHEME_MAINTENANCE: SchemeSpec = {
  id: 'maintenance',
  label: 'Mantenimento',
  sets: [2, 2, 1],
  repsMain: [6, 8],
  repsSecondary: [8, 10],
  restMain: [120, 120],
  restSecondary: [90, 90],
  restCore: [45, 60],
  rir: [3, 3],
  cardio: steady(10, 15, 'facili', 'Cardio facile: in questa fase serve a recuperare, non ad affaticare.'),
  optionalCardioB: null,
  rationale:
    'Due serie per esercizio e margine di 3: conserva quanto costruito senza accumulare stanchezza. Serve quando la priorita\' e\' altrove.',
};

/**
 * Periodo di pista: come il mantenimento, con l'avvertenza sul riposo prima
 * delle giornate in pista.
 */
const SCHEME_TRACK: SchemeSpec = {
  ...SCHEME_MAINTENANCE,
  id: 'track',
  label: 'Periodo di pista',
  rationale:
    'Volume ridotto e margine ampio nei periodi con piu\' pista. Il riferimento prudenziale del piano e\' di lasciare circa 72 ore fra l\'ultima seduta impegnativa e una giornata in pista: e\' un criterio configurabile, non una garanzia.',
};

/** Scarico programmato: una settimana a volume ridotto e margine ampio. */
const SCHEME_DELOAD: SchemeSpec = {
  id: 'deload',
  label: 'Scarico',
  sets: [2, 1, 1],
  repsMain: [6, 8],
  repsSecondary: [8, 10],
  restMain: [120, 120],
  restSecondary: [90, 90],
  restCore: [45, 60],
  rir: [4, 4],
  cardio: steady(10, 12, 'facili', 'Solo lavoro facile.'),
  optionalCardioB: null,
  rationale:
    'Settimana di scarico: meno serie e margine di 4 ripetizioni. Serve a recuperare, non a testare niente. I carichi restano quelli della settimana precedente.',
};

/** Rientro: lo schema delle settimane 1-4, riusato dopo una lunga pausa. */
const SCHEME_REENTRY: SchemeSpec = {
  id: 'reentry',
  label: 'Rientro',
  sets: [2, 2, 1],
  repsMain: [8, 10],
  repsSecondary: [10, 12],
  restMain: [120, 120],
  restSecondary: [90, 90],
  restCore: [45, 60],
  rir: [4, 4],
  cardio: steady(8, 10, 'facili', null),
  optionalCardioB: null,
  rationale:
    'Volumi ridotti e margine ampio: la priorita\' e\' la tolleranza al lavoro, non il carico.',
};

export const SCHEMES = {
  reentry: SCHEME_REENTRY,
  technical: SCHEME_TECHNICAL,
  strength: SCHEME_STRENGTH,
  muscle: SCHEME_MUSCLE,
  repeatEfforts: SCHEME_REPEAT_EFFORTS,
  maintenance: SCHEME_MAINTENANCE,
  track: SCHEME_TRACK,
  deload: SCHEME_DELOAD,
} as const satisfies Record<string, SchemeSpec>;

// ---------------------------------------------------------------------------
// Applicazione di uno schema alle sedute base
// ---------------------------------------------------------------------------

/**
 * Esercizi il cui bersaglio NON viene toccato dagli schemi, perche' la
 * specifica lo definisce in termini di durata e controllo o di intervalli
 * fissi (pallof press, farmer carry, plank laterale, step-up).
 */
const FIXED_TARGET_EXERCISES = new Set<string>([
  E.pallofPress,
  E.farmerCarry,
  E.sideplankKneesDown,
  E.stepUp,
]);

function applyScheme(base: SessionPrescription, scheme: SchemeSpec): SessionPrescription {
  const exercises = base.exercises.map<ExercisePrescription>((ex) => {
    const group = ex.order <= 2 ? 0 : ex.order <= 4 ? 1 : 2;
    const sets = scheme.sets[group] ?? ex.workingSets;

    // Gli esercizi a bersaglio fisso conservano intervallo, metrica e
    // indicazione di sforzo; cambia solo il numero di serie.
    if (FIXED_TARGET_EXERCISES.has(ex.exerciseId)) {
      return {
        ...ex,
        workingSets: sets,
        rest:
          group === 2
            ? rest(scheme.restCore[0], scheme.restCore[1])
            : group === 1
              ? rest(scheme.restSecondary[0], scheme.restSecondary[1])
              : rest(scheme.restMain[0], scheme.restMain[1]),
      };
    }

    const reps = group === 0 ? scheme.repsMain : scheme.repsSecondary;
    const restSpec =
      group === 0
        ? rest(scheme.restMain[0], scheme.restMain[1])
        : group === 1
          ? rest(scheme.restSecondary[0], scheme.restSecondary[1])
          : rest(scheme.restCore[0], scheme.restCore[1]);

    return {
      ...ex,
      workingSets: sets,
      target: range(reps[0], reps[1]),
      rest: restSpec,
      effort:
        ex.effort.kind === 'durationControl'
          ? ex.effort
          : rirTarget(scheme.rir[0], scheme.rir[1]),
    };
  });

  const cardio: CardioPrescription[] = [scheme.cardio];
  if (base.slot === 'B' && scheme.optionalCardioB !== null) {
    cardio.push(scheme.optionalCardioB);
  }

  return { ...base, warmup: WARMUP, exercises, cardio };
}

// ---------------------------------------------------------------------------
// Criteri di ingresso e di revisione
// ---------------------------------------------------------------------------

const ALWAYS: BlockEntryCriterion = {
  id: 'always',
  description: 'Nessuna condizione: e\' il blocco di partenza.',
  rule: { kind: 'always' },
};

function completedSessions(count: number): BlockEntryCriterion {
  return {
    id: `completed-${String(count)}`,
    description: `Almeno ${String(count)} sedute completate nel blocco precedente (le sedute saltate non contano).`,
    rule: { kind: 'minCompletedSessions', count },
  };
}

function noIssues(count: number): BlockEntryCriterion {
  return {
    id: `noIssues-${String(count)}`,
    description: `Almeno ${String(count)} sedute consecutive senza fastidi segnalati.`,
    rule: { kind: 'consecutiveSessionsWithoutIssue', count },
  };
}

function techniqueOn(exerciseIds: readonly string[]): BlockEntryCriterion {
  return {
    id: `technique-${exerciseIds.join('-')}`,
    description:
      'Tecnica dichiarata controllata sugli esercizi principali del blocco precedente. ' +
      'La dichiarazione e\' tua: l\'app non giudica l\'esecuzione.',
    rule: { kind: 'techniqueControlled', exerciseIds },
  };
}

function adherence(weeks: number, minRatio: number): BlockEntryCriterion {
  return {
    id: `adherence-${String(weeks)}`,
    description: `Almeno il ${String(Math.round(minRatio * 100))}% delle sedute previste completate nelle ultime ${String(weeks)} settimane.`,
    rule: { kind: 'adherence', weeks, minRatio },
  };
}

/** Criteri di revisione comuni a tutti i blocchi di lavoro. */
const STANDARD_REVIEW: readonly BlockReviewCriterion[] = [
  {
    id: 'discomfort-2',
    description:
      'Fastidio segnalato sullo stesso esercizio in 2 sedute consecutive: il blocco va rivisto e l\'esercizio adattato o sostituito.',
    rule: { kind: 'repeatedDiscomfort', count: 2 },
  },
  {
    id: 'stalled-3',
    description:
      'Nessun progresso confrontabile per 3 esposizioni sullo stesso esercizio: si valuta un cambio di schema, non un aumento forzato.',
    rule: { kind: 'stalledExposures', count: 3 },
  },
  {
    id: 'adherence-low',
    description:
      'Meno della metà delle sedute previste completate nelle ultime 4 settimane: si torna a un blocco piu\' leggero invece di accumulare arretrati.',
    rule: { kind: 'lowAdherence', weeks: 4, maxRatio: 0.5 },
  },
  {
    id: 'overrun',
    description:
      'Seduta oltre 10 minuti in piu\' del tempo disponibile per 2 volte: si riduce il lavoro, non la durata dei recuperi.',
    rule: { kind: 'sessionOverrun', minutesOver: 10, occurrences: 2 },
  },
];

const INTERRUPTION_STANDARD =
  'Fino a 2 settimane di pausa: si riprende dalla stessa settimana, con la prima seduta a margine piu\' ampio. ' +
  'Da 3 a 6 settimane: si ripete il blocco dall\'inizio. Oltre 6 settimane: si rientra dal blocco di rientro. ' +
  'Le sedute perse non si recuperano accumulandole.';

const INTERRUPTION_LIGHT =
  'E\' un blocco a volume ridotto: dopo una pausa si riprende da dove si era interrotto. ' +
  'Le sedute perse non si recuperano accumulandole.';

// ---------------------------------------------------------------------------
// Definizione dei blocchi
// ---------------------------------------------------------------------------

interface BlockDefinition {
  readonly id: string;
  readonly name: string;
  readonly phase: ProgramPhaseKind;
  readonly purpose: string;
  /** Durata in settimane. `null` solo per l'ultimo blocco (P4). */
  readonly weeks: number | null;
  readonly schemeId: keyof typeof SCHEMES | 'initialSchedule';
  readonly yearNumber: number;
  readonly entryCriteria: readonly BlockEntryCriterion[];
  readonly reviewCriteria: readonly BlockReviewCriterion[];
  readonly interruptionPolicy: string;
}

const MAIN_LIFTS = [E.legPress, E.chestPressMachine, E.dumbbellRomanianDeadlift, E.latPulldownFront];

/**
 * I blocchi del percorso, in ordine.
 *
 * I primi due usano `initialSchedule`: sono la scheda fornita dall'utente,
 * riprodotta esattamente e non derivata da uno schema.
 */
export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  // ----------------------------- ANNO 1 -----------------------------------
  {
    id: 'y1b1-rientro',
    name: 'Rientro',
    phase: 'reentry',
    purpose:
      'Riabituare il corpo al lavoro con i pesi dopo circa quattro anni di pausa, con volumi bassi e margine ampio. ' +
      'La priorita\' e\' arrivare alla seduta successiva senza dolori, non spostare carichi.',
    weeks: 4,
    schemeId: 'initialSchedule',
    yearNumber: 1,
    entryCriteria: [ALWAYS],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y1b2-consolidamento',
    name: 'Consolidamento tecnico',
    phase: 'technicalConsolidation',
    purpose:
      'Portare a regime le tabelle complete della scheda iniziale e stabilizzare l\'esecuzione dei sei esercizi di ogni seduta.',
    weeks: 8,
    schemeId: 'initialSchedule',
    yearNumber: 1,
    entryCriteria: [completedSessions(6), noIssues(2)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y1b3-scarico1',
    name: 'Scarico e verifica',
    phase: 'deload',
    purpose:
      'Una settimana di scarico dopo le prime 12: si recupera e si fa il punto sui dati raccolti, senza test.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 1,
    entryCriteria: [completedSessions(10)],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y1b4-forza1',
    name: 'Forza generale 1',
    phase: 'development',
    purpose:
      'Primo blocco dedicato all\'espressione di forza sui due esercizi principali di ogni seduta, con la tecnica gia\' consolidata.',
    weeks: 8,
    schemeId: 'strength',
    yearNumber: 1,
    entryCriteria: [completedSessions(12), techniqueOn(MAIN_LIFTS), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y1b5-base-aerobica',
    name: 'Base aerobica e continuita',
    phase: 'development',
    purpose:
      'Costruire la base aerobica con la cyclette e mantenere la forza acquisita, in un periodo in cui la continuita\' conta piu\' dei carichi.',
    weeks: 8,
    schemeId: 'repeatEfforts',
    yearNumber: 1,
    entryCriteria: [completedSessions(12), adherence(8, 0.7)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y1b6-scarico2',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico programmata a metà anno.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 1,
    entryCriteria: [completedSessions(10)],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y1b7-forza2',
    name: 'Forza generale 2',
    phase: 'development',
    purpose:
      'Secondo blocco di forza generale, sugli stessi esercizi: e\' il confronto diretto con il primo blocco a rendere misurabile il progresso.',
    weeks: 8,
    schemeId: 'strength',
    yearNumber: 1,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y1b8-pista',
    name: 'Periodo di pista',
    phase: 'trackSeason',
    purpose:
      "Periodo con piu' giornate in pista: la palestra passa a volume di mantenimento per non arrivare stanco ai turni.",
    weeks: 8,
    schemeId: 'track',
    yearNumber: 1,
    entryCriteria: [ALWAYS],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y1b9-scarico3',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico dopo il periodo di pista.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 1,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y1b10-chiusura',
    name: 'Consolidamento di fine anno',
    phase: 'technicalConsolidation',
    purpose:
      'Chiusura del primo anno: si torna agli schemi di consolidamento per riportare a regime la tecnica dopo il periodo a volume ridotto.',
    weeks: 5,
    schemeId: 'technical',
    yearNumber: 1,
    entryCriteria: [ALWAYS],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },

  // ----------------------------- ANNO 2 -----------------------------------
  {
    id: 'y2b1-forza-relativa1',
    name: 'Forza relativa 1',
    phase: 'development',
    purpose:
      'Sviluppo sostenibile della forza relativa: piu\' forza a parita\' di peso corporeo, con l\'obiettivo corporeo che procede in parallelo.',
    weeks: 8,
    schemeId: 'strength',
    yearNumber: 2,
    entryCriteria: [completedSessions(60), techniqueOn(MAIN_LIFTS), adherence(12, 0.7)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y2b2-muscolare1',
    name: 'Consolidamento muscolare 1',
    phase: 'development',
    purpose:
      'Piu\' lavoro per serie con ripetizioni piu\' alte: sostiene la forza costruita nel blocco precedente.',
    weeks: 8,
    schemeId: 'muscle',
    yearNumber: 2,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y2b3-scarico1',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico programmata.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 2,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y2b4-ripetere-sforzi',
    name: 'Ripetere gli sforzi',
    phase: 'development',
    purpose:
      'Tollerare sforzi ripetuti con recuperi brevi: e\' la qualita\' che serve per sostenere piu\' turni in pista nella stessa giornata.',
    weeks: 8,
    schemeId: 'repeatEfforts',
    yearNumber: 2,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y2b5-pista',
    name: 'Periodo di pista',
    phase: 'trackSeason',
    purpose:
      'Stagione di pista: volume di mantenimento e attenzione al riposo prima delle giornate in circuito.',
    weeks: 8,
    schemeId: 'track',
    yearNumber: 2,
    entryCriteria: [ALWAYS],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y2b6-scarico2',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico dopo la stagione di pista.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 2,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y2b7-forza-relativa2',
    name: 'Forza relativa 2',
    phase: 'development',
    purpose:
      'Secondo blocco di forza relativa dell\'anno, confrontabile direttamente con il primo sugli stessi esercizi.',
    weeks: 8,
    schemeId: 'strength',
    yearNumber: 2,
    entryCriteria: [completedSessions(12), techniqueOn(MAIN_LIFTS)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y2b8-muscolare2',
    name: 'Consolidamento muscolare 2',
    phase: 'development',
    purpose: 'Secondo blocco di consolidamento muscolare, a chiusura del secondo anno.',
    weeks: 8,
    schemeId: 'muscle',
    yearNumber: 2,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y2b9-mantenimento',
    name: 'Mantenimento e verifica',
    phase: 'maintenance',
    purpose:
      'Due settimane a volume ridotto per chiudere l\'anno e rivedere i dati raccolti prima di impostare il terzo anno.',
    weeks: 2,
    schemeId: 'maintenance',
    yearNumber: 2,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },

  // ----------------------------- ANNO 3 -----------------------------------
  {
    id: 'y3b1-limitanti1',
    name: 'Qualita limitanti 1',
    phase: 'development',
    purpose:
      'Lavoro sulle qualita\' che i dati dei primi due anni indicano come realmente limitanti. Il blocco si imposta LEGGENDO lo storico, non secondo uno schema deciso oggi: la revisione di fine secondo anno scegliera\' su cosa concentrarlo.',
    weeks: 8,
    schemeId: 'strength',
    yearNumber: 3,
    entryCriteria: [completedSessions(100), adherence(12, 0.6)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y3b2-consolidamento',
    name: 'Consolidamento',
    phase: 'development',
    purpose:
      'Consolidare quanto costruito nei due anni precedenti con ripetizioni piu\' alte e volume pieno.',
    weeks: 8,
    schemeId: 'muscle',
    yearNumber: 3,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y3b3-scarico1',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico programmata.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 3,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y3b4-pista',
    name: 'Periodo di pista',
    phase: 'trackSeason',
    purpose: 'Stagione di pista del terzo anno, a volume di mantenimento.',
    weeks: 8,
    schemeId: 'track',
    yearNumber: 3,
    entryCriteria: [ALWAYS],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y3b5-limitanti2',
    name: 'Qualita limitanti 2',
    phase: 'development',
    purpose:
      'Secondo blocco sulle qualita\' limitanti, impostato sui dati dell\'anno in corso.',
    weeks: 8,
    schemeId: 'repeatEfforts',
    yearNumber: 3,
    entryCriteria: [completedSessions(12), noIssues(4)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y3b6-scarico2',
    name: 'Scarico',
    phase: 'deload',
    purpose: 'Settimana di scarico programmata.',
    weeks: 1,
    schemeId: 'deload',
    yearNumber: 3,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
  {
    id: 'y3b7-alternanza',
    name: 'Alternanza personalizzata',
    phase: 'development',
    purpose:
      'Alternanza fra sviluppo, mantenimento e recupero decisa sui dati: quattro settimane di sviluppo, due di mantenimento, ripetute. E\' la struttura che regge meglio un terzo anno, in cui pista, lavoro e vita reale non seguono un calendario fisso.',
    weeks: 12,
    schemeId: 'strength',
    yearNumber: 3,
    entryCriteria: [completedSessions(12)],
    reviewCriteria: STANDARD_REVIEW,
    interruptionPolicy: INTERRUPTION_STANDARD,
  },
  {
    id: 'y3b8-chiusura',
    name: 'Chiusura del percorso',
    phase: 'maintenance',
    purpose:
      'Ultimo blocco: volume di mantenimento e revisione complessiva dei tre anni, per decidere insieme come proseguire. La durata di questo blocco assorbe la differenza fra 156 e 157 settimane dell\'orizzonte reale.',
    // P4: durata variabile, calcolata sull'orizzonte reale.
    weeks: null,
    schemeId: 'maintenance',
    yearNumber: 3,
    entryCriteria: [ALWAYS],
    reviewCriteria: [],
    interruptionPolicy: INTERRUPTION_LIGHT,
  },
];

/**
 * Nel blocco `y3b7-alternanza` le settimane alternano sviluppo e mantenimento
 * secondo questo ciclo di 6: quattro di sviluppo, due di mantenimento.
 */
const ALTERNATION_CYCLE: readonly (keyof typeof SCHEMES)[] = [
  'strength',
  'strength',
  'strength',
  'strength',
  'maintenance',
  'maintenance',
];

// ---------------------------------------------------------------------------
// Obiettivi annuali
// ---------------------------------------------------------------------------

const YEAR_CAVEAT =
  'Questa e\' una struttura progettuale, non una previsione certa del livello che verra\' raggiunto. ' +
  'Non contiene carichi in kg per il futuro: quelli nascono dai dati registrati. ' +
  'Il percorso e\' stato scritto e rivisto da agenti AI e non e\' clinicamente certificato.';

const YEAR_DEFINITIONS: readonly Omit<ProgramYear, 'blockIds'>[] = [
  {
    number: 1,
    title: 'Rientro, tecnica e prima forza generale',
    objectives: [
      'Tornare ad allenarsi con continuita\': due sedute a settimana diventano un\'abitudine, non uno sforzo di volonta\'.',
      'Consolidare l\'esecuzione dei dodici esercizi delle sedute A e B, dichiarando la tecnica seduta per seduta.',
      'Costruire una prima forza generale sui due esercizi principali di ogni seduta, misurata sul confronto fra blocchi.',
      'Costruire una base aerobica con la cyclette, partendo da 8-10 minuti facili.',
      'Avvicinarsi a 90 kg migliorando la composizione corporea, senza una data promessa.',
    ],
    caveat: YEAR_CAVEAT,
  },
  {
    number: 2,
    title: 'Forza relativa sostenibile e capacita di ripetere gli sforzi',
    objectives: [
      'Sviluppare la forza relativa in modo sostenibile: piu\' forza a parita\' di peso corporeo.',
      'Consolidare la massa muscolare con blocchi a ripetizioni piu\' alte alternati a quelli di forza.',
      'Tollerare sforzi ripetuti con recuperi brevi, utile per sostenere piu\' turni in pista nella stessa giornata.',
      'Gestire i periodi con piu\' pista passando a volume di mantenimento invece di interrompere.',
    ],
    caveat: YEAR_CAVEAT,
  },
  {
    number: 3,
    title: 'Consolidamento e lavoro sulle qualita limitanti',
    objectives: [
      'Consolidare quanto costruito nei primi due anni.',
      'Concentrare il lavoro sulle qualita\' che i dati raccolti indicano come realmente limitanti - scelte leggendo lo storico, non decise in anticipo.',
      'Alternare sviluppo, mantenimento e recupero in modo personalizzato, senza un calendario rigido.',
      'Arrivare alla fine del percorso con una revisione completa dei dati, per decidere come proseguire.',
    ],
    caveat: YEAR_CAVEAT,
  },
];

// ---------------------------------------------------------------------------
// Generazione del piano
// ---------------------------------------------------------------------------

/**
 * Durata in settimane di ciascun blocco, dato l'orizzonte reale.
 *
 * L'ultimo blocco assorbe la differenza (P4). Se l'orizzonte fosse piu' corto
 * della somma dei blocchi a durata fissa, l'ultimo blocco riceve almeno una
 * settimana e i blocchi in eccesso vengono troncati: il piano resta coerente
 * con il calendario invece di sforare.
 */
export function resolveBlockWeeks(totalWeeks: number): readonly number[] {
  const fixed = BLOCK_DEFINITIONS.map((b) => b.weeks);
  const fixedSum = fixed.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const flexibleCount = fixed.filter((w) => w === null).length;
  if (flexibleCount !== 1) {
    throw new Error(
      `Il piano deve avere esattamente un blocco a durata variabile, trovati ${String(flexibleCount)}.`,
    );
  }
  const tail = totalWeeks - fixedSum;
  if (tail < 1) {
    throw new Error(
      `Orizzonte troppo corto: ${String(totalWeeks)} settimane non bastano per i blocchi a durata fissa (${String(fixedSum)}).`,
    );
  }
  return fixed.map((w) => w ?? tail);
}

/** Schema usato da una settimana specifica del blocco `y3b7-alternanza`. */
function schemeForWeek(
  definition: BlockDefinition,
  indexInBlock: number,
): SchemeSpec | 'initialSchedule' {
  if (definition.schemeId === 'initialSchedule') return 'initialSchedule';
  if (definition.id === 'y3b7-alternanza') {
    const key = ALTERNATION_CYCLE[(indexInBlock - 1) % ALTERNATION_CYCLE.length] ?? 'strength';
    return SCHEMES[key];
  }
  return SCHEMES[definition.schemeId];
}

function buildWeek(
  definition: BlockDefinition,
  absoluteIndex: number,
  indexInBlock: number,
): ProgramWeek {
  const scheme = schemeForWeek(definition, indexInBlock);

  if (scheme === 'initialSchedule') {
    // Blocchi 1 e 2: la scheda dell'utente, riprodotta esattamente.
    return {
      index: absoluteIndex,
      indexInBlock,
      label: `Settimana ${String(absoluteIndex)} - ${definition.name}`,
      note: noteForInitialWeek(absoluteIndex),
      sessions: [buildSessionA(absoluteIndex), buildSessionB(absoluteIndex)],
      isDeload: false,
    };
  }

  // Gli altri blocchi derivano dalle sedute a regime (settimana 5) applicando
  // lo schema del blocco: stessi esercizi, schemi diversi.
  const baseA = buildSessionA(5);
  const baseB = buildSessionB(5);

  return {
    index: absoluteIndex,
    indexInBlock,
    label: `Settimana ${String(absoluteIndex)} - ${definition.name} (${scheme.label})`,
    note: indexInBlock === 1 ? scheme.rationale : null,
    sessions: [applyScheme(baseA, scheme), applyScheme(baseB, scheme)],
    isDeload: scheme.id === 'deload',
  };
}

function noteForInitialWeek(index: number): string | null {
  if (index <= 2) {
    return 'Fase di rientro: due serie dei primi quattro esercizi, una del quinto e del sesto. Circa 4 ripetizioni in riserva.';
  }
  if (index <= 4) {
    return 'Due serie per tutti e sei gli esercizi. Step-up a 8 per gamba. Circa 3 ripetizioni in riserva.';
  }
  if (index === 5) {
    return 'Tabelle complete. Generalmente 2 o 3 ripetizioni in riserva. Cyclette finale 12-15 minuti.';
  }
  if (index === 7) {
    return "Dalla settimana 7 nella seduta B e' disponibile l'alternativa cardio a intervalli. E' facoltativa: scegli tu se usarla.";
  }
  return null;
}

/** Genera il piano completo per l'orizzonte indicato. */
export function buildThreeYearPlan(options: {
  readonly id: string;
  readonly startDate: LocalDate;
  readonly horizonYears?: number;
  readonly version?: number;
  readonly revisionReason?: string | null;
  readonly derivedFromVersion?: number | null;
}): ProgramPlan {
  const horizonYears = options.horizonYears ?? 3;
  const horizon = planningHorizon(options.startDate, horizonYears);
  const weeksPerBlock = resolveBlockWeeks(horizon.totalWeeks);

  const blocks: ProgramBlock[] = [];
  let cursor = 1;

  BLOCK_DEFINITIONS.forEach((definition, blockIndex) => {
    const count = weeksPerBlock[blockIndex] ?? 0;
    const weeks: ProgramWeek[] = [];
    for (let i = 1; i <= count; i += 1) {
      weeks.push(buildWeek(definition, cursor + i - 1, i));
    }
    blocks.push({
      id: definition.id,
      order: blockIndex + 1,
      name: definition.name,
      phase: definition.phase,
      purpose: definition.purpose,
      plannedWeeks: count,
      startWeekIndex: cursor,
      weeks,
      entryCriteria: definition.entryCriteria,
      reviewCriteria: definition.reviewCriteria,
      interruptionPolicy: definition.interruptionPolicy,
      yearNumber: definition.yearNumber,
    });
    cursor += count;
  });

  const years: ProgramYear[] = YEAR_DEFINITIONS.map((year) => ({
    ...year,
    blockIds: blocks.filter((b) => b.yearNumber === year.number).map((b) => b.id),
  }));

  return {
    id: options.id,
    version: options.version ?? 1,
    formatVersion: PROGRAM_PLAN_FORMAT_VERSION,
    startDate: horizon.startDate,
    horizonYears,
    lastDate: horizon.lastDate,
    years,
    blocks,
    revisionReason: options.revisionReason ?? null,
    derivedFromVersion: options.derivedFromVersion ?? null,
  };
}
