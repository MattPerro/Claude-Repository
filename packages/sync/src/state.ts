/**
 * Porta di persistenza dello stato di sincronizzazione.
 *
 * Il motore ha bisogno di ricordare: quali operazioni ha gia' applicato, dove
 * e' arrivato col cursore dei cambiamenti, cosa deve ancora inviare, quali
 * pacchetti ha gia' visto o caricato, lo stato materializzato delle entita', i
 * conflitti aperti e a quale account Google e' collegato l'archivio.
 *
 * Questo pacchetto **non** dipende da `@trackstrong/db`: definisce solo il
 * contratto. L'implementazione SQLite (transazionale, con migrazioni, come
 * richiesto dalla specifica §7) viene collegata altrove;
 * `src/testing/inMemoryState.ts` fornisce un'implementazione in memoria per i
 * test di questo pacchetto.
 *
 * ## Il punto critico del contratto: {@link SyncStateStore.applyIncoming}
 *
 * Tutto cio' che deriva da un giro di `pull` (record aggiornati, registro delle
 * operazioni applicate, conflitti materializzati, pacchetti visti, contatore
 * logico, coda delle operazioni in attesa) **e il cursore** viene scritto in
 * **una sola** operazione atomica. E' questo che soddisfa il divieto "non
 * avanzare il cursore prima di aver persistito i dati ricevuti"
 * (specifica §8.1): se la scrittura non riesce, il cursore non avanza e il
 * pull si ripete dallo stesso punto. Un'implementazione che eseguisse le
 * scritture separatamente lascerebbe una finestra in cui il cursore e' avanti
 * rispetto ai dati, cioe' una finestra di **perdita silenziosa**.
 */

import type { DeviceId, Instant, WorkspaceId } from '@trackstrong/core';
import type { OperationId, SyncEntityType, SyncOperation } from './operation.js';
import type { Conflict, EntityRecord } from './conflict.js';
import type { BundleRejection } from './bundle.js';

/** Account Google a cui l'archivio locale e' collegato (specifica §8.3). */
export interface LinkedAccount {
  /**
   * Identificativo stabile dell'account Google (il `sub` dell'ID token, non
   * l'indirizzo email: l'email puo' cambiare).
   */
  readonly googleAccountId: string;
  readonly workspaceId: WorkspaceId;
  readonly linkedAt: Instant;
}

/** Pacchetto gia' caricato da questo dispositivo. */
export interface PushedBundle {
  readonly bundleId: string;
  readonly fileId: string;
  readonly operationIds: readonly OperationId[];
  readonly confirmedAt: Instant;
}

/**
 * Intento di caricamento, scritto **prima** dell'upload.
 *
 * Serve a rendere il retry idempotente: dopo una risposta persa il dispositivo
 * ritrova lo stesso `bundleId` e lo stesso contenuto, quindi puo' verificare su
 * Drive se quel pacchetto esiste gia' invece di crearne un secondo.
 */
export interface PushIntent {
  readonly bundleId: string;
  readonly operationIds: readonly OperationId[];
  readonly fileName: string;
  readonly content: string;
  /** Proprieta' private del file remoto, `bundleId` incluso. */
  readonly appProperties: Readonly<Record<string, string>>;
  readonly createdAt: Instant;
  readonly attempts: number;
}

/** Operazione ricevuta ma non ancora applicabile. */
export interface DeferredOperation {
  readonly operation: SyncOperation;
  readonly reason: 'dipendenze-mancanti' | 'seduta-in-corso';
  readonly receivedAt: Instant;
}

/**
 * Batch atomico di un giro di `pull` (o di un recupero iniziale).
 * Tutti i campi vengono scritti insieme, o nessuno.
 */
export interface IncomingBatch {
  /** Operazioni da registrare come applicate (registro di idempotenza). */
  readonly appliedOperations: readonly SyncOperation[];
  /**
   * Soli identificativi da registrare come applicati, senza il corpo
   * dell'operazione: e' cio' che arriva da uno snapshot, che riporta gli `id`
   * gia' applicati ma non i delta. Servono a rendere no-op un pacchetto
   * vecchio riapplicato dopo un recupero.
   */
  readonly appliedOperationIdsOnly: readonly OperationId[];
  /** Record da scrivere (upsert per chiave `entityType`+`entityId`). */
  readonly entityUpdates: readonly EntityRecord[];
  /** Conflitti da materializzare. */
  readonly conflicts: readonly Conflict[];
  /** Operazioni che restano in attesa: sostituiscono integralmente la coda. */
  readonly deferred: readonly DeferredOperation[];
  /** Pacchetti visti, per non riscaricarli ne' riapplicarli. */
  readonly seenBundles: readonly { readonly bundleId: string; readonly fileId: string }[];
  /**
   * Pacchetti rifiutati: vanno in **quarantena** (non semplicemente
   * registrati). La quarantena e' indicizzata per `fileId` e viene ritentata
   * a ogni pull successivo.
   */
  readonly rejectedBundles: readonly BundleRejection[];
  /**
   * `fileId` da togliere dalla quarantena perche' riletti correttamente e
   * applicati: e' il caso del download interrotto che al secondo tentativo
   * arriva integro.
   */
  readonly clearedRejections: readonly string[];
  /** Nuovo massimo del contatore logico. */
  readonly lamport: number;
  /**
   * Cursore da salvare **nella stessa transazione**.
   * `null` = non avanzare (per esempio durante una risoluzione interna).
   */
  readonly cursor: string | null;
  readonly syncedAt: Instant | null;
}

