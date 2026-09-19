/**
 * Timer persistiti.
 *
 * §11 e il mandato dell'ingegnere mobile: `setInterval` serve solo a
 * ridisegnare, la verita' e' una SCADENZA persistita. Questo repository
 * conserva la scadenza assoluta, la base monotona e lo stato di pausa, cosi'
 * che al rientro nell'app il tempo risulti coerente e un recupero scaduto
 * risulti terminato.
 *
 * Quello che questo repository NON fa, deliberatamente: completare una serie.
 * La scadenza di un recupero non conferma niente (§11).
 *
 * I timer sono in `LOCAL_ONLY_TABLES`: non generano operazioni di
 * sincronizzazione. Lo vieta la specifica (§8, "creare un file remoto per
 * ogni aggiornamento del timer") ed e' anche corretto nel merito: un recupero
 * in corso e' un fatto di questo dispositivo, adesso.
 */

import type { Instant, Monotonic } from '@trackstrong/core';

import type { Database } from '../database.js';
import { withWrite } from '../unitOfWork.js';

export type TimerKind = 'rest' | 'exercise' | 'cardioInterval' | 'other';
export type TimerStatus = 'running' | 'paused' | 'expired' | 'cancelled' | 'acknowledged';

export interface PersistedTimer {
  readonly id: string;
  readonly sessionId: string | null;
  readonly performedSetId: string | null;
  readonly kind: TimerKind;
  readonly status: TimerStatus;
  readonly durationSeconds: number;
  readonly startedAt: Instant;
  /** Scadenza assoluta: la fonte di verita'. */
  readonly expiresAt: Instant;
  readonly pausedAt: Instant | null;
  readonly remainingMsAtPause: number | null;
  readonly monotonicBase: Monotonic | null;
  readonly note: string | null;
}

interface TimerRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string | null;
  readonly performed_set_id: string | null;
  readonly kind: string;
  readonly status: string;
  readonly duration_seconds: number;
  readonly started_at: number;
  readonly expires_at: number;
  readonly paused_at: number | null;
  readonly remaining_ms_at_pause: number | null;
  readonly monotonic_base: number | null;
  readonly note: string | null;
  readonly revision: number;
  readonly updated_at: number;
}

export interface StartTimerInput {
  readonly kind: TimerKind;
  readonly durationSeconds: number;
  readonly startedAt: Instant;
  readonly monotonicBase?: Monotonic;
  readonly sessionId?: string | null;
  readonly performedSetId?: string | null;
  readonly note?: string | null;
  readonly id?: string;
}

export interface TimerRepository {
  start(input: StartTimerInput): PersistedTimer;
  byId(id: string): PersistedTimer | null;
  /** Timer non conclusi, da ripristinare al rientro nell'app. */
  pending(): readonly PersistedTimer[];
  pause(id: string, at: Instant): PersistedTimer;
  resume(id: string, at: Instant): PersistedTimer;
  cancel(id: string): PersistedTimer;
  /**
   * L'utente ha visto la fine del recupero. Stato separato da `expired`:
   * "scaduto" e "visto" non sono la stessa cosa e la notifica non va
   * ripetuta all'infinito.
   */
  acknowledge(id: string): PersistedTimer;
  /**
   * Millisecondi rimanenti a `now`. Negativi -> gia' scaduto.
   * Calcolati sulla scadenza persistita, non su un contatore in memoria.
   */
  remainingMs(timer: PersistedTimer, now: Instant): number;
  /**
   * Marca come `expired` i timer la cui scadenza e' passata.
   * Va chiamato al rientro in primo piano. Non completa nessuna serie.
   */
  reconcile(now: Instant): readonly PersistedTimer[];
}

