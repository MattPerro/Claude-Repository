/**
 * Revisioni del programma fatte dall'interfaccia.
 *
 * Una revisione **non riscrive** il piano esistente: produce un piano nuovo con
 * `version` successiva, `derivedFromVersion` e `revisionReason`, e il piano
 * precedente resta consultabile (§7, §8). Le sedute gia' svolte non sono
 * toccate perche' conservano la propria fotografia congelata.
 *
 * Qui c'e' solo la trasformazione pura. La scrittura passa da
 * `programRepository.savePlan`, che rifiuta di sovrascrivere una versione
 * esistente.
 */

import type {
  ExercisePrescription,
  ExerciseLibrary,
  ProgramBlock,
  ProgramPlan,
  ProgramWeek,
  SessionPrescription,
} from '@trackstrong/core';

/**
 * Sostituisce un esercizio con un altro **dalla settimana indicata in avanti**.
 *
 * Le settimane precedenti restano come erano: una sostituzione decisa oggi non
 * puo' cambiare quello che il programma chiedeva un mese fa.
 *
 * La convenzione di carico, la metrica e il "per lato" seguono l'esercizio
 * nuovo: sono proprieta' dell'attrezzo, non della casella del programma.
 * Lo storico dei due esercizi resta **distinto** perche' la chiave di
 * comparabilita' contiene l'identificativo dell'esercizio (§3.4).
 */
export function substituteInPlan(
  plan: ProgramPlan,
  library: ExerciseLibrary,
  options: {
    readonly fromWeekIndex: number;
    readonly exerciseId: string;
    readonly replacementExerciseId: string;
    readonly newVersion: number;
    readonly reason: string;
  },
): ProgramPlan {
  const replacement = library.get(options.replacementExerciseId);

  const mapPrescription = (ex: ExercisePrescription): ExercisePrescription => {
    if (ex.exerciseId !== options.exerciseId) return ex;
    return {
      ...ex,
      exerciseId: replacement.id,
      variantId: null,
      metric: replacement.metric,
      perSide: replacement.perSide,
      loadConvention: replacement.loadConvention,
      alternativeExerciseIds: ex.alternativeExerciseIds.filter(
        (id) => id !== replacement.id,
      ),
    };
  };

  const mapSession = (session: SessionPrescription): SessionPrescription => ({
    ...session,
    exercises: session.exercises.map(mapPrescription),
  });

  const mapWeek = (week: ProgramWeek): ProgramWeek =>
    week.index < options.fromWeekIndex
      ? week
      : { ...week, sessions: week.sessions.map(mapSession) };

  const mapBlock = (block: ProgramBlock): ProgramBlock => ({
    ...block,
    weeks: block.weeks.map(mapWeek),
  });

  return {
    ...plan,
    version: options.newVersion,
    blocks: plan.blocks.map(mapBlock),
    revisionReason: options.reason,
    derivedFromVersion: plan.version,
  };
}
