/**
 * Driver `expo-sqlite` — quello che gira sull'iPhone.
 *
 * ┌───────────────────────────────────────────────────────────────────────┐
 * │  NON VERIFICATO SU DISPOSITIVO.                                       │
 * │                                                                       │
 * │  Questo file non e' eseguito da nessun test: l'ambiente di sviluppo    │
 * │  usato per scriverlo e' Linux e non ha ne' il modulo nativo di         │
 * │  expo-sqlite ne' un simulatore iOS. Le firme sono state verificate     │
 * │  sulle dichiarazioni TypeScript del pacchetto pubblicato, il           │
 * │  COMPORTAMENTO a runtime non lo e'. Va provato su iPhone prima di      │
 * │  considerarlo funzionante (specifica §15: e' vietato dichiarare        │
 * │  "verificato su iPhone" cio' che e' stato provato solo su Node).       │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ## Verifica delle API
 *
 * API confermate leggendo le dichiarazioni `.d.ts` del pacchetto pubblicato
 * `expo-sqlite@57.0.3` (il tag npm `sdk-57` risolve a questa versione) e la
 * sorgente `build/SQLiteDatabase.js` dello stesso pacchetto.
 *
 * - Registry: https://registry.npmjs.org/expo-sqlite  (tag `sdk-57` -> 57.0.3)
 * - Tarball:  https://registry.npmjs.org/expo-sqlite/-/expo-sqlite-57.0.3.tgz
 *   file `build/SQLiteDatabase.d.ts`, `build/NativeStatement.d.ts`,
 *   `build/NativeDatabase.d.ts`, `build/SQLiteDatabase.js`
 * - Documentazione: https://docs.expo.dev/versions/latest/sdk/sqlite/
 *   (NON raggiungibile da questo ambiente: l'egress verso `docs.expo.dev` e'
 *   bloccato dal proxy, quindi la verifica e' stata fatta sul pacchetto
 *   pubblicato, che e' la stessa fonte da cui la documentazione e' generata
 *   e ha il vantaggio di essere la versione effettivamente installata.)
 *
 * Data della verifica: **2026-09-19**.
 *
 * Firme rilevanti, citate:
 *
 * ```ts
 * function openDatabaseSync(
 *   databaseName: string, options?: SQLiteOpenOptions, directory?: string
 * ): SQLiteDatabase;
 *
 * class SQLiteDatabase {
 *   execSync(source: string): void;
 *   runSync(source: string, params: SQLiteBindParams): SQLiteRunResult;
 *   getAllSync<T>(source: string, params: SQLiteBindParams): T[];
 *   getFirstSync<T>(source: string, params: SQLiteBindParams): T | null;
 *   withTransactionSync(task: () => void): void;
 *   closeSync(): void;
 * }
 *
 * interface SQLiteRunResult { lastInsertRowId: number; changes: number; }
 * type SQLiteBindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;
 * type SQLiteBindParams = Record<string, SQLiteBindValue> | SQLiteBindValue[];
 * ```
 *
 * Tre dettagli che cambiano il codice rispetto a `node:sqlite` e che sono
 * gestiti sotto:
 *
 * 1. `getFirstSync` restituisce `null` per "nessuna riga", mentre la porta
 *    {@link SqlDriver} usa `undefined`. La conversione e' esplicita, perche'
 *    `null` e' anche un valore di colonna legittimo.
 * 2. `withTransactionSync(task: () => void): void` non restituisce nulla: il
 *    valore di ritorno di `transaction<T>` viene catturato in una variabile
 *    della chiusura. L'implementazione ufficiale (`build/SQLiteDatabase.js`)
 *    fa `BEGIN` / `COMMIT` e, in `catch`, `ROLLBACK` + rilancio: e' una vera
 *    transazione SQLite con rollback.
 * 3. `withTransactionSync` non supporta l'annidamento (farebbe `BEGIN` dentro
 *    `BEGIN`), quindi l'annidamento e' gestito qui con `SAVEPOINT`, come nel
 *    driver Node.
 *
 * ## Perche' l'import e' dinamico
 *
 * `expo-sqlite` importa `expo-modules-core` e il modulo nativo: importarlo
 * staticamente qui farebbe fallire l'import di `@trackstrong/db` su Node,
 * cioe' romperebbe tutti i test del pacchetto anche quando il driver Expo non
 * viene nemmeno usato. Per evitarlo:
 *
 * - il modulo e' descritto da un'interfaccia locale ({@link ExpoSqliteModule}),
 *   scritta a mano sulle firme verificate sopra;
 * - l'app lo INIETTA: `openExpoSqlite({ module: await import('expo-sqlite'), ... })`.
 *   L'unico posto che nomina `expo-sqlite` e' quindi `apps/mobile`, dove il
 *   bundler nativo c'e' davvero.
 * - i test su Node usano `openNodeSqlite()` da `@trackstrong/db/node`, da
 *   sola: resta fuori dal grafo statico e non viene mai eseguito nei test.
 */

import {
  classifyConstraint,
  SqlConstraintError,
  type SqlDriver,
  type SqlRunResult,
  type SqlValue,
} from '../driver.js';

/** Valore accettato da `expo-sqlite` come parametro di bind. */
export type ExpoBindValue = string | number | null | boolean | Uint8Array | ArrayBuffer;

/** Sottoinsieme di `SQLiteDatabase` realmente usato da TrackStrong. */
export interface ExpoSqliteDatabase {
  execSync(source: string): void;
  runSync(source: string, params: ExpoBindValue[]): { changes: number; lastInsertRowId: number };
  getAllSync<T>(source: string, params: ExpoBindValue[]): T[];
  getFirstSync<T>(source: string, params: ExpoBindValue[]): T | null;
  withTransactionSync(task: () => void): void;
  closeSync(): void;
}

