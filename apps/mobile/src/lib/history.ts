/**
 * Lettura dello storico, nella forma che il motore adattivo e le schermate dei
 * progressi si aspettano.
 *
 * Tutto quello che c'e' qui e' lettura dal database locale: nessuna rete, e
 * nessun dato inventato. Le sedute senza `performedDate` non entrano nello
 * storico perche' non sono state svolte (§5.2: "i dati mancanti non sono
 * risultati positivi").
 */

import {
  extractExposures,
  groupByComparability,
  type Exposure,
  type SessionHistoryEntry,
} from '@trackstrong/core';
import type { Repositories } from '@trackstrong/db';

/** Storico completo delle sedute svolte, dalla piu' recente. */
export function readHistory(repos: Repositories, limit = 60): readonly SessionHistoryEntry[] {
  return repos.sessions.history(limit).map((session) => ({
    session,
    exercises: repos.sessions.exercises(session.id),
    sets: repos.sets.bySession(session.id),
  }));
}

/** Esposizioni raggruppate per chiave di comparabilita'. */
export function readExposureGroups(
  history: readonly SessionHistoryEntry[],
): ReadonlyMap<string, readonly Exposure[]> {
  return groupByComparability(extractExposures(history));
}

export interface TrainingTotals
{
  /** Sedute chiuse con tutte le serie allenanti previste confermate. */
  readonly completed: number;
  /** Sedute chiuse in anticipo: contate a parte, non con le completate (§13.1). */
  readonly partial: number;
  readonly skipped: number;
  /** Serie allenanti confermate. Le serie di riscaldamento non contano (§3.1). */
  readonly workingSets: number;
  /** Serie con RIR dichiarato: il RIR e' facoltativo (§3.10). */
  readonly setsWithRir: number;
  /** Minuti netti sommati, pause escluse, delle sole sedute con durata nota. */
  readonly netMinutes: number;
  readonly sessionsWithDuration: number;
}

/**
 * Conteggi di allenamento.
 *
 * Nessuna somma fra grandezze diverse: secondi, ripetizioni e carichi non
 * vengono mescolati e non esiste nessuna "forza totale" (§13.1).
 */
export function computeTotals(history: readonly SessionHistoryEntry[]): TrainingTotals {
  let completed = 0;
  let partial = 0;
  let skipped = 0;
  let workingSets = 0;
  let setsWithRir = 0;
  let netMinutes = 0;
  let sessionsWithDuration = 0;

  for (const entry of history) {
    if (entry.session.status === 'completed') completed += 1;
    else if (entry.session.status === 'partial') partial += 1;
    else if (entry.session.status === 'skipped') skipped += 1;

    for (const set of entry.sets) {
      if (set.role !== 'working' || set.status !== 'completed') continue;
      workingSets += 1;
      if (set.rir !== null) setsWithRir += 1;
    }

    const started = entry.session.startedAt;
    const ended = entry.session.endedAt;
    if (started !== null && ended !== null && ended > started) {
      netMinutes += Math.round((ended - started - entry.session.pausedMs) / 60_000);
      sessionsWithDuration += 1;
    }
  }

  return {
    completed,
    partial,
    skipped,
    workingSets,
    setsWithRir,
    netMinutes,
    sessionsWithDuration,
  };
}

/** Riga di una tabella di progresso su un esercizio confrontabile. */
export interface ComparableRow {
  readonly comparabilityKey: string;
  readonly exerciseId: string;
  readonly metric: 'reps' | 'seconds';
  readonly points: readonly {
    readonly date: string;
    readonly loadKg: number | null;
    readonly bestValue: number | null;
    readonly setCount: number;
    readonly mixedLoads: boolean;
  }[];
}

/**
 * Serie di progresso per ciascun gruppo confrontabile.
 *
 * I gruppi restano separati: macchine diverse, varianti diverse e convenzioni
 * diverse non finiscono nella stessa curva (§5.3).
 */
export function buildComparableRows(
  groups: ReadonlyMap<string, readonly Exposure[]>,
): readonly ComparableRow[] {
  const rows: ComparableRow[] = [];
  for (const [key, exposures] of groups) {
    const first = exposures[0];
    if (first === undefined) continue;
    const ordered = [...exposures].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    rows.push({
      comparabilityKey: key,
      exerciseId: first.exerciseId,
      metric: first.metric,
      points: ordered.map((exposure) => ({
        date: exposure.date,
        loadKg: exposure.loadKg,
        bestValue: bestValueOf(exposure),
        setCount: exposure.completedSets.length,
        mixedLoads: exposure.mixedLoads,
      })),
    });
  }
  return rows.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId));
}

function bestValueOf(exposure: Exposure): number | null {
  let best: number | null = null;
  for (const set of exposure.completedSets) {
    const value = exposure.metric === 'reps' ? set.reps : set.seconds;
    if (value === null) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}