export function createTimerRepository(db: Database): TimerRepository {
  const map = (row: TimerRow): PersistedTimer => ({
    id: row.id,
    sessionId: row.session_id,
    performedSetId: row.performed_set_id,
    kind: row.kind as TimerKind,
    status: row.status as TimerStatus,
    durationSeconds: row.duration_seconds,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    pausedAt: row.paused_at,
    remainingMsAtPause: row.remaining_ms_at_pause,
    monotonicBase: row.monotonic_base,
    note: row.note,
  });

  const readRow = (id: string): TimerRow | undefined =>
    db.driver.get<TimerRow>('SELECT * FROM timers WHERE id = ?', [id]);

  const require_ = (id: string): TimerRow => {
    const row = readRow(id);
    if (row === undefined) throw new Error(`Timer inesistente: ${id}.`);
    return row;
  };

  const patch = (id: string, changes: Record<string, string | number | null>): PersistedTimer =>
    withWrite(db, (ctx) => {
      const current = require_(id);
      const columns = Object.keys(changes);
      ctx.run(
        `UPDATE timers SET ${columns.map((c) => `${c} = ?`).join(', ')}, revision = ?, updated_at = ? WHERE id = ?`,
        [...columns.map((c) => changes[c] ?? null), current.revision + 1, ctx.now, id],
      );
      return map(require_(id));
    });

  const remainingMs = (timer: PersistedTimer, now: Instant): number =>
    timer.status === 'paused'
      ? (timer.remainingMsAtPause ?? 0)
      : timer.expiresAt - now;

  return {
    start: (input) =>
      withWrite(db, (ctx) => {
        if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
          throw new Error(`Durata del timer non valida: ${String(input.durationSeconds)} s.`);
        }
        const id = input.id ?? db.ids.newId();
        ctx.run(
          `INSERT INTO timers (
             id, workspace_id, session_id, performed_set_id, kind, status,
             duration_seconds, started_at, expires_at, paused_at,
             remaining_ms_at_pause, monotonic_base, note, revision, updated_at
           ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, NULL, NULL, ?, ?, 1, ?)`,
          [
            id,
            db.workspaceId,
            input.sessionId ?? null,
            input.performedSetId ?? null,
            input.kind,
            input.durationSeconds,
            input.startedAt,
            input.startedAt + input.durationSeconds * 1000,
            input.monotonicBase ?? null,
            input.note ?? null,
            ctx.now,
          ],
        );
        return map(require_(id));
      }),

    byId: (id) => {
      const row = readRow(id);
      return row === undefined ? null : map(row);
    },

    pending: () =>
      db.driver
        .all<TimerRow>(
          `SELECT * FROM timers WHERE workspace_id = ? AND status IN ('running','paused','expired')
            ORDER BY expires_at ASC`,
          [db.workspaceId],
        )
        .map(map),

    pause: (id, at) => {
      const current = map(require_(id));
      if (current.status !== 'running') return current;
      return patch(id, {
        status: 'paused',
        paused_at: at,
        remaining_ms_at_pause: Math.max(0, current.expiresAt - at),
      });
    },

    resume: (id, at) => {
      const current = map(require_(id));
      if (current.status !== 'paused') return current;
      const remaining = current.remainingMsAtPause ?? 0;
      // La scadenza viene RICALCOLATA dal momento della ripresa: e' l'unico
      // modo per cui il tempo risulti coerente dopo un'app messa in
      // background per venti minuti.
      return patch(id, {
        status: 'running',
        paused_at: null,
        remaining_ms_at_pause: null,
        expires_at: at + remaining,
      });
    },

    cancel: (id) => patch(id, { status: 'cancelled' }),

    acknowledge: (id) => patch(id, { status: 'acknowledged' }),

    remainingMs,

    reconcile: (now) =>
      withWrite(db, (ctx) => {
        // Solo un cambio di stato del timer. Nessuna serie viene confermata:
        // "nessuna serie deve essere completata automaticamente" (§11).
        ctx.run(
          `UPDATE timers SET status = 'expired', updated_at = ?
            WHERE workspace_id = ? AND status = 'running' AND expires_at <= ?`,
          [ctx.now, db.workspaceId, now],
        );
        return ctx
          .all<TimerRow>(
            `SELECT * FROM timers WHERE workspace_id = ? AND status = 'expired'
              ORDER BY expires_at ASC`,
            [db.workspaceId],
          )
          .map(map);
      }),
  };
}
