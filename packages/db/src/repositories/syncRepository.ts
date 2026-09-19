/**
 * Coda delle operazioni, registro di quelle applicate, cursore, conflitti.
 *
 * Questo repository LEGGE e amministra la coda che `withWrite` riempie. Non
 * la riempie lui: le operazioni nascono insieme al dato (§7), non dopo.
 *
 * Requisiti coperti:
 * - §8 "Ogni operazione e' identificabile e applicabile una sola volta":
 *   {@link SyncRepository.markApplied} e {@link SyncRepository.isApplied}
 *   usano `sync_applied_operations`, con UNIQUE su `operation_id`.
 * - §8 "non avanzare il cursore prima di aver persistito i dati":
 *   {@link SyncRepository.applyRemote} scrive il dato, il registro di
 *   idempotenza e il cursore nella stessa transazione.
 * - §8.2 i conflitti incompatibili conservano ENTRAMBE le alternative.
 */

import type { Instant } from '@trackstrong/core';

import type { Database } from '../database.js';
import { fromJson, toJson, type JsonValue } from '../json.js';
import type { OperationKind, SyncOperation, SyncOperationRow } from '../operations.js';
import { withWrite, type WriteContext } from '../unitOfWork.js';

export type ConflictKind = 'updateUpdate' | 'updateDelete' | 'programRevision' | 'other';
export type ConflictResolution = 'pending' | 'keepLocal' | 'keepRemote' | 'merged' | 'keepBoth';

export interface ConflictRecord {
  readonly id: string;
  readonly entity: string;
  readonly entityId: string;
  readonly kind: ConflictKind;
  readonly localPayload: JsonValue;
  readonly remotePayload: JsonValue;
  readonly localRevision: number | null;
  readonly remoteRevision: number | null;
  readonly detectedAt: Instant;
  readonly resolution: ConflictResolution;
  readonly resolvedAt: Instant | null;
  readonly note: string | null;
}

export interface SyncStateRecord {
  readonly workspaceId: string;
  readonly remoteCursor: string | null;
  readonly lastPulledAt: Instant | null;
  readonly lastPushedAt: Instant | null;
  readonly lastSnapshotAt: Instant | null;
  readonly googleAccountId: string | null;
  readonly googleAccountEmail: string | null;
  readonly protocolVersion: number;
  readonly syncBlockedReason: string | null;
}

export interface SyncRepository {
  /** Operazioni ancora da inviare, in ordine causale. */
  pendingOperations(limit?: number): readonly SyncOperation[];
  pendingCount(): number;
  operationsFor(entity: string, entityId: string): readonly SyncOperation[];
  /** Segna come inviate le operazioni di un pacchetto. */
  markSent(operationIds: readonly string[], bundleId: string, at: Instant): number;
  /** Registra un tentativo fallito, senza perdere l'operazione. */
  recordAttemptFailure(operationIds: readonly string[], error: string): void;

  /** Vero se l'operazione remota e' gia' stata applicata in locale. */
  isApplied(operationId: string): boolean;
  /**
   * Applica una modifica remota: la scrittura dei dati, il registro di
   * idempotenza e l'eventuale avanzamento del cursore in una transazione.
   * Se l'operazione risulta gia' applicata, non fa nulla e non e' un errore.
   */
  applyRemote(input: {
    readonly operationId: string;
    readonly originDeviceId: string;
    readonly entity: string;
    readonly entityId: string;
    readonly kind: OperationKind;
    readonly appliedAt: Instant;
    /** Scrittura effettiva, dentro la stessa transazione. */
    readonly write: (ctx: WriteContext) => void;
    /** Cursore da avanzare SOLO dopo la scrittura. */
    readonly advanceCursorTo?: string;
  }): { readonly applied: boolean };

  state(): SyncStateRecord | null;
  initState(protocolVersion: number): SyncStateRecord;
  setCursor(cursor: string, at: Instant): SyncStateRecord;
  setAccount(accountId: string | null, email: string | null): SyncStateRecord;
  setBlockedReason(reason: string | null): SyncStateRecord;

  recordConflict(input: {
    readonly entity: string;
    readonly entityId: string;
    readonly kind: ConflictKind;
    readonly localPayload: JsonValue;
    readonly remotePayload: JsonValue;
    readonly localRevision: number | null;
    readonly remoteRevision: number | null;
    readonly detectedAt: Instant;
    readonly remoteOriginDeviceId?: string | null;
  }): ConflictRecord;
  openConflicts(): readonly ConflictRecord[];
  resolveConflict(
    id: string,
    resolution: Exclude<ConflictResolution, 'pending'>,
    at: Instant,
    resolvedPayload?: JsonValue,
    note?: string,
  ): ConflictRecord;
}

interface SyncStateRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly remote_cursor: string | null;
  readonly last_pulled_at: number | null;
  readonly last_pushed_at: number | null;
  readonly last_snapshot_at: number | null;
  readonly google_account_id: string | null;
  readonly google_account_email: string | null;
  readonly protocol_version: number;
  readonly sync_blocked_reason: string | null;
  readonly revision: number;
  readonly updated_at: number;
}

