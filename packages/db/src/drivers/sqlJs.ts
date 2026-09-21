/**
 * Driver SQLite per il BROWSER, sopra `sql.js`.
 *
 * Serve alla versione PWA, installabile sull'iPhone senza Mac e senza firma.
 * Riusa lo stesso schema, le stesse migrazioni, gli stessi repository e gli
 * stessi test del driver nativo: cambia soltanto il motore sotto la porta
 * `SqlDriver`.
 *
 * ---------------------------------------------------------------------------
 * IL PUNTO CRITICO: `sql.js` VIVE IN MEMORIA
 *
 * `sql.js` e' SQLite compilato in WebAssembly, e il suo database sta nella
 * memoria della pagina. Se la pagina viene chiusa senza che il file sia stato
 * salvato altrove, **i dati sono perduti**. E' esattamente la priorita' numero
 * uno del progetto, quindi merita di essere trattato con attenzione invece che
 * con un salvataggio ogni tanto.
 *
 * Il driver quindi:
 *
 *  1. resta SINCRONO, come richiede la porta, perche' la garanzia "dati e
 *     operazione di sincronizzazione nella stessa transazione" dipende da
 *     questo;
 *  2. dopo ogni transazione di scrittura di primo livello esporta il file e lo
 *     consegna a un {@link BinaryStore};
 *  3. espone {@link SqlJsDriver.flush}, che l'interfaccia deve **attendere
 *     prima di confermare qualcosa all'utente**. Confermare una serie prima
 *     che il file sia durevole significa mostrare un segno di conferma per un
 *     dato che potrebbe non esistere piu' al prossimo avvio - cioe' proprio
 *     cio' che la specifica (§10) vieta.
 *
 * Chi usa questo driver **non puo' ignorare `flush()`**: e' per questo che
 * `pendingWrites` e' ispezionabile e che `flush()` rilancia l'errore di
 * scrittura invece di inghiottirlo.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * `export()` CHIUDE E RIAPRE LA CONNESSIONE
 *
 * Letto in `node_modules/sql.js/dist/sql-wasm-debug.js` (1.14.2),
 * `Database.prototype.export` fa `sqlite3_close_v2` sulla connessione, legge il
 * file dal filesystem virtuale e riapre con `sqlite3_open`. Non e' un dettaglio
 * interno: e' un cambio di connessione a ogni salvataggio, e porta con se' tre
 * conseguenze che un driver scritto per analogia con quelli nativi sbaglia.
 *
 *  1. `sqlite3_changes` torna a zero. Il numero di righe modificate va quindi
 *     letto PRIMA di esportare, non dopo.
 *  2. **I pragma di connessione tornano al valore di default**, e
 *     `foreign_keys` di default e' OFF. Senza un riapplicarlo dopo ogni
 *     esportazione, il primo salvataggio disattiva silenziosamente tutti i
 *     vincoli di integrita' referenziale dello schema - cioe' proprio la
 *     protezione che il progetto preferisce ai controlli nel codice (§3).
 *  3. Una transazione aperta non sopravvive: chiudere la connessione con una
 *     transazione in corso la annulla. Esportare dentro una transazione
 *     significa perdere le scritture fatte fino a quel punto, quindi qui e'
 *     vietato e non solo sconsigliato (vedi `exportSnapshot`).
 *
 * I primi due punti sono stati trovati da due test che fallivano, non leggendo
 * il codice: `changes` valeva 0 e un inserimento con chiave esterna inesistente
 * veniva accettato.
 * ---------------------------------------------------------------------------
 *
 * Verificato il 2026-09-21 su `sql.js@1.14.2`: API sincrona (`run`, `exec`,
 * `prepare`, `export`), e un file esportato e reimportato restituisce gli
 * stessi dati.
 */

import {
  classifyConstraint,
  SqlConstraintError,
  type SqlDriver,
  type SqlRunResult,
  type SqlValue,
} from '../driver.js';

