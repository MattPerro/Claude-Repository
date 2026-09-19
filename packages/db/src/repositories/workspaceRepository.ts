/**
 * Archivio, dispositivi, profilo, impostazioni, attrezzature.
 *
 * Non e' un repository "di comodo": tutte le altre tabelle hanno una chiave
 * esterna verso `workspaces`, quindi senza questo nulla si puo' scrivere. E'
 * anche il posto in cui vive la distinzione dichiarata dalla specifica (§2 e
 * §15) fra il peso DICHIARATO nel profilo e una pesata datata: il primo sta
 * in `profiles.declared_weight_kg`, la seconda in `measurements`, e non si
 * incontrano mai.
 */

import {
  type AppSettings,
  type BodyGoal,
  type Device,
  type Instant,
  type IsoWeekday,
  type LocalDate,
  type PhysicalLimitation,
  type Profile,
  type Workspace,
} from '@trackstrong/core';

import { fromSqlBool, sqlBool } from '../driver.js';
import type { Database } from '../database.js';
import { fromJson, fromJsonOrNull, toJson, toJsonOrNull } from '../json.js';
import { rowPayload, upsertOperation, withWrite } from '../unitOfWork.js';

interface WorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly created_at: number;
  readonly google_account_id: string | null;
  readonly google_account_email: string | null;
  readonly sync_protocol_version: number;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

interface ProfileRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly display_name: string;
  readonly height_cm: number | null;
  readonly declared_weight_kg: number | null;
  readonly body_goal_json: string | null;
  readonly sport_goal: string | null;
  readonly program_start_date: string;
  readonly preferred_weekdays_json: string;
  readonly available_minutes_per_session: number;
  readonly sessions_per_week: number;
  readonly notes: string | null;
  readonly revision: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

interface SettingsRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly time_zone: string;
  readonly theme: string;
  readonly keep_screen_awake: number;
  readonly haptics_enabled: number;
  readonly rest_timer_notifications: number;
  readonly session_reminders: number;
  readonly hours_before_track_day: number;
  readonly auto_sync_enabled: number;
  readonly auto_sync_min_interval_minutes: number;
  readonly client_encryption_enabled: number;
  readonly sync_progress_photos: number;
  readonly generative_coach_enabled: number;
  readonly backup_reminder_days: number;
  readonly reminder_time_of_day: string;
  readonly revision: number;
  readonly updated_at: number;
}

export interface EquipmentInstanceInput {
  readonly label: string;
  readonly kind: string;
  readonly location?: string | null;
  readonly stepKg: number;
  readonly minKg?: number | null;
  readonly maxKg?: number | null;
  readonly stepNote?: string | null;
  readonly settingsNote?: string | null;
  readonly id?: string;
}

export interface SaveProfileInput {
  readonly displayName: string;
  readonly heightCm: number | null;
  /** Dichiarato in configurazione. NON e' una pesata (§2). */
  readonly declaredWeightKg: number | null;
  readonly bodyGoal: BodyGoal | null;
  readonly sportGoal: string | null;
  readonly programStartDate: LocalDate;
  readonly preferredWeekdays: readonly IsoWeekday[];
  readonly availableMinutesPerSession: number;
  readonly sessionsPerWeek: number;
  readonly notes?: string | null;
  readonly id?: string;
}

export interface WorkspaceRepository {
  /** Crea l'archivio se non esiste. Idempotente. */
  ensureWorkspace(name: string, createdAt: Instant, protocolVersion: number): Workspace;
  workspace(): Workspace | null;
  /** Registra questa installazione. Idempotente sullo stesso `deviceId`. */
  registerDevice(label: string, platform: Device['platform'], at: Instant): Device;
  devices(): readonly Device[];
  saveProfile(input: SaveProfileInput): Profile;
  profile(): Profile | null;
  saveLimitation(profileId: string, limitation: PhysicalLimitation): string;
  saveSettings(settings: AppSettings): AppSettings;
  settings(): AppSettings | null;
  saveEquipment(input: EquipmentInstanceInput): string;
  equipment(): readonly {
    readonly id: string;
    readonly label: string;
    readonly kind: string;
    readonly stepKg: number;
  }[];
}

