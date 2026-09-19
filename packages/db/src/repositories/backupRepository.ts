/**
 * Esportazione e importazione del backup completo.
 *
 * Requisiti di §14, tutti vincolanti:
 * - esportazione JSON completa e versionata;
 * - **anteprima** di importazione prima di scrivere;
 * - validazione;
 * - **ripristino transazionale**;
 * - **gestione duplicati**: reimportare lo stesso file non deve moltiplicare
 *   lo storico;
 * - **"un file corrotto non deve cancellare lo storico"**: l'importazione non
 *   svuota niente in anticipo e avviene in una sola transazione, quindi un
 *   file rotto a metà lascia il database esattamente come era;
 * - avviso quando l'esportazione contiene dati personali non cifrati.
 *
 * Quello che questo repository NON fa: sovrascrivere gli altri dispositivi.
 * Un ripristino locale produce operazioni in coda come qualunque altra
 * modifica, e sara' la sincronizzazione a mostrarne gli effetti e a chiedere
 * conferma (§14).
 */

import type { Instant } from '@trackstrong/core';

import { assertIdentifier, type SqlValue } from '../driver.js';
import type { Database } from '../database.js';
import { isJsonObject } from '../json.js';
import { CURRENT_SCHEMA_VERSION, listColumns, readSchemaVersion } from '../migrate.js';
import { rowPayload, upsertOperation, withWrite } from '../unitOfWork.js';

/** Versione del formato del file di backup. */
export const BACKUP_FORMAT_VERSION = 1;

/**
 * Tabelle esportate, in ordine di dipendenza: i padri prima dei figli, cosi'
 * l'importazione non viola le chiavi esterne senza doverle disattivare.
 * Disattivare `foreign_keys` durante un import sarebbe il modo piu' semplice
 * per far entrare uno storico incoerente.
 */
export const BACKUP_TABLES: readonly string[] = [
  'workspaces',
  'devices',
  'profiles',
  'physical_limitations',
  'settings',
  'equipment_instances',
  'exercise_overrides',
  'program_plans',
  'program_blocks',
  'program_weeks',
  'program_cursor',
  'planned_events',
  'sessions',
  'performed_exercises',
  'performed_sets',
  'performed_cardio',
  'measurements',
  'recovery_check_ins',
  'habit_entries',
  'track_days',
  'progress_photos',
  'coach_proposals',
  'proposal_decisions',
  'conflicts',
];

/**
 * Tabelle escluse dal backup, con il motivo.
 *
 * - `sync_operations` / `sync_applied_operations` / `sync_state`: sono lo
 *   stato della sincronizzazione di QUESTO dispositivo. Reimportarle su un
 *   altro telefono gli farebbe credere di aver gia' inviato o applicato
 *   cose che non ha fatto.
 * - `timers`: un recupero in corso non e' un dato da ripristinare.
 * - `session_drafts`: bozze dei campi in corso, non fatti.
 * - `meta`: la versione di schema del file di destinazione, non della copia.
 */
export const BACKUP_EXCLUDED_TABLES: readonly string[] = [
  'meta',
  'sync_operations',
  'sync_applied_operations',
  'sync_state',
  'timers',
  'session_drafts',
];

export interface BackupFile {
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly exportedAt: Instant;
  readonly workspaceId: string;
  readonly deviceId: string;
  /**
   * `true` se il contenuto include dati personali in chiaro. Serve
   * all'interfaccia per mostrare l'avviso richiesto da §14.
   */
  readonly containsPersonalData: boolean;
  readonly tables: Readonly<Record<string, readonly Readonly<Record<string, SqlValue>>[]>>;
  readonly counts: Readonly<Record<string, number>>;
}

/** Il file non e' un backup di TrackStrong utilizzabile. */
export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(`Backup non valido: ${message} Lo storico locale non e' stato modificato.`);
    this.name = 'InvalidBackupError';
  }
}

