/**
 * Programma: piani versionati, blocchi, settimane, cursore.
 *
 * Requisiti coperti:
 * - §8 il piano e' un dato VERSIONATO. Una revisione crea una NUOVA riga con
 *   `version` successiva, `derived_from_version` e `revision_reason`; il
 *   piano precedente resta consultabile e non viene riscritto.
 * - §7 il cursore distingue la settimana di PROGRAMMA da quella di
 *   calendario, e avanza solo quando le sedute previste sono state
 *   completate: una seduta saltata non fa avanzare la fase.
 */

import {
  allWeeks,
  blockAtWeek,
  type LocalDate,
  type ProgramCursor,
  type ProgramPlan,
  type SessionSlot,
} from '@trackstrong/core';

import { sqlBool } from '../driver.js';
import type { Database } from '../database.js';
import { fromJson, toJson } from '../json.js';
import { toProgramCursor, type ProgramCursorRow } from '../rows.js';
import { rowPayload, upsertOperation, withWrite, type WriteContext } from '../unitOfWork.js';

interface ProgramPlanRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly version: number;
  readonly format_version: number;
  readonly derived_from_version: number | null;
  readonly revision_reason: string | null;
  readonly start_date: string;
  readonly horizon_years: number;
  readonly last_date: string;
  readonly plan_json: string;
  readonly created_at: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface StoredPlan {
  readonly id: string;
  readonly version: number;
  readonly formatVersion: number;
  readonly derivedFromVersion: number | null;
  readonly revisionReason: string | null;
  readonly plan: ProgramPlan;
  readonly createdAt: number;
}

export interface ProgramRepository {
  /**
   * Salva un piano come nuova versione.
   * Non sovrascrive: se la versione esiste gia' con un contenuto diverso e'
   * un errore, perche' riscrivere una versione significa riscrivere lo
   * storico delle revisioni.
   */
  savePlan(
    plan: ProgramPlan,
    options?: { readonly revisionReason?: string; readonly derivedFromVersion?: number },
  ): StoredPlan;
  /** Piano con la versione piu' alta. */
  currentPlan(): StoredPlan | null;
  planByVersion(version: number): StoredPlan | null;
  /** Elenco delle versioni con il motivo della revisione (§8, storia). */
  revisionHistory(): readonly {
    readonly version: number;
    readonly derivedFromVersion: number | null;
    readonly revisionReason: string | null;
    readonly createdAt: number;
  }[];
  cursor(): ProgramCursor | null;
  initCursor(planVersion: number, enteredOn: LocalDate): ProgramCursor;
  /** Registra uno slot completato nella settimana corrente. */
  markSlotCompleted(slot: SessionSlot): ProgramCursor;
  /** Avanza alla settimana successiva. Azzera gli slot completati. */
  advanceWeek(enteredOn: LocalDate): ProgramCursor;
  /**
   * Ripete la settimana corrente: `repetitionCount + 1`, slot azzerati.
   * E' la forma prevista dalla specifica quando i criteri di avanzamento non
   * sono soddisfatti: ripetere, non saltare (§9, proposta `repeatWeek`).
   */
  repeatWeek(enteredOn: LocalDate): ProgramCursor;
}

export class PlanVersionConflictError extends Error {
  constructor(readonly version: number) {
    super(
      `Esiste gia' un piano con versione ${String(version)} e contenuto diverso. ` +
        'Una revisione deve creare una versione nuova: riscrivere una versione ' +
        'esistente riscriverebbe lo storico delle revisioni (§8).',
    );
    this.name = 'PlanVersionConflictError';
  }
}