export function createWorkspaceRepository(db: Database): WorkspaceRepository {
  const workspaceRow = (): WorkspaceRow | undefined =>
    db.driver.get<WorkspaceRow>('SELECT * FROM workspaces WHERE id = ?', [db.workspaceId]);

  const profileRow = (): ProfileRow | undefined =>
    db.driver.get<ProfileRow>(
      'SELECT * FROM profiles WHERE workspace_id = ? AND deleted_at IS NULL LIMIT 1',
      [db.workspaceId],
    );

  const settingsRow = (): SettingsRow | undefined =>
    db.driver.get<SettingsRow>('SELECT * FROM settings WHERE workspace_id = ?', [db.workspaceId]);

  const mapProfile = (row: ProfileRow): Profile => ({
    id: row.id,
    workspaceId: row.workspace_id,
    displayName: row.display_name,
    heightCm: row.height_cm,
    declaredWeightKg: row.declared_weight_kg,
    bodyGoal: fromJsonOrNull<BodyGoal>(row.body_goal_json, 'profiles.body_goal_json'),
    sportGoal: row.sport_goal,
    programStartDate: row.program_start_date,
    preferredWeekdays: fromJson<IsoWeekday[]>(
      row.preferred_weekdays_json,
      'profiles.preferred_weekdays_json',
    ),
    availableMinutesPerSession: row.available_minutes_per_session,
    sessionsPerWeek: row.sessions_per_week,
    limitations: db.driver
      .all<{
        id: string;
        label: string;
        note: string | null;
        affected_exercise_ids_json: string;
        active: number;
        recorded_on: string;
      }>(
        'SELECT * FROM physical_limitations WHERE profile_id = ? AND deleted_at IS NULL ORDER BY recorded_on',
        [row.id],
      )
      .map((limit) => ({
        id: limit.id,
        label: limit.label,
        note: limit.note,
        affectedExerciseIds: fromJson<string[]>(
          limit.affected_exercise_ids_json,
          'physical_limitations.affected_exercise_ids_json',
        ),
        active: fromSqlBool(limit.active),
        recordedOn: limit.recorded_on,
      })),
    notes: row.notes,
    revision: row.revision,
  });

  return {
    ensureWorkspace: (name, createdAt, protocolVersion) =>
      withWrite(db, (ctx) => {
        const existing = workspaceRow();
        if (existing !== undefined) {
          return {
            id: existing.id,
            name: existing.name,
            createdAt: existing.created_at,
            googleAccountId: existing.google_account_id,
            googleAccountEmail: existing.google_account_email,
            syncProtocolVersion: existing.sync_protocol_version,
          };
        }
        const row = {
          id: db.workspaceId,
          name,
          created_at: createdAt,
          google_account_id: null,
          google_account_email: null,
          sync_protocol_version: protocolVersion,
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'workspaces',
          row,
          upsertOperation(1, null, rowPayload(row), 'creazione archivio'),
        );
        return {
          id: row.id,
          name,
          createdAt,
          googleAccountId: null,
          googleAccountEmail: null,
          syncProtocolVersion: protocolVersion,
        };
      }),

    workspace: () => {
      const row = workspaceRow();
      return row === undefined
        ? null
        : {
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            googleAccountId: row.google_account_id,
            googleAccountEmail: row.google_account_email,
            syncProtocolVersion: row.sync_protocol_version,
          };
    },

    registerDevice: (label, platform, at) =>
      withWrite(db, (ctx) => {
        const existing = ctx.get<{ first_seen_at: number; revision: number }>(
          'SELECT first_seen_at, revision FROM devices WHERE id = ?',
          [db.deviceId],
        );
        const row = {
          id: db.deviceId,
          workspace_id: db.workspaceId,
          label,
          platform,
          first_seen_at: existing?.first_seen_at ?? at,
          last_seen_at: at,
          reminders_enabled: 1,
          revision: (existing?.revision ?? 0) + 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'devices',
          row,
          upsertOperation(
            row.revision,
            existing?.revision ?? null,
            rowPayload(row),
            'registrazione dispositivo',
          ),
        );
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          label,
          platform,
          firstSeenAt: row.first_seen_at,
          lastSeenAt: at,
          remindersEnabled: true,
        };
      }),

    devices: () =>
      db.driver
        .all<{
          id: string;
          workspace_id: string;
          label: string;
          platform: string;
          first_seen_at: number;
          last_seen_at: number;
          reminders_enabled: number;
        }>('SELECT * FROM devices WHERE workspace_id = ? AND deleted_at IS NULL', [db.workspaceId])
        .map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          label: row.label,
          platform: row.platform as Device['platform'],
          firstSeenAt: row.first_seen_at,
          lastSeenAt: row.last_seen_at,
          remindersEnabled: fromSqlBool(row.reminders_enabled),
        })),

    saveProfile: (input) =>
      withWrite(db, (ctx) => {
        const existing = profileRow();
        const row = {
          id: input.id ?? existing?.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          display_name: input.displayName,
          height_cm: input.heightCm,
          declared_weight_kg: input.declaredWeightKg,
          body_goal_json: toJsonOrNull(input.bodyGoal),
          sport_goal: input.sportGoal,
          program_start_date: input.programStartDate,
          preferred_weekdays_json: toJson(input.preferredWeekdays),
          available_minutes_per_session: input.availableMinutesPerSession,
          sessions_per_week: input.sessionsPerWeek,
          notes: input.notes ?? null,
          revision: (existing?.revision ?? 0) + 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'profiles',
          row,
          upsertOperation(
            row.revision,
            existing?.revision ?? null,
            rowPayload(row),
            'profilo salvato',
          ),
        );
        const stored = profileRow();
        if (stored === undefined) throw new Error('Profilo non leggibile dopo il salvataggio.');
        return mapProfile(stored);
      }),

    profile: () => {
      const row = profileRow();
      return row === undefined ? null : mapProfile(row);
    },

    saveLimitation: (profileId, limitation) =>
      withWrite(db, (ctx) => {
        const row = {
          id: limitation.id,
          profile_id: profileId,
          label: limitation.label,
          note: limitation.note,
          affected_exercise_ids_json: toJson(limitation.affectedExerciseIds),
          active: sqlBool(limitation.active),
          recorded_on: limitation.recordedOn,
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'physical_limitations',
          row,
          upsertOperation(1, null, rowPayload(row), 'limitazione fisica'),
        );
        return row.id;
      }),

    saveSettings: (settings) =>
      withWrite(db, (ctx) => {
        const existing = settingsRow();
        const row = {
          id: existing?.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          time_zone: settings.timeZone,
          theme: settings.theme,
          keep_screen_awake: sqlBool(settings.keepScreenAwakeDuringSession),
          haptics_enabled: sqlBool(settings.hapticsEnabled),
          rest_timer_notifications: sqlBool(settings.restTimerNotifications),
          session_reminders: sqlBool(settings.sessionReminders),
          hours_before_track_day: settings.hoursBeforeTrackDay,
          auto_sync_enabled: sqlBool(settings.autoSyncEnabled),
          auto_sync_min_interval_minutes: settings.autoSyncMinIntervalMinutes,
          client_encryption_enabled: sqlBool(settings.clientEncryptionEnabled),
          sync_progress_photos: sqlBool(settings.syncProgressPhotos),
          generative_coach_enabled: sqlBool(settings.generativeCoachEnabled),
          backup_reminder_days: settings.backupReminderDays,
          reminder_time_of_day: settings.reminderTimeOfDay,
          revision: (existing?.revision ?? 0) + 1,
          updated_at: ctx.now,
        };
        ctx.upsert(
          'settings',
          row,
          upsertOperation(
            row.revision,
            existing?.revision ?? null,
            rowPayload(row),
            'impostazioni',
          ),
        );
        return settings;
      }),

    settings: () => {
      const row = settingsRow();
      if (row === undefined) return null;
      return {
        workspaceId: row.workspace_id,
        timeZone: row.time_zone,
        theme: row.theme as AppSettings['theme'],
        keepScreenAwakeDuringSession: fromSqlBool(row.keep_screen_awake),
        hapticsEnabled: fromSqlBool(row.haptics_enabled),
        restTimerNotifications: fromSqlBool(row.rest_timer_notifications),
        sessionReminders: fromSqlBool(row.session_reminders),
        hoursBeforeTrackDay: row.hours_before_track_day,
        autoSyncEnabled: fromSqlBool(row.auto_sync_enabled),
        autoSyncMinIntervalMinutes: row.auto_sync_min_interval_minutes,
        clientEncryptionEnabled: fromSqlBool(row.client_encryption_enabled),
        syncProgressPhotos: fromSqlBool(row.sync_progress_photos),
        generativeCoachEnabled: fromSqlBool(row.generative_coach_enabled),
        backupReminderDays: row.backup_reminder_days,
        reminderTimeOfDay: row.reminder_time_of_day,
      };
    },

    saveEquipment: (input) =>
      withWrite(db, (ctx) => {
        const row = {
          id: input.id ?? db.ids.newId(),
          workspace_id: db.workspaceId,
          label: input.label,
          kind: input.kind,
          location: input.location ?? null,
          step_kg: input.stepKg,
          min_kg: input.minKg ?? null,
          max_kg: input.maxKg ?? null,
          step_note: input.stepNote ?? null,
          settings_note: input.settingsNote ?? null,
          revision: 1,
          updated_at: ctx.now,
          deleted_at: null,
        };
        ctx.upsert(
          'equipment_instances',
          row,
          upsertOperation(1, null, rowPayload(row), 'attrezzo configurato'),
        );
        return row.id;
      }),

    equipment: () =>
      db.driver
        .all<{ id: string; label: string; kind: string; step_kg: number }>(
          'SELECT id, label, kind, step_kg FROM equipment_instances WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY label',
          [db.workspaceId],
        )
        .map((row) => ({ id: row.id, label: row.label, kind: row.kind, stepKg: row.step_kg })),
  };
}
