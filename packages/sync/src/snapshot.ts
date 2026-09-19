/**
 * Copie coerenti periodiche (snapshot) per velocizzare il recupero
 * (specifica §8.1).
 *
 * ## Cosa uno snapshot NON e'
 *
 *  - **Non sostituisce i pacchetti.** I pacchetti di operazioni restano
 *    sull'archivio: sono la storia, lo snapshot e' solo una scorciatoia. Un
 *    protocollo in cui lo snapshot rimpiazza le operazioni ricade nel divieto
 *    "un unico database con vince l'ultimo caricamento".
 *  - **Non cancella le tombstone.** Uno snapshot include le tombstone ancora
 *    entro la politica di conservazione: se le omettesse, un dispositivo che
 *    recupera dallo snapshot non saprebbe che un dato e' stato eliminato e lo
 *    farebbe ricomparire.
 *  - **Non e' un backup di stati precedenti.** La specifica §14 distingue
 *    "sincronizzazione dello stato corrente" e "backup recuperabile di stati
 *    precedenti": questo e' il primo. Gli snapshot piu' vecchi si conservano
 *    con una politica dichiarata, ma il ripristino versionato e' un'altra
 *    funzione.
 */

import type { DeviceId, Instant, WorkspaceId } from '@trackstrong/core';
import { isUlid } from '@trackstrong/core';
import { SYNC_FORMAT_VERSION, type OperationId } from './operation.js';
import { SYNC_PROTOCOL_VERSION } from './bundle.js';
import { canonicalJson, computeSnapshotDigest } from './digest.js';
import type { Conflict, EntityRecord } from './conflict.js';

/** Prefisso dei nomi degli snapshot in `appDataFolder`. */
export const SNAPSHOT_NAME_PREFIX = 'ts-snap';

/** Valore di `appProperties.kind` per uno snapshot. */
export const SNAPSHOT_APP_KIND = 'snapshot';

export interface SyncSnapshot {
  readonly snapshotId: string;
  readonly originDeviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly protocolVersion: number;
  readonly formatVersion: number;
  readonly createdAt: Instant;
  /**
   * Massimo contatore logico coperto: un dispositivo che recupera da questo
   * snapshot sa da dove ripartire per applicare i pacchetti.
   */
  readonly lamport: number;
  /** Entita' vive **e** tombstone ancora da conservare. */
  readonly entities: readonly EntityRecord[];
  /**
   * Operazioni gia' applicate al momento dello snapshot. Vengono ricaricate
   * nel registro di idempotenza, cosi' riapplicare un pacchetto vecchio dopo
   * un recupero resta un no-op.
   */
  readonly appliedOperationIds: readonly OperationId[];
  /** Conflitti ancora aperti: non si perdono in un recupero. */
  readonly openConflicts: readonly Conflict[];
  readonly entityCount: number;
  readonly tombstoneCount: number;
  readonly digest: string;
}

export interface NewSnapshotInput {
  readonly snapshotId: string;
  readonly originDeviceId: DeviceId;
  readonly workspaceId: WorkspaceId;
  readonly createdAt: Instant;
  readonly lamport: number;
  readonly entities: readonly EntityRecord[];
  readonly appliedOperationIds: readonly OperationId[];
  readonly openConflicts: readonly Conflict[];
}

export function createSnapshot(input: NewSnapshotInput): SyncSnapshot {
  const entities = [...input.entities].sort((a, b) =>
    `${a.entityType}:${a.entityId}` < `${b.entityType}:${b.entityId}` ? -1 : 1,
  );
  const appliedOperationIds = [...input.appliedOperationIds].sort();
  const body = {
    entities,
    appliedOperationIds,
    openConflicts: input.openConflicts,
  };
  return Object.freeze({
    snapshotId: input.snapshotId,
    originDeviceId: input.originDeviceId,
    workspaceId: input.workspaceId,
    protocolVersion: SYNC_PROTOCOL_VERSION,
    formatVersion: SYNC_FORMAT_VERSION,
    createdAt: input.createdAt,
    lamport: input.lamport,
    entities,
    appliedOperationIds,
    openConflicts: input.openConflicts,
    entityCount: entities.length,
    tombstoneCount: entities.filter((e) => e.deleted).length,
    digest: computeSnapshotDigest(body),
  });
}

export function snapshotFileName(snapshot: SyncSnapshot): string {
  const lamport = String(snapshot.lamport).padStart(12, '0');
  return `${SNAPSHOT_NAME_PREFIX}-${snapshot.workspaceId}-${lamport}-${snapshot.snapshotId}.json`;
}

