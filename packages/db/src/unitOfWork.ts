/**
 * L'unita' di lavoro: dato + operazione di sincronizzazione, una transazione.
 *
 * Questo file esiste per un solo requisito, ed e' il piu' vincolante
 * dell'intera persistenza (specifica §7):
 *
 *   "Nella STESSA transazione: la modifica ai dati E l'operazione da inviare
 *    alla sincronizzazione."
 *
 * Il modo in cui lo si sbaglia normalmente e': scrivere la riga, confermare,
 * poi accodare l'operazione. Se il secondo passo non avviene (processo
 * ucciso, disco pieno, vincolo violato) la modifica esiste solo su questo
 * telefono e non arrivera' mai da nessun'altra parte: silenziosamente, senza
 * errori, per sempre. Da qui la forma di {@link withWrite}: le due scritture
 * passano dallo stesso `WriteContext` e lo stesso `BEGIN IMMEDIATE`, e se
 * l'accodamento fallisce rotola indietro anche il dato.
 *
 * Corollario dichiarato nel mandato dell'ingegnere mobile: "se l'operazione
 * di sync non viene scritta, la modifica non e' avvenuta".
 */

import {
  assertIdentifier,
  type SqlRow,
  type SqlRunResult,
  type SqlValue,
} from './driver.js';
import type { Database } from './database.js';
import { toJson, toJsonOrNull, type JsonValue } from './json.js';
import type { OperationKind, PendingOperationInput } from './operations.js';

/**
 * Tabelle che NON generano operazioni di sincronizzazione.
 *
 * Sono fatti locali del dispositivo, non dell'archivio: la coda di
 * sincronizzazione stessa, il registro delle operazioni applicate, il
 * cursore, i conflitti (che sono l'esito locale di una sincronizzazione), i
 * timer (§8: "non creare un file remoto per ogni aggiornamento del timer") e
 * `meta`. Accodare un'operazione per queste tabelle vorrebbe dire
 * sincronizzare la sincronizzazione.
 */
export const LOCAL_ONLY_TABLES: readonly string[] = [
  'meta',
  'sync_operations',
  'sync_applied_operations',
  'sync_state',
  'conflicts',
  'timers',
  'session_drafts',
];

export interface WriteContext {
  /** Scrive/aggiorna un'entita' E accoda l'operazione di sync corrispondente. */
  upsert<T extends SqlRow>(table: string, row: T, op: PendingOperationInput): void;

  /** Cancellazione logica (tombstone) + operazione di sync. */
  softDelete(table: string, id: string, op: PendingOperationInput): void;

  // --- estensioni additive, per i casi che l'upsert generico non copre ---

  /**
   * Inserisce senza sovrascrivere una riga esistente con la stessa chiave.
   * `inserted: false` e' il risultato atteso del doppio tocco (§10): un
   * no-op verificabile, non un errore e non un duplicato.
   */
  insertIfAbsent<T extends SqlRow>(
    table: string,
    row: T,
    op: PendingOperationInput,
    conflictColumns?: readonly string[],
  ): { readonly inserted: boolean };

  /** Aggiorna colonne specifiche di una riga esistente, per `id`. */
  patch(
    table: string,
    id: string,
    changes: SqlRow,
    op: PendingOperationInput,
  ): { readonly changes: number };

  /** Accoda un'operazione per un'entita' scritta con SQL a mano. */
  enqueue(table: string, entityId: string, op: PendingOperationInput): void;

  /** SQL diretta, DENTRO la stessa transazione. */
  run(sql: string, params?: readonly SqlValue[]): SqlRunResult;
  all<R>(sql: string, params?: readonly SqlValue[]): R[];
  get<R>(sql: string, params?: readonly SqlValue[]): R | undefined;

  /** Istante di riferimento, unico per tutta la transazione. */
  readonly now: number;
  readonly db: Database;
  /** Numero di operazioni di sync accodate in questa transazione. */
  readonly enqueuedCount: number;
}

/**
 * Esegue `fn` in una transazione, fornendo il contesto di scrittura.
 *
 * Non c'e' una variante "senza operazioni di sync": per scrivere dati si
 * passa da qui.
 */
export function withWrite<T>(db: Database, fn: (ctx: WriteContext) => T): T {
  return db.driver.transaction(() => {
    const ctx = new TransactionalWriteContext(db);
    return fn(ctx);
  });
}

class TransactionalWriteContext implements WriteContext {
  readonly now: number;
  private queued = 0;
  /**
   * Contatore causale della transazione. Parte da `MAX(lamport)` letto una
   * sola volta: cosi' le operazioni accodate nella stessa transazione
   * mantengono l'ordine in cui sono state prodotte.
   */
  private lamport: number;

  constructor(readonly db: Database) {
    this.now = db.clock.now();
    const row = db.driver.get<{ max_lamport: number | null }>(
      'SELECT MAX(lamport) AS max_lamport FROM sync_operations',
    );
    this.lamport = row?.max_lamport ?? 0;
  }

  get enqueuedCount(): number {
    return this.queued;
  }

  upsert<T extends SqlRow>(table: string, row: T, op: PendingOperationInput): void {
    const safeTable = assertIdentifier(table);
    const columns = Object.keys(row).map(assertIdentifier);
    if (columns.length === 0) {
      throw new Error(`upsert("${safeTable}"): nessuna colonna da scrivere.`);
    }
    const id = requireId(row, safeTable);

    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((c) => c !== 'id')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');
    const sql =
      `INSERT INTO ${safeTable} (${columns.join(', ')}) VALUES (${placeholders}) ` +
      (updates === ''
        ? 'ON CONFLICT(id) DO NOTHING'
        : `ON CONFLICT(id) DO UPDATE SET ${updates}`);

    this.db.driver.run(sql, columns.map((c) => row[c] ?? null));
    this.enqueue(safeTable, id, op);
  }