interface ConflictRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly entity_table: string;
  readonly entity_id: string;
  readonly kind: string;
  readonly local_payload_json: string;
  readonly remote_payload_json: string;
  readonly local_revision: number | null;
  readonly remote_revision: number | null;
  readonly remote_origin_device_id: string | null;
  readonly detected_at: number;
  readonly resolution: string;
  readonly resolved_at: number | null;
  readonly resolved_payload_json: string | null;
  readonly note: string | null;
  readonly revision: number;
  readonly updated_at: number;
}

export function createSyncRepository(db: Database): SyncRepository {
  const mapOperation = (row: SyncOperationRow): SyncOperation => ({
    id: row.id,
    workspaceId: row.workspace_id,
    originDeviceId: row.origin_device_id,
    entity: row.entity_table,
    entityId: row.entity_id,
    kind: row.op_kind,
    baseRevision: row.base_revision,
    revision: row.revision,
    formatVersion: row.format_version,
    payload: fromJson<JsonValue>(row.payload_json, 'sync_operations.payload_json'),
    createdAt: row.created_at,
    lamport: row.lamport,
    cause: row.cause,
    bundleId: row.bundle_id,
    sentAt: row.sent_at,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  });

  const mapConflict = (row: ConflictRow): ConflictRecord => ({
    id: row.id,
    entity: row.entity_table,
    entityId: row.entity_id,
    kind: row.kind as ConflictKind,
    localPayload: fromJson<JsonValue>(row.local_payload_json, 'conflicts.local_payload_json'),
    remotePayload: fromJson<JsonValue>(row.remote_payload_json, 'conflicts.remote_payload_json'),
    localRevision: row.local_revision,
    remoteRevision: row.remote_revision,
    detectedAt: row.detected_at,
    resolution: row.resolution as ConflictResolution,
    resolvedAt: row.resolved_at,
    note: row.note,
  });

  const stateRow = (): SyncStateRow | undefined =>
    db.driver.get<SyncStateRow>('SELECT * FROM sync_state WHERE workspace_id = ?', [
      db.workspaceId,
    ]);

  const mapState = (row: SyncStateRow): SyncStateRecord => ({
    workspaceId: row.workspace_id,
    remoteCursor: row.remote_cursor,
    lastPulledAt: row.last_pulled_at,
    lastPushedAt: row.last_pushed_at,
    lastSnapshotAt: row.last_snapshot_at,
    googleAccountId: row.google_account_id,
    googleAccountEmail: row.google_account_email,
    protocolVersion: row.protocol_version,
    syncBlockedReason: row.sync_blocked_reason,
  });

  const patchState = (changes: Record<string, string | number | null>): SyncStateRecord => {
    const current = stateRow();
    if (current === undefined) {
      throw new Error('Stato di sincronizzazione non inizializzato: chiama initState().');
    }
    const columns = Object.keys(changes);
    db.driver.run(
      `UPDATE sync_state SET ${columns.map((c) => `${c} = ?`).join(', ')}, revision = ?, updated_at = ? WHERE id = ?`,
      [...columns.map((c) => changes[c] ?? null), current.revision + 1, db.clock.now(), current.id],
    );
    const updated = stateRow();
    if (updated === undefined) throw new Error('Stato non leggibile dopo l\'aggiornamento.');
    return mapState(updated);
  };

  return {
    pendingOperations: (limit = 500) =>
      db.driver
        .all<SyncOperationRow>(
          `SELECT * FROM sync_operations
            WHERE workspace_id = ? AND sent_at IS NULL
            ORDER BY lamport ASC, id ASC
            LIMIT ?`,
          [db.workspaceId, limit],
        )
        .map(mapOperation),

    pendingCount: () =>
      db.driver.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sync_operations WHERE workspace_id = ? AND sent_at IS NULL',
        [db.workspaceId],
      )?.n ?? 0,

    operationsFor: (entity, entityId) =>
      db.driver
        .all<SyncOperationRow>(
          `SELECT * FROM sync_operations
            WHERE entity_table = ? AND entity_id = ?
            ORDER BY lamport ASC, id ASC`,
          [entity, entityId],
        )
        .map(mapOperation),

    markSent: (operationIds, bundleId, at) =>
      withWrite(db, (ctx) => {
        let changed = 0;
        for (const id of operationIds) {
          // `sent_at` si scrive solo dopo che il pacchetto e' stato
          // effettivamente caricato: e' il chiamante a garantirlo, ma qui il
          // dato resta in coda finche' non lo dice.
          changed += ctx.run(
            'UPDATE sync_operations SET sent_at = ?, bundle_id = ? WHERE id = ? AND sent_at IS NULL',
            [at, bundleId, id],
          ).changes;
        }
        return changed;
      }),

    recordAttemptFailure: (operationIds, error) => {
      withWrite(db, (ctx) => {
        for (const id of operationIds) {
          ctx.run(
            'UPDATE sync_operations SET attempt_count = attempt_count + 1, last_error = ? WHERE id = ?',
            [error, id],
          );
        }
      });
    },

    isApplied: (operationId) =>
      db.driver.get<{ id: string }>(
        'SELECT id FROM sync_applied_operations WHERE operation_id = ?',
        [operationId],
      ) !== undefined,

    applyRemote: (input) =>
      withWrite(db, (ctx) => {
        const already = ctx.get<{ id: string }>(
          'SELECT id FROM sync_applied_operations WHERE operation_id = ?',
          [input.operationId],
        );
        if (already !== undefined) {
          // Ricezione ripetuta o fuori ordine: no-op, non un errore (§8).
          return { applied: false };
        }

        input.write(ctx);

        ctx.run(
          `INSERT INTO sync_applied_operations
             (id, operation_id, origin_device_id, entity_table, entity_id, applied_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            db.ids.newId(),
            input.operationId,
            input.originDeviceId,
            input.entity,
            input.entityId,
            input.appliedAt,
          ],
        );

        if (input.advanceCursorTo !== undefined) {
          // Il cursore avanza nella STESSA transazione della scrittura: se
          // la scrittura rotola indietro, il cursore non e' avanzato (§8).
          ctx.run(
            'UPDATE sync_state SET remote_cursor = ?, last_pulled_at = ? WHERE workspace_id = ?',
            [input.advanceCursorTo, input.appliedAt, db.workspaceId],
          );
        }
        return { applied: true };
      }),

    state: () => {
      const row = stateRow();
      return row === undefined ? null : mapState(row);
    },

    initState: (protocolVersion) =>
      withWrite(db, (ctx) => {
        const existing = stateRow();
        if (existing !== undefined) return mapState(existing);
        const id = db.ids.newId();
        ctx.run(
          `INSERT INTO sync_state
             (id, workspace_id, remote_cursor, last_pulled_at, last_pushed_at,
              last_snapshot_at, google_account_id, google_account_email,
              protocol_version, sync_blocked_reason, revision, updated_at)
           VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, 1, ?)`,
          [id, db.workspaceId, protocolVersion, db.syncBlockedReason, ctx.now],
        );
        const created = stateRow();
        if (created === undefined) throw new Error('Stato non leggibile dopo la creazione.');
        return mapState(created);
      }),

    setCursor: (cursor, at) => patchState({ remote_cursor: cursor, last_pulled_at: at }),

    setAccount: (accountId, email) =>
      patchState({ google_account_id: accountId, google_account_email: email }),

    setBlockedReason: (reason) => patchState({ sync_blocked_reason: reason }),

    recordConflict: (input) =>
      withWrite(db, (ctx) => {
        const id = db.ids.newId();
        // Entrambe le alternative vengono conservate: nessuna delle due va
        // scartata in silenzio (§8.2).
        ctx.run(
          `INSERT INTO conflicts
             (id, workspace_id, entity_table, entity_id, kind, local_payload_json,
              remote_payload_json, local_revision, remote_revision,
              remote_origin_device_id, detected_at, resolution, resolved_at,
              resolved_payload_json, note, revision, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, NULL, 1, ?)`,
          [
            id,
            db.workspaceId,
            input.entity,
            input.entityId,
            input.kind,
            toJson(input.localPayload),
            toJson(input.remotePayload),
            input.localRevision,
            input.remoteRevision,
            input.remoteOriginDeviceId ?? null,
            input.detectedAt,
            ctx.now,
          ],
        );
        const row = ctx.get<ConflictRow>('SELECT * FROM conflicts WHERE id = ?', [id]);
        if (row === undefined) throw new Error('Conflitto non leggibile dopo la registrazione.');
        return mapConflict(row);
      }),

    openConflicts: () =>
      db.driver
        .all<ConflictRow>(
          `SELECT * FROM conflicts WHERE workspace_id = ? AND resolution = 'pending'
            ORDER BY detected_at ASC`,
          [db.workspaceId],
        )
        .map(mapConflict),

    resolveConflict: (id, resolution, at, resolvedPayload, note) =>
      withWrite(db, (ctx) => {
        const changes = ctx.run(
          `UPDATE conflicts
              SET resolution = ?, resolved_at = ?, resolved_payload_json = ?, note = ?,
                  revision = revision + 1, updated_at = ?
            WHERE id = ? AND resolution = 'pending'`,
          [
            resolution,
            at,
            resolvedPayload === undefined ? null : toJson(resolvedPayload),
            note ?? null,
            ctx.now,
            id,
          ],
        ).changes;
        if (changes === 0) {
          throw new Error(`Conflitto inesistente o gia' risolto: ${id}.`);
        }
        const row = ctx.get<ConflictRow>('SELECT * FROM conflicts WHERE id = ?', [id]);
        if (row === undefined) throw new Error('Conflitto non leggibile dopo la risoluzione.');
        return mapConflict(row);
      }),
  };
}