export interface SyncStateStore {
  // --- account ------------------------------------------------------------
  readLinkedAccount(): Promise<LinkedAccount | null>;
  writeLinkedAccount(account: LinkedAccount): Promise<void>;

  // --- cursore ------------------------------------------------------------
  /** `null` se il dispositivo non ha ancora fatto il primo recupero. */
  readCursor(): Promise<string | null>;

  // --- registro delle operazioni applicate (idempotenza) ------------------
  hasAppliedOperation(id: OperationId): Promise<boolean>;
  countAppliedOperations(): Promise<number>;
  listAppliedOperationIds(): Promise<readonly OperationId[]>;

  // --- coda in uscita -----------------------------------------------------
  /**
   * Accoda un'operazione locale e ne persiste subito l'effetto.
   *
   * Nella **stessa transazione** (specifica §7) scrive: il record aggiornato,
   * l'operazione nella coda in uscita, l'operazione nel registro delle
   * applicate (cosi' quando torna da Drive e' un no-op) e il nuovo massimo del
   * contatore logico.
   */
  enqueueLocal(operation: SyncOperation, record: EntityRecord | null): Promise<void>;
  listPendingOperations(): Promise<readonly SyncOperation[]>;
  /** Marca come inviate SOLO dopo la conferma del caricamento. */
  markOperationsSent(bundle: PushedBundle): Promise<void>;

  // --- idempotenza del push ----------------------------------------------
  readPushIntent(): Promise<PushIntent | null>;
  writePushIntent(intent: PushIntent | null): Promise<void>;
  listPushedBundles(): Promise<readonly PushedBundle[]>;

  // --- idempotenza del pull ----------------------------------------------
  hasSeenBundle(bundleId: string): Promise<boolean>;
  /** Quarantena: pacchetti rifiutati, da ritentare ai giri successivi. */
  listRejectedBundles(): Promise<readonly BundleRejection[]>;

  // --- applicazione atomica ----------------------------------------------
  applyIncoming(batch: IncomingBatch): Promise<void>;

  // --- lettura dello stato materializzato ---------------------------------
  readEntity(entityType: SyncEntityType, entityId: string): Promise<EntityRecord | null>;
  listEntities(entityType?: SyncEntityType): Promise<readonly EntityRecord[]>;
  /** Solo le entita' vive (tombstone escluse). */
  listLiveEntities(entityType?: SyncEntityType): Promise<readonly EntityRecord[]>;
  listTombstones(): Promise<readonly EntityRecord[]>;
  listConflicts(): Promise<readonly Conflict[]>;
  markConflictResolved(
    conflictId: string,
    chosenOperationId: OperationId,
    at: Instant,
  ): Promise<void>;
  listDeferredOperations(): Promise<readonly DeferredOperation[]>;

  // --- contatore logico ---------------------------------------------------
  readLamport(): Promise<number>;

  // --- diagnostica --------------------------------------------------------
  readLastSyncedAt(): Promise<Instant | null>;
  /** Dispositivo su cui gira questo archivio locale. */
  readDeviceId(): Promise<DeviceId | null>;
  writeDeviceId(deviceId: DeviceId): Promise<void>;

  // --- manutenzione delle tombstone --------------------------------------
  /**
   * Rimuove definitivamente le tombstone indicate.
   * Il motore la chiama SOLO dopo aver verificato la politica di
   * conservazione: vedi `TOMBSTONE_RETENTION_MS` in `protocol.ts`.
   */
  purgeTombstones(keys: readonly { entityType: SyncEntityType; entityId: string }[]): Promise<void>;
}

/** Chiave di un record. */
export function entityKey(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** Batch vuoto, da estendere con lo spread. */
export const EMPTY_BATCH: IncomingBatch = {
  appliedOperations: [],
  appliedOperationIdsOnly: [],
  entityUpdates: [],
  conflicts: [],
  deferred: [],
  seenBundles: [],
  rejectedBundles: [],
  clearedRejections: [],
  lamport: 0,
  cursor: null,
  syncedAt: null,
};
