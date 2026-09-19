/**
 * Migrazioni dello schema locale.
 *
 * Due requisiti normativi governano questo file:
 *
 * - §7: "Database transazionale con migrazioni". Ogni migrazione viene
 *   applicata dentro una transazione insieme all'aggiornamento di `meta`:
 *   non esiste uno stato in cui il DDL e' stato eseguito ma la versione
 *   registrata e' quella vecchia (o viceversa).
 * - §14: "Versiona protocollo e dati: un'app vecchia non deve corrompere un
 *   archivio aggiornato. Quando serve, blocca SOLO la sincronizzazione
 *   incompatibile, preservando i dati locali." Da qui
 *   {@link SchemaTooNewError}: se il file e' piu' recente del codice non si
 *   tenta nessuna migrazione al contrario, non si riscrive niente, e l'app
 *   riceve un errore tipizzato con cui bloccare la sincronizzazione lasciando
 *   i dati leggibili.
 */

import type { SqlDriver } from './driver.js';
import { MIGRATION_001_SQL } from './schema/migration001.js';
import { MIGRATION_002_SQL } from './schema/migration002.js';

/** Chiavi usate nella tabella `meta`. */
export const META_SCHEMA_VERSION = 'schema_version';
export const META_PROTOCOL_VERSION = 'sync_protocol_version';
export const META_CREATED_AT = 'created_at';
export const META_LAST_MIGRATED_AT = 'last_migrated_at';
export const META_APP_SCHEMA_HISTORY = 'schema_history';

/**
 * Versione del protocollo di sincronizzazione supportata da questo codice.
 * E' un numero distinto dalla versione dello schema: lo schema locale puo'
 * cambiare senza che cambi il formato dei pacchetti su Drive.
 */
export const SUPPORTED_PROTOCOL_VERSION = 1;

export interface Migration {
  readonly version: number;
  readonly description: string;
  up(driver: SqlDriver): void;
}

/**
 * Elenco ORDINATO delle migrazioni. L'ordine e' verificato a runtime da
 * {@link assertMigrationsWellFormed}: una versione duplicata o fuori ordine
 * e' un errore di programmazione che deve fallire subito.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    description: 'Schema iniziale: entita\' di dominio, coda di sincronizzazione, indici.',
    up: (driver) => {
      driver.exec(MIGRATION_001_SQL);
    },
  },
  {
    version: 2,
    description:
      'performed_sets.prefilled (distinzione precompilato/eseguito) e indice ' +
      'sync_operations(entity_table, entity_id) per il rilevamento dei conflitti.',
    up: (driver) => {
      driver.exec(MIGRATION_002_SQL);
    },
  },
];

/** Versione di schema che questo codice sa gestire. */
export const CURRENT_SCHEMA_VERSION: number = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);

/**
 * L'archivio locale e' stato scritto da una versione piu' recente dell'app.
 *
 * Non si migra al contrario e non si "aggiusta" niente: l'app deve
 * continuare a mostrare i dati e bloccare la sola sincronizzazione (§14).
 */
export class SchemaTooNewError extends Error {
  constructor(
    readonly foundVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `L'archivio locale usa la versione di schema ${String(foundVersion)}, ` +
        `mentre questa versione dell'app ne supporta al massimo la ${String(supportedVersion)}. ` +
        'I dati non sono stati modificati. Aggiorna l\'app: fino ad allora la ' +
        'sincronizzazione resta bloccata, i dati locali restano leggibili.',
    );
    this.name = 'SchemaTooNewError';
  }
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  /** Versioni effettivamente applicate in questa chiamata. */
  readonly applied: readonly number[];
}

function assertMigrationsWellFormed(migrations: readonly Migration[]): void {
  let previous = 0;
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previous) {
      throw new Error(
        `Elenco delle migrazioni malformato: la versione ${String(migration.version)} ` +
          `non segue ${String(previous)}. Le versioni devono essere interi crescenti.`,
      );
    }
    previous = migration.version;
  }
}

/**
 * La tabella `meta` e' l'unica cosa che deve esistere prima di tutto il
 * resto: e' dove si legge la versione. Viene creata con lo stesso DDL della
 * migrazione 001 (`CREATE TABLE IF NOT EXISTS`), quindi crearla qui non
 * rende la 001 un no-op parziale.
 */
