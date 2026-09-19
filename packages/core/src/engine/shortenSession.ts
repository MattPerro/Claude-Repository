/**
 * "Oggi ho meno tempo."
 *
 * La specifica (§5.4) chiede una SELEZIONE RAGIONATA del lavoro, non un taglio
 * indiscriminato dei recuperi. Questo modulo riduce il lavoro in un ordine
 * dichiarato e lascia i recuperi esattamente come sono prescritti: un recupero
 * accorciato cambia la natura dello stimolo, e farlo di nascosto per far
 * quadrare un orologio sarebbe esattamente il comportamento vietato.
 */

import type { CardioPrescription, SessionPrescription } from '../domain/prescription.js';
import { range } from '../domain/prescription.js';
import type { ExerciseLibrary } from '../domain/exercise.js';
import { estimateSession, type DurationModel, DEFAULT_DURATION_MODEL } from '../program/duration.js';

/** Un passo di riduzione effettivamente applicato, da mostrare all'utente. */
export interface ReductionStep {
  readonly kind:
    | 'cardioToMinimum'
    | 'dropExercise'
    | 'reduceSets'
    | 'skipCardio'
    | 'reduceMainSets';
  readonly description: string;
  readonly exerciseId: string | null;
  readonly minutesSaved: number;
}

export interface ShortenResult {
  readonly session: SessionPrescription;
  readonly originalMinutes: number;
  readonly finalMinutes: number;
  readonly availableMinutes: number;
  readonly fits: boolean;
  readonly steps: readonly ReductionStep[];
  readonly keptExerciseIds: readonly string[];
  readonly droppedExerciseIds: readonly string[];
  /** Spiegazione completa in italiano. */
  readonly explanation: string;
  /**
   * Dichiarazione esplicita: i recuperi non sono stati modificati.
   * Il test di sicurezza verifica che sia sempre vero.
   */
  readonly restsUnchanged: true;
}

function cardioToMinimum(cardio: readonly CardioPrescription[]): readonly CardioPrescription[] {
  return cardio.map((c) =>
    c.kind === 'steady' && c.minutes.max > c.minutes.min
      ? { ...c, minutes: range(c.minutes.min, c.minutes.min) }
      : c,
  );
}

function minutesOf(
  session: SessionPrescription,
  library: ExerciseLibrary,
  model: DurationModel,
): number {
  return estimateSession(session, library, model).totalMinutes;
}

/**
 * Riduce la seduta al tempo disponibile.
 *
 * Ordine di riduzione, dal meno al piu' costoso in termini di allenamento:
 *  1. cardio al minimo del suo intervallo;
 *  2. rimozione degli esercizi a priorita' piu' bassa (numero `timePriority`
 *     piu' alto), uno per volta;
 *  3. riduzione delle serie degli esercizi non prioritari a 2;
 *  4. rimozione completa del cardio;
 *  5. riduzione delle serie degli esercizi prioritari a 2, come ultima cosa.
 *
 * Gli esercizi con `timePriority === 1` non vengono mai rimossi: sono il
 * motivo per cui si e' andati in palestra.
 */
