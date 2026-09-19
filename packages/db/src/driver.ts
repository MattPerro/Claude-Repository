/**
 * La porta SQL di TrackStrong.
 *
 * L'app gira su `expo-sqlite` sull'iPhone, i test girano su `node:sqlite`.
 * Per non avere due implementazioni della persistenza (e quindi due
 * comportamenti diversi, di cui uno non verificato) tutta la SQL del progetto
 * passa da questa interfaccia. L'unica cosa che cambia fra dispositivo e test
 * e' il driver; schema, migrazioni, transazioni e repository sono gli stessi
 * byte di codice.
 *
 * L'interfaccia e' deliberatamente SINCRONA. Non e' un vezzo: la specifica
 * (§7) richiede che la modifica ai dati e l'operazione da inviare alla
 * sincronizzazione stiano nella STESSA transazione. Con un'API asincrona
 * basta un `await` mal piazzato dentro la transazione perche' un'altra
 * operazione si infili nella connessione e la "stessa transazione" diventi
 * una finzione. `expo-sqlite` espone un'API sincrona completa
 * (`openDatabaseSync`, `execSync`, `runSync`, `withTransactionSync`), quindi
 * la scelta e' possibile su entrambi i lati.
 */

/** Valore che SQLite sa memorizzare. `boolean` non c'e': si salva 0/1. */
export type SqlValue = string | number | bigint | Uint8Array | null;

/** Riga pronta per l'inserimento: nomi di colonna -> valori. */
export type SqlRow = Readonly<Record<string, SqlValue>>;

/** Risultato di una scrittura. `changes` e' quello che serve per verificare. */
export interface SqlRunResult {
  /** Righe effettivamente modificate. 0 significa "no-op verificabile". */
  readonly changes: number;
  /** Rowid dell'ultimo inserimento. Diagnostico: le chiavi sono ULID. */
  readonly lastInsertRowId: number;
}

export interface SqlDriver {
  /** Nome del driver, usato solo nei messaggi di errore e nei log tecnici. */
  readonly name: string;

  /** DDL e pragma. Puo' contenere piu' istruzioni separate da `;`. */
  exec(sql: string): void;

  /** Una singola istruzione di scrittura con parametri posizionali. */
  run(sql: string, params?: readonly SqlValue[]): SqlRunResult;

  /** Tutte le righe di una query. */
  all<T>(sql: string, params?: readonly SqlValue[]): T[];

  /**
   * Prima riga di una query, oppure `undefined` se non ce n'e' nessuna.
   * `undefined` e non `null`: `null` e' un valore SQL legittimo di colonna,
   * "riga assente" e' un'altra cosa.
   */
  get<T>(sql: string, params?: readonly SqlValue[]): T | undefined;

  /**
   * Esegue `fn` in una VERA transazione SQLite.
   *
   * - se `fn` ritorna, la transazione viene confermata (COMMIT);
   * - se `fn` lancia, la transazione viene annullata (ROLLBACK) e l'eccezione
   *   viene rilanciata immutata;
   * - le chiamate annidate usano `SAVEPOINT`, quindi un repository puo'
   *   chiamarne un altro senza sapere se e' gia' dentro una transazione.
   */
  transaction<T>(fn: () => T): T;

  close(): void;
}

/** Errore di violazione di vincolo, normalizzato fra i driver. */
export class SqlConstraintError extends Error {
  constructor(
    message: string,
    readonly kind: 'unique' | 'foreignKey' | 'check' | 'notNull' | 'other',
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'SqlConstraintError';
  }
}

/**
 * Riconosce i vincoli violati dal messaggio di SQLite.
 *
 * SQLite non espone un codice strutturato distinto per tipo di vincolo
 * attraverso queste API, quindi la classificazione passa dal testo. E' il
 * motivo per cui esiste {@link SqlConstraintError}: il codice dei repository
 * non deve mai leggere stringhe di errore.
 */
export function classifyConstraint(message: string): SqlConstraintError['kind'] {
  const m = message.toUpperCase();
  if (m.includes('UNIQUE CONSTRAINT FAILED')) return 'unique';
  if (m.includes('FOREIGN KEY CONSTRAINT FAILED')) return 'foreignKey';
  if (m.includes('CHECK CONSTRAINT FAILED')) return 'check';
  if (m.includes('NOT NULL CONSTRAINT FAILED')) return 'notNull';
  return 'other';
}

/** Vero se l'errore e' una violazione di unicita' (usato per l'idempotenza). */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof SqlConstraintError) return error.kind === 'unique';
  if (error instanceof Error) return classifyConstraint(error.message) === 'unique';
  return false;
}

const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Valida un nome di tabella o di colonna.
 *
 * I nomi arrivano dal codice, non dall'utente, ma `upsert(table, row, op)`
 * accetta stringhe: senza questo controllo un refactoring sbagliato
 * potrebbe far finire in una query un identificatore costruito da dati.
 * Meglio un errore rumoroso qui che una SQL malformata in produzione.
 */
export function assertIdentifier(name: string): string {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(
      `Identificatore SQL non valido: "${name}". ` +
        'Sono ammessi solo minuscole, cifre e underscore, con iniziale non numerica.',
    );
  }
  return name;
}

/** Converte un booleano nella rappresentazione SQLite (0/1). */
export function sqlBool(value: boolean): number {
  return value ? 1 : 0;
}

/** Legge un intero SQLite come booleano. */
export function fromSqlBool(value: SqlValue): boolean {
  return value === 1 || value === 1n || value === '1';
}
