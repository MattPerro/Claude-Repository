/**
 * Implementazione in memoria di {@link SyncStateStore}, per i test.
 *
 * NON e' l'implementazione di produzione: quella e' SQLite, transazionale e
 * con migrazioni (specifica §7), e viene collegata da un altro pacchetto.
 * Qui si riproduce l'unica proprieta' del contratto che il protocollo usa per
 * restare corretto: **{@link InMemorySyncStateStore.applyIncoming} e'
 * atomica**. Le scritture vengono preparate su copie e pubblicate solo alla
 * fine; se qualcosa fallisce, nulla cambia - cursore incluso.
 *
 * `failNextApplyIncoming()` inietta proprio quel guasto, per verificare che il
 * cursore non avanzi quando la persistenza non riesce.
 */

import type { DeviceId, Instant } from '@trackstrong/core';
import type { OperationId, SyncEntityType, SyncOperation } from '../operation.js';
import type { Conflict, EntityRecord } from '../conflict.js';
import type { BundleRejection } from '../bundle.js';
import {
  entityKey,
  type DeferredOperation,
  type IncomingBatch,
  type LinkedAccount,
  type PushIntent,
  type PushedBundle,
  type SyncStateStore,
} from '../state.js';

/** Guasto di persistenza iniettato nei test. */
export class PersistenceFailure extends Error {
  constructor(message = 'Scrittura locale non riuscita.') {
    super(message);
    this.name = 'PersistenceFailure';
  }
}

export class InMemorySyncStateStore implements SyncStateStore {
  private account: LinkedAccount | null = null;
  private deviceId: DeviceId | null = null;
  private cursor: string | null = null;
  private lastSyncedAt: Instant | null = null;
  private lamport = 0;

  private applied = new Set<OperationId>();
  private outbound: SyncOperation[] = [];
  private pushIntent: PushIntent | null = null;
  private pushed: PushedBundle[] = [];
  private seenBundles = new Map<string, string>();
  private rejected: BundleRejection[] = [];
  private entities = new Map<string, EntityRecord>();
  private conflicts: Conflict[] = [];
  private deferred: DeferredOperation[] = [];

  private failApplies = 0;

  /** Numero di chiamate atomiche riuscite: utile alle asserzioni. */
  applyCount = 0;

  /** Fa fallire le prossime `times` chiamate ad `applyIncoming`. */
  failNextApplyIncoming(times = 1): void {
    this.failApplies += times;
  }

  // --- account ------------------------------------------------------------

  async readLinkedAccount(): Promise<LinkedAccount | null> {
    return this.account;
  }

  async writeLinkedAccount(account: LinkedAccount): Promise<void> {
    this.account = account;
  }

  // --- cursore ------------------------------------------------------------

  async readCursor(): Promise<string | null> {
    return this.cursor;
  }

  // --- registro delle applicate ------------------------------------------

  async hasAppliedOperation(id: OperationId): Promise<boolean> {
    return this.applied.has(id);
  }

  async countAppliedOperations(): Promise<number> {
    return this.applied.size;
  }

  async listAppliedOperationIds(): Promise<readonly OperationId[]> {
    return [...this.applied];
  }

  // --- coda in uscita -----------------------------------------------------

  async enqueueLocal(operation: SyncOperation, record: EntityRecord | null): Promise<void> {
    // Nell'implementazione SQLite queste scritture stanno nella stessa
    // transazione della modifica ai dati (specifica §7).
    if (record !== null) {
      this.entities.set(entityKey(record.entityType, record.entityId), record);
    }
    this.outbound.push(operation);
    this.applied.add(operation.id);
    if (operation.lamport > this.lamport) this.lamport = operation.lamport;
  }

  async listPendingOperations(): Promise<readonly SyncOperation[]> {
    return [...this.outbound];
  }

  async markOperationsSent(bundle: PushedBundle): Promise<void> {
    const sent = new Set(bundle.operationIds);
    this.outbound = this.outbound.filter((op) => !sent.has(op.id));
    this.pushed.push(bundle);
    // Il pacchetto caricato da noi e' anche "gia' visto": quando torna da
    // `changes.list` non va riscaricato.
    this.seenBundles.set(bundle.bundleId, bundle.fileId);
  }