export interface ImportPreview {
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly exportedAt: Instant;
  readonly sameWorkspace: boolean;
  /** Per tabella: righe nel file, righe nuove, duplicati gia' presenti. */
  readonly perTable: readonly {
    readonly table: string;
    readonly inFile: number;
    readonly newRows: number;
    readonly duplicates: number;
  }[];
  readonly totalInFile: number;
  readonly totalNew: number;
  readonly totalDuplicates: number;
  /** Avvisi da mostrare prima di confermare. */
  readonly warnings: readonly string[];
}

export interface ImportResult {
  readonly inserted: number;
  readonly skippedDuplicates: number;
  readonly perTable: Readonly<Record<string, { readonly inserted: number; readonly skipped: number }>>;
}

export interface ImportOptions {
  /**
   * Cosa fare con una riga il cui `id` esiste gia'.
   * `skip` (predefinito) rende l'importazione ripetibile senza duplicati.
   * `overwrite` sostituisce la riga locale: va chiesto espressamente, perche'
   * una riga locale piu' recente andrebbe perduta.
   */
  readonly onDuplicate?: 'skip' | 'overwrite';
  /** Motivo registrato nelle operazioni di sync generate. */
  readonly cause?: string;
}

export interface BackupRepository {
  export(at: Instant): BackupFile;
  /** JSON pronto da scrivere su file. */
  exportJson(at: Instant, pretty?: boolean): string;
  /** Valida e riassume, senza scrivere niente. */
  preview(raw: string | BackupFile): ImportPreview;
  /** Importa in UNA transazione. Un errore a metà non lascia tracce. */
  import(raw: string | BackupFile, options?: ImportOptions): ImportResult;
}

