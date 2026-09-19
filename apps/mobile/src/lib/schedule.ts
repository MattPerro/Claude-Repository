/**
 * Date **previste** delle sedute e fotografia della prescrizione all'avvio.
 *
 * Due punti della specifica governano questo file:
 *
 *  - §2: lunedi' e giovedi' sono **proposti, non imposti**. Le date qui
 *    calcolate sono quindi una PROPOSTA basata su `profile.preferredWeekdays`;
 *    la data in cui una seduta e' stata davvero svolta resta un dato a parte
 *    (`Session.performedDate`), e le due non vengono mai confuse (§11).
 *  - §7: ogni sessione conserva una fotografia della prescrizione valida al suo
 *    avvio. {@link buildSnapshot} la costruisce dal piano al momento
 *    dell'avvio, e da quel momento il piano non la tocca piu'.
 *
 * ## Limite dichiarato
 *
 * Le date previste sono **calcolate**, non lette dalla tabella
 * `planned_events`: `@trackstrong/db` non espone (ancora) un repository per
 * quella tabella. Finche' non c'e', spostare una singola occorrenza non e'
 * persistibile e l'interfaccia lo dichiara invece di simularlo.
 */

import {
  addDays,
  blockAtWeek,
  compareDates,
  nextWeekdayOnOrAfter,
  programWeekStart,
  sessionAt,
  weekAt,
  type Instant,
  type IsoWeekday,
  type LocalDate,
  type PrescriptionSnapshot,
  type ProgramBlock,
  type ProgramCursor,
  type ProgramPlan,
  type ProgramWeek,
  type SessionPrescription,
  type SessionSlot,
} from '@trackstrong/core';

/** Una seduta prevista dal programma, con la data proposta. */
export interface PlannedSession {
  readonly weekIndex: number;
  readonly slot: SessionSlot;
  /** Data **proposta** dal programma. Non e' un impegno. */
  readonly plannedDate: LocalDate;
  readonly prescription: SessionPrescription;
  readonly block: ProgramBlock | undefined;
  readonly week: ProgramWeek;
}

/**
 * Giorni proposti, con una riserva prudente.
 *
 * Se il profilo non ha giorni preferiti non si inventa nulla: si distribuiscono
 * le sedute a partire dal primo giorno della settimana di programma, che e' il
 * comportamento piu' neutro possibile.
 */
function weekdaysFor(preferred: readonly IsoWeekday[]): readonly IsoWeekday[] {
  return preferred.length === 0 ? [] : preferred;
}

/**
 * Date proposte per le sedute di una settimana di programma.
 *
 * Le sedute vengono messe nei giorni preferiti disponibili, in ordine. Se i
 * giorni preferiti sono meno delle sedute, le rimanenti scalano di due giorni
 * l'una dall'altra dentro la stessa settimana: e' una proposta, e resta
 * modificabile.
 */
export function plannedDatesForWeek(
  plan: ProgramPlan,
  weekIndex: number,
  sessionCount: number,
  preferred: readonly IsoWeekday[],
): readonly LocalDate[] {
  const weekStart = programWeekStart(plan.startDate, weekIndex);
  const allowed = weekdaysFor(preferred);
  const dates: LocalDate[] = [];

  let cursor = weekStart;
  for (let i = 0; i < sessionCount; i += 1) {
    if (allowed.length === 0) {
      dates.push(addDays(weekStart, i * 3));
      continue;
    }
    const found = nextWeekdayOnOrAfter(cursor, allowed);
    const date = found ?? addDays(weekStart, i * 3);
    dates.push(date);
    cursor = addDays(date, 1);
  }
  return dates;
}

/** Sedute previste di una settimana di programma, con le date proposte. */
export function plannedSessionsForWeek(
  plan: ProgramPlan,
  weekIndex: number,
  preferred: readonly IsoWeekday[],
): readonly PlannedSession[] {
  const week = weekAt(plan, weekIndex);
  if (week === undefined) return [];
  const dates = plannedDatesForWeek(plan, weekIndex, week.sessions.length, preferred);
  const block = blockAtWeek(plan, weekIndex);
  return week.sessions.map((prescription, i) => ({
    weekIndex,
    slot: prescription.slot,
    plannedDate: dates[i] ?? programWeekStart(plan.startDate, weekIndex),
    prescription,
    block,
    week,
  }));
}

/**
 * Prossima seduta operativa.
 *
 * Si guarda **il cursore del programma**, non il calendario: una seduta saltata
 * non fa avanzare la fase (§3.11), quindi la "prossima" e' il primo slot non
 * ancora completato della settimana di programma corrente, e solo quando la
 * settimana e' completa si passa alla successiva.
 */
export function nextPlannedSession(
  plan: ProgramPlan,
  cursor: ProgramCursor,
  preferred: readonly IsoWeekday[],
): PlannedSession | null {
  for (let index = cursor.weekIndex; index <= cursor.weekIndex + 1; index += 1) {
    const sessions = plannedSessionsForWeek(plan, index, preferred);
    if (sessions.length === 0) continue;
    const done = index === cursor.weekIndex ? cursor.completedSlots : [];
    const pending = sessions.filter((s) => !done.includes(s.slot));
    const first = pending[0];
    if (first !== undefined) return first;
  }
  return null;
}

/** Sedute previste nell'intervallo di date indicato, per il calendario. */
export function plannedSessionsBetween(
  plan: ProgramPlan,
  from: LocalDate,
  to: LocalDate,
  preferred: readonly IsoWeekday[],
): readonly PlannedSession[] {
  const out: PlannedSession[] = [];
  const weeks = plan.blocks.reduce((n, b) => n + b.weeks.length, 0);
  for (let index = 1; index <= weeks; index += 1) {
    const start = programWeekStart(plan.startDate, index);
    // Le settimane sono in ordine: oltre il limite superiore si puo' smettere.
    if (compareDates(start, to) > 0) break;
    if (compareDates(addDays(start, 6), from) < 0) continue;
    for (const session of plannedSessionsForWeek(plan, index, preferred)) {
      if (
        compareDates(session.plannedDate, from) >= 0 &&
        compareDates(session.plannedDate, to) <= 0
      ) {
        out.push(session);
      }
    }
  }
  return out;
}

/**
 * Fotografia congelata della prescrizione, da passare a `sessions.start()`.
 *
 * `capturedAt` e' l'istante dell'avvio: da quel momento una revisione del piano
 * non riscrive piu' questa seduta (§7).
 */
export function buildSnapshot(
  plan: ProgramPlan,
  weekIndex: number,
  slot: SessionSlot,
  capturedAt: Instant,
): PrescriptionSnapshot | null {
  const prescription = sessionAt(plan, weekIndex, slot);
  if (prescription === undefined) return null;
  const block = blockAtWeek(plan, weekIndex);
  if (block === undefined) return null;
  return {
    planVersion: plan.version,
    weekIndex,
    slot,
    blockId: block.id,
    prescription,
    capturedAt,
  };
}

/**
 * Fotografia con una prescrizione **sostituita** (seduta accorciata, esercizio
 * sostituito solo per oggi).
 *
 * Serve perche' la fotografia dev'essere quella effettivamente seguita: se si
 * accorcia la seduta prima di iniziare, congelare la versione integrale
 * renderebbe la seduta "parziale" per definizione.
 */
export function snapshotWithPrescription(
  snapshot: PrescriptionSnapshot,
  prescription: SessionPrescription,
): PrescriptionSnapshot {
  return { ...snapshot, prescription };
}
