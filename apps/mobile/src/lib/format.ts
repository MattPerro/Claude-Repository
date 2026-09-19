/**
 * Formattazioni per l'interfaccia.
 *
 * Tutto quello che si puo' calcolare nel dominio sta in `@trackstrong/core`
 * (`formatKgIt`, `formatRange`, `formatRestIt`, `formatDurationIt`, ...): qui ci
 * sono solo le composizioni che servono alle schermate e che non hanno senso
 * fuori dall'interfaccia.
 */

import {
  formatDecimalIt,
  formatDurationIt,
  formatKgIt,
  formatRange,
  instantToLocalTime,
  LOAD_CONVENTION_LABEL,
  requiresNoLoad,
  type Instant,
  type LoadConvention,
  type SetMetric,
  type TargetRange,
  type TimeZone,
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

/** Valore grande da mostrare in seduta: "8" oppure "25". */
export function formatSetValue(value: number | null): string {
  return value === null ? '—' : formatDecimalIt(value);
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

/** Ora locale "18:42" di un istante, nel fuso scelto dall'utente. */
export function formatTimeIt(instant: Instant, timeZone: TimeZone): string {
  return instantToLocalTime(instant, timeZone);
}

/** "alle 18:42", da mettere accanto a "Sincronizzato con Drive". */
export function formatAtTimeIt(instant: Instant, timeZone: TimeZone): string {
  return `alle ${instantToLocalTime(instant, timeZone)}`;
}

/** Conto alla rovescia grande: "1:30". */
export function formatCountdown(seconds: number): string {
  return formatDurationIt(Math.max(0, seconds));
}

/** "3 serie" / "1 serie", senza numeri al plurale sbagliati. */
export function pluralIt(count: number, singular: string, plural: string): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

/** "su 6" per i conteggi parziali. */
export function formatOutOf(done: number, total: number): string {
  return `${String(done)} su ${String(total)}`;
}
