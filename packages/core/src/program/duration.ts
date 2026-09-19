/**
 * Stima della durata di una seduta.
 *
 * La specifica (§4.5) richiede che la stima consideri riscaldamento, lavoro,
 * recuperi, lati, cambi di attrezzo e cardio - e vieta di rendere compatibile
 * una seduta troppo lunga **comprimendo arbitrariamente i recuperi**.
 *
 * Qui si calcola soltanto la stima, con una ripartizione ispezionabile. Se la
 * seduta non sta nel tempo disponibile, la risposta corretta e' ridurre il
 * LAVORO in modo ragionato (vedi `engine/shortenSession.ts`), non accorciare i
 * recuperi.
 *
 * I coefficienti sono stime progettuali dichiarate, non misurazioni: la durata
 * reale viene registrata a ogni seduta e mostrata accanto alla stima, cosi'
 * diventa verificabile con i dati di Mattia invece di restare un'affermazione.
 */

import type {
  CardioPrescription,
  ExercisePrescription,
  SessionPrescription,
} from '../domain/prescription.js';
import { cardioMinutes, defaultRestSeconds } from '../domain/prescription.js';
import type { Exercise, ExerciseLibrary } from '../domain/exercise.js';

/** Coefficienti della stima, tutti dichiarati ed esposti. */
export interface DurationModel {
  /**
   * Secondi per registrare una serie sul telefono: leggere il bersaglio,
   * inserire carico e ripetizioni, confermare.
   */
  readonly secondsPerSetLogging: number;
  /** Secondi per il check-in iniziale, se svolto. */
  readonly checkInSeconds: number;
  /** Secondi per il riepilogo finale. */
  readonly summarySeconds: number;
  /** Secondi per passare dalla palestra alla cyclette e impostarla. */
  readonly cardioSetupSeconds: number;
}

export const DEFAULT_DURATION_MODEL: DurationModel = {
  secondsPerSetLogging: 10,
  checkInSeconds: 45,
  summarySeconds: 45,
  cardioSetupSeconds: 60,
};

/** Quante "esecuzioni" richiede una serie: due per gli esercizi per lato. */
export function setEventsPerSet(prescription: ExercisePrescription): number {
  return prescription.perSide ? 2 : 1;
}

/**
 * Numero totale di esecuzioni per un esercizio.
 * Un esercizio 2 x 8 per gamba ha 2 serie e 4 esecuzioni: le serie NON
 * raddoppiano (specifica §11), ma il tempo sotto sforzo si'.
 */
export function totalSetEvents(prescription: ExercisePrescription): number {
  return prescription.workingSets * setEventsPerSet(prescription);
}

/**
 * Numero di recuperi PRINCIPALI dentro l'esercizio.
 *
 * Per lo step-up il recupero e' dopo entrambe le gambe
 * (`restAfterBothSides`), quindi i recuperi sono uno per serie, non uno per
 * gamba. Fra le due gambe si conta solo il tempo di cambio appoggio.
 */
export function restCountWithinExercise(
  prescription: ExercisePrescription,
  exercise: Exercise,
): number {
  const perSideRests =
    prescription.perSide && !exercise.restAfterBothSides
      ? prescription.workingSets * 2
      : prescription.workingSets;
  // L'ultimo recupero dell'esercizio e' contato nel passaggio all'esercizio
  // successivo (vedi `estimateSessionSeconds`), per non sommarlo due volte.
  return Math.max(0, perSideRests - 1);
}

/** Secondi di lavoro effettivo (tempo sotto sforzo) di un esercizio. */
export function workSeconds(prescription: ExercisePrescription, exercise: Exercise): number {
  const events = totalSetEvents(prescription);
  // Si stima sul limite SUPERIORE dell'intervallo: e' il caso che deve stare
  // nel tempo disponibile. Stimare sul minimo produrrebbe sedute che sforano
  // sistematicamente.
  const perEvent =
    prescription.metric === 'seconds'
      ? prescription.target.max
      : prescription.target.max * exercise.secondsPerRep;
  return events * perEvent;
}

/** Ripartizione della stima, mostrabile all'utente. */
export interface DurationBreakdown {
  readonly warmupSeconds: number;
  readonly workSeconds: number;
  readonly restSeconds: number;
  /** Cambi di attrezzo e impostazione delle macchine. */
  readonly transitionSeconds: number;
  /** Tempo speso a registrare sul telefono. */
  readonly loggingSeconds: number;
  readonly cardioSeconds: number;
  readonly overheadSeconds: number;
  readonly totalSeconds: number;
  readonly totalMinutes: number;
}