export function snapshotAppProperties(snapshot: SyncSnapshot): Record<string, string> {
  return {
    kind: SNAPSHOT_APP_KIND,
    snapshotId: snapshot.snapshotId,
    workspaceId: snapshot.workspaceId,
    originDeviceId: snapshot.originDeviceId,
    protocolVersion: String(snapshot.protocolVersion),
    lamport: String(snapshot.lamport),
    entityCount: String(snapshot.entityCount),
  };
}

export function serializeSnapshot(snapshot: SyncSnapshot): string {
  return canonicalJson(snapshot);
}

export type SnapshotRejectionCode =
  | 'json-non-valido'
  | 'struttura-non-valida'
  | 'protocollo-troppo-recente'
  | 'digest-non-corrispondente'
  | 'archivio-diverso';

export interface SnapshotRejection {
  readonly code: SnapshotRejectionCode;
  readonly message: string;
  readonly snapshotId: string | null;
}

export type SnapshotParseResult =
  | { readonly ok: true; readonly snapshot: SyncSnapshot }
  | { readonly ok: false; readonly rejection: SnapshotRejection };

/**
 * Validazione rigorosa, con le stesse regole dei pacchetti: uno snapshot
 * corrotto o di un protocollo piu' recente viene **ignorato** e il recupero
 * ricade sui pacchetti, che restano tutti sull'archivio. Non si perde niente:
 * lo snapshot e' solo un'accelerazione.
 */
export function parseSnapshot(
  text: string,
  options: { readonly workspaceId?: WorkspaceId; readonly supportedProtocolVersion?: number } = {},
): SnapshotParseResult {
  const maxProtocol = options.supportedProtocolVersion ?? SYNC_PROTOCOL_VERSION;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      rejection: {
        code: 'json-non-valido',
        message: 'Snapshot illeggibile o troncato: il recupero prosegue dai pacchetti.',
        snapshotId: null,
      },
    };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      rejection: {
        code: 'struttura-non-valida',
        message: "Lo snapshot non e un oggetto JSON.",
        snapshotId: null,
      },
    };
  }
  const o = raw as Record<string, unknown>;
  const snapshotId = typeof o['snapshotId'] === 'string' ? o['snapshotId'] : null;

  const protocolVersion = o['protocolVersion'];
  if (!Number.isInteger(protocolVersion)) {
    return bad('struttura-non-valida', 'Versione del protocollo assente.', snapshotId);
  }
  if ((protocolVersion as number) > maxProtocol) {
    return bad(
      'protocollo-troppo-recente',
      `Snapshot con protocollo ${String(protocolVersion)}, supportato fino al ` +
        `${String(maxProtocol)}: ignorato, i dati locali restano intatti.`,
      snapshotId,
    );
  }
  if (snapshotId === null || !isUlid(snapshotId)) {
    return bad('struttura-non-valida', 'Identificativo dello snapshot non valido.', snapshotId);
  }
  if (typeof o['workspaceId'] !== 'string' || typeof o['digest'] !== 'string') {
    return bad('struttura-non-valida', 'Campi obbligatori assenti.', snapshotId);
  }
  if (options.workspaceId !== undefined && o['workspaceId'] !== options.workspaceId) {
    return bad('archivio-diverso', 'Lo snapshot appartiene a un altro archivio.', snapshotId);
  }
  if (!Array.isArray(o['entities']) || !Array.isArray(o['appliedOperationIds'])) {
    return bad('struttura-non-valida', 'Contenuto dello snapshot non valido.', snapshotId);
  }
  if (!Number.isInteger(o['lamport']) || (o['lamport'] as number) < 0) {
    return bad('struttura-non-valida', 'Contatore logico dello snapshot non valido.', snapshotId);
  }

  const digest = computeSnapshotDigest({
    entities: o['entities'],
    appliedOperationIds: o['appliedOperationIds'],
    openConflicts: o['openConflicts'] ?? [],
  });
  if (digest !== o['digest']) {
    return bad(
      'digest-non-corrispondente',
      'Snapshot corrotto: ignorato, il recupero prosegue dai pacchetti e lo storico resta intatto.',
      snapshotId,
    );
  }
  return { ok: true, snapshot: o as unknown as SyncSnapshot };
}

function bad(
  code: SnapshotRejectionCode,
  message: string,
  snapshotId: string | null,
): SnapshotParseResult {
  return { ok: false, rejection: { code, message, snapshotId } };
}
