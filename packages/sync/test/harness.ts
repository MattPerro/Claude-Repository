/**
 * Attrezzatura condivisa dei test di `@trackstrong/sync`.
 *
 * Tre regole rispettate da tutti i test di questo pacchetto:
 *
 *  1. **Nessuna attesa reale.** L'orologio e' un {@link FakeClock} e le attese
 *     passano da {@link FakeSleeper}, che registra i ritardi e ritorna subito.
 *  2. **Solo dati sintetici** (specifica §14: "dati sintetici per test e
 *     screenshot condivisi"). Nessun dato personale, nessuna misura reale.
 *  3. **Nessuna rete.** Drive e' il finto in memoria, che NON e' una verifica
 *     contro i server reali di Google.
 */

import { FakeClock, createIdGenerator, seededRandom } from '@trackstrong/core';
import {
  LamportCounter,
  SyncEngine,
  bundleAppProperties,
  bundleFileName,
  canonicalJson,
  createBundle,
  createOperation,
  serializeBundle,
  type DriveChangesPage,
  type DriveFileMetadata,
  type DriveQuery,
  type DriveStore,
  type DriveUploadRequest,
  type DriveUploadResult,
  type NewOperationInput,
  type SyncOperation,
} from '../src/index.js';
import {
  FakeSleeper,
  InMemoryDriveBackend,
  InMemoryDriveStore,
  InMemorySyncStateStore,
  fixedRandom,
  type InMemoryDriveOptions,
} from '../src/testing/index.js';

export const WORKSPACE = 'ws-sintetico';
export const ACCOUNT_A = 'google-sub-0001';
export const ACCOUNT_B = 'google-sub-0002';
/** 19 settembre 2026, 08:00 UTC. Istante sintetico, fisso. */
export const T0 = Date.UTC(2026, 8, 19, 8, 0, 0);

export const GIORNO_MS = 24 * 60 * 60 * 1000;

export interface Device {
  readonly deviceId: string;
  readonly engine: SyncEngine;
  readonly drive: InMemoryDriveStore;
  readonly store: InMemorySyncStateStore;
  readonly clock: FakeClock;
  readonly sleeper: FakeSleeper;
}

let seedCounter = 1;

export interface MakeDeviceParams {
  readonly deviceId: string;
  readonly backend: InMemoryDriveBackend;
  readonly driveOptions?: InMemoryDriveOptions;
  readonly googleAccountId?: string;
  readonly workspaceId?: string;
  readonly maxOperationsPerBundle?: number;
  readonly maxAttempts?: number;
  readonly store?: InMemorySyncStateStore;
  readonly driveWrapper?: (drive: DriveStore) => DriveStore;
}

export function makeDevice(params: MakeDeviceParams): Device {
  const clock = new FakeClock(T0);
  const sleeper = new FakeSleeper();
  const drive = params.backend.connect(params.driveOptions ?? {});
  const store = params.store ?? new InMemorySyncStateStore();
  // Seed diverso per dispositivo: due dispositivi con lo stesso orologio e lo
  // stesso seme genererebbero gli stessi ULID, che nella realta' non accade.
  seedCounter += 1;
  const ids = createIdGenerator(() => clock.now(), seededRandom(seedCounter * 7919));
  const engine = new SyncEngine({
    deviceId: params.deviceId,
    workspaceId: params.workspaceId ?? WORKSPACE,
    googleAccountId: params.googleAccountId ?? ACCOUNT_A,
    drive: params.driveWrapper === undefined ? drive : params.driveWrapper(drive),
    state: store,
    clock,
    sleeper,
    ids,
    random: fixedRandom([0.25, 0.75]),
    ...(params.maxOperationsPerBundle === undefined
      ? {}
      : { maxOperationsPerBundle: params.maxOperationsPerBundle }),
    ...(params.maxAttempts === undefined
      ? {}
      : { retryPolicy: { maxAttempts: params.maxAttempts } }),
  });
  return { deviceId: params.deviceId, engine, drive, store, clock, sleeper };
}

/** Fabbrica di operazioni "di un altro dispositivo", senza passare dal motore. */
export function operationFactory(origin: string, clock: FakeClock, workspaceId = WORKSPACE) {
  seedCounter += 1;
  const ids = createIdGenerator(() => clock.now(), seededRandom(seedCounter * 104729));
  const lamport = new LamportCounter();
  return (input: NewOperationInput): SyncOperation =>
    createOperation(input, {
      origin,
      workspaceId,
      newId: () => ids.newId(),
      now: () => clock.now(),
      lamport,
    });
}

/** Genera un ULID sintetico (per i `bundleId` costruiti a mano). */
export function ulidFactory(clock: FakeClock): () => string {
  seedCounter += 1;
  const ids = createIdGenerator(() => clock.now(), seededRandom(seedCounter * 15485863));
  return () => ids.newId();
}

/**
 * Pubblica un pacchetto direttamente sull'archivio, come farebbe un altro
 * dispositivo. `protocolVersionOverride` serve a fabbricare un pacchetto di un
 * protocollo futuro senza invalidare l'impronta (che copre le sole operazioni).
 */
export function publishBundle(
  backend: InMemoryDriveBackend,
  params: {
    readonly originDeviceId: string;
    readonly operations: readonly SyncOperation[];
    readonly bundleId: string;
    readonly createdAt: number;
    readonly workspaceId?: string;
    readonly protocolVersionOverride?: number;
  },
): string {
  const bundle = createBundle({
    bundleId: params.bundleId,
    originDeviceId: params.originDeviceId,
    workspaceId: params.workspaceId ?? WORKSPACE,
    operations: params.operations,
    createdAt: params.createdAt,
  });
  let content = serializeBundle(bundle);
  let appProperties = bundleAppProperties(bundle);
  if (params.protocolVersionOverride !== undefined) {
    content = canonicalJson({
      ...(JSON.parse(content) as Record<string, unknown>),
      protocolVersion: params.protocolVersionOverride,
    });
    appProperties = {
      ...appProperties,
      protocolVersion: String(params.protocolVersionOverride),
    };
  }
  return backend.write({ name: bundleFileName(bundle), content, appProperties });
}

/**
 * Vista di Drive che esegue `hook` durante il **primo** download.
 *
 * Serve a simulare l'arrivo di modifiche **mentre** il primo recupero sta
 * scaricando lo storico: e' il caso che la specifica §8.1 chiede di non
 * perdere.
 */
export function withHookOnFirstDownload(drive: DriveStore, hook: () => void): DriveStore {
  let fired = false;
  return {
    getStartPageToken: (): Promise<string> => drive.getStartPageToken(),
    listChanges: (token: string): Promise<DriveChangesPage> => drive.listChanges(token),
    listFiles: (query: DriveQuery): Promise<readonly DriveFileMetadata[]> =>
      drive.listFiles(query),
    uploadFile: (request: DriveUploadRequest): Promise<DriveUploadResult> =>
      drive.uploadFile(request),
    downloadFile: async (fileId: string): Promise<string> => {
      const content = await drive.downloadFile(fileId);
      if (!fired) {
        fired = true;
        hook();
      }
      return content;
    },
    deleteFile: (fileId: string): Promise<void> => drive.deleteFile(fileId),
  };
}
