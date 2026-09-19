/**
 * Righe SQL e conversione verso i tipi di `@trackstrong/core`.
 *
 * I repository non fanno uscire righe grezze: fuori dal pacchetto si parlano
 * i tipi del dominio. Questo file e' l'unico punto in cui le due
 * rappresentazioni si toccano, cosi' un cambiamento di colonna si vede in un
 * posto solo.
 */

import type {
  BodySide,
  HabitEntry,
  LoadConvention,
  Measurement,
  MeasurementKind,
  PerformedCardio,
  PerformedExercise,
  PerformedSet,
  PrescriptionSnapshot,
  ProgramCursor,
  RecoveryCheckIn,
  Session,
  SessionCheckIn,
  SessionSlot,
  SessionStatus,
  SetMetric,
  SetRole,
  SetStatus,
  TrackDay,
} from '@trackstrong/core';
import { EMPTY_CHECK_IN, EMPTY_TRACK_FATIGUE } from '@trackstrong/core';

import { fromSqlBool, type SqlValue } from './driver.js';
import { fromJson, fromJsonOrNull } from './json.js';

// ---------------------------------------------------------------------------
// Righe
// ---------------------------------------------------------------------------

export interface SessionRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly planned_event_id: string | null;
  readonly planned_date: string;
  readonly performed_date: string | null;
  readonly slot: string;
  readonly status: string;
  readonly prescription_snapshot: string;
  readonly plan_version: number;
  readonly week_index: number;
  readonly block_id: string;
  readonly check_in_json: string | null;
  readonly started_at: number | null;
  readonly ended_at: number | null;
  readonly paused_ms: number;
  readonly note: string | null;
  readonly owner_device_id: string | null;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface PerformedExerciseRow {
  readonly id: string;
  readonly session_id: string;
  readonly order_index: number;
  readonly exercise_id: string;
  readonly variant_id: string | null;
  readonly substituted_for_exercise_id: string | null;
  readonly equipment_instance_id: string | null;
  readonly technique: string | null;
  readonly discomfort_json: string | null;
  readonly settings_note: string | null;
  readonly note: string | null;
  readonly skipped: number;
  readonly revision: number;
  readonly updated_at: number;
}

export interface PerformedSetRow {
  readonly id: string;
  readonly session_id: string;
  readonly performed_exercise_id: string;
  readonly order_index: number;
  readonly role: string;
  readonly load_convention: string;
  readonly load_kg: number | null;
  readonly equipment_instance_id: string | null;
  readonly metric: string;
  readonly reps: number | null;
  readonly seconds: number | null;
  readonly side: string;
  readonly rir: number | null;
  readonly note: string | null;
  readonly status: string;
  readonly completed_at: number | null;
  readonly comparability_key: string;
  readonly idempotency_key: string;
  readonly revision: number;
  readonly updated_at: number;
  /** Aggiunta dalla migrazione 002. */
  readonly prefilled?: number;
}

export interface PerformedCardioRow {
  readonly id: string;
  readonly session_id: string;
  readonly kind: string;
  readonly minutes: number;
  readonly rounds_completed: number | null;
  readonly intensity_note: string | null;
  readonly confirmed: number;
  readonly revision: number;
  readonly updated_at: number;
}

export interface MeasurementRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly kind: string;
  readonly value: number;
  readonly measured_on: string;
  readonly recorded_at: number;
  readonly method: string | null;
  readonly note: string | null;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface ProgramCursorRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly plan_version: number;
  readonly week_index: number;
  readonly repetition_count: number;
  readonly completed_slots_json: string;
  readonly entered_on: string;
  readonly revision: number;
  readonly updated_at: number;
}

export interface RecoveryCheckInRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly check_in_date: string;
  readonly sleep_hours: number | null;
  readonly sleep_quality: number | null;
  readonly energy: number | null;
  readonly stress: number | null;
  readonly soreness: number | null;
  readonly note: string | null;
  readonly recorded_at: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface HabitEntryRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly entry_date: string;
  readonly kind: string;
  readonly minutes: number | null;
  readonly manual_kcal: number | null;
  readonly manual_protein_g: number | null;
  readonly note: string | null;
  readonly recorded_at: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface TrackDayRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly track_date: string;
  readonly circuit: string;
  readonly session_count: number;
  readonly minutes_per_session: number | null;
  readonly fatigue_json: string;
  readonly best_lap_seconds: number | null;
  readonly average_lap_seconds: number | null;
  readonly note: string | null;
  readonly recorded_at: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

// ---------------------------------------------------------------------------
// Conversioni riga -> dominio
// ---------------------------------------------------------------------------

/**
 * Serie come sta nel database: i campi del dominio piu' i due riferimenti
 * che il dominio non porta (la sessione e la provenienza del valore).
 */
export interface StoredPerformedSet extends PerformedSet {
  readonly sessionId: string;
  readonly idempotencyKey: string;
  /**
   * `true` se il valore confermato era quello precompilato dall'ultima
   * prestazione comparabile e non e' stato modificato (§5, §10).
   */
  readonly prefilled: boolean;
  readonly revision: number;
}