  // --- idempotenza del push ----------------------------------------------

  async readPushIntent(): Promise<PushIntent | null> {
    return this.pushIntent;
  }

  async writePushIntent(intent: PushIntent | null): Promise<void> {
    this.pushIntent = intent;
  }

  async listPushedBundles(): Promise<readonly PushedBundle[]> {
    return [...this.pushed];
  }

  // --- idempotenza del pull ----------------------------------------------

  async hasSeenBundle(bundleId: string): Promise<boolean> {
    return this.seenBundles.has(bundleId);
  }

  async listRejectedBundles(): Promise<readonly BundleRejection[]> {
    return [...this.rejected];
  }

  // --- applicazione atomica ----------------------------------------------

  async applyIncoming(batch: IncomingBatch): Promise<void> {
    if (this.failApplies > 0) {
      this.failApplies -= 1;
      // Nulla e' stato modificato: in particolare il cursore resta indietro.
      throw new PersistenceFailure();
    }

    // Preparazione su copie: la pubblicazione avviene in blocco.
    const applied = new Set(this.applied);
    const entities = new Map(this.entities);
    const seen = new Map(this.seenBundles);

    for (const op of batch.appliedOperations) applied.add(op.id);
    for (const id of batch.appliedOperationIdsOnly) applied.add(id);
    for (const record of batch.entityUpdates) {
      entities.set(entityKey(record.entityType, record.entityId), record);
    }
    for (const b of batch.seenBundles) seen.set(b.bundleId, b.fileId);

    const conflicts = [...this.conflicts];
    const known = new Set(conflicts.map((c) => c.id));
    for (const c of batch.conflicts) if (!known.has(c.id)) conflicts.push(c);

    this.applied = applied;
    this.entities = entities;
    this.seenBundles = seen;
    this.conflicts = conflicts;
    this.deferred = [...batch.deferred];
    this.rejected = [...this.rejected, ...batch.rejectedBundles];
    if (batch.lamport > this.lamport) this.lamport = batch.lamport;
    if (batch.cursor !== null) this.cursor = batch.cursor;
    if (batch.syncedAt !== null) this.lastSyncedAt = batch.syncedAt;
    this.applyCount += 1;
  }

  // --- lettura ------------------------------------------------------------

  async readEntity(entityType: SyncEntityType, entityId: string): Promise<EntityRecord | null> {
    return this.entities.get(entityKey(entityType, entityId)) ?? null;
  }

  async listEntities(entityType?: SyncEntityType): Promise<readonly EntityRecord[]> {
    const all = [...this.entities.values()];
    return entityType === undefined ? all : all.filter((r) => r.entityType === entityType);
  }

  async listLiveEntities(entityType?: SyncEntityType): Promise<readonly EntityRecord[]> {
    return (await this.listEntities(entityType)).filter((r) => !r.deleted);
  }

  async listTombstones(): Promise<readonly EntityRecord[]> {
    return [...this.entities.values()].filter((r) => r.deleted);
  }

  async listConflicts(): Promise<readonly Conflict[]> {
    return [...this.conflicts];
  }

  async markConflictResolved(
    conflictId: string,
    chosenOperationId: OperationId,
    at: Instant,
  ): Promise<void> {
    this.conflicts = this.conflicts.map((c) =>
      c.id === conflictId
        ? { ...c, resolvedWithOperationId: chosenOperationId, resolvedAt: at }
        : c,
    );
  }

  async listDeferredOperations(): Promise<readonly DeferredOperation[]> {
    return [...this.deferred];
  }

  async readLamport(): Promise<number> {
    return this.lamport;
  }

  async readLastSyncedAt(): Promise<Instant | null> {
    return this.lastSyncedAt;
  }

  async readDeviceId(): Promise<DeviceId | null> {
    return this.deviceId;
  }

  async writeDeviceId(deviceId: DeviceId): Promise<void> {
    this.deviceId = deviceId;
  }

  async purgeTombstones(
    keys: readonly { entityType: SyncEntityType; entityId: string }[],
  ): Promise<void> {
    for (const key of keys) this.entities.delete(entityKey(key.entityType, key.entityId));
  }
}