export function createBackupRepository(db: Database): BackupRepository {
  const tablesPresent = (): readonly string[] => {
    const existing = new Set(
      db.driver
        .all<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .map((r) => r.name),
    );
    return BACKUP_TABLES.filter((t) => existing.has(t));
  };

  const doExport = (at: Instant): BackupFile => {
    const tables: Record<string, readonly Readonly<Record<string, SqlValue>>[]> = {};
    const counts: Record<string, number> = {};
    for (const table of tablesPresent()) {
      const rows = db.driver.all<Record<string, SqlValue>>(
        `SELECT * FROM ${assertIdentifier(table)} ORDER BY id`,
      );
      // `[...]`: le righe di node:sqlite hanno prototipo null, e un oggetto
      // senza prototipo attraversa JSON.stringify ma non e' comodo altrove.
      tables[table] = rows.map((row) => ({ ...row }));
      counts[table] = rows.length;
    }
    const personal =
      (counts['profiles'] ?? 0) > 0 ||
      (counts['measurements'] ?? 0) > 0 ||
      (counts['progress_photos'] ?? 0) > 0;

    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      schemaVersion: readSchemaVersion(db.driver),
      exportedAt: at,
      workspaceId: db.workspaceId,
      deviceId: db.deviceId,
      containsPersonalData: personal,
      tables,
      counts,
    };
  };

  const parse = (raw: string | BackupFile): BackupFile => {
    let candidate: unknown;
    if (typeof raw === 'string') {
      try {
        candidate = JSON.parse(raw);
      } catch {
        throw new InvalidBackupError('il file non e\' JSON leggibile.');
      }
    } else {
      candidate = raw;
    }

    if (!isJsonObject(candidate)) {
      throw new InvalidBackupError('il contenuto non e\' un oggetto.');
    }
    const formatVersion = candidate['formatVersion'];
    if (typeof formatVersion !== 'number') {
      throw new InvalidBackupError('manca "formatVersion".');
    }
    if (formatVersion > BACKUP_FORMAT_VERSION) {
      throw new InvalidBackupError(
        `il formato ${String(formatVersion)} e' piu' recente di quello supportato ` +
          `(${String(BACKUP_FORMAT_VERSION)}).`,
      );
    }
    const schemaVersion = candidate['schemaVersion'];
    if (typeof schemaVersion !== 'number') {
      throw new InvalidBackupError('manca "schemaVersion".');
    }
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw new InvalidBackupError(
        `e' stato prodotto con lo schema ${String(schemaVersion)}, ` +
          `questa app ne gestisce al massimo il ${String(CURRENT_SCHEMA_VERSION)}.`,
      );
    }
    const tables = candidate['tables'];
    if (!isJsonObject(tables)) {
      throw new InvalidBackupError('manca l\'oggetto "tables".');
    }
    for (const [name, rows] of Object.entries(tables)) {
      if (!Array.isArray(rows)) {
        throw new InvalidBackupError(`la tabella "${name}" non e' un elenco di righe.`);
      }
    }
    return candidate as unknown as BackupFile;
  };

  /**
   * Righe di una tabella, validate riga per riga.
   * La validazione e' severa: una riga senza `id`, o con una colonna che non
   * esiste nello schema, fa fallire TUTTA l'importazione. Importare "quello
   * che si riesce" da un file rotto produce uno storico incoerente che nessuno
   * si accorge di avere.
   */
  const validatedRows = (
    file: BackupFile,
    table: string,
    known: readonly string[],
  ): readonly Record<string, SqlValue>[] => {
    const rows = file.tables[table] ?? [];
    const out: Record<string, SqlValue>[] = [];
    const knownSet = new Set(known);
    rows.forEach((row, index) => {
      if (!isJsonObject(row)) {
        throw new InvalidBackupError(`la riga ${String(index)} di "${table}" non e' un oggetto.`);
      }
      const id = (row as Record<string, unknown>)['id'];
      if (typeof id !== 'string' || id === '') {
        throw new InvalidBackupError(
          `la riga ${String(index)} di "${table}" non ha un "id" testuale.`,
        );
      }
      const clean: Record<string, SqlValue> = {};
      for (const [column, value] of Object.entries(row as Record<string, unknown>)) {
        if (!knownSet.has(column)) {
          throw new InvalidBackupError(
            `la colonna "${column}" non esiste nella tabella "${table}" ` +
              `(riga ${String(index)}, id ${id}).`,
          );
        }
        if (
          value !== null &&
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'boolean'
        ) {
          throw new InvalidBackupError(
            `valore non memorizzabile in "${table}.${column}" (riga ${String(index)}, id ${id}).`,
          );
        }
        clean[column] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
      }
      out.push(clean);
    });
    return out;
  };

  return {
    export: doExport,

    exportJson: (at, pretty = false) =>
      pretty ? JSON.stringify(doExport(at), null, 2) : JSON.stringify(doExport(at)),

    preview: (raw) => {
      const file = parse(raw);
      const perTable: {
        table: string;
        inFile: number;
        newRows: number;
        duplicates: number;
      }[] = [];
      const warnings: string[] = [];
      let totalInFile = 0;
      let totalNew = 0;
      let totalDuplicates = 0;

      for (const table of tablesPresent()) {
        const known = listColumns(db.driver, table);
        const rows = validatedRows(file, table, known);
        if (rows.length === 0) continue;
        let duplicates = 0;
        for (const row of rows) {
          const id = row['id'];
          const found = db.driver.get<{ id: string }>(
            `SELECT id FROM ${assertIdentifier(table)} WHERE id = ?`,
            [id ?? null],
          );
          if (found !== undefined) duplicates += 1;
        }
        perTable.push({
          table,
          inFile: rows.length,
          newRows: rows.length - duplicates,
          duplicates,
        });
        totalInFile += rows.length;
        totalNew += rows.length - duplicates;
        totalDuplicates += duplicates;
      }

      const unknownTables = Object.keys(file.tables).filter(
        (t) => !BACKUP_TABLES.includes(t) && !BACKUP_EXCLUDED_TABLES.includes(t),
      );
      if (unknownTables.length > 0) {
        warnings.push(
          `Il file contiene tabelle che questa versione non conosce e che verranno ` +
            `ignorate: ${unknownTables.join(', ')}.`,
        );
      }
      if (file.workspaceId !== db.workspaceId) {
        warnings.push(
          'Il backup proviene da un archivio diverso da quello attuale. ' +
            'L\'importazione unisce due archivi: verifica gli effetti prima di confermare.',
        );
      }
      if (totalDuplicates > 0) {
        warnings.push(
          `${String(totalDuplicates)} righe sono gia' presenti e verranno saltate ` +
            '(nessun duplicato).',
        );
      }
      if (file.containsPersonalData) {
        warnings.push(
          'Il file contiene dati personali NON cifrati (profilo, misurazioni, foto): ' +
            'conservalo di conseguenza.',
        );
      }

      return {
        formatVersion: file.formatVersion,
        schemaVersion: file.schemaVersion,
        exportedAt: file.exportedAt,
        sameWorkspace: file.workspaceId === db.workspaceId,
        perTable,
        totalInFile,
        totalNew,
        totalDuplicates,
        warnings,
      };
    },

    import: (raw, options) => {
      // La validazione dell'involucro avviene PRIMA di aprire la
      // transazione: un file che non e' nemmeno JSON non deve nemmeno
      // toccare il database.
      const file = parse(raw);
      const onDuplicate = options?.onDuplicate ?? 'skip';
      const cause = options?.cause ?? 'ripristino da backup';

      return withWrite(db, (ctx) => {
        const perTable: Record<string, { inserted: number; skipped: number }> = {};
        let inserted = 0;
        let skipped = 0;

        // Nessun DELETE preventivo: l'importazione aggiunge. Uno storico non
        // viene mai svuotato "per fare spazio" al file in arrivo (§14).
        for (const table of tablesPresent()) {
          const known = listColumns(db.driver, table);
          // La validazione riga-per-riga sta DENTRO la transazione: cosi' un
          // file valido nell'involucro ma corrotto a metà fa rotolare
          // indietro anche le righe gia' scritte.
          const rows = validatedRows(file, table, known);
          if (rows.length === 0) continue;

          let tableInserted = 0;
          let tableSkipped = 0;
          for (const row of rows) {
            const id = row['id'];
            if (typeof id !== 'string') continue; // gia' validato sopra.
            const columns = Object.keys(row).map(assertIdentifier);
            const params = columns.map((c) => row[c] ?? null);
            const conflictClause =
              onDuplicate === 'skip'
                ? // Senza bersaglio esplicito: cosi' il salto copre anche i
                  // vincoli UNIQUE diversi dalla chiave primaria. Serve per
                  // le tabelle a riga unica per archivio (`settings`,
                  // `program_cursor`), dove un ripristino da un altro
                  // dispositivo porta un `id` diverso ma lo stesso
                  // `workspace_id`: senza questo, l'importazione fallirebbe
                  // invece di riconoscere il duplicato.
                  'ON CONFLICT DO NOTHING'
                : `ON CONFLICT(id) DO UPDATE SET ${columns
                    .filter((c) => c !== 'id')
                    .map((c) => `${c} = excluded.${c}`)
                    .join(', ')}`;
            const result = ctx.run(
              `INSERT INTO ${assertIdentifier(table)} (${columns.join(', ')}) ` +
                `VALUES (${columns.map(() => '?').join(', ')}) ${conflictClause}`,
              params,
            );
            if (result.changes === 0) {
              tableSkipped += 1;
              continue;
            }
            tableInserted += 1;
            const revision = row['revision'];
            ctx.enqueue(
              table,
              id,
              upsertOperation(
                typeof revision === 'number' ? revision : 1,
                null,
                rowPayload(row),
                cause,
              ),
            );
          }
          perTable[table] = { inserted: tableInserted, skipped: tableSkipped };
          inserted += tableInserted;
          skipped += tableSkipped;
        }

        return { inserted, skippedDuplicates: skipped, perTable };
      });
    },
  };
}