function ensureMetaTable(driver: SqlDriver): void {
  driver.exec(
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL) STRICT;',
  );
}

export function readMeta(driver: SqlDriver, key: string): string | null {
  const row = driver.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export function writeMeta(driver: SqlDriver, key: string, value: string): void {
  driver.run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  );
}

/**
 * Versione di schema registrata nel file. `0` per un database vuoto.
 * Non lancia: serve anche per decidere se aprire in sola lettura.
 */
export function readSchemaVersion(driver: SqlDriver): number {
  ensureMetaTable(driver);
  const raw = readMeta(driver, META_SCHEMA_VERSION);
  if (raw === null) return 0;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Versione di schema illeggibile in meta.${META_SCHEMA_VERSION}: "${raw}". ` +
        'Il file non viene toccato.',
    );
  }
  return parsed;
}

/**
 * Applica le migrazioni mancanti.
 *
 * @param targetVersion Versione massima da applicare. Serve ai test per
 *   costruire un database "fermo alla 001" e verificare la migrazione
 *   incrementale. In produzione si lascia il valore predefinito.
 * @throws {SchemaTooNewError} se il file e' piu' recente del codice.
 */
export function migrate(
  driver: SqlDriver,
  targetVersion: number = CURRENT_SCHEMA_VERSION,
): MigrationResult {
  assertMigrationsWellFormed(MIGRATIONS);
  ensureMetaTable(driver);

  const found = readSchemaVersion(driver);
  if (found > CURRENT_SCHEMA_VERSION) {
    // Prima di qualunque scrittura. Il file resta esattamente com'era.
    throw new SchemaTooNewError(found, CURRENT_SCHEMA_VERSION);
  }

  const pending = MIGRATIONS.filter((m) => m.version > found && m.version <= targetVersion);
  if (pending.length === 0) {
    return { fromVersion: found, toVersion: found, applied: [] };
  }

  const applied: number[] = [];
  // Una transazione per migrazione: se la 003 fallisce, la 002 resta
  // applicata e registrata, e il prossimo avvio riprende da 002 invece di
  // rieseguirla. Rieseguire un DDL parzialmente applicato e' il modo tipico
  // di rompere un archivio.
  for (const migration of pending) {
    driver.transaction(() => {
      migration.up(driver);
      writeMeta(driver, META_SCHEMA_VERSION, String(migration.version));
      appendHistory(driver, migration);
    });
    applied.push(migration.version);
  }

  driver.transaction(() => {
    if (readMeta(driver, META_CREATED_AT) === null) {
      writeMeta(driver, META_CREATED_AT, String(Date.now()));
    }
    writeMeta(driver, META_LAST_MIGRATED_AT, String(Date.now()));
    writeMeta(driver, META_PROTOCOL_VERSION, String(SUPPORTED_PROTOCOL_VERSION));
  });

  const last = applied[applied.length - 1] ?? found;
  return { fromVersion: found, toVersion: last, applied };
}

/**
 * Storia delle migrazioni applicate, in `meta`.
 *
 * Non e' decorativa: quando un archivio arriva da un altro dispositivo, la
 * prima domanda utile e' "da quale versione e' passato questo file".
 */
function appendHistory(driver: SqlDriver, migration: Migration): void {
  const raw = readMeta(driver, META_APP_SCHEMA_HISTORY);
  const entries: { version: number; at: number; description: string }[] =
    raw === null ? [] : (JSON.parse(raw) as { version: number; at: number; description: string }[]);
  entries.push({ version: migration.version, at: Date.now(), description: migration.description });
  writeMeta(driver, META_APP_SCHEMA_HISTORY, JSON.stringify(entries));
}

/** Nomi delle tabelle realmente presenti nel file (esclusi gli oggetti interni). */
export function listTables(driver: SqlDriver): readonly string[] {
  return driver
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((row) => row.name);
}

/** Nomi degli indici definiti dallo schema (esclusi quelli automatici). */
export function listIndexes(driver: SqlDriver): readonly string[] {
  return driver
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .map((row) => row.name);
}

/** Colonne di una tabella, in ordine di definizione. */
export function listColumns(driver: SqlDriver, table: string): readonly string[] {
  return driver
    .all<{ name: string }>(`SELECT name FROM pragma_table_info(?)`, [table])
    .map((row) => row.name);
}
