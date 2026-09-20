/**
 * Formattazioni per l'interfaccia.
 *
 * Tutto quello che si puo' calcolare nel dominio sta in `@trackstrong/core`
 * (`formatKgIt`, `formatRange`, `formatRestIt`, `formatDurationIt`, ...): qui ci
 * sono solo le composizioni che servono alle schermate e che non hanno senso
 * fuori dall'interfaccia.
 */

import {
  formatDurationIt,
  formatKgIt,
  formatRange,
  LOAD_CONVENTION_LABEL,
  requiresNoLoad,
  type LoadConvention,
  type SetMetric,
  type TargetRange,
} from '@trackstrong/core';

/** "6-8 ripetizioni" oppure "20-30 secondi", con "per lato" se pertinente. */
export function formatTargetIt(
  target: TargetRange,
  metric: SetMetric,
  perSide: boolean,
): string {
  const unit = metric === 'reps' ? 'ripetizioni' : 'secondi';
  const side = perSide ? ' per lato' : '';
  return `${formatRange(target)} ${unit}${side}`;
}

/**
 * Carico con la sua convenzione, sempre insieme.
 * Un carico senza convenzione non ha significato (specifica §5.3).
 */
export function formatLoadIt(kg: number | null, convention: LoadConvention): string {
  if (requiresNoLoad(convention)) return LOAD_CONVENTION_LABEL[convention];
  if (kg === null) return `— (${LOAD_CONVENTION_LABEL[convention]})`;
  return `${formatKgIt(kg)} (${LOAD_CONVENTION_LABEL[convention]})`;
}

/** Conto alla rovescia grande: "1:30". */
export function formatCountdown(seconds: number): string {
  return formatDurationIt(Math.max(0, seconds));
}

/** "su 6" per i conteggi parziali. */
export function formatOutOf(done: number, total: number): string {
  return `${String(done)} su ${String(total)}`;
}
