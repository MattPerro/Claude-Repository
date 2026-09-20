/**
 * Sedute: avvio con fotografia congelata, registrazione, ripresa, chiusura.
 *
 * Requisiti coperti:
 * - §7 "Ogni sessione conserva una fotografia della prescrizione valida al
 *   suo avvio. Le modifiche future non riscrivono lo storico." La fotografia
 *   viene serializzata alla creazione e non viene mai riaggiornata da una
 *   revisione del piano.
 * - §10 "Una sola sessione attiva per installazione", con il vincolo nel
 *   database (indice UNIQUE parziale su `owner_device_id WHERE status =
 *   'active'`) e non solo in un controllo applicativo.
 * - §10 "ripresa dopo interruzione" e le bozze dei campi in corso.
 * - §10 lo stato finale e' CALCOLATO sulle serie confermate, non "completata
 *   perche' l'utente ha premuto Fine".
 */

import {
  computeFinalStatus,
  EMPTY_CHECK_IN,
  type Instant,
  type LocalDate,
  type PrescriptionSnapshot,
  type Session,
  type SessionCheckIn,
  type SessionSlot,
  type SessionStatus,
  type DiscomfortReport,
  type TechniqueRating,
} from '@trackstrong/core';

import { isUniqueViolation, type SqlValue } from '../driver.js';
import type { Database } from '../database.js';
import { toJson, toJsonOrNull } from '../json.js';
import {
  toPerformedExercise,
  toPerformedSet,
  toSession,
  type PerformedExerciseRow,
  type PerformedSetRow,
  type SessionRow,
} from '../rows.js';
import { rowPayload, upsertOperation, withWrite, type WriteContext } from '../unitOfWork.js';

export interface StartSessionInput {
  readonly plannedDate: LocalDate;
  readonly slot: SessionSlot;
  /** Fotografia da congelare. Prodotta dal piano al momento dell'avvio. */
  readonly snapshot: PrescriptionSnapshot;
  readonly checkIn?: SessionCheckIn;
  readonly startedAt: Instant;
  readonly plannedEventId?: string;
  readonly id?: string;
}

/** Esiste gia' una seduta attiva su questa installazione (§10). */
export class ActiveSessionExistsError extends Error {
  constructor(readonly activeSessionId: string) {
    super(
      `Su questa installazione c'e' gia' una seduta attiva (${activeSessionId}). ` +
        'Riprendila o chiudila prima di iniziarne un\'altra. ' +
        'Nota: questo vincolo vale per il dispositivo, non e\' un blocco globale ' +
        'fra dispositivi, che offline non sarebbe garantibile.',
    );
    this.name = 'ActiveSessionExistsError';
  }
}

export interface DraftFields {
  readonly [field: string]: string | number | boolean | null;
}

export interface SessionDraft {
  readonly id: string;
  readonly sessionId: string;
  readonly performedExerciseId: string | null;
  readonly setOrder: number | null;
  readonly side: string | null;
  readonly fields: DraftFields;
  readonly updatedAt: Instant;
}

export interface AddPerformedExerciseInput {
  readonly sessionId: string;
  readonly order: number;
  readonly exerciseId: string;
  readonly variantId?: string | null;
  readonly substitutedForExerciseId?: string | null;
  readonly equipmentInstanceId?: string | null;
  readonly settingsNote?: string | null;
  readonly note?: string | null;
  readonly id?: string;
}

export interface SessionSummary {
  readonly session: Session;
  /** Serie allenanti confermate. */
  readonly workingCompleted: number;
  /** Serie allenanti previste dalla fotografia congelata. */
  readonly workingPrescribed: number;
  readonly warmupCompleted: number;
  readonly skipped: number;
  readonly voided: number;
  /** Bozze salvate: NON eseguite (§10). */
  readonly drafts: number;
  readonly finalStatus: 'completed' | 'partial';
}

