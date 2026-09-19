/**
 * Modello della seduta in corso: dalla fotografia congelata alle singole
 * "caselle" da registrare.
 *
 * Il punto delicato e' l'esercizio **per lato** (§11): entrambi i lati vanno
 * eseguiti e registrati, ma **le serie non raddoppiano**. Qui questo si traduce
 * in due caselle che condividono lo stesso `order` e si distinguono per `side`,
 * che e' anche esattamente la chiave di idempotenza usata dal database
 * (`setIdempotencyKey`: sessione, esercizio svolto, posizione, lato).
 *
 * Il conteggio delle serie allenanti resta quindi `workingSets`, non
 * `workingSets * 2`.
 */

import {
  comparabilityKey,
  defaultRestSeconds,
  requiresNoLoad,
  type BodySide,
  type ExercisePrescription,
  type Exercise,
  type ExerciseLibrary,
  type LoadConvention,
  type SessionPrescription,
  type SetMetric,
  type SetRole,
  type TargetRange,
} from '@trackstrong/core';
import type { StoredPerformedSet } from '@trackstrong/db';

/** Una casella da registrare: una serie, e per gli esercizi per lato un lato. */
export interface SetSlot {
  /** Chiave stabile nell'interfaccia: posizione esercizio, serie, lato. */
  readonly key: string;
  readonly exerciseOrder: number;
  readonly exerciseId: string;
  readonly variantId: string | null;
  /** Posizione della serie fra quelle dell'esercizio, 1-based. */
  readonly order: number;
  readonly role: SetRole;
  readonly side: BodySide;
  readonly metric: SetMetric;
  readonly target: TargetRange;
  readonly loadConvention: LoadConvention;
  readonly perSide: boolean;
  readonly restSeconds: number;
  /** `true` se per questo esercizio il recupero e' dopo entrambi i lati. */
  readonly restAfterBothSides: boolean;
}

/** Un esercizio della seduta, con le sue caselle. */
export interface ExercisePlanItem {
  readonly order: number;
  readonly exerciseId: string;
  readonly exercise: Exercise;
  readonly prescription: ExercisePrescription;
  readonly slots: readonly SetSlot[];
  /** `true` se l'esercizio ha sostituito quello prescritto, solo per oggi. */
  readonly substitutedForExerciseId: string | null;
}

function slotsFor(
  prescription: ExercisePrescription,
  exercise: Exercise,
  exerciseId: string,
): readonly SetSlot[] {
  const rest = defaultRestSeconds(prescription.rest);
  const sides: readonly BodySide[] = prescription.perSide ? ['left', 'right'] : ['both'];
  const slots: SetSlot[] = [];
  for (let order = 1; order <= prescription.workingSets; order += 1) {
    for (const side of sides) {
      slots.push({
        key: `${String(prescription.order)}:${String(order)}:${side}`,
        exerciseOrder: prescription.order,
        exerciseId,
        variantId: prescription.variantId,
        order,
        role: 'working',
        side,
        metric: prescription.metric,
        target: prescription.target,
        loadConvention: prescription.loadConvention,
        perSide: prescription.perSide,
        restSeconds: rest,
        restAfterBothSides: exercise.restAfterBothSides,
      });
    }
  }
  return slots;
}

/**
 * Esercizi della seduta con le loro caselle.
 *
 * `substitutions` sostituisce un esercizio prescritto con un altro **solo per
 * questa seduta**: la convenzione di carico e la metrica seguono l'esercizio
 * che si esegue davvero, non quello prescritto, altrimenti si registrerebbe un
 * carico con la convenzione di un altro attrezzo.
 */
export function buildSessionPlan(
  prescription: SessionPrescription,
  library: ExerciseLibrary,
  substitutions: ReadonlyMap<string, string>,
): readonly ExercisePlanItem[] {
  const items: ExercisePlanItem[] = [];
  for (const ex of prescription.exercises) {
    const replacement = substitutions.get(ex.exerciseId);
    const effectiveId = replacement ?? ex.exerciseId;
    const exercise = library.find(effectiveId);
    if (exercise === undefined) continue;
    const effective: ExercisePrescription =
      replacement === undefined
        ? ex
        : {
            ...ex,
            exerciseId: effectiveId,
            variantId: null,
            metric: exercise.metric,
            perSide: exercise.perSide,
            loadConvention: exercise.loadConvention,
          };
    items.push({
      order: ex.order,
      exerciseId: effectiveId,
      exercise,
      prescription: effective,
      slots: slotsFor(effective, exercise, effectiveId),
      substitutedForExerciseId: replacement === undefined ? null : ex.exerciseId,
    });
  }
  return items;
}

/** Chiave di comparabilita' di una casella, con l'attrezzo effettivo. */
export function slotComparabilityKey(
  slot: SetSlot,
  equipmentInstanceId: string | null,
): string {
  return comparabilityKey({
    exerciseId: slot.exerciseId,
    variantId: slot.variantId,
    loadConvention: slot.loadConvention,
    equipmentInstanceId,
    metric: slot.metric,
    perSide: slot.perSide,
  });
}

/** Valori con cui precompilare una casella. */
export interface Prefill {
  readonly loadKg: number | null;
  readonly reps: number | null;
  readonly seconds: number | null;
  /** `true` se i valori vengono da una prestazione precedente confrontabile. */
  readonly fromHistory: boolean;
  /** Descrizione della fonte: "ultima volta 40 kg x 8, seduta del ...". */
  readonly sourceLabel: string | null;
}

/**
 * Precompila dall'ultima prestazione comparabile.
 *
 * Se non esiste storico confrontabile **non si inventa niente**: il carico
 * resta vuoto e le ripetizioni partono dal minimo dell'intervallo prescritto,
 * che e' una prescrizione, non una prestazione. In tutti i casi il valore
 * mostrato e' marcato come precompilato (§7: "precompilato" e "eseguito" non
 * sono la stessa cosa).
 */
export function buildPrefill(
  slot: SetSlot,
  previous: StoredPerformedSet | null,
  formatSource: (set: StoredPerformedSet) => string,
): Prefill {
  const noLoad = requiresNoLoad(slot.loadConvention);
  if (previous === null) {
    return {
      loadKg: null,
      reps: slot.metric === 'reps' ? slot.target.min : null,
      seconds: slot.metric === 'seconds' ? slot.target.min : null,
      fromHistory: false,
      sourceLabel: null,
    };
  }
  return {
    loadKg: noLoad ? null : previous.load.kg,
    reps: slot.metric === 'reps' ? (previous.reps ?? slot.target.min) : null,
    seconds: slot.metric === 'seconds' ? (previous.seconds ?? slot.target.min) : null,
    fromHistory: true,
    sourceLabel: formatSource(previous),
  };
}

/** Caselle gia' confermate, indicizzate per `order|side`. */
export function indexConfirmed(
  sets: readonly StoredPerformedSet[],
): ReadonlyMap<string, StoredPerformedSet> {
  const map = new Map<string, StoredPerformedSet>();
  for (const set of sets) {
    if (set.status !== 'completed' && set.status !== 'skipped') continue;
    map.set(`${set.performedExerciseId}|${String(set.order)}|${set.side}`, set);
  }
  return map;
}

/** Serie allenanti previste dalla fotografia: le serie, NON i lati. */
export function prescribedWorkingSets(prescription: SessionPrescription): number {
  return prescription.exercises.reduce((total, ex) => total + ex.workingSets, 0);
}