/**
 * Archivio di byte durevole, fuori dalla memoria della pagina.
 *
 * Nel browser e' IndexedDB. Nei test e' una mappa in memoria, oppure un file.
 * Il driver non sa quale sia, e non deve saperlo.
 */
export interface BinaryStore {
  /** Legge il file. `null` se non esiste ancora. */
  load(key: string): Promise<Uint8Array | null>;
  /** Scrive il file. Deve risolvere SOLO quando la scrittura e' durevole. */
  save(key: string, bytes: Uint8Array): Promise<void>;
  /** Cancella il file. */
  remove(key: string): Promise<void>;
}

/** Sottoinsieme di `sql.js` realmente usato, per non dipendere dai suoi tipi. */
export interface SqlJsStatement {
  bind(params?: readonly SqlValue[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, SqlValue>;
  free(): boolean;
  reset(): void;
}

export interface SqlJsDatabase {
  run(sql: string, params?: readonly SqlValue[]): unknown;
  exec(sql: string): unknown;
  prepare(sql: string, params?: readonly SqlValue[]): SqlJsStatement;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}

export interface SqlJsModule {
  Database: new (data?: Uint8Array | null) => SqlJsDatabase;
}

export interface SqlJsDriverOptions {
  /** Il modulo `sql.js` gia' inizializzato. */
  readonly module: SqlJsModule;
  /** Archivio durevole in cui conservare il file. */
  readonly store: BinaryStore;
  /** Chiave del file nell'archivio. */
  readonly key: string;
  /** Contenuto iniziale, se il database esiste gia'. */
  readonly initialBytes?: Uint8Array | null;
  /**
   * Chiamata quando una scrittura durevole fallisce.
   *
   * Non e' un canale per ignorare l'errore: `flush()` lo rilancia comunque.
   * Serve all'interfaccia per mostrare subito che il salvataggio non e'
   * riuscito, invece di scoprirlo solo al prossimo `flush()`.
   */
  readonly onPersistError?: (error: unknown) => void;
}

/**
 * Apre il driver, caricando il file dall'archivio se esiste.
 *
 * E' asincrono solo all'apertura: da quel momento tutte le operazioni sono
 * sincrone, come richiede la porta.
 */
export async function openSqlJs(
  options: Omit<SqlJsDriverOptions, 'initialBytes'>,
): Promise<SqlJsDriver> {
  const existing = await options.store.load(options.key);
  return new SqlJsDriver({ ...options, initialBytes: existing });
}

export class SqlJsDriver implements SqlDriver {
  readonly name = 'sql.js';

  private readonly db: SqlJsDatabase;
  private readonly store: BinaryStore;
  private readonly key: string;
  private readonly onPersistError: ((error: unknown) => void) | undefined;

  /** Profondita' di transazione: 0 = fuori da ogni transazione. */
  private depth = 0;
  /** Contatore dei savepoint, per nomi univoci. */
  private savepointSeq = 0;
  /** true se ci sono modifiche non ancora scritte nell'archivio durevole. */
  private dirty = false;
  /** Scrittura in corso o appena programmata. */
  private persisting: Promise<void> = Promise.resolve();
  /** Errore dell'ultima scrittura non riuscita, da rilanciare in `flush()`. */
  private persistError: unknown = null;
  private closed = false;

  constructor(options: SqlJsDriverOptions) {
    this.db = new options.module.Database(options.initialBytes ?? null);
    this.store = options.store;
    this.key = options.key;
    this.onPersistError = options.onPersistError;

    this.applyConnectionPragmas();
  }

  /**
   * Pragma che valgono per connessione e non per database.
   *
   * Va richiamato dopo ogni `export()`, che riapre la connessione e riporta
   * questi valori al default (vedi l'intestazione del file).
   *
   * `journal_mode = WAL` NON si usa qui: non ha senso su un database in memoria
   * esportato per intero, e creerebbe file collaterali che l'export non
   * contiene.
   */
  private applyConnectionPragmas(): void {
    this.db.run('PRAGMA foreign_keys = ON;');
  }

  exec(sql: string): void {
    this.assertOpen();
    try {
      this.db.exec(sql);
    } catch (error) {
      throw this.wrap(error);
    }
    this.markDirty();
  }

  run(sql: string, params: readonly SqlValue[] = []): SqlRunResult {
    this.assertOpen();
    try {
      this.db.run(sql, params);
    } catch (error) {
      throw this.wrap(error);
    }
    // Letto PRIMA di `markDirty`, che puo' esportare e quindi azzerare il
    // contatore riaprendo la connessione.
    const changes = this.db.getRowsModified();
    this.markDirty();
    return {
      changes,
      // `sql.js` non espone `lastInsertRowId` in modo diretto e affidabile.
      // Il progetto usa ULID come chiavi, quindi il rowid non serve a
      // nessuno: si restituisce 0 invece di inventare un numero.
      lastInsertRowId: 0,
    };
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): T[] {
    this.assertOpen();
    const statement = this.db.prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } catch (error) {
      throw this.wrap(error);
    } finally {
      statement.free();
    }
  }

  get<T>(sql: string, params: readonly SqlValue[] = []): T | undefined {
    const rows = this.all<T>(sql, params);
    return rows[0];
  }

  transaction<T>(fn: () => T): T {
    this.assertOpen();

    if (this.depth > 0) {
      // Transazione annidata: SAVEPOINT, cosi' un repository puo' chiamarne
      // un altro senza sapere se e' gia' dentro una transazione.
      this.savepointSeq += 1;
      const name = `ts_sp_${String(this.savepointSeq)}`;
      this.db.run(`SAVEPOINT ${name};`);
      this.depth += 1;
      try {
        const result = fn();
        this.db.run(`RELEASE ${name};`);
        return result;
      } catch (error) {
        this.db.run(`ROLLBACK TO ${name};`);
        this.db.run(`RELEASE ${name};`);
        throw error;
      } finally {
        this.depth -= 1;
      }
    }

    // `BEGIN IMMEDIATE` come nei driver nativi: nel browser non c'e'
    // concorrenza fra processi, ma tenere lo stesso comportamento evita che
    // una differenza fra driver si scopra solo in produzione.
    this.db.run('BEGIN IMMEDIATE;');
    this.depth = 1;
    let committed = false;
    try {
      const result = fn();
      this.db.run('COMMIT;');
      committed = true;
      return result;
    } catch (error) {
      if (!committed) {
        try {
          this.db.run('ROLLBACK;');
        } catch {
          // Un rollback fallito su una transazione gia' chiusa non deve
          // nascondere l'errore vero, che viene rilanciato qui sotto.
        }
      }
      throw error;
    } finally {
      this.depth = 0;
      if (committed) {
        // Solo dopo un COMMIT di primo livello si programma la scrittura
        // durevole: esportare a ogni singola istruzione dentro una
        // transazione sarebbe sia inutile sia sbagliato (uno stato
        // intermedio non deve diventare durevole).
        this.schedulePersist();
      } else {
        // La transazione e' stata annullata: il file su disco e' ancora
        // valido, ma la memoria e' tornata allo stato precedente. Non c'e'
        // niente da scrivere.
        this.dirty = false;
      }
    }
  }

  /**
   * Attende che tutte le modifiche siano durevoli.
   *
   * **L'interfaccia deve attendere questa promessa prima di confermare
   * qualcosa all'utente.** Se la scrittura e' fallita, rilancia: un
   * salvataggio non riuscito non deve mai passare per riuscito.
   */
  async flush(): Promise<void> {
    if (this.dirty) this.schedulePersist();
    // `catch` invece di lasciar propagare: l'unica fonte di verita' e'
    // `persistError`, che va azzerato quando l'errore viene consegnato. Se
    // `await` rilanciasse direttamente, `persistError` resterebbe impostato e
    // il `flush` successivo - anche dopo un salvataggio riuscito - fallirebbe
    // con l'errore vecchio. Trovato da un test, non leggendo il codice.
    await this.persisting.catch(() => undefined);
    if (this.persistError !== null) {
      const error = this.persistError;
      this.persistError = null;
      throw error;
    }
  }

  /** true se ci sono modifiche non ancora scritte nell'archivio durevole. */
  get hasPendingWrites(): boolean {
    return this.dirty;
  }

  /** Byte del database, per l'esportazione manuale di un backup. */
  exportBytes(): Uint8Array {
    this.assertOpen();
    return this.exportSnapshot();
  }

  /**
   * Unico punto in cui si chiama `export()`.
   *
   * Vietato dentro una transazione: `export()` chiude la connessione, e
   * chiuderla con una transazione aperta la annulla. Un backup non deve poter
   * cancellare le scritture in corso, quindi qui si solleva un errore invece di
   * esportare uno stato mutilato.
   */
  private exportSnapshot(): Uint8Array {
    if (this.depth > 0) {
      throw new Error(
        'Esportazione richiesta dentro una transazione: annullerebbe le ' +
          'scritture in corso. Attendere il commit.',
      );
    }
    const bytes = this.db.export();
    // La connessione e' nuova: i pragma tornano al default e vanno riapplicati.
    this.applyConnectionPragmas();
    return bytes;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  private markDirty(): void {
    this.dirty = true;
    // Fuori da una transazione (DDL, pragma, migrazioni) si programma subito:
    // dentro una transazione lo fa il `finally` del COMMIT.
    if (this.depth === 0) this.schedulePersist();
  }

  private schedulePersist(): void {
    if (!this.dirty || this.closed) return;
    const bytes = this.exportSnapshot();
    this.dirty = false;
    // Le scritture si accodano una dopo l'altra: due `save` in parallelo sullo
    // stesso file potrebbero completarsi in ordine inverso e lasciare durevole
    // uno stato piu' vecchio.
    this.persisting = this.persisting
      .catch(() => undefined)
      .then(async () => {
        try {
          await this.store.save(this.key, bytes);
        } catch (error) {
          this.persistError = error;
          // Il file in memoria non e' stato scritto: la modifica e' ancora da
          // salvare, e un `flush()` successivo deve riprovare.
          this.dirty = true;
          this.onPersistError?.(error);
          throw error;
        }
      });
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error('Il driver sql.js e\' stato chiuso: nessuna operazione e\' possibile.');
    }
  }

  private wrap(error: unknown): unknown {
    if (error instanceof Error) {
      const kind = classifyConstraint(error.message);
      if (kind !== 'other') {
        return new SqlConstraintError(error.message, kind, error);
      }
    }
    return error;
  }
}

/**
 * Archivio in memoria, per i test.
 *
 * Non e' durevole e non pretende di esserlo: serve a verificare il
 * comportamento del driver, non la persistenza del browser.
 */
export class InMemoryBinaryStore implements BinaryStore {
  private readonly files = new Map<string, Uint8Array>();
  /** Numero di scritture completate, per i test. */
  saveCount = 0;
  /** Se impostato, la prossima `save` fallisce con questo errore. */
  failNextSave: Error | null = null;

  async load(key: string): Promise<Uint8Array | null> {
    return this.files.get(key) ?? null;
  }

  async save(key: string, bytes: Uint8Array): Promise<void> {
    if (this.failNextSave !== null) {
      const error = this.failNextSave;
      this.failNextSave = null;
      throw error;
    }
    // Copia difensiva: `export()` restituisce una vista che potrebbe essere
    // riusata, e un archivio che conserva un riferimento vivo non sta
    // conservando uno stato.
    this.files.set(key, new Uint8Array(bytes));
    this.saveCount += 1;
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }

  /** Byte attualmente durevoli, per le verifiche dei test. */
  peek(key: string): Uint8Array | null {
    return this.files.get(key) ?? null;
  }
}