export interface SessionRepository {
  start(input: StartSessionInput): Session;
  byId(sessionId: string): Session | null;
  /** Seduta attiva o in pausa di QUESTA installazione, se esiste. */
  activeForThisDevice(): Session | null;
  /** Riprende una seduta interrotta: torna `active` su questo dispositivo. */
  resume(sessionId: string, at: Instant): Session;
  pause(sessionId: string, at: Instant): Session;
  addExercise(input: AddPerformedExerciseInput): string;
  /**
   * Dichiara la tecnica su un esercizio svolto.
   *
   * Senza questo metodo il campo restava sempre `null`, e poiche' il motore
   * adattivo richiede `technique === 'controlled'` per proporre un incremento,
   * **non avrebbe potuto proporne mai uno**: l'intero motore era inerte.
   * Nessun test lo aveva colto, perche' i test del motore costruiscono le
   * esposizioni direttamente invece di passare dalla persistenza.
   */
  setTechnique(performedExerciseId: string, technique: TechniqueRating | null): void;
  /** Registra o rimuove un fastidio su un esercizio svolto. */
  reportDiscomfort(performedExerciseId: string, discomfort: DiscomfortReport | null): void;
  /** Segna un esercizio come saltato, o annulla il salto. */
  skipExercise(performedExerciseId: string, skipped: boolean): void;
  /** Aggiorna le regolazioni personali annotate (sedile, schienale, presa). */
  setSettingsNote(performedExerciseId: string, note: string | null): void;
  /** Salva la nota della seduta (§10). */
  setNote(sessionId: string, note: string | null): void;
  saveDraft(input: {
    readonly sessionId: string;
    readonly performedExerciseId: string | null;
    readonly setOrder: number | null;
    readonly side: string | null;
    readonly fields: DraftFields;
  }): SessionDraft;
  drafts(sessionId: string): readonly SessionDraft[];
  clearDraft(sessionId: string, performedExerciseId: string | null, setOrder: number | null, side: string | null): void;
  /** Chiude la seduta e CALCOLA lo stato finale sulle serie confermate. */
  finish(sessionId: string, endedAt: Instant, performedDate: LocalDate): SessionSummary;
  summary(sessionId: string): SessionSummary;
  exercises(sessionId: string): readonly ReturnType<typeof toPerformedExercise>[];
  /** Sedute svolte, dalla piu' recente. */
  history(limit?: number): readonly Session[];
  setStatus(sessionId: string, status: SessionStatus): Session;
}

