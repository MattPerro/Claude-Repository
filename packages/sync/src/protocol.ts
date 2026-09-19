/**
 * Motore di sincronizzazione bidirezionale su Google Drive (specifica §8).
 *
 * Drive e' un **archivio di sincronizzazione**, non una destinazione di
 * esportazione. La fonte operativa resta il database locale; su Drive vanno
 * pacchetti immutabili di operazioni piu' snapshot periodici.
 *
 * ## Le quattro invarianti che questo motore non viola mai
 *
 *  1. **Il cursore avanza solo dopo la persistenza.** `pull()` scrive record,
 *     registro di idempotenza, conflitti **e** cursore in un'unica chiamata
 *     atomica (`SyncStateStore.applyIncoming`). Se la scrittura non riesce, il
 *     cursore resta indietro e il giro si ripete.
 *  2. **Un upload ritentato non crea un secondo pacchetto logico.** Prima di
 *     caricare si cerca su Drive un file con lo stesso `bundleId`: dopo una
 *     risposta persa il file c'e' gia' e non si riscrive.
 *  3. **Un errore non e' mai "archivio vuoto".** Token revocato, quota, spazio
 *     esaurito e rete assente interrompono il giro e si propagano tipizzati.
 *     Il primo recupero non conclude "non c'e' niente da recuperare".
 *  4. **Le eliminazioni non tornano indietro.** Le tombstone si conservano a
 *     lungo (vedi {@link TOMBSTONE_RETENTION_MS}) e uno snapshot non le
 *     rimuove.
 *
 * ## Ordine del primo recupero
 *
 * `getStartPageToken()` viene chiamato **prima** di scaricare lo storico.
 * Qualunque pacchetto caricato da un altro dispositivo mentre il download e'
 * in corso comparira' in `changes.list` a partire da quel cursore, quindi il
 * `pull()` immediatamente successivo lo recupera: e' impossibile perdere
 * modifiche arrivate durante il download (specifica §8.1). L'ordine inverso -
 * prima il download, poi il token - avrebbe una finestra cieca esattamente
 * larga quanto il download dello storico, cioe' il momento peggiore.
 */

import type { Clock, DeviceId, IdGenerator, Instant, WorkspaceId } from '@trackstrong/core';
import { createIdGenerator } from '@trackstrong/core';

import {
  LamportCounter,
  createOperation,
  sortOperationsCausally,
  type NewOperationInput,
  type OperationId,
  type SyncEntityType,
  type SyncOperation,
} from './operation.js';
import {
  BUNDLE_APP_KIND,
  BUNDLE_NAME_PREFIX,
  bundleAppProperties,
  bundleFileName,
  createBundle,
  parseBundle,
  serializeBundle,
  type BundleRejection,
  type OperationBundle,
} from './bundle.js';
import {
  SNAPSHOT_APP_KIND,
  createSnapshot,
  parseSnapshot,
  serializeSnapshot,
  snapshotAppProperties,
  snapshotFileName,
  type SyncSnapshot,
} from './snapshot.js';
import {
  DriveNotFoundError,
  isAccessOrTransportError,
  type DriveFileMetadata,
  type DriveStore,
} from './drive.js';
import {
  DEFAULT_RETRY_POLICY,
  withRetry,
  type RetryPolicy,
  type Sleeper,
} from './retry.js';
import { resolveIncoming, type Conflict, type EntityRecord } from './conflict.js';
import { EMPTY_BATCH, entityKey, type DeferredOperation, type IncomingBatch, type PushIntent, type SyncStateStore } from './state.js';

// ---------------------------------------------------------------------------
// Costanti di politica
// ---------------------------------------------------------------------------

/**
 * Conservazione delle tombstone: **400 giorni**.
 *
 * Perche' 400 e non 30. Il rischio da evitare e' la **resurrezione**: un
 * dispositivo rimasto offline a lungo che, riallineandosi, ripropone
 * un'operazione `upsert` su un'entita' eliminata nel frattempo. Se la
 * tombstone e' stata rimossa, quell'`upsert` viene letto come una creazione e
 * il dato eliminato **ricompare**. E' un danno silenzioso: l'utente non vede
 * un errore, vede riapparire un allenamento che aveva cancellato.
 *
 * 400 giorni coprono, con margine:
 *  - un secondo telefono usato una volta l'anno (il caso reale piu' lungo);
 *  - una stagione di inattivita' seguita dalla ripresa;
 *  - un ripristino da un backup di un anno prima.
 *
 * Il costo e' trascurabile: una tombstone e' un record di poche decine di
 * byte, e l'ordine di grandezza dei dati di TrackStrong e' migliaia di righe,
 * non milioni.
 *
 * La rimozione, quando la scadenza e' superata, e' **esplicita**
 * ({@link SyncEngine.pruneTombstones}): non avviene mai come effetto
 * collaterale di uno snapshot o di un pull.
 */
export const TOMBSTONE_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;

/**
 * Operazioni per pacchetto.
 *
 * Il divieto e' esplicito: "non creare un file remoto per ogni aggiornamento
 * del timer" (specifica §8.1). Una seduta genera facilmente centinaia di
 * operazioni (una per serie, piu' i timer): devono stare in pochi file.
 */
export const DEFAULT_MAX_OPERATIONS_PER_BUNDLE = 200;

// ---------------------------------------------------------------------------
// Errori del motore
// ---------------------------------------------------------------------------

export abstract class SyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * L'archivio locale e' collegato a un account Google diverso da quello
 * attualmente autenticato (specifica §8.3).
 *
 * Il motore **si rifiuta di sincronizzare**: nessun upload automatico sul
 * nuovo account. Caricare i dati di un account sull'altro sarebbe un
 * trasferimento involontario, potenzialmente verso un account non dell'utente.
 * Serve una conferma esplicita
 * ({@link SyncEngine.confirmAccountTransfer}).
 */
export class AccountChangedError extends SyncError {
  constructor(
    readonly linkedAccountId: string,
    readonly currentAccountId: string,
  ) {
    super(
      'Questo archivio e collegato a un altro account Google. ' +
        'Per usarlo con l account attuale serve una conferma esplicita di trasferimento: ' +
        'nessun dato viene caricato automaticamente sul nuovo account.',
    );
  }
}