export function createProgramRepository(db: Database): ProgramRepository {
  const mapPlan = (row: ProgramPlanRow): StoredPlan => ({
    id: row.id,
    version: row.version,
    formatVersion: row.format_version,
    derivedFromVersion: row.derived_from_version,
    revisionReason: row.revision_reason,
    plan: fromJson<ProgramPlan>(row.plan_json, 'program_plans.plan_json'),
    createdAt: row.created_at,
  });

  const cursorRow = (): ProgramCursorRow | undefined =>
    db.driver.get<ProgramCursorRow>('SELECT * FROM program_cursor WHERE workspace_id = ?', [
      db.workspaceId,
    ]);

  const writeCursor = (
    ctx: WriteContext,
    next: {
      readonly planVersion: number;
      readonly weekIndex: number;
      readonly repetitionCount: number;
      readonly completedSlots: readonly SessionSlot[];
      readonly enteredOn: LocalDate;
    },
    cause: string,
  ): ProgramCursor => {
    const existing = cursorRow();
    const row = {
      id: existing?.id ?? db.ids.newId(),
      workspace_id: db.workspaceId,
      plan_version: next.planVersion,
      week_index: next.weekIndex,
      repetition_count: next.repetitionCount,
      completed_slots_json: toJson(next.completedSlots),
      entered_on: next.enteredOn,
      revision: (existing?.revision ?? 0) + 1,
      updated_at: ctx.now,
    };
    ctx.upsert(
      'program_cursor',
      row,
      upsertOperation(row.revision, existing?.revision ?? null, rowPayload(row), cause),
    );
    const stored = cursorRow();
    if (stored === undefined) throw new Error('Cursore non leggibile dopo la scrittura.');
    return toProgramCursor(stored);
  };

  const requireCursor = (): ProgramCursorRow => {
    const row = cursorRow();
    if (row === undefined) {
      throw new Error('Cursore del programma non inizializzato: chiama initCursor().');
    }
    return row;
  };

  return {
    savePlan: (plan, options) =>
      withWrite(db, (ctx) => {
        const existing = ctx.get<ProgramPlanRow>(
          'SELECT * FROM program_plans WHERE workspace_id = ? AND version = ?',
          [db.workspaceId, plan.version],
        );
        const planJson = toJson(plan);
        if (existing !== undefined) {
          if (existing.plan_json !== planJson) throw new PlanVersionConflictError(plan.version);
          return mapPlan(existing);
        }

        const row = {
          id: db.ids.newId(),
          workspace_id: db.workspaceId,
          version: plan.version,
          format_version: plan.formatVersion,
          derived_from_version: options?.derivedFromVersion ?? plan.derivedFromVersion,
          revision_reason: options?.revisionReason ?? plan.revisionReason,
          start_date: plan.startDate,
          horizon_years: plan.horizonYears,
          last_date: plan.lastDate,
          plan_json: planJson,
          created_at: ctx.now,
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'program_plans',
          row,
          upsertOperation(1, null, rowPayload(row), options?.revisionReason ?? 'nuovo piano'),
        );

        // Blocchi e settimane sono anche righe interrogabili, non solo JSON:
        // servono al calendario e alle viste di programma senza dover
        // deserializzare tre anni di piano a ogni schermata.
        for (const block of plan.blocks) {
          const blockRow = {
            id: db.ids.newId(),
            plan_id: row.id,
            block_key: block.id,
            order_index: block.order,
            name: block.name,
            phase: block.phase,
            purpose: block.purpose,
            planned_weeks: block.plannedWeeks,
            start_week_index: block.startWeekIndex,
            year_number: block.yearNumber,
            interruption_policy: block.interruptionPolicy,
            entry_criteria_json: toJson(block.entryCriteria),
            review_criteria_json: toJson(block.reviewCriteria),
            revision: 1,
            updated_at: ctx.now,
          };
          ctx.upsert(
            'program_blocks',
            blockRow,
            upsertOperation(1, null, rowPayload(blockRow), 'blocco di programma'),
          );
          for (const week of block.weeks) {
            const weekRow = {
              id: db.ids.newId(),
              block_id: blockRow.id,
              week_index: week.index,
              index_in_block: week.indexInBlock,
              label: week.label,
              note: week.note,
              is_deload: sqlBool(week.isDeload),
              sessions_json: toJson(week.sessions),
              revision: 1,
              updated_at: ctx.now,
            };
            ctx.upsert(
              'program_weeks',
              weekRow,
              upsertOperation(1, null, rowPayload(weekRow), 'settimana di programma'),
            );
          }
        }

        const stored = ctx.get<ProgramPlanRow>('SELECT * FROM program_plans WHERE id = ?', [row.id]);
        if (stored === undefined) throw new Error('Piano non leggibile dopo il salvataggio.');
        return mapPlan(stored);
      }),

    currentPlan: () => {
      const row = db.driver.get<ProgramPlanRow>(
        `SELECT * FROM program_plans
          WHERE workspace_id = ? AND deleted_at IS NULL
          ORDER BY version DESC LIMIT 1`,
        [db.workspaceId],
      );
      return row === undefined ? null : mapPlan(row);
    },

    planByVersion: (version) => {
      const row = db.driver.get<ProgramPlanRow>(
        'SELECT * FROM program_plans WHERE workspace_id = ? AND version = ?',
        [db.workspaceId, version],
      );
      return row === undefined ? null : mapPlan(row);
    },

    revisionHistory: () =>
      db.driver
        .all<{
          version: number;
          derived_from_version: number | null;
          revision_reason: string | null;
          created_at: number;
        }>(
          `SELECT version, derived_from_version, revision_reason, created_at
             FROM program_plans WHERE workspace_id = ? ORDER BY version`,
          [db.workspaceId],
        )
        .map((row) => ({
          version: row.version,
          derivedFromVersion: row.derived_from_version,
          revisionReason: row.revision_reason,
          createdAt: row.created_at,
        })),

    cursor: () => {
      const row = cursorRow();
      return row === undefined ? null : toProgramCursor(row);
    },

    initCursor: (planVersion, enteredOn) =>
      withWrite(db, (ctx) =>
        writeCursor(
          ctx,
          { planVersion, weekIndex: 1, repetitionCount: 0, completedSlots: [], enteredOn },
          'avvio percorso',
        ),
      ),

    markSlotCompleted: (slot) =>
      withWrite(db, (ctx) => {
        const current = requireCursor();
        const slots = fromJson<SessionSlot[]>(
          current.completed_slots_json,
          'program_cursor.completed_slots_json',
        );
        if (slots.includes(slot)) return toProgramCursor(current);
        return writeCursor(
          ctx,
          {
            planVersion: current.plan_version,
            weekIndex: current.week_index,
            repetitionCount: current.repetition_count,
            completedSlots: [...slots, slot],
            enteredOn: current.entered_on,
          },
          'slot completato',
        );
      }),

    advanceWeek: (enteredOn) =>
      withWrite(db, (ctx) => {
        const current = requireCursor();
        return writeCursor(
          ctx,
          {
            planVersion: current.plan_version,
            weekIndex: current.week_index + 1,
            repetitionCount: 0,
            completedSlots: [],
            enteredOn,
          },
          'avanzamento settimana',
        );
      }),

    repeatWeek: (enteredOn) =>
      withWrite(db, (ctx) => {
        const current = requireCursor();
        return writeCursor(
          ctx,
          {
            planVersion: current.plan_version,
            weekIndex: current.week_index,
            repetitionCount: current.repetition_count + 1,
            completedSlots: [],
            enteredOn,
          },
          'ripetizione settimana',
        );
      }),
  };
}

/** Riesportate per comodita': utili a chi legge un piano dal repository. */
export { allWeeks, blockAtWeek };