export function createSessionRepository(db: Database): SessionRepository {
  const readRow = (sessionId: string): SessionRow | undefined =>
    db.driver.get<SessionRow>('SELECT * FROM sessions WHERE id = ?', [sessionId]);

  const require_ = (sessionId: string): SessionRow => {
    const row = readRow(sessionId);
    if (row === undefined) throw new Error(`Seduta inesistente: ${sessionId}.`);
    return row;
  };

  const activeRow = (): SessionRow | undefined =>
    db.driver.get<SessionRow>(
      `SELECT * FROM sessions
        WHERE owner_device_id = ? AND status IN ('active','paused') AND deleted_at IS NULL
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, started_at DESC
        LIMIT 1`,
      [db.deviceId],
    );

  const summaryOf = (sessionId: string): SessionSummary => {
    const row = require_(sessionId);
    const session = toSession(row);
    const counts = db.driver.get<{
      working_completed: number;
      warmup_completed: number;
      skipped: number;
      voided: number;
    }>(
      `SELECT
         SUM(CASE WHEN role = 'working' AND status = 'completed' THEN 1 ELSE 0 END) AS working_completed,
         SUM(CASE WHEN role = 'warmup'  AND status = 'completed' THEN 1 ELSE 0 END) AS warmup_completed,
         SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
         SUM(CASE WHEN status = 'voided'  THEN 1 ELSE 0 END) AS voided
       FROM performed_sets WHERE session_id = ?`,
      [sessionId],
    );
    const draftRow = db.driver.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM session_drafts WHERE session_id = ?',
      [sessionId],
    );
    // I conteggi passano dalle serie CONFERMATE lette dal database, non da
    // un contatore tenuto in memoria dall'interfaccia.
    const sets = db.driver
      .all<PerformedSetRow>('SELECT * FROM performed_sets WHERE session_id = ?', [sessionId])
      .map(toPerformedSet);
    const workingPrescribed = session.snapshot.prescription.exercises.reduce(
      (sum, e) => sum + e.workingSets * (e.perSide ? 2 : 1),
      0,
    );
    return {
      session,
      workingCompleted: counts?.working_completed ?? 0,
      workingPrescribed,
      warmupCompleted: counts?.warmup_completed ?? 0,
      skipped: counts?.skipped ?? 0,
      voided: counts?.voided ?? 0,
      drafts: draftRow?.n ?? 0,
      finalStatus: computeFinalStatus(session.snapshot, sets),
    };
  };

  const setStatusIn = (
    ctx: WriteContext,
    sessionId: string,
    changes: Record<string, string | number | null>,
    cause: string,
  ): Session => {
    const current = require_(sessionId);
    const patch = { ...changes, revision: current.revision + 1, updated_at: ctx.now };
    ctx.patch(
      'sessions',
      sessionId,
      patch,
      upsertOperation(current.revision + 1, current.revision, { ...patch, id: sessionId }, cause),
    );
    return toSession(require_(sessionId));
  };


  /**
   * Aggiorna alcuni campi di un esercizio svolto, incrementando la revisione
   * e accodando l'operazione di sincronizzazione nella stessa transazione.
   */
  const patchPerformedExercise = (
    ctx: WriteContext,
    performedExerciseId: string,
    patch: Record<string, SqlValue>,
    cause: string,
  ): void => {
    const current = db.driver.get<{ revision: number; session_id: string }>(
      'SELECT revision, session_id FROM performed_exercises WHERE id = ?',
      [performedExerciseId],
    );
    if (current === undefined) {
      throw new Error(`Esercizio svolto inesistente: ${performedExerciseId}.`);
    }
    const revision = current.revision + 1;
    ctx.patch(
      'performed_exercises',
      performedExerciseId,
      { ...patch, revision, updated_at: ctx.now },
      upsertOperation(
        revision,
        current.revision,
        { id: performedExerciseId, ...patch },
        cause,
      ),
    );
  };
  return {
    start: (input) =>
      withWrite(db, (ctx) => {
        const existing = ctx.get<SessionRow>(
          `SELECT * FROM sessions
            WHERE owner_device_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
          [db.deviceId],
        );
        if (existing !== undefined) {
          throw new ActiveSessionExistsError(existing.id);
        }

        const row = {
          id: input.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          planned_event_id: input.plannedEventId ?? null,
          planned_date: input.plannedDate,
          performed_date: null,
          slot: input.slot,
          status: 'active',
          // Serializzata QUI e mai riaggiornata: e' la fotografia.
          prescription_snapshot: toJson(input.snapshot),
          plan_version: input.snapshot.planVersion,
          week_index: input.snapshot.weekIndex,
          block_id: input.snapshot.blockId,
          check_in_json: toJson(input.checkIn ?? EMPTY_CHECK_IN),
          started_at: input.startedAt,
          ended_at: null,
          paused_ms: 0,
          note: null,
          owner_device_id: db.deviceId,
          revision: 1,
          updated_at: ctx.now,
        };

        try {
          ctx.upsert(
            'sessions',
            row,
            upsertOperation(1, null, rowPayload(row), 'avvio seduta'),
          );
        } catch (error) {
          if (isUniqueViolation(error)) {
            // L'indice parziale ha fatto il suo lavoro: e' la seconda
            // difesa, quella che regge anche una corsa fra due schermate.
            const other = ctx.get<{ id: string }>(
              `SELECT id FROM sessions WHERE owner_device_id = ? AND status = 'active' LIMIT 1`,
              [db.deviceId],
            );
            throw new ActiveSessionExistsError(other?.id ?? 'sconosciuta');
          }
          throw error;
        }
        return toSession(require_(row.id));
      }),

    byId: (sessionId) => {
      const row = readRow(sessionId);
      return row === undefined ? null : toSession(row);
    },

    activeForThisDevice: () => {
      const row = activeRow();
      return row === undefined ? null : toSession(row);
    },

    resume: (sessionId, at) =>
      withWrite(db, (ctx) => {
        const current = require_(sessionId);
        if (current.status === 'active') return toSession(current);
        const other = ctx.get<{ id: string }>(
          `SELECT id FROM sessions
            WHERE owner_device_id = ? AND status = 'active' AND id <> ? AND deleted_at IS NULL
            LIMIT 1`,
          [db.deviceId, sessionId],
        );
        if (other !== undefined) throw new ActiveSessionExistsError(other.id);

        // Il tempo passato in pausa si somma: la durata netta della seduta
        // non conta le interruzioni (§12, sessionNetMinutes).
        const pausedMs =
          current.status === 'paused' && current.ended_at !== null
            ? current.paused_ms + Math.max(0, at - current.ended_at)
            : current.paused_ms;

        return setStatusIn(
          ctx,
          sessionId,
          {
            status: 'active',
            owner_device_id: db.deviceId,
            paused_ms: pausedMs,
            ended_at: null,
          },
          'ripresa seduta',
        );
      }),

    pause: (sessionId, at) =>
      withWrite(db, (ctx) =>
        // `ended_at` sulla seduta in pausa registra il momento della
        // sospensione, cosi' alla ripresa si sa quanto e' durata.
        setStatusIn(ctx, sessionId, { status: 'paused', ended_at: at }, 'pausa seduta'),
      ),

    addExercise: (input) =>
      withWrite(db, (ctx) => {
        const row = {
          id: input.id ?? db.ids.newId(),
          session_id: input.sessionId,
          order_index: input.order,
          exercise_id: input.exerciseId,
          variant_id: input.variantId ?? null,
          substituted_for_exercise_id: input.substitutedForExerciseId ?? null,
          equipment_instance_id: input.equipmentInstanceId ?? null,
          technique: null,
          discomfort_json: null,
          settings_note: input.settingsNote ?? null,
          note: input.note ?? null,
          skipped: 0,
          revision: 1,
          updated_at: ctx.now,
        };
        ctx.upsert(
          'performed_exercises',
          row,
          upsertOperation(1, null, rowPayload(row), 'esercizio in seduta'),
        );
        return row.id;
      }),

    setTechnique: (performedExerciseId, technique) =>
      withWrite(db, (ctx) => {
        patchPerformedExercise(ctx, performedExerciseId, { technique }, 'tecnica dichiarata');
      }),

    reportDiscomfort: (performedExerciseId, discomfort) =>
      withWrite(db, (ctx) => {
        patchPerformedExercise(
          ctx,
          performedExerciseId,
          { discomfort_json: toJsonOrNull(discomfort) },
          'fastidio segnalato',
        );
      }),

    skipExercise: (performedExerciseId, skipped) =>
      withWrite(db, (ctx) => {
        patchPerformedExercise(
          ctx,
          performedExerciseId,
          { skipped: skipped ? 1 : 0 },
          skipped ? 'esercizio saltato' : 'salto annullato',
        );
      }),

    setSettingsNote: (performedExerciseId, note) =>
      withWrite(db, (ctx) => {
        patchPerformedExercise(
          ctx,
          performedExerciseId,
          { settings_note: note },
          'regolazioni annotate',
        );
      }),

    setNote: (sessionId, note) =>
      withWrite(db, (ctx) => {
        const current = db.driver.get<{ revision: number }>(
          'SELECT revision FROM sessions WHERE id = ?',
          [sessionId],
        );
        if (current === undefined) {
          throw new Error(`Seduta inesistente: ${sessionId}.`);
        }
        const revision = current.revision + 1;
        ctx.patch(
          'sessions',
          sessionId,
          { note, revision, updated_at: ctx.now },
          upsertOperation(revision, current.revision, { id: sessionId, note }, 'nota della seduta'),
        );
      }),

    saveDraft: (input) =>
      withWrite(db, (ctx) => {
        // `session_drafts` e' in LOCAL_ONLY_TABLES: una bozza dei campi in
        // corso non e' un fatto da propagare agli altri dispositivi, e
        // accodarla genererebbe traffico a ogni tasto premuto.
        const existing = ctx.get<{ id: string; revision: number }>(
          `SELECT id, revision FROM session_drafts
            WHERE session_id = ? AND performed_exercise_id IS ? AND set_order IS ? AND side IS ?`,
          [input.sessionId, input.performedExerciseId, input.setOrder, input.side],
        );
        const id = existing?.id ?? db.ids.newId();
        const revision = (existing?.revision ?? 0) + 1;
        ctx.run(
          `INSERT INTO session_drafts
             (id, session_id, performed_exercise_id, set_order, side, fields_json, revision, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET fields_json = excluded.fields_json,
             revision = excluded.revision, updated_at = excluded.updated_at`,
          [
            id,
            input.sessionId,
            input.performedExerciseId,
            input.setOrder,
            input.side,
            toJson(input.fields),
            revision,
            ctx.now,
          ],
        );
        return {
          id,
          sessionId: input.sessionId,
          performedExerciseId: input.performedExerciseId,
          setOrder: input.setOrder,
          side: input.side,
          fields: input.fields,
          updatedAt: ctx.now,
        };
      }),

    drafts: (sessionId) =>
      db.driver
        .all<{
          id: string;
          session_id: string;
          performed_exercise_id: string | null;
          set_order: number | null;
          side: string | null;
          fields_json: string;
          updated_at: number;
        }>(
          'SELECT * FROM session_drafts WHERE session_id = ? ORDER BY set_order, side',
          [sessionId],
        )
        .map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          performedExerciseId: row.performed_exercise_id,
          setOrder: row.set_order,
          side: row.side,
          fields: JSON.parse(row.fields_json) as DraftFields,
          updatedAt: row.updated_at,
        })),

    clearDraft: (sessionId, performedExerciseId, setOrder, side) => {
      db.driver.run(
        `DELETE FROM session_drafts
          WHERE session_id = ? AND performed_exercise_id IS ? AND set_order IS ? AND side IS ?`,
        [sessionId, performedExerciseId, setOrder, side],
      );
    },

    finish: (sessionId, endedAt, performedDate) =>
      withWrite(db, (ctx) => {
        const before = summaryOf(sessionId);
        // Lo stato finale e' calcolato: `completed` solo se tutte le serie
        // allenanti previste risultano confermate (§10, core.computeFinalStatus).
        setStatusIn(
          ctx,
          sessionId,
          {
            status: before.finalStatus,
            ended_at: endedAt,
            performed_date: performedDate,
          },
          'chiusura seduta',
        );
        // Le bozze rimaste non diventano serie eseguite: vengono scartate.
        ctx.run('DELETE FROM session_drafts WHERE session_id = ?', [sessionId]);
        return summaryOf(sessionId);
      }),

    summary: summaryOf,

    exercises: (sessionId) =>
      db.driver
        .all<PerformedExerciseRow>(
          'SELECT * FROM performed_exercises WHERE session_id = ? ORDER BY order_index',
          [sessionId],
        )
        .map(toPerformedExercise),

    history: (limit = 50) =>
      db.driver
        .all<SessionRow>(
          `SELECT * FROM sessions
            WHERE deleted_at IS NULL AND performed_date IS NOT NULL
            ORDER BY performed_date DESC, started_at DESC
            LIMIT ?`,
          [limit],
        )
        .map(toSession),

    setStatus: (sessionId, status) =>
      withWrite(db, (ctx) => setStatusIn(ctx, sessionId, { status }, 'stato seduta')),
  };
}