/** Sottoinsieme del modulo `expo-sqlite` realmente usato. */
export interface ExpoSqliteModule {
  openDatabaseSync(
    databaseName: string,
    options?: { readonly enableChangeListener?: boolean; readonly useNewConnection?: boolean },
    directory?: string,
  ): ExpoSqliteDatabase;
}

export interface ExpoSqliteOptions {
  /**
   * Il modulo `expo-sqlite`, iniettato dall'app.
   * Passalo cosi': `module: await import('expo-sqlite')`.
   */
  readonly module: ExpoSqliteModule;
  /** Nome del file, es. `trackstrong.db`. */
  readonly databaseName: string;
  readonly busyTimeoutMs?: number;
  /**
   * Directory del file. Lasciare il valore predefinito di Expo
   * (`defaultDatabaseDirectory`, nel contenitore protetto dell'app).
   * NON puntare a una cartella sincronizzata: aprire un database operativo
   * dentro una cartella sincronizzata e' vietato dalla specifica (§8).
   */
  readonly directory?: string;
}

/** Apre il database su dispositivo, con il modulo iniettato dal chiamante. */
export function openExpoSqlite(options: ExpoSqliteOptions): SqlDriver {
  const db =
    options.directory === undefined
      ? options.module.openDatabaseSync(options.databaseName)
      : options.module.openDatabaseSync(options.databaseName, undefined, options.directory);

  const driver = new ExpoSqliteDriver(db);
  // Pragma per connessione: non sono persistenti nel file, vanno riapplicati
  // a ogni apertura (esattamente come nel driver Node).
  driver.exec('PRAGMA foreign_keys = ON;');
  driver.exec(
    `PRAGMA busy_timeout = ${String(Math.max(0, Math.floor(options.busyTimeoutMs ?? 5_000)))};`,
  );
  driver.exec('PRAGMA journal_mode = WAL;');
  driver.exec('PRAGMA synchronous = NORMAL;');
  return driver;
}

/*
 * RIMOSSA: `openExpoSqliteAsync`, che caricava `expo-sqlite` da sola con un
 * `import()` dinamico dal nome costruito a runtime
 * (`['expo','sqlite'].join('-')`).
 *
 * L'intenzione era buona - non trascinare il modulo nativo nel grafo dei test
 * su Node - ma il risultato era un difetto: **Metro rifiuta un `import()` con
 * specificatore calcolato a runtime** e il bundle non si costruiva affatto
 * (`SyntaxError: Invalid call ... import(specifier)`). Nessun test poteva
 * coglierlo, perche' su Node quell'import funziona.
 *
 * Non serviva a nessuno: l'app inietta il modulo con
 * `openExpoSqlite({ module: await import('expo-sqlite') })`, che e' un import
 * statico che Metro analizza correttamente, e i test su Node usano
 * `openNodeSqlite()` da `@trackstrong/db/node`.
 */

class ExpoSqliteDriver implements SqlDriver {
  readonly name = 'expo-sqlite';

  private depth = 0;
  private savepointSeq = 0;
  private closed = false;

  constructor(private readonly db: ExpoSqliteDatabase) {}

  exec(sql: string): void {
    this.assertOpen();
    try {
      this.db.execSync(sql);
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  run(sql: string, params: readonly SqlValue[] = []): SqlRunResult {
    this.assertOpen();
    try {
      const result = this.db.runSync(sql, toBindParams(params));
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowId) };
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    this.assertOpen();
    try {
      return this.db.getAllSync<T>(sql, toBindParams(params));
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    this.assertOpen();
    try {
      // getFirstSync -> `null` quando non c'e' nessuna riga; la porta usa
      // `undefined`, perche' `null` e' un valore di colonna legittimo.
      const row = this.db.getFirstSync<T>(sql, toBindParams(params));
      return row === null ? undefined : row;
    } catch (error) {
      throw wrap(error, sql);
    }
  }

  transaction<T>(fn: () => T): T {
    this.assertOpen();

    if (this.depth > 0) {
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
          // l'errore originale vince.
        }
        throw error;
      }
    }

    // `withTransactionSync` ritorna void: il risultato passa da qui.
    let captured: { readonly value: T } | undefined;
    this.depth = 1;
    try {
      this.db.withTransactionSync(() => {
        captured = { value: fn() };
      });
    } catch (error) {
      throw wrap(error, 'TRANSACTION');
    } finally {
      this.depth = 0;
    }
    if (captured === undefined) {
      // Non dovrebbe accadere: withTransactionSync rilancia le eccezioni.
      // Se accade, e' un fallimento silenzioso e va segnalato, non ignorato.
      throw new Error(
        'withTransactionSync e\' terminato senza eseguire il corpo della transazione.',
      );
    }
    return captured.value;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.closeSync();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Database gia\' chiuso: nessuna operazione e\' possibile.');
    }
  }
}

function toBindParams(params: readonly SqlValue[]): ExpoBindValue[] {
  return params.map((value) => (typeof value === 'bigint' ? Number(value) : value));
}

function wrap(error: unknown, sql: string): unknown {
  if (!(error instanceof Error)) return error;
  const kind = classifyConstraint(error.message);
  if (kind === 'other') return error;
  return new SqlConstraintError(`${error.message} (SQL: ${sql.trim().slice(0, 200)})`, kind, error);
}
