/**
 * Operazioni di sincronizzazione: il registro persistente richiesto da §8.1.
 *
 * Un'operazione descrive UNA modifica a UNA entita', e porta con se' tutto
 * cio' che serve per applicarla altrove una sola volta (§8):
 * origine, entita', versione di base, versione del formato, informazioni
 * causali.
 *
 * Il tipo vive qui e non in `@trackstrong/sync` di proposito: e' il
 * pacchetto di persistenza che le scrive, nella stessa transazione del dato,
 * e non deve dipendere dal trasporto. `@trackstrong/sync` legge questa coda.
 */

import type { Instant } from '@trackstrong/core';

import type { JsonValue } from './json.js';

/** Versione del formato dei payload prodotti da questo codice. */
export const OPERATION_FORMAT_VERSION = 1;

export type OperationKind = 'upsert' | 'softDelete';

/**
 * Quello che il chiamante deve dichiarare per accodare un'operazione.
 *
 * `entity` ed `entityId` NON sono qui: li deriva {@link WriteContext} dalla
 * tabella e dalla riga che sta scrivendo. Se fossero parametri, potrebbero
 * essere diversi dal dato appena scritto, e un'operazione che descrive
 * un'entita' diversa da quella modificata e' un danno silenzioso.
 */
export interface PendingOperationInput {
  readonly kind: OperationKind;
  /** Revisione dell'entita' DOPO questa modifica. */
  readonly revision: number;
  /**
   * Revisione su cui la modifica e' stata costruita. `null` per una
   * creazione. Serve a distinguere una modifica indipendente (da unire
   * automaticamente) da una concorrente (da mostrare all'utente) - §8.2.
   */
  readonly baseRevision: number | null;
  /** Corpo dell'operazione: lo stato dell'entita' o la tombstone. */
  readonly payload: JsonValue;
  /** Informazione causale leggibile: "conferma serie", "import backup". */
  readonly cause?: string;
}

/** Riga della coda `sync_operations`, come sta nel database. */
export interface SyncOperationRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly origin_device_id: string;
  readonly entity_table: string;
  readonly entity_id: string;
  readonly op_kind: OperationKind;
  readonly base_revision: number | null;
  readonly revision: number;
  readonly format_version: number;
  readonly payload_json: string;
  readonly created_at: number;
  readonly lamport: number;
  readonly cause: string | null;
  readonly bundle_id: string | null;
  readonly sent_at: number | null;
  readonly attempt_count: number;
  readonly last_error: string | null;
}

/** Operazione con il payload gia' interpretato. */
export interface SyncOperation {
  readonly id: string;
  readonly workspaceId: string;
  readonly originDeviceId: string;
  readonly entity: string;
  readonly entityId: string;
  readonly kind: OperationKind;
  readonly baseRevision: number | null;
  readonly revision: number;
  readonly formatVersion: number;
  readonly payload: JsonValue;
  readonly createdAt: Instant;
  readonly lamport: number;
  readonly cause: string | null;
  readonly bundleId: string | null;
  readonly sentAt: Instant | null;
  readonly attemptCount: number;
  readonly lastError: string | null;
}