  insertIfAbsent<T extends SqlRow>(
    table: string,
    row: T,
    op: PendingOperationInput,
    conflictColumns?: readonly string[],
  ): { readonly inserted: boolean } {
    const safeTable = assertIdentifier(table);
    const columns = Object.keys(row).map(assertIdentifier);
    const id = requireId(row, safeTable);
    const target =
      conflictColumns === undefined
        ? ''
        : `(${conflictColumns.map(assertIdentifier).join(', ')}) `;
    const sql =
      `INSERT INTO ${safeTable} (${columns.join(', ')}) ` +
      `VALUES (${columns.map(() => '?').join(', ')}) ` +
      `ON CONFLICT ${target}DO NOTHING`;

    const result = this.db.driver.run(
      sql,
      columns.map((c) => row[c] ?? null),
    );
    if (result.changes === 0) {
      // Niente e' cambiato: non si accoda un'operazione che descriverebbe
      // una scrittura mai avvenuta. Il doppio tocco non produce traffico.
      return { inserted: false };
    }
    this.enqueue(safeTable, id, op);
    return { inserted: true };
  }

  patch(
    table: string,
    id: string,
    changes: SqlRow,
    op: PendingOperationInput,
  ): { readonly changes: number } {
    const safeTable = assertIdentifier(table);
    const columns = Object.keys(changes).map(assertIdentifier);
    if (columns.length === 0) {
      throw new Error(`patch("${safeTable}"): nessuna colonna da aggiornare.`);
    }
    const sql = `UPDATE ${safeTable} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    const params: SqlValue[] = columns.map((c) => changes[c] ?? null);
    params.push(id);
    const result = this.db.driver.run(sql, params);
    if (result.changes > 0) this.enqueue(safeTable, id, op);
    return { changes: result.changes };
  }

  softDelete(table: string, id: string, op: PendingOperationInput): void {
    const safeTable = assertIdentifier(table);
    const result = this.db.driver.run(
      `UPDATE ${safeTable} SET deleted_at = ?, revision = ?, updated_at = ? WHERE id = ?`,
      [this.now, op.revision, this.now, id],
    );
    if (result.changes === 0) {
      throw new Error(
        `softDelete("${safeTable}", "${id}"): nessuna riga corrispondente. ` +
          'Non si accoda una cancellazione di qualcosa che non esiste.',
      );
    }
    this.enqueue(safeTable, id, { ...op, kind: 'softDelete' });
  }

  enqueue(table: string, entityId: string, op: PendingOperationInput): void {
    const safeTable = assertIdentifier(table);
    if (LOCAL_ONLY_TABLES.includes(safeTable)) return;

    this.lamport += 1;
    this.queued += 1;
    this.db.driver.run(
      `INSERT INTO sync_operations (
         id, workspace_id, origin_device_id, entity_table, entity_id, op_kind,
         base_revision, revision, format_version, payload_json, created_at,
         lamport, cause, bundle_id, sent_at, attempt_count, last_error
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`,
      [
        this.db.ids.newId(),
        this.db.workspaceId,
        this.db.deviceId,
        safeTable,
        entityId,
        op.kind satisfies OperationKind,
        op.baseRevision,
        op.revision,
        this.db.operationFormatVersion,
        toJson(op.payload),
        this.now,
        this.lamport,
        toCauseText(op.cause),
      ],
    );
  }

  run(sql: string, params?: readonly SqlValue[]): SqlRunResult {
    return this.db.driver.run(sql, params);
  }

  all<R>(sql: string, params?: readonly SqlValue[]): R[] {
    return this.db.driver.all<R>(sql, params);
  }

  get<R>(sql: string, params?: readonly SqlValue[]): R | undefined {
    return this.db.driver.get<R>(sql, params);
  }
}

function requireId(row: SqlRow, table: string): string {
  const id = row['id'];
  if (typeof id !== 'string' || id === '') {
    throw new Error(
      `La riga per "${table}" non ha una colonna "id" testuale. ` +
        'Ogni entita\' nasce con un ULID definitivo sul dispositivo (§8).',
    );
  }
  return id;
}

function toCauseText(cause: string | undefined): string | null {
  return cause === undefined ? null : cause;
}

/**
 * Comodita' per costruire un `PendingOperationInput` di tipo `upsert` a
 * partire dall'entita' appena scritta.
 */
export function upsertOperation(
  revision: number,
  baseRevision: number | null,
  payload: JsonValue,
  cause?: string,
): PendingOperationInput {
  return cause === undefined
    ? { kind: 'upsert', revision, baseRevision, payload }
    : { kind: 'upsert', revision, baseRevision, payload, cause };
}

/** Comodita' per la tombstone. */
export function deleteOperation(
  revision: number,
  baseRevision: number | null,
  cause?: string,
): PendingOperationInput {
  const payload: JsonValue = { deleted: true };
  return cause === undefined
    ? { kind: 'softDelete', revision, baseRevision, payload }
    : { kind: 'softDelete', revision, baseRevision, payload, cause };
}

/** Serializza una riga per il payload dell'operazione. */
export function rowPayload(row: SqlRow): JsonValue {
  const out: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) out[key] = null;
    else if (typeof value === 'bigint') out[key] = Number(value);
    else if (value instanceof Uint8Array) out[key] = { __blobBase64: toBase64(value) };
    else out[key] = value;
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  // `btoa` esiste su Hermes e su Node 22.
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

/** Riesporta per comodita' dei repository. */
export { toJson, toJsonOrNull };
