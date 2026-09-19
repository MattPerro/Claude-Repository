/**
 * Driver `node:sqlite`. E' quello usato da TUTTI i test automatici.
 *
 * `node:sqlite` e' il modulo SQLite incluso in Node 22 (`DatabaseSync`).
 * Emette un `ExperimentalWarning` all'import: e' atteso e non indica un
 * problema. Serve solo per i test e per gli strumenti da riga di comando:
 * sull'iPhone gira `drivers/expoSqlite.ts`.
 */

import { DatabaseSync } from 'node:sqlite';

import {
  classifyConstraint,
  SqlConstraintError,
  type SqlDriver,
  type SqlRunResult,
  type SqlValue,
} from '../driver.js';

export interface NodeSqliteOptions {
  /** Percorso del file, oppure `:memory:`. */
  readonly location?: string;
  /**
   * Millisecondi di attesa prima di dichiarare il database occupato.
   * Serve quando due connessioni scrivono (per noi: l'app in primo piano e
   * un task in background di sincronizzazione).
   */
  readonly busyTimeoutMs?: number;
  /**
   * `journal_mode = WAL`. Ignorato sui database `:memory:`, dove SQLite
   * resta in `memory` per costruzione.
   */
  readonly wal?: boolean;
}

/**
 * Apre un database con `node:sqlite`.
 *
 * I pragma sono applicati qui e non nelle migrazioni perche' `foreign_keys`
 * e `busy_timeout` non sono persistenti: valgono per connessione e vanno
 * riattivati a ogni apertura.
 */
export function openNodeSqlite(options: NodeSqliteOptions = {}): SqlDriver {
  const location = options.location ?? ':memory:';
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  const wal = options.wal ?? location !== ':memory:';

  const db = new DatabaseSync(location);
  const driver = new NodeSqliteDriver(db);

  // `foreign_keys` e' ON per default in node:sqlite, ma lo dichiariamo
  // comunque: e' un requisito di integrita' (§7), non un default su cui
  // appoggiarsi silenziosamente.
  driver.exec('PRAGMA foreign_keys = ON;');
  driver.exec(`PRAGMA busy_timeout = ${String(Math.max(0, Math.floor(busyTimeoutMs)))};`);
  if (wal) {
    // Vedi il commento su WAL in schema/migration001.ts: WAL comporta i file
    // collaterali `-wal` e `-shm`, e questo e' il motivo per cui NON si copia
    // un database in uso (specifica §8, elenco dei divieti).
    driver.exec('PRAGMA journal_mode = WAL;');
    driver.exec('PRAGMA synchronous = NORMAL;');
  }

  return driver;
}

class NodeSqliteDriver implements SqlDriver {
  readonly name = 'node:sqlite';

  /**
   * Cache delle istruzioni preparate.
   *
   * Non e' un'ottimizzazione prematura: la registrazione di una serie durante
   * la seduta e' il percorso su cui la specifica (§4, priorita' 3) chiede di
   * non peggiorare la latenza, e ricompilare la stessa SQL migliaia di volte
   * durante l'import di un backup o la generazione dello storico e' la
   * differenza fra secondi e decine di secondi.
   */
  private readonly statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();

  /** Profondita' di annidamento delle transazioni (0 = nessuna aperta). */
  private depth = 0;
  private savepointSeq = 0;
  private closed = false;

  constructor(private readonly db: DatabaseSync) {}

  exec(sql: string): void {
    this.assertOpen();
    try {
      this.db.exec(sql);
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  run(sql: string, params: readonly SqlValue[] = []): SqlRunResult {
    this.assertOpen();
    try {
      const result = this.prepared(sql).run(...(params as SqlValue[]));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    this.assertOpen();
    try {
      return this.prepared(sql).all(...(params as SqlValue[])) as T[];
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    this.assertOpen();
    try {
      const row = this.prepared(sql).get(...(params as SqlValue[]));
      return row === undefined ? undefined : (row as T);
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  transaction<T>(fn: () => T): T {
    this.assertOpen();
    if (this.depth === 0) {
      // BEGIN IMMEDIATE: prende subito il lock di scrittura. Con BEGIN
      // DEFERRED una transazione che legge e poi scrive puo' fallire con
      // SQLITE_BUSY a meta' strada, cioe' esattamente dopo che l'utente ha
      // premuto "Completa serie".
      this.exec('BEGIN IMMEDIATE;');
      this.depth = 1;
      try {
        const value = fn();
        this.exec('COMMIT;');
        this.depth = 0;
        return value;
      } catch (error) {
        this.depth = 0;
        try {
          this.exec('ROLLBACK;');
        } catch {
          // Se il ROLLBACK stesso fallisce (transazione gia' chiusa da
          // SQLite) non si perde l'errore originale, che e' quello utile.
        }
        throw error;
      }
    }

    this.savepointSeq += 1;
    const name = `ts_sp_${String(this.savepointSeq)}`;
    this.exec(`SAVEPOINT ${name};`);
    this.depth += 1;
    try {
      const value = fn();
      this.exec(`RELEASE ${name};`);
      this.depth -= 1;
      return value;
    } catch (error) {
      this.depth -= 1;
      try {
        this.exec(`ROLLBACK TO ${name};`);
        this.exec(`RELEASE ${name};`);
      } catch {
        // idem: l'errore originale vince.
      }
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.statements.clear();
    this.db.close();
  }

  private prepared(sql: string): ReturnType<DatabaseSync['prepare']> {
    const cached = this.statements.get(sql);
    if (cached !== undefined) return cached;
    const statement = this.db.prepare(sql);
    this.statements.set(sql, statement);
    return statement;
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Database gia\' chiuso: nessuna operazione e\' possibile.');
    }
  }
}

function wrap(error: unknown, sql: string): unknown {
  if (!(error instanceof Error)) return error;
  const kind = classifyConstraint(error.message);
  if (kind === 'other') return error;
  return new SqlConstraintError(
    `${error.message} (SQL: ${sql.trim().slice(0, 200)})`,
    kind,
    error,
  );
}