/**
 * Quale prescrizione cardio si usa per la stima.
 *
 * Le alternative facoltative (`optIn`) NON vengono conteggiate: non sono
 * attive finche' Mattia non le sceglie, e includerle gonfierebbe la stima di
 * una seduta che non ha scelto di fare.
 */
function cardioSecondsFor(cardio: readonly CardioPrescription[]): number {
  const active = cardio.filter((c) => c.kind === 'steady' || !c.optIn);
  const longest = active.reduce((max, c) => Math.max(max, cardioMinutes(c)), 0);
  return longest * 60;
}

/** Stima completa, con ripartizione. */
export function estimateSession(
  session: SessionPrescription,
  library: ExerciseLibrary,
  model: DurationModel = DEFAULT_DURATION_MODEL,
  options: { readonly includeCheckIn?: boolean } = {},
): DurationBreakdown {
  const warmup = session.warmup.reduce((sum, item) => sum + item.estimatedSeconds, 0);

  let work = 0;
  let restTotal = 0;
  let transitions = 0;
  let logging = 0;

  const exercises = [...session.exercises].sort((a, b) => a.order - b.order);

  exercises.forEach((prescription, index) => {
    const exercise = library.get(prescription.exerciseId);
    const restSeconds = defaultRestSeconds(prescription.rest);

    work += workSeconds(prescription, exercise);
    restTotal += restCountWithinExercise(prescription, exercise) * restSeconds;
    logging += totalSetEvents(prescription) * model.secondsPerSetLogging;

    // Per gli esercizi per lato con recupero dopo entrambe le gambe si
    // aggiunge il tempo di cambio appoggio fra un lato e l'altro.
    if (prescription.perSide && exercise.restAfterBothSides) {
      transitions += prescription.workingSets * 10;
    }

    const next = exercises[index + 1];
    if (next !== undefined) {
      const nextExercise = library.get(next.exerciseId);
      // Fra due esercizi si recupera E si cambia postazione: il tempo reale e'
      // il maggiore dei due, non la somma (il recupero avviene camminando).
      transitions += Math.max(restSeconds, nextExercise.transitionSeconds);
    }
  });

  const cardio = cardioSecondsFor(session.cardio);
  const cardioSetup = cardio > 0 ? model.cardioSetupSeconds : 0;
  const overhead =
    (options.includeCheckIn === false ? 0 : model.checkInSeconds) +
    model.summarySeconds +
    cardioSetup;

  const total = warmup + work + restTotal + transitions + logging + cardio + overhead;

  return {
    warmupSeconds: warmup,
    workSeconds: work,
    restSeconds: restTotal,
    transitionSeconds: transitions,
    loggingSeconds: logging,
    cardioSeconds: cardio,
    overheadSeconds: overhead,
    totalSeconds: total,
    totalMinutes: Math.round(total / 60),
  };
}

/** Comodo alias quando serve solo il totale in minuti. */
export function estimateSessionMinutes(
  session: SessionPrescription,
  library: ExerciseLibrary,
  model: DurationModel = DEFAULT_DURATION_MODEL,
): number {
  return estimateSession(session, library, model).totalMinutes;
}

/** Esito del controllo di compatibilita' con il tempo disponibile. */
export interface FitVerdict {
  readonly fits: boolean;
  readonly estimatedMinutes: number;
  readonly availableMinutes: number;
  readonly overByMinutes: number;
  /** Spiegazione in italiano, mostrabile all'utente. */
  readonly explanation: string;
}

/**
 * La seduta sta nel tempo disponibile?
 *
 * Quando non ci sta, il messaggio dice esplicitamente che la soluzione e'
 * ridurre il lavoro, NON accorciare i recuperi.
 */
export function fitsWithin(
  session: SessionPrescription,
  library: ExerciseLibrary,
  availableMinutes: number,
  model: DurationModel = DEFAULT_DURATION_MODEL,
): FitVerdict {
  const breakdown = estimateSession(session, library, model);
  const over = breakdown.totalMinutes - availableMinutes;
  if (over <= 0) {
    return {
      fits: true,
      estimatedMinutes: breakdown.totalMinutes,
      availableMinutes,
      overByMinutes: 0,
      explanation: `Stima ${String(breakdown.totalMinutes)} minuti, entro i ${String(availableMinutes)} disponibili.`,
    };
  }
  return {
    fits: false,
    estimatedMinutes: breakdown.totalMinutes,
    availableMinutes,
    overByMinutes: over,
    explanation:
      `Stima ${String(breakdown.totalMinutes)} minuti, ${String(over)} in piu' dei ${String(availableMinutes)} disponibili. ` +
      "Per rientrare si riduce il lavoro (serie o esercizi a priorita' piu' bassa), non la durata dei recuperi.",
  };
}