/** L'archivio locale appartiene a un altro workspace. */
export class WorkspaceMismatchError extends SyncError {
  constructor(
    readonly linkedWorkspaceId: WorkspaceId,
    readonly currentWorkspaceId: WorkspaceId,
  ) {
    super(
      `Questo dispositivo e collegato all archivio ${linkedWorkspaceId}, ` +
        `non a ${currentWorkspaceId}. Sincronizzazione bloccata per non mescolare due archivi.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Stato osservabile (specifica §8.5)
// ---------------------------------------------------------------------------

export type SyncStatus =
  | 'salvato-sul-dispositivo'
  | 'modifiche-in-attesa'
  | 'sincronizzazione-in-corso'
  | 'sincronizzato'
  | 'accesso-da-rinnovare'
  | 'conflitto-da-risolvere'
  | 'spazio-esaurito'
  | 'trasferimento-da-confermare'
  | 'protocollo-non-compatibile'
  | 'errore-di-rete';

export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  'salvato-sul-dispositivo': 'Salvato sul dispositivo',
  'modifiche-in-attesa': 'Modifiche in attesa',
  'sincronizzazione-in-corso': 'Sincronizzazione in corso',
  // NB: "Sincronizzato con Drive" NON significa che gli altri dispositivi
  // abbiano gia' scaricato i dati (specifica §8.5).
  sincronizzato: 'Sincronizzato con Drive',
  'accesso-da-rinnovare': 'Accesso da rinnovare',
  'conflitto-da-risolvere': 'Conflitto da risolvere',
  'spazio-esaurito': 'Spazio su Drive esaurito',
  'trasferimento-da-confermare': 'Account Google cambiato: conferma richiesta',
  'protocollo-non-compatibile': 'Aggiorna l app per sincronizzare',
  'errore-di-rete': 'Connessione non disponibile',
};

export interface SyncState {
  readonly status: SyncStatus;
  readonly label: string;
  readonly pendingOperations: number;
  readonly deferredOperations: number;
  readonly unresolvedConflicts: number;
  readonly rejectedBundles: number;
  readonly lastSyncedAt: Instant | null;
  readonly cursor: string | null;
  readonly lastError: { readonly name: string; readonly message: string } | null;
}

// ---------------------------------------------------------------------------
// Risultati
// ---------------------------------------------------------------------------

export interface PushResult {
  readonly bundlesUploaded: number;
  /** Pacchetti gia' presenti su Drive: risposta persa riconosciuta. */
  readonly bundlesAlreadyPresent: number;
  readonly operationsSent: number;
  readonly fileNames: readonly string[];
}

export interface ApplyStats {
  readonly operationsApplied: number;
  readonly operationsSkipped: number;
  readonly operationsDeferred: number;
  readonly conflictsOpened: number;
  readonly mergedFields: number;
}

export interface PullResult extends ApplyStats {
  readonly pagesProcessed: number;
  readonly bundlesApplied: number;
  readonly bundlesSkipped: number;
  readonly rejected: readonly BundleRejection[];
  readonly cursor: string | null;
  readonly bootstrapped: boolean;
}

export interface BootstrapResult extends ApplyStats {
  /** Vero se su Drive esisteva gia' un archivio di questo workspace. */
  readonly foundRemoteArchive: boolean;
  /**
   * Vero **solo** se l'archivio remoto e' assente.
   *
   * Il chiamante genera il programma iniziale solo quando questo e' `true`:
   * "non creare un secondo programma iniziale se esiste gia' quello remoto"
   * (specifica §8.3).
   */
  readonly shouldCreateInitialProgram: boolean;
  readonly snapshotApplied: string | null;
  readonly bundlesApplied: number;
  readonly rejected: readonly BundleRejection[];
  readonly cursor: string;
}

export interface SyncOnceResult {
  readonly ok: boolean;
  readonly bootstrap: BootstrapResult | null;
  readonly push: PushResult | null;
  readonly pull: PullResult | null;
  readonly error: unknown;
}

export interface SnapshotWriteResult {
  readonly snapshotId: string;
  readonly fileId: string;
  readonly fileName: string;
  readonly entityCount: number;
  readonly tombstoneCount: number;
}

// ---------------------------------------------------------------------------
// Motore
// ---------------------------------------------------------------------------

export interface SyncEngineOptions {
  readonly deviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  /** `sub` dell'ID token Google, non l'email (l'email puo' cambiare). */
  readonly googleAccountId: string;
  readonly drive: DriveStore;
  readonly state: SyncStateStore;
  readonly clock: Clock;
  /** Porta di attesa: nei test si inietta un finto, nessuna attesa reale. */
  readonly sleeper: Sleeper;
  readonly ids?: IdGenerator;
  readonly retryPolicy?: Partial<RetryPolicy>;
  /** Sorgente del jitter. Iniettabile per rendere i test deterministici. */
  readonly random?: () => number;
  readonly maxOperationsPerBundle?: number;
}

export type LocalChangeInput = Omit<NewOperationInput, 'baseRevision' | 'causalDeps'> & {
  /** Solo per i test di regressione: normalmente la base e' quella locale. */
  readonly forceBaseRevision?: number;
};

export class SyncEngine {
  private readonly drive: DriveStore;
  private readonly store: SyncStateStore;
  private readonly clock: Clock;
  private readonly sleeper: Sleeper;
  private readonly ids: IdGenerator;
  private readonly policy: RetryPolicy;
  private readonly random: () => number;
  private readonly maxPerBundle: number;
  private lamport: LamportCounter | null = null;
  private listeners = new Set<(state: SyncState) => void>();
  private current: SyncState;
  /** Attese registrate, utile alla diagnostica e ai test. */
  readonly retryDelays: number[] = [];

  constructor(private readonly options: SyncEngineOptions) {
    this.drive = options.drive;
    this.store = options.state;
    this.clock = options.clock;
    this.sleeper = options.sleeper;
    this.ids = options.ids ?? createIdGenerator(() => options.clock.now());
    this.policy = { ...DEFAULT_RETRY_POLICY, ...options.retryPolicy };
    this.random = options.random ?? Math.random;
    this.maxPerBundle = options.maxOperationsPerBundle ?? DEFAULT_MAX_OPERATIONS_PER_BUNDLE;
    this.current = {
      status: 'salvato-sul-dispositivo',
      label: SYNC_STATUS_LABEL['salvato-sul-dispositivo'],
      pendingOperations: 0,
      deferredOperations: 0,
      unresolvedConflicts: 0,
      rejectedBundles: 0,
      lastSyncedAt: null,
      cursor: null,
      lastError: null,
    };
  }

  get deviceId(): DeviceId {
    return this.options.deviceId;
  }

  get workspaceId(): WorkspaceId {
    return this.options.workspaceId;
  }

  // -------------------------------------------------------------------------
  // Stato osservabile
  // -------------------------------------------------------------------------

  getState(): SyncState {
    return this.current;
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /** Ricalcola lo stato leggendo il magazzino. */
  async refreshState(status?: SyncStatus): Promise<SyncState> {
    const [pending, deferred, conflicts, rejected, cursor, lastSyncedAt] = await Promise.all([
      this.store.listPendingOperations(),
      this.store.listDeferredOperations(),
      this.store.listConflicts(),
      this.store.listRejectedBundles(),
      this.store.readCursor(),
      this.store.readLastSyncedAt(),
    ]);
    const open = conflicts.filter((c) => c.resolvedAt === null);
    const resolved: SyncStatus =
      status ??
      (open.length > 0
        ? 'conflitto-da-risolvere'
        : pending.length > 0
          ? 'modifiche-in-attesa'
          : lastSyncedAt !== null
            ? 'sincronizzato'
            : 'salvato-sul-dispositivo');
    this.publish({
      status: resolved,
      label: SYNC_STATUS_LABEL[resolved],
      pendingOperations: pending.length,
      deferredOperations: deferred.length,
      unresolvedConflicts: open.length,
      rejectedBundles: rejected.length,
      lastSyncedAt,
      cursor,
      lastError: status === undefined ? null : this.current.lastError,
    });
    return this.current;
  }

  private publish(next: SyncState): void {
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  private noteError(error: unknown): void {
    const status: SyncStatus =
      error instanceof AccountChangedError
        ? 'trasferimento-da-confermare'
        : errorStatus(error);
    this.publish({
      ...this.current,
      status,
      label: SYNC_STATUS_LABEL[status],
      lastError:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'Error', message: String(error) },
    });
  }

  // -------------------------------------------------------------------------
  // Account (specifica §8.3)
  // -------------------------------------------------------------------------

  /**
   * Verifica il collegamento prima di qualunque accesso alla rete.
   *
   * Al primo uso registra l'account. Se l'account e' cambiato **non** carica
   * nulla: solleva {@link AccountChangedError}.
   */
  private async ensureAccount(): Promise<void> {
    const linked = await this.store.readLinkedAccount();
    if (linked === null) {
      await this.store.writeLinkedAccount({
        googleAccountId: this.options.googleAccountId,
        workspaceId: this.options.workspaceId,
        linkedAt: this.clock.now(),
      });
      await this.store.writeDeviceId(this.options.deviceId);
      return;
    }
    if (linked.googleAccountId !== this.options.googleAccountId) {
      const error = new AccountChangedError(
        linked.googleAccountId,
        this.options.googleAccountId,
      );
      this.noteError(error);
      throw error;
    }
    if (linked.workspaceId !== this.options.workspaceId) {
      const error = new WorkspaceMismatchError(linked.workspaceId, this.options.workspaceId);
      this.noteError(error);
      throw error;
    }
  }

  /**
   * Conferma esplicita del trasferimento su un altro account Google.
   *
   * L'unico modo di ricollegare l'archivio. Va invocato solo dopo che l'utente
   * ha visto e accettato gli effetti (specifica §8.3 e §14: "il ripristino non
   * sovrascrive immediatamente gli altri dispositivi: mostra gli effetti e
   * chiedi conferma").
   *
   * Il cursore **non** viene azzerato qui: se l'utente conferma il
   * trasferimento, il nuovo archivio remoto e' vuoto e il primo `pull()`
   * ripartira' da `bootstrap()` solo se il cursore e' assente. Il chiamante
   * decide se ripartire da zero (`resetForNewArchive`) o proseguire.
   */
  async confirmAccountTransfer(googleAccountId: string): Promise<void> {
    await this.store.writeLinkedAccount({
      googleAccountId,
      workspaceId: this.options.workspaceId,
      linkedAt: this.clock.now(),
    });
    await this.refreshState();
  }

  // -------------------------------------------------------------------------
  // Registrazione di una modifica locale
  // -------------------------------------------------------------------------

  /**
   * Registra una modifica locale: crea l'operazione, la applica allo stato
   * materializzato e la accoda per l'invio, **in un'unica scrittura**
   * (specifica §7: stessa transazione per dato e operazione).
   *
   * Funziona identico offline: la rete non viene toccata.
   */
  async recordLocalChange(input: LocalChangeInput): Promise<SyncOperation> {
    const lamport = await this.lamportCounter();
    const current = await this.store.readEntity(input.entityType, input.entityId);
    const baseRevision = input.forceBaseRevision ?? current?.revision ?? 0;
    const causalDeps = current === null ? [] : [current.lastOperationId];
    const op = createOperation(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        kind: input.kind,
        baseRevision,
        payload: input.payload ?? null,
        causalDeps,
        ...(input.formatVersion === undefined ? {} : { formatVersion: input.formatVersion }),
      },
      {
        origin: this.options.deviceId,
        workspaceId: this.options.workspaceId,
        newId: () => this.ids.newId(),
        now: () => this.clock.now(),
        lamport,
      },
    );
    const resolution = resolveIncoming({
      incoming: op,
      current,
      localDeviceId: this.options.deviceId,
      workspaceId: this.options.workspaceId,
      now: this.clock.now(),
      newConflictId: () => this.ids.newId(),
      siblings: [],
    });
    await this.store.enqueueLocal(op, resolution.record);
    await this.refreshState();
    return op;
  }

  // -------------------------------------------------------------------------
  // Push
  // -------------------------------------------------------------------------

  /**
   * Carica le operazioni in attesa, raggruppate in pacchetti.
   *
   * Le operazioni vengono marcate come inviate **solo dopo** la conferma del
   * caricamento. Un upload ritentato dopo una risposta persa non crea un
   * secondo pacchetto logico: prima di caricare si cerca su Drive un file con
   * lo stesso `bundleId`.
   */
  async push(): Promise<PushResult> {
    await this.ensureAccount();
    await this.refreshState('sincronizzazione-in-corso');
    const result = { uploaded: 0, alreadyPresent: 0, sent: 0, names: [] as string[] };
    try {
      // 1. Chiude un intento rimasto aperto da un tentativo precedente.
      const pendingIntent = await this.store.readPushIntent();
      if (pendingIntent !== null) await this.completePush(pendingIntent, result);

      // 2. Nuovi pacchetti, finche' la coda e' vuota.
      for (;;) {
        const pending = await this.store.listPendingOperations();
        if (pending.length === 0) break;
        // L'ordine causale rende il pacchetto applicabile da solo quando
        // possibile: chi lo riceve non deve attendere un pacchetto successivo.
        const chunk = sortOperationsCausally(pending).slice(0, this.maxPerBundle);
        const bundle = createBundle({
          bundleId: this.ids.newId(),
          originDeviceId: this.options.deviceId,
          workspaceId: this.options.workspaceId,
          operations: chunk,
          createdAt: this.clock.now(),
        });
        const intent: PushIntent = {
          bundleId: bundle.bundleId,
          operationIds: chunk.map((op) => op.id),
          fileName: bundleFileName(bundle),
          content: serializeBundle(bundle),
          appProperties: bundleAppProperties(bundle),
          createdAt: this.clock.now(),
          attempts: 0,
        };
        // L'intento si scrive PRIMA dell'upload: e' cio' che permette al
        // retry di riusare lo stesso `bundleId` invece di generarne un altro.
        await this.store.writePushIntent(intent);
        await this.completePush(intent, result);
      }
      await this.refreshState();
      return {
        bundlesUploaded: result.uploaded,
        bundlesAlreadyPresent: result.alreadyPresent,
        operationsSent: result.sent,
        fileNames: result.names,
      };
    } catch (error) {
      this.noteError(error);
      throw error;
    }
  }

  private async completePush(
    intent: PushIntent,
    result: { uploaded: number; alreadyPresent: number; sent: number; names: string[] },
  ): Promise<void> {
    let uploadedNow = false;
    let foundExisting = false;
    const fileId = await withRetry(
      async () => {
        // Verifica per `bundleId`, non per nome: il nome non e' unico in Drive
        // (vedi bundle.ts). Se il pacchetto c'e' gia', l'upload precedente era
        // andato a buon fine e solo la risposta si e' persa.
        const existing = await this.drive.listFiles({
          appProperties: { bundleId: intent.bundleId },
        });
        const already = existing.find((f) => !f.trashed);
        if (already !== undefined) {
          foundExisting = true;
          return already.id;
        }
        const uploaded = await this.drive.uploadFile({
          name: intent.fileName,
          content: intent.content,
          appProperties: intent.appProperties,
        });
        uploadedNow = true;
        return uploaded.fileId;
      },
      this.retryContext(),
    );

    // Conferma prima, pulizia dell'intento dopo: se il processo muore in
    // mezzo, al riavvio si ritrova l'intento, si ritrova il file su Drive e
    // non si carica nulla di nuovo.
    await this.store.markOperationsSent({
      bundleId: intent.bundleId,
      fileId,
      operationIds: intent.operationIds,
      confirmedAt: this.clock.now(),
    });
    await this.store.writePushIntent(null);

    if (foundExisting && !uploadedNow) result.alreadyPresent += 1;
    else result.uploaded += 1;
    result.sent += intent.operationIds.length;
    result.names.push(intent.fileName);
  }

  // -------------------------------------------------------------------------
  // Pull
  // -------------------------------------------------------------------------

  /**
   * Scarica e applica le modifiche remote.
   *
   * Il cursore avanza **una pagina alla volta e solo dopo** la persistenza:
   * `applyIncoming` scrive dati e cursore insieme. Se la persistenza fallisce,
   * il cursore resta al valore precedente e il giro successivo ripete la
   * stessa pagina (specifica §8.1).
   */
  async pull(): Promise<PullResult> {
    await this.ensureAccount();
    await this.refreshState('sincronizzazione-in-corso');
    let bootstrapped = false;
    try {
      const stored = await this.store.readCursor();
      let cursor: string;
      if (stored === null) {
        // Nessun cursore: e' una nuova installazione. Il recupero prende il
        // token PRIMA di scaricare lo storico.
        const boot = await this.bootstrap();
        cursor = boot.cursor;
        bootstrapped = true;
      } else {
        cursor = stored;
      }

      const totals = {
        pages: 0,
        bundles: 0,
        skipped: 0,
        applied: 0,
        opSkipped: 0,
        deferred: 0,
        conflicts: 0,
        merged: 0,
      };
      const rejected: BundleRejection[] = [];

      for (;;) {
        const page = await withRetry(() => this.drive.listChanges(cursor), this.retryContext());
        const nextCursor = page.nextPageToken ?? page.newStartPageToken ?? cursor;

        // Oltre alla pagina corrente si ritentano i pacchetti in quarantena:
        // un rifiuto per download interrotto e' transitorio, e il cursore e'
        // gia' avanzato oltre il loro cambiamento.
        const quarantena = (await this.store.listRejectedBundles())
          .map((r) => r.fileId)
          .filter((id): id is string => id !== undefined);
        const collected = await this.collectBundles(page.changes, quarantena);
        rejected.push(...collected.rejected);
        totals.bundles += collected.bundles.length;
        totals.skipped += collected.skipped;

        const incoming = collected.bundles.flatMap((b) => b.operations);
        const outcome = await this.applyOperations(incoming, {
          seed: [],
          seenBundles: collected.bundles.map((b) => ({
            bundleId: b.bundleId,
            fileId: collected.fileIdOf.get(b.bundleId) ?? '',
          })),
          rejectedBundles: collected.rejected,
          clearedRejections: collected.cleared,
          cursor: nextCursor,
          markSynced: true,
        });
        totals.pages += 1;
        totals.applied += outcome.operationsApplied;
        totals.opSkipped += outcome.operationsSkipped;
        totals.deferred += outcome.operationsDeferred;
        totals.conflicts += outcome.conflictsOpened;
        totals.merged += outcome.mergedFields;

        // Il cursore in memoria avanza SOLO adesso, cioe' dopo che
        // `applyOperations` ha completato `applyIncoming`. Se quella avesse
        // lanciato, saremmo gia' usciti da qui per eccezione.
        cursor = nextCursor;
        if (page.nextPageToken === null) break;
      }

      await this.refreshState();
      return {
        pagesProcessed: totals.pages,
        bundlesApplied: totals.bundles,
        bundlesSkipped: totals.skipped,
        operationsApplied: totals.applied,
        operationsSkipped: totals.opSkipped,
        operationsDeferred: totals.deferred,
        conflictsOpened: totals.conflicts,
        mergedFields: totals.merged,
        rejected,
        cursor,
        bootstrapped,
      };
    } catch (error) {
      this.noteError(error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Primo recupero
  // -------------------------------------------------------------------------

  /**
   * Primo recupero su una nuova installazione (specifica §8.3).
   *
   * Ordine, e il motivo di ogni passo:
   *
   *  1. `getStartPageToken()` **per primo**. Da questo istante ogni pacchetto
   *     caricato da un altro dispositivo e' visibile in `changes.list`: il
   *     download dello storico non ha una finestra cieca.
   *  2. Elenco di snapshot e pacchetti. Se l'elenco e' vuoto **e non ci sono
   *     stati errori**, l'archivio remoto e' davvero assente. Un errore di
   *     autorizzazione, di quota o di rete arriva qui come eccezione e
   *     interrompe tutto: non viene mai letto come "archivio vuoto".
   *  3. Applicazione dello snapshot piu' recente, poi di tutti i pacchetti.
   *  4. Scrittura atomica di dati **e** cursore.
   *
   * Dopo questo, `pull()` recupera cio' che e' arrivato durante il download.
   */
  async bootstrap(): Promise<BootstrapResult> {
    await this.ensureAccount();
    await this.refreshState('sincronizzazione-in-corso');
    try {
      // 1. Prima il cursore. Vedi il commento in testa al file.
      const startPageToken = await withRetry(
        () => this.drive.getStartPageToken(),
        this.retryContext(),
      );

      // 2. Inventario remoto.
      const snapshotFiles = await withRetry(
        () =>
          this.drive.listFiles({
            appProperties: { kind: SNAPSHOT_APP_KIND, workspaceId: this.options.workspaceId },
          }),
        this.retryContext(),
      );
      const bundleFiles = await withRetry(
        () =>
          this.drive.listFiles({
            namePrefix: BUNDLE_NAME_PREFIX,
            appProperties: { kind: BUNDLE_APP_KIND, workspaceId: this.options.workspaceId },
          }),
        this.retryContext(),
      );
      const foundRemoteArchive = snapshotFiles.length > 0 || bundleFiles.length > 0;

      const rejected: BundleRejection[] = [];

      // 3a. Snapshot piu' recente per contatore logico (non per orologio).
      let snapshot: SyncSnapshot | null = null;
      for (const file of [...snapshotFiles].sort(byLamportDesc)) {
        const text = await withRetry(
          () => this.drive.downloadFile(file.id),
          this.retryContext(),
        );
        const parsed = parseSnapshot(text, { workspaceId: this.options.workspaceId });
        if (parsed.ok) {
          snapshot = parsed.snapshot;
          break;
        }
        // Snapshot corrotto o troppo recente: si prova il precedente, e in
        // ultima istanza si recupera dai soli pacchetti. Nulla viene perso.
      }

      // 3b. Tutti i pacchetti. Lo snapshot non li sostituisce.
      const bundles: OperationBundle[] = [];
      const fileIdOf = new Map<string, string>();
      for (const file of [...bundleFiles].sort(byLamportAsc)) {
        if (file.trashed) continue;
        const text = await withRetry(
          () => this.drive.downloadFile(file.id),
          this.retryContext(),
        );
        const parsed = parseBundle(text, { workspaceId: this.options.workspaceId });
        if (!parsed.ok) {
          rejected.push({ ...parsed.rejection, fileId: file.id });
          continue;
        }
        bundles.push(parsed.bundle);
        fileIdOf.set(parsed.bundle.bundleId, file.id);
      }

      // 4. Applicazione e scrittura atomica.
      const incoming = bundles.flatMap((b) => b.operations);
      const outcome = await this.applyOperations(incoming, {
        seed: snapshot?.entities ?? [],
        seedAppliedIds: snapshot?.appliedOperationIds ?? [],
        seedConflicts: snapshot?.openConflicts ?? [],
        seedLamport: snapshot?.lamport ?? 0,
        seenBundles: bundles.map((b) => ({
          bundleId: b.bundleId,
          fileId: fileIdOf.get(b.bundleId) ?? '',
        })),
        rejectedBundles: rejected,
        cursor: startPageToken,
        markSynced: foundRemoteArchive,
      });

      await this.refreshState();
      return {
        foundRemoteArchive,
        shouldCreateInitialProgram: !foundRemoteArchive,
        snapshotApplied: snapshot?.snapshotId ?? null,
        bundlesApplied: bundles.length,
        rejected,
        cursor: startPageToken,
        operationsApplied: outcome.operationsApplied,
        operationsSkipped: outcome.operationsSkipped,
        operationsDeferred: outcome.operationsDeferred,
        conflictsOpened: outcome.conflictsOpened,
        mergedFields: outcome.mergedFields,
      };
    } catch (error) {
      this.noteError(error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Un giro completo
  // -------------------------------------------------------------------------

  /**
   * Un giro: eventuale primo recupero, poi push, poi pull.
   *
   * Il recupero precede il push: su una nuova installazione va prima
   * riconosciuto l'archivio remoto, altrimenti si rischia di caricare un
   * secondo programma iniziale (specifica §8.3).
   *
   * Non lancia: raccoglie l'errore nel risultato e aggiorna lo stato
   * osservabile, perche' un problema di rete **non** deve interrompere l'uso
   * dell'app (specifica §8.5).
   */
  async syncOnce(): Promise<SyncOnceResult> {
    let bootstrap: BootstrapResult | null = null;
    let push: PushResult | null = null;
    let pull: PullResult | null = null;
    try {
      if ((await this.store.readCursor()) === null) bootstrap = await this.bootstrap();
      push = await this.push();
      pull = await this.pull();
      return { ok: true, bootstrap, push, pull, error: null };
    } catch (error) {
      this.noteError(error);
      return { ok: false, bootstrap, push, pull, error };
    }
  }

  // -------------------------------------------------------------------------
  // Snapshot
  // -------------------------------------------------------------------------

  /**
   * Scrive uno snapshot per velocizzare il recupero.
   *
   * Non cancella nessun pacchetto e **non rimuove nessuna tombstone**: le
   * tombstone entro la politica di conservazione fanno parte dello snapshot,
   * altrimenti un dispositivo che recupera da qui non saprebbe che un dato e'
   * stato eliminato e lo farebbe ricomparire.
   */
  async writeSnapshot(): Promise<SnapshotWriteResult> {
    await this.ensureAccount();
    try {
      const entities = await this.store.listEntities();
      const appliedOperationIds = await this.store.listAppliedOperationIds();
      const conflicts = (await this.store.listConflicts()).filter((c) => c.resolvedAt === null);
      const snapshot = createSnapshot({
        snapshotId: this.ids.newId(),
        originDeviceId: this.options.deviceId,
        workspaceId: this.options.workspaceId,
        createdAt: this.clock.now(),
        lamport: await this.store.readLamport(),
        entities,
        appliedOperationIds,
        openConflicts: conflicts,
      });
      const fileName = snapshotFileName(snapshot);
      const uploaded = await withRetry(
        () =>
          this.drive.uploadFile({
            name: fileName,
            content: serializeSnapshot(snapshot),
            appProperties: snapshotAppProperties(snapshot),
          }),
        this.retryContext(),
      );
      await this.refreshState();
      return {
        snapshotId: snapshot.snapshotId,
        fileId: uploaded.fileId,
        fileName,
        entityCount: snapshot.entityCount,
        tombstoneCount: snapshot.tombstoneCount,
      };
    } catch (error) {
      this.noteError(error);
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Tombstone
  // -------------------------------------------------------------------------

  /**
   * Rimuove le tombstone oltre {@link TOMBSTONE_RETENTION_MS}.
   *
   * Operazione **esplicita**: non avviene come effetto collaterale di un pull
   * ne' di uno snapshot. Una tombstone rimossa troppo presto fa ricomparire
   * dati eliminati (specifica §8.1).
   */
  async pruneTombstones(): Promise<readonly { entityType: SyncEntityType; entityId: string }[]> {
    const now = this.clock.now();
    const expired = (await this.store.listTombstones())
      .filter((t) => t.deletedAt !== null && now - t.deletedAt > TOMBSTONE_RETENTION_MS)
      .map((t) => ({ entityType: t.entityType, entityId: t.entityId }));
    if (expired.length > 0) await this.store.purgeTombstones(expired);
    return expired;
  }

  // -------------------------------------------------------------------------
  // Conflitti e operazioni in attesa
  // -------------------------------------------------------------------------

  /**
   * Risolve un conflitto scegliendo una delle alternative **conservate**.
   *
   * La scelta genera una nuova operazione locale: e' cosi' che la decisione si
   * propaga agli altri dispositivi invece di restare locale. L'alternativa non
   * scelta resta nella tabella dei conflitti come storia della decisione: non
   * viene cancellata.
   */
  async resolveConflict(conflictId: string, chosenOperationId: OperationId): Promise<void> {
    const conflict = (await this.store.listConflicts()).find((c) => c.id === conflictId);
    if (conflict === undefined) throw new Error(`Conflitto ${conflictId} inesistente.`);
    const choice = conflict.alternatives.find((a) => a.operationId === chosenOperationId);
    if (choice === undefined) {
      throw new Error(`Alternativa ${chosenOperationId} non presente nel conflitto ${conflictId}.`);
    }
    const record = await this.store.readEntity(conflict.entityType, conflict.entityId);

    if (conflict.reason === 'stesso-campo-divergente' && conflict.field !== null) {
      const current = record?.fields[conflict.field];
      if (!Object.is(current, choice.value)) {
        await this.recordLocalChange({
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          kind: 'upsert',
          payload: { [conflict.field]: choice.value },
        });
      }
    } else if (conflict.reason === 'modifica-vs-eliminazione') {
      if (choice.kind === 'delete' && record !== null && !record.deleted) {
        await this.recordLocalChange({
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          kind: 'delete',
        });
      } else if (choice.kind === 'upsert' && typeof choice.value === 'object' && choice.value !== null) {
        await this.recordLocalChange({
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          kind: 'upsert',
          payload: choice.value as Record<string, unknown>,
        });
      }
    }
    // Per 'revisioni-concorrenti-programma' e 'seduta-in-corso' non serve una
    // nuova operazione: le alternative coesistono gia'. La scelta viene solo
    // registrata.
    await this.store.markConflictResolved(conflictId, chosenOperationId, this.clock.now());
    await this.refreshState();
  }

  /**
   * Applica un'operazione rimasta in attesa di conferma (tipicamente una
   * modifica remota su una seduta in corso, specifica §8.2).
   */
  async confirmDeferredOperation(operationId: OperationId): Promise<ApplyStats> {
    const deferred = await this.store.listDeferredOperations();
    const target = deferred.find((d) => d.operation.id === operationId);
    if (target === undefined) throw new Error(`Operazione ${operationId} non e in attesa.`);
    const others = deferred.filter((d) => d.operation.id !== operationId);
    const outcome = await this.applyOperations([target.operation], {
      seed: [],
      seenBundles: [],
      rejectedBundles: [],
      cursor: null,
      markSynced: false,
      keepDeferred: others,
      // La conferma dell'utente sospende la protezione della seduta in corso
      // per questa singola operazione.
      bypassActiveSessionGuard: true,
    });
    await this.refreshState();
    return outcome;
  }

  // -------------------------------------------------------------------------
  // Motore di applicazione
  // -------------------------------------------------------------------------

  private async applyOperations(
    incoming: readonly SyncOperation[],
    options: {
      readonly seed: readonly EntityRecord[];
      readonly seedAppliedIds?: readonly OperationId[];
      readonly seedConflicts?: readonly Conflict[];
      readonly seedLamport?: number;
      readonly seenBundles: readonly { bundleId: string; fileId: string }[];
      readonly rejectedBundles: readonly BundleRejection[];
      readonly clearedRejections?: readonly string[];
      readonly cursor: string | null;
      readonly markSynced: boolean;
      readonly keepDeferred?: readonly DeferredOperation[];
      readonly bypassActiveSessionGuard?: boolean;
    },
  ): Promise<ApplyStats> {
    const now = this.clock.now();
    const lamport = await this.lamportCounter();
    if (options.seedLamport !== undefined) lamport.observe(options.seedLamport);

    // Sovrapposizione in memoria dello stato materializzato: piu' operazioni
    // dello stesso giro possono toccare la stessa entita'.
    const overlay = new Map<string, EntityRecord>();
    for (const record of options.seed) overlay.set(entityKey(record.entityType, record.entityId), record);

    const appliedNow = new Set<OperationId>(options.seedAppliedIds ?? []);
    const appliedCache = new Map<OperationId, boolean>();
    const isApplied = async (id: OperationId): Promise<boolean> => {
      if (appliedNow.has(id)) return true;
      const cached = appliedCache.get(id);
      if (cached !== undefined) return cached;
      const found = await this.store.hasAppliedOperation(id);
      appliedCache.set(id, found);
      return found;
    };

    const readRecord = async (
      entityType: SyncEntityType,
      entityId: string,
    ): Promise<EntityRecord | null> => {
      const key = entityKey(entityType, entityId);
      const cached = overlay.get(key);
      if (cached !== undefined) return cached;
      const stored = await this.store.readEntity(entityType, entityId);
      if (stored !== null) overlay.set(key, stored);
      return stored;
    };

    const appliedOperations: SyncOperation[] = [];
    const entityUpdates = new Map<string, EntityRecord>();
    const conflicts: Conflict[] = [];
    const deferred: DeferredOperation[] = [...(options.keepDeferred ?? [])];

    // Chiavi dei conflitti gia' materializzati: un'operazione che resta in
    // attesa non deve creare un conflitto nuovo a ogni giro.
    const existingConflictKeys = new Set(
      [...(await this.store.listConflicts()), ...(options.seedConflicts ?? [])].map(conflictKey),
    );

    let skipped = 0;
    let merged = 0;

    // Le operazioni gia' in attesa rientrano nel giro: e' cosi' che una
    // ricezione fuori ordine si ricompone quando arriva il pezzo mancante.
    const previouslyDeferred =
      options.keepDeferred === undefined ? await this.store.listDeferredOperations() : [];
    const pool = dedupeById([...previouslyDeferred.map((d) => d.operation), ...incoming]);

    let pending = sortOperationsCausally(pool);
    let progress = true;
    while (progress && pending.length > 0) {
      progress = false;
      const stillPending: SyncOperation[] = [];
      for (const op of pending) {
        if (await isApplied(op.id)) {
          // Idempotenza: riapplicare un'operazione e' un no-op (specifica §8.1).
          skipped += 1;
          continue;
        }
        lamport.observe(op.lamport);

        // Dipendenze causali non ancora applicate: ricezione fuori ordine.
        let missing = false;
        for (const dep of op.causalDeps) {
          if (!(await isApplied(dep))) {
            missing = true;
            break;
          }
        }
        if (missing) {
          stillPending.push(op);
          continue;
        }

        const current = await readRecord(op.entityType, op.entityId);
        const siblings =
          op.entityType === 'programPlan'
            ? await this.programPlanSiblings(overlay, op.entityId)
            : [];

        const guarded =
          options.bypassActiveSessionGuard === true && current !== null
            ? stripActiveStatus(current)
            : current;

        const resolution = resolveIncoming({
          incoming: op,
          current: guarded,
          localDeviceId: this.options.deviceId,
          workspaceId: this.options.workspaceId,
          now,
          newConflictId: () => this.ids.newId(),
          siblings,
        });

        if (resolution.kind === 'in-attesa') {
          if (resolution.reason === 'seduta-in-corso') {
            deferred.push({ operation: op, reason: 'seduta-in-corso', receivedAt: now });
            for (const c of resolution.conflicts) {
              if (!existingConflictKeys.has(conflictKey(c))) {
                existingConflictKeys.add(conflictKey(c));
                conflicts.push(c);
              }
            }
            progress = true; // l'operazione e' stata classificata, non riprovarla
          } else {
            stillPending.push(op);
          }
          continue;
        }

        if (resolution.record !== null) {
          const key = entityKey(resolution.record.entityType, resolution.record.entityId);
          overlay.set(key, resolution.record);
          entityUpdates.set(key, resolution.record);
        }
        for (const c of resolution.conflicts) {
          if (!existingConflictKeys.has(conflictKey(c))) {
            existingConflictKeys.add(conflictKey(c));
            conflicts.push(c);
          }
        }
        merged += resolution.mergedFields.length;
        if (resolution.markApplied) {
          appliedNow.add(op.id);
          appliedOperations.push(op);
        }
        progress = true;
      }
      pending = stillPending;
    }

    // Quel che resta non e' applicabile: attende le operazioni mancanti.
    for (const op of pending) {
      deferred.push({ operation: op, reason: 'dipendenze-mancanti', receivedAt: now });
    }

    const batch: IncomingBatch = {
      ...EMPTY_BATCH,
      appliedOperations,
      appliedOperationIdsOnly: options.seedAppliedIds ?? [],
      entityUpdates: [...entityUpdates.values(), ...seedNotTouched(options.seed, entityUpdates)],
      conflicts,
      deferred,
      seenBundles: options.seenBundles,
      rejectedBundles: options.rejectedBundles,
      clearedRejections: options.clearedRejections ?? [],
      lamport: lamport.current(),
      cursor: options.cursor,
      syncedAt: options.markSynced ? now : null,
    };

    // Unica scrittura atomica: dati, registro, conflitti E cursore.
    await this.store.applyIncoming(batch);

    return {
      operationsApplied: appliedOperations.length,
      operationsSkipped: skipped,
      operationsDeferred: deferred.length,
      conflictsOpened: conflicts.length,
      mergedFields: merged,
    };
  }

  private async programPlanSiblings(
    overlay: Map<string, EntityRecord>,
    excludeEntityId: string,
  ): Promise<readonly EntityRecord[]> {
    const stored = await this.store.listEntities('programPlan');
    const byKey = new Map<string, EntityRecord>();
    for (const record of stored) byKey.set(entityKey('programPlan', record.entityId), record);
    for (const [key, record] of overlay) {
      if (record.entityType === 'programPlan') byKey.set(key, record);
    }
    return [...byKey.values()].filter((r) => r.entityId !== excludeEntityId);
  }

  // -------------------------------------------------------------------------
  // Lettura dei pacchetti dai cambiamenti
  // -------------------------------------------------------------------------

  private async collectBundles(
    changes: readonly { fileId: string; removed: boolean; file: DriveFileMetadata | null }[],
    retryFileIds: readonly string[] = [],
  ): Promise<{
    bundles: readonly OperationBundle[];
    rejected: readonly BundleRejection[];
    cleared: readonly string[];
    skipped: number;
    fileIdOf: Map<string, string>;
  }> {
    const bundles: OperationBundle[] = [];
    const rejected: BundleRejection[] = [];
    const cleared: string[] = [];
    const fileIdOf = new Map<string, string>();
    const visited = new Set<string>();
    let skipped = 0;

    // Prima la quarantena: se un pacchetto rifiutato per un download
    // interrotto arriva integro, va applicato e togliere dalla quarantena.
    for (const fileId of retryFileIds) {
      visited.add(fileId);
      let text: string;
      try {
        text = await withRetry(() => this.drive.downloadFile(fileId), this.retryContext());
      } catch (error) {
        // File scomparso: resta in quarantena solo se e' un problema di
        // integrita'; se non esiste piu' non c'e' nulla da ritentare.
        if (error instanceof DriveNotFoundError) {
          cleared.push(fileId);
          continue;
        }
        throw error;
      }
      const parsed = parseBundle(text, { workspaceId: this.options.workspaceId });
      if (!parsed.ok) {
        rejected.push({ ...parsed.rejection, fileId });
        continue;
      }
      if (await this.store.hasSeenBundle(parsed.bundle.bundleId)) {
        cleared.push(fileId);
        continue;
      }
      bundles.push(parsed.bundle);
      fileIdOf.set(parsed.bundle.bundleId, fileId);
      cleared.push(fileId);
    }

    // I cambiamenti possono arrivare in qualunque ordine. Si ordina per
    // `lamportMax` dichiarato nelle proprieta' del file: e' un'euristica utile
    // (riduce le attese), non una garanzia. La correttezza dipende dalle
    // dipendenze causali, non dall'ordine di arrivo.
    const ordered = [...changes].sort((a, b) => {
      const la = Number(a.file?.appProperties['lamportMax'] ?? '0');
      const lb = Number(b.file?.appProperties['lamportMax'] ?? '0');
      return la - lb;
    });

    for (const change of ordered) {
      if (change.removed || change.file === null) {
        // Un file rimosso su Drive NON e' un'eliminazione di dati: le
        // eliminazioni viaggiano come operazioni `delete`. Ignorare qui e'
        // deliberato.
        skipped += 1;
        continue;
      }
      const file = change.file;
      if (visited.has(file.id)) {
        skipped += 1;
        continue;
      }
      if (file.trashed) {
        skipped += 1;
        continue;
      }
      const props = file.appProperties;
      if (props['kind'] !== BUNDLE_APP_KIND) {
        skipped += 1;
        continue;
      }
      if (props['workspaceId'] !== this.options.workspaceId) {
        skipped += 1;
        continue;
      }
      const bundleId = props['bundleId'];
      if (bundleId === undefined) {
        skipped += 1;
        continue;
      }
      // De-duplicazione sull'`id` del pacchetto, non sul nome del file.
      // Due controlli, perche' il duplicato puo' essere sia gia' applicato in
      // passato sia presente due volte nella **stessa** pagina: in Drive due
      // `files.create` con lo stesso nome producono due file distinti.
      if (fileIdOf.has(bundleId) || (await this.store.hasSeenBundle(bundleId))) {
        skipped += 1;
        continue;
      }
      const text = await withRetry(() => this.drive.downloadFile(file.id), this.retryContext());
      const parsed = parseBundle(text, { workspaceId: this.options.workspaceId });
      if (!parsed.ok) {
        // Pacchetto rifiutato: NON si tocca nulla in locale. Va in quarantena
        // col riferimento al file, cosi' il prossimo pull lo ritenta (un
        // download interrotto e' transitorio), e si prosegue con gli altri
        // (specifica §14).
        rejected.push({ ...parsed.rejection, fileId: file.id });
        continue;
      }
      bundles.push(parsed.bundle);
      fileIdOf.set(parsed.bundle.bundleId, file.id);
    }
    return { bundles, rejected, cleared, skipped, fileIdOf };
  }

  // -------------------------------------------------------------------------
  // Utilita'
  // -------------------------------------------------------------------------

  private retryContext(): {
    policy: RetryPolicy;
    sleeper: Sleeper;
    random: () => number;
    onRetry: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  } {
    return {
      policy: this.policy,
      sleeper: this.sleeper,
      random: this.random,
      onRetry: (info) => {
        this.retryDelays.push(info.delayMs);
      },
    };
  }

  private async lamportCounter(): Promise<LamportCounter> {
    if (this.lamport === null) this.lamport = new LamportCounter(await this.store.readLamport());
    return this.lamport;
  }
}

// ---------------------------------------------------------------------------
// Funzioni di supporto
// ---------------------------------------------------------------------------

function errorStatus(error: unknown): SyncStatus {
  const name = error instanceof Error ? error.name : '';
  if (name === 'DriveAuthError') return 'accesso-da-rinnovare';
  if (name === 'DriveStorageFullError') return 'spazio-esaurito';
  if (name === 'DriveQuotaError' || name === 'DriveRateLimitError') return 'errore-di-rete';
  if (name === 'DriveNetworkError') return 'errore-di-rete';
  if (isAccessOrTransportError(error)) return 'errore-di-rete';
  return 'modifiche-in-attesa';
}

function conflictKey(conflict: Conflict): string {
  const ids = conflict.alternatives.map((a) => a.operationId).sort().join('|');
  return `${conflict.entityType}:${conflict.entityId}:${conflict.field ?? '-'}:${conflict.reason}:${ids}`;
}

function dedupeById(ops: readonly SyncOperation[]): readonly SyncOperation[] {
  const seen = new Map<OperationId, SyncOperation>();
  for (const op of ops) if (!seen.has(op.id)) seen.set(op.id, op);
  return [...seen.values()];
}

/**
 * Record arrivati da uno snapshot e mai toccati dai pacchetti: vanno scritti
 * comunque, altrimenti il recupero perderebbe le entita' presenti solo nello
 * snapshot (per esempio quelle i cui pacchetti sono stati potati).
 */
function seedNotTouched(
  seed: readonly EntityRecord[],
  touched: Map<string, EntityRecord>,
): readonly EntityRecord[] {
  return seed.filter((r) => !touched.has(entityKey(r.entityType, r.entityId)));
}

/**
 * Sospende la protezione della seduta in corso per una singola operazione, su
 * conferma esplicita dell'utente. Non modifica lo stato persistito: e' una
 * vista temporanea usata solo per la valutazione della regola.
 */
function stripActiveStatus(record: EntityRecord): EntityRecord {
  if (record.entityType !== 'session' || record.fields['status'] !== 'active') return record;
  return { ...record, fields: { ...record.fields, status: 'paused' } };
}

function byLamportDesc(a: DriveFileMetadata, b: DriveFileMetadata): number {
  return lamportOf(b) - lamportOf(a);
}

function byLamportAsc(a: DriveFileMetadata, b: DriveFileMetadata): number {
  return lamportOf(a) - lamportOf(b);
}

function lamportOf(file: DriveFileMetadata): number {
  return Number(file.appProperties['lamport'] ?? file.appProperties['lamportMax'] ?? '0');
}