export function shortenSession(
  original: SessionPrescription,
  library: ExerciseLibrary,
  availableMinutes: number,
  model: DurationModel = DEFAULT_DURATION_MODEL,
): ShortenResult {
  const originalMinutes = minutesOf(original, library, model);
  const steps: ReductionStep[] = [];
  let current = original;

  const record = (
    kind: ReductionStep['kind'],
    description: string,
    exerciseId: string | null,
    before: number,
  ): void => {
    const after = minutesOf(current, library, model);
    steps.push({ kind, description, exerciseId, minutesSaved: Math.max(0, before - after) });
  };

  const fitsNow = (): boolean => minutesOf(current, library, model) <= availableMinutes;

  // 1. Cardio al minimo dell'intervallo.
  if (!fitsNow()) {
    const before = minutesOf(current, library, model);
    const reduced = cardioToMinimum(current.cardio);
    if (JSON.stringify(reduced) !== JSON.stringify(current.cardio)) {
      current = { ...current, cardio: reduced };
      record('cardioToMinimum', 'Cyclette al minimo dell\'intervallo previsto.', null, before);
    }
  }

  // 2. Rimozione degli esercizi a priorita' piu' bassa.
  while (!fitsNow()) {
    const removable = [...current.exercises]
      .filter((e) => e.timePriority > 1)
      .sort((a, b) => b.timePriority - a.timePriority || b.order - a.order);
    const victim = removable[0];
    if (victim === undefined) break;
    const before = minutesOf(current, library, model);
    current = { ...current, exercises: current.exercises.filter((e) => e !== victim) };
    record(
      'dropExercise',
      `Rimosso "${library.get(victim.exerciseId).shortName}" da questa seduta: e' fra gli esercizi a priorita' piu' bassa.`,
      victim.exerciseId,
      before,
    );
  }

  // 3. Riduzione delle serie degli esercizi non prioritari a 2.
  if (!fitsNow()) {
    const before = minutesOf(current, library, model);
    const reduced = current.exercises.map((e) =>
      e.timePriority > 1 && e.workingSets > 2 ? { ...e, workingSets: 2 } : e,
    );
    if (reduced.some((e, i) => e !== current.exercises[i])) {
      current = { ...current, exercises: reduced };
      record('reduceSets', 'Serie ridotte a 2 sugli esercizi non prioritari.', null, before);
    }
  }

  // 4. Cardio rimosso del tutto.
  if (!fitsNow() && current.cardio.length > 0) {
    const before = minutesOf(current, library, model);
    current = { ...current, cardio: [] };
    record(
      'skipCardio',
      'Cyclette finale rimossa da questa seduta. Se ti resta tempo dopo, puoi comunque farla e registrarla.',
      null,
      before,
    );
  }

  // 5. Ultima risorsa: serie degli esercizi prioritari a 2.
  if (!fitsNow()) {
    const before = minutesOf(current, library, model);
    const reduced = current.exercises.map((e) =>
      e.workingSets > 2 ? { ...e, workingSets: 2 } : e,
    );
    if (reduced.some((e, i) => e !== current.exercises[i])) {
      current = { ...current, exercises: reduced };
      record(
        'reduceMainSets',
        'Serie ridotte a 2 anche sugli esercizi principali: e\' l\'ultima riduzione applicata.',
        null,
        before,
      );
    }
  }

  const finalMinutes = minutesOf(current, library, model);
  const keptExerciseIds = current.exercises.map((e) => e.exerciseId);
  const droppedExerciseIds = original.exercises
    .map((e) => e.exerciseId)
    .filter((id) => !keptExerciseIds.includes(id));

  const fits = finalMinutes <= availableMinutes;
  const explanation = fits
    ? `Seduta riorganizzata per ${String(availableMinutes)} minuti: stima ${String(finalMinutes)} minuti invece di ${String(originalMinutes)}. ` +
      'I recuperi restano quelli prescritti: si e\' ridotto il lavoro, non il riposo.'
    : `Anche dopo tutte le riduzioni previste la stima resta di ${String(finalMinutes)} minuti, sopra i ${String(availableMinutes)} disponibili. ` +
      'Non accorcio i recuperi per far quadrare il conto: meglio svolgere una parte della seduta e registrarla come parziale.';

  return {
    session: current,
    originalMinutes,
    finalMinutes,
    availableMinutes,
    fits,
    steps,
    keptExerciseIds,
    droppedExerciseIds,
    explanation,
    restsUnchanged: true,
  };
}

/**
 * Verifica di sicurezza usata dai test: i recuperi della seduta ridotta sono
 * identici a quelli prescritti per gli esercizi conservati.
 */
export function restsAreUnchanged(
  original: SessionPrescription,
  shortened: SessionPrescription,
): boolean {
  return shortened.exercises.every((ex) => {
    const source = original.exercises.find((o) => o.exerciseId === ex.exerciseId);
    if (source === undefined) return false;
    return (
      source.rest.minSeconds === ex.rest.minSeconds && source.rest.maxSeconds === ex.rest.maxSeconds
    );
  });
}