export function toPerformedSet(row: PerformedSetRow): StoredPerformedSet {
  return {
    id: row.id,
    sessionId: row.session_id,
    performedExerciseId: row.performed_exercise_id,
    order: row.order_index,
    role: row.role as SetRole,
    load: {
      convention: row.load_convention as LoadConvention,
      kg: row.load_kg,
      equipmentInstanceId: row.equipment_instance_id,
    },
    metric: row.metric as SetMetric,
    reps: row.reps,
    seconds: row.seconds,
    side: row.side as BodySide,
    rir: row.rir,
    note: row.note,
    status: row.status as SetStatus,
    completedAt: row.completed_at,
    comparabilityKey: row.comparability_key,
    idempotencyKey: row.idempotency_key,
    prefilled: fromSqlBool(row.prefilled ?? 0),
    revision: row.revision,
  };
}

export function toPerformedExercise(row: PerformedExerciseRow): PerformedExercise {
  return {
    id: row.id,
    sessionId: row.session_id,
    order: row.order_index,
    exerciseId: row.exercise_id,
    variantId: row.variant_id,
    substitutedForExerciseId: row.substituted_for_exercise_id,
    equipmentInstanceId: row.equipment_instance_id,
    technique: row.technique as PerformedExercise['technique'],
    discomfort: fromJsonOrNull<PerformedExercise['discomfort']>(
      row.discomfort_json,
      'performed_exercises.discomfort_json',
    ),
    settingsNote: row.settings_note,
    note: row.note,
    skipped: fromSqlBool(row.skipped),
  };
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    plannedDate: row.planned_date,
    performedDate: row.performed_date,
    slot: row.slot as SessionSlot,
    status: row.status as SessionStatus,
    snapshot: fromJson<PrescriptionSnapshot>(
      row.prescription_snapshot,
      'sessions.prescription_snapshot',
    ),
    checkIn:
      fromJsonOrNull<SessionCheckIn>(row.check_in_json, 'sessions.check_in_json') ??
      EMPTY_CHECK_IN,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    pausedMs: row.paused_ms,
    note: row.note,
    ownerDeviceId: row.owner_device_id,
    revision: row.revision,
  };
}

export function toPerformedCardio(row: PerformedCardioRow): PerformedCardio {
  return {
    id: row.id,
    sessionId: row.session_id,
    kind: row.kind as PerformedCardio['kind'],
    minutes: row.minutes,
    roundsCompleted: row.rounds_completed,
    intensityNote: row.intensity_note,
    confirmed: fromSqlBool(row.confirmed),
  };
}

export function toMeasurement(row: MeasurementRow): Measurement {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    kind: row.kind as MeasurementKind,
    value: row.value,
    measuredOn: row.measured_on,
    recordedAt: row.recorded_at,
    method: row.method as Measurement['method'],
    note: row.note,
    revision: row.revision,
  };
}

export function toProgramCursor(row: ProgramCursorRow): ProgramCursor {
  return {
    planVersion: row.plan_version,
    weekIndex: row.week_index,
    repetitionCount: row.repetition_count,
    completedSlots: fromJson<SessionSlot[]>(
      row.completed_slots_json,
      'program_cursor.completed_slots_json',
    ),
    enteredOn: row.entered_on,
  };
}

export function toRecoveryCheckIn(row: RecoveryCheckInRow): RecoveryCheckIn {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    date: row.check_in_date,
    sleepHours: row.sleep_hours,
    sleepQuality: row.sleep_quality,
    energy: row.energy,
    stress: row.stress,
    soreness: row.soreness,
    note: row.note,
    recordedAt: row.recorded_at,
    revision: row.revision,
  };
}

export function toHabitEntry(row: HabitEntryRow): HabitEntry {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    date: row.entry_date,
    kind: row.kind as HabitEntry['kind'],
    minutes: row.minutes,
    manualKcal: row.manual_kcal,
    manualProteinG: row.manual_protein_g,
    note: row.note,
    recordedAt: row.recorded_at,
    revision: row.revision,
  };
}

export function toTrackDay(row: TrackDayRow): TrackDay {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    date: row.track_date,
    circuit: row.circuit,
    sessionCount: row.session_count,
    minutesPerSession: row.minutes_per_session,
    fatigue:
      fromJsonOrNull<TrackDay['fatigue']>(row.fatigue_json, 'track_days.fatigue_json') ??
      EMPTY_TRACK_FATIGUE,
    bestLapSeconds: row.best_lap_seconds,
    averageLapSeconds: row.average_lap_seconds,
    note: row.note,
    recordedAt: row.recorded_at,
    revision: row.revision,
  };
}

/** `undefined` -> `null`: le colonne nullable non accettano `undefined`. */
export function orNull(value: SqlValue | undefined): SqlValue {
  return value === undefined ? null : value;
}
